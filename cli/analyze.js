// 세부 분석 (재스캔 없음, 결과 파일 읽기 전용)
// 사용: node cli/analyze.js [결과 폴더=experiment/results] [사이트 목록=experiment/sites.csv] [출력 이름]
// 출력: experiment/analysis/<이름>.md, .json  (실명 사이트 정보는 포함하지 않음: 사업자·업종 단위 집계만)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse as parseDomain } from 'tldts';
import { classifyRequest, TRACKING_CATEGORIES, CATEGORY_LABELS } from '../lib/trackers.js';

const [RES = 'experiment/results', LIST = 'experiment/sites.csv', NAME = '2026-10-07_detail'] = process.argv.slice(2);
const DOMESTIC = new Set(['naver', 'kakao', 'enliple', 'widerplanet', 'dable', 'acecounter', 'bizspring', 'wisetracker', 'beusable', 'groobee', 'bigin', 'ab180', 'hackle', 'channelio', 'daangn', 'pg']);
// 주 기능: 한 사업자가 여러 기능을 가지면 고지 필요성이 큰 순서로 하나만 배정 (쌍 합계가 전체와 같도록)
const PRIORITY = ['advertising', 'session_replay', 'attribution', 'analytics', 'marketing', 'social'];

const rows = readFileSync(LIST, 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const sites = rows.map(([cat, url]) => ({ cat, r: JSON.parse(readFileSync(`${RES}/${new URL(url).hostname.replace(/^www\./, '')}.json`, 'utf8')) }))
  .filter(({ r }) => !r.error && r.policy.found);
const reg = h => parseDomain(h).domain || h;
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '-');
const median = xs => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const tally = () => ({ n: 0, explicit: 0, vague: 0, undisclosed: 0 });
const add = (t, s) => { t.n++; t[s]++; };
const row = (label, t) => `| ${label} | ${t.n} | ${t.explicit} (${pct(t.explicit, t.n)}) | ${t.vague} (${pct(t.vague, t.n)}) | **${t.undisclosed} (${pct(t.undisclosed, t.n)})** |`;

const byFunc = {}, byOrigin = { 국내: tally(), 해외: tally() }, byIndustry = {};
const cookieByStatus = { explicit: [], vague: [], undisclosed: [] };   // 사업자별 생성 쿠키 수
const lifetimes = { explicit: [], vague: [], undisclosed: [] };       // 쿠키 만료까지 일수 (영속 쿠키만)
const idParam = { explicit: tally(), vague: tally(), undisclosed: tally() };
const firstDelay = { explicit: [], vague: [], undisclosed: [] };      // 사이트 첫 요청 대비 해당 사업자 첫 요청까지 초

for (const { cat, r } of sites) {
  const t0 = Math.min(...r.raw.requests.map(q => q.ts));
  const scanTs = Date.parse(r.scannedAt) / 1000;
  // 쿠키 → 사업자 매핑 (값은 원래 저장되지 않음)
  const cookiesByEntity = {};
  for (const c of r.raw.cookies) {
    const cls = classifyRequest(c.domain.replace(/^\./, ''));
    if (!cls || reg(c.domain.replace(/^\./, '')) === reg(r.raw.siteHost)) continue;
    (cookiesByEntity[cls.entity.id] ||= []).push(c);
  }
  for (const e of r.entities.filter(x => x.tracking)) {
    const func = PRIORITY.find(p => e.categories.includes(p));
    add(byFunc[func] ||= tally(), e.status);
    add(byOrigin[DOMESTIC.has(e.id) ? '국내' : '해외'], e.status);
    add(byIndustry[cat] ||= tally(), e.status);
    const cs = cookiesByEntity[e.id] || [];
    cookieByStatus[e.status].push(cs.length);
    for (const c of cs) if (c.expires > 0) lifetimes[e.status].push((c.expires - scanTs) / 86400);
    idParam[e.status].n++; if (e.idParams?.length) idParam[e.status][e.status]++;
    firstDelay[e.status].push((e.firstSeenMs - t0) / 1000);
  }
}

