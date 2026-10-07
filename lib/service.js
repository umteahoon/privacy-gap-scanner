// 스캔 작업 관리 로직. 저장소(store)를 주입받아 Netlify Blobs(배포)와 메모리 저장소(로컬 개발) 양쪽에서 재사용한다.
// store 인터페이스: getJSON(key), setJSON(key, value), delete(key)
import { randomUUID, createHmac } from 'node:crypto';
import { normalizeTargetUrl, assertPublicHost } from './guard.js';
import { scanSite } from './scan.js';

const INDEX_MAX = 500;
const REUSE_MS = 30 * 60 * 1000;                 // 같은 URL 30분 내 재요청 시 기존 결과 재사용 (대상 사이트 부하 감소)
const RETENTION_DAYS = Number(process.env.SCAN_RETENTION_DAYS || 30);   // 검사 기록 보관 기간
const PER_IP_PER_HOUR = Number(process.env.SCAN_LIMIT_PER_IP_HOUR || 10);
const GLOBAL_PER_DAY = Number(process.env.SCAN_LIMIT_PER_DAY || 300);

// 이용자 IP는 원문을 저장하지 않고, 서버 비밀키로 HMAC 처리한 값만 요청 횟수 제한에 1시간 동안 사용한다.
const ipHash = ip => createHmac('sha256', process.env.SCAN_WORKER_SECRET || 'local-dev').update(String(ip || 'unknown')).digest('hex').slice(0, 16);

const SCAN_TIMEOUT_MS = 8 * 60 * 1000;   // 백그라운드 함수 한도(15분) 안에서 검사가 멈춰도 반드시 종료

function withTimeout(promise, ms) {
  let timer;
  const t = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('검사 시간이 초과되었습니다.')), ms); });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

const httpError = (msg, status) => Object.assign(new Error(msg), { status });

export async function createScan(store, { url, policyUrl, ip, agree }) {
  if (agree !== true) throw httpError('이용 안내에 동의해야 검사할 수 있습니다.', 400);
  if (String(url || '').length > 2048 || String(policyUrl || '').length > 2048) throw httpError('URL이 너무 깁니다.', 400);
  const target = normalizeTargetUrl(url);
  const policy = policyUrl ? normalizeTargetUrl(policyUrl) : null;
  await assertPublicHost(target.hostname);
  if (policy) await assertPublicHost(policy.hostname);

  const index = await purgeExpired(store);
  const reuse = !policy && index.find(r => r.url === target.toString() && r.status !== 'error' && Date.now() - Date.parse(r.createdAt) < REUSE_MS);
  if (reuse) return { id: reuse.id, reused: true };

  // 요청 횟수 제한: 시간·일 단위 카운터 하나만 유지 (구간이 바뀌면 초기화)
  const hour = new Date().toISOString().slice(0, 13);
  const day = hour.slice(0, 10);
  let rl = (await store.getJSON('ratelimit')) || {};
  if (rl.hour !== hour) rl = { ...rl, hour, perIp: {} };
  if (rl.day !== day) rl = { ...rl, day, dayCount: 0 };
  const key = ipHash(ip);
  if ((rl.perIp[key] || 0) >= PER_IP_PER_HOUR) throw httpError('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', 429);
  if (rl.dayCount >= GLOBAL_PER_DAY) throw httpError('오늘의 검사 한도를 초과했습니다. 내일 다시 시도하세요.', 429);
  rl.perIp[key] = (rl.perIp[key] || 0) + 1;
  rl.dayCount++;
  await store.setJSON('ratelimit', rl);

  const id = randomUUID();
  const record = { id, url: target.toString(), policyUrl: policy?.toString() || null, status: 'queued', stage: 'queued', message: '대기 중', createdAt: new Date().toISOString() };
  await store.setJSON(`scan/${id}`, record);
  await updateIndex(store, record);
  return { id, reused: false };
}

// 내부 색인(공개하지 않음): 결과 재사용과 보관 기간 만료 처리에만 사용
async function updateIndex(store, rec) {
  const index = ((await store.getJSON('index')) || []).filter(r => r.id !== rec.id);
  index.unshift({ id: rec.id, url: rec.url, status: rec.status, createdAt: rec.createdAt });
  await store.setJSON('index', index.slice(0, INDEX_MAX));
}

async function purgeExpired(store) {
  const index = (await store.getJSON('index')) || [];
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const expired = index.filter(r => Date.parse(r.createdAt) < cutoff);
  if (!expired.length) return index;
  await Promise.all(expired.map(r => store.delete(`scan/${r.id}`).catch(() => {})));
  const kept = index.filter(r => Date.parse(r.createdAt) >= cutoff);
  await store.setJSON('index', kept);
  return kept;
}

export async function runScan(store, id) {
  const rec = await store.getJSON(`scan/${id}`);
  if (!rec || rec.status !== 'queued') return;
  const save = async patch => { Object.assign(rec, patch); await store.setJSON(`scan/${id}`, rec); };
  await save({ status: 'running', stage: 'start', message: '브라우저 준비 중' });
  let progress = Promise.resolve();   // 진행 상황 기록을 순차 처리해 최종 결과를 덮어쓰지 않도록 함
  try {
    const result = await withTimeout(scanSite(rec.url, {
      policyUrl: rec.policyUrl || undefined,
      onProgress: (stage, message) => { progress = progress.then(() => save({ stage, message })).catch(() => {}); },
    }), SCAN_TIMEOUT_MS);
    await progress;
    await save({ status: 'done', stage: 'done', message: '완료', result, finishedAt: new Date().toISOString() });
  } catch (e) {
    await progress;
    const blocked = e.code === 'blocked' || e.code === 'robots';
    await save({ status: 'error', stage: 'error', blocked, message: (blocked ? '' : '검사 실패: ') + e.message.split('\n')[0], finishedAt: new Date().toISOString() });
  }
  await updateIndex(store, rec);
}

export async function failScan(store, id, message) {
  const rec = await store.getJSON(`scan/${id}`);
  if (!rec) return;
  Object.assign(rec, { status: 'error', stage: 'error', message, finishedAt: new Date().toISOString() });
  await store.setJSON(`scan/${id}`, rec);
  await updateIndex(store, rec);
}

export async function getScan(store, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return null;
  return store.getJSON(`scan/${id}`);
}