const statuses = ['explicit', 'vague', 'undisclosed'];
const SL = { explicit: '명시', vague: '포괄 고지', undisclosed: '미명시' };
const sum = xs => xs.reduce((a, b) => a + b, 0);
const lines = [];
lines.push(`# 세부 분석: ${NAME}`, '', `대상: 처리방침을 확보한 ${sites.length}곳, 사이트–추적 사업자 쌍 ${sum(Object.values(byFunc).map(t => t.n))}개. 결과 파일 읽기 전용(재스캔 없음).`, '');
lines.push('## 1. 기능별 고지 상태', '', '한 사업자가 여러 기능을 가지면 광고 > 세션 녹화 > 성과 측정 > 분석 > 마케팅 > 소셜 순으로 하나만 배정했습니다.', '');
lines.push('| 주 기능 | 쌍 | 명시 | 포괄 고지 | 미명시 |', '|---|---|---|---|---|');
for (const f of PRIORITY) if (byFunc[f]) lines.push(row(CATEGORY_LABELS[f], byFunc[f]));
lines.push('', '## 2. 사업자 출처별 고지 상태', '', '| 출처 | 쌍 | 명시 | 포괄 고지 | 미명시 |', '|---|---|---|---|---|');
for (const [k, t] of Object.entries(byOrigin)) lines.push(row(k, t));
lines.push('', '## 3. 업종별 고지 상태 (쌍 기준)', '', '| 업종 | 쌍 | 명시 | 포괄 고지 | 미명시 |', '|---|---|---|---|---|');
for (const [k, t] of Object.entries(byIndustry).sort((a, b) => b[1].undisclosed / b[1].n - a[1].undisclosed / a[1].n)) lines.push(row(k, t));

lines.push('', '## 4. 쿠키·식별자 전송 (수집 강도)', '');
lines.push('| 고지 상태 | 쌍 | 쿠키를 생성한 쌍 | 생성 쿠키 합계 | 영속 쿠키 만료 중앙값(일) | 약 1년 이상 쿠키(360일+) | 식별 파라미터 전송 쌍 | 첫 요청까지 중앙값(초) | 5초 안에 호출된 쌍 |');
lines.push('|---|---|---|---|---|---|---|---|---|');
const detail = {};
for (const s of statuses) {
  const n = cookieByStatus[s].length, withC = cookieByStatus[s].filter(x => x > 0).length, total = sum(cookieByStatus[s]);
  const lt = lifetimes[s], longLived = lt.filter(d => d >= 360).length;   // 만료일을 스캔 종료 시각 기준으로 계산하므로 1년 쿠키가 364.x일로 잡힘 → 360일 이상을 약 1년 이상으로 집계
  const fd = firstDelay[s], fast = fd.filter(d => d <= 5).length;
  detail[s] = { pairs: n, pairsWithCookies: withC, cookies: total, lifetimeMedianDays: median(lt), cookiesOver1y: longLived, persistentCookies: lt.length, pairsWithIdParams: idParam[s][s], firstRequestMedianSec: median(fd), within5s: fast };
  lines.push(`| ${SL[s]} | ${n} | ${withC} (${pct(withC, n)}) | ${total} | ${median(lt)?.toFixed(0) ?? '-'} | ${longLived}/${lt.length} (${pct(longLived, lt.length)}) | ${idParam[s][s]} (${pct(idParam[s][s], n)}) | ${median(fd)?.toFixed(1) ?? '-'} | ${fast} (${pct(fast, n)}) |`);
}
lines.push('', '- 식별 파라미터: 요청 URL에 `uid`, `cid`, `_ga`, `fbp`, `gclid` 등 이용자·기기 식별용 이름의 파라미터가 있는 경우입니다. 값은 저장하지 않았습니다.');
lines.push('- 첫 요청까지 시간: 해당 사이트의 첫 네트워크 요청 시점부터 그 사업자로 첫 요청이 나가기까지의 시간입니다. 메인 페이지 로딩 직후 호출되는지 보여주며, 동의 배너와 상호작용하지 않은 상태의 값입니다.');

mkdirSync('experiment/analysis', { recursive: true });
writeFileSync(`experiment/analysis/${NAME}.md`, lines.join('\n') + '\n');
writeFileSync(`experiment/analysis/${NAME}.json`, JSON.stringify({ sites: sites.length, byFunction: byFunc, byOrigin, byIndustry, cookiesAndIds: detail }, null, 2));
console.log(lines.join('\n'));
