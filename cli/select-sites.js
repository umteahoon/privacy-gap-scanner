// 표본 확대용 후보 선별 (Tranco 목록 → .kr 도메인 → 자동 제외 규칙 적용)
// 사용: node cli/select-sites.js <top-1m.csv> --from-rank 97655 --want 120 --out <후보.json>
//   --want: 자동 규칙을 통과한 후보를 이 수만큼 모으면 멈춤 (연구자 판단 제외는 이후 사람이/기록과 함께 수행)
// 각 도메인에 대해 robots.txt 1회, 홈페이지 1회만 요청한다 (스캐너 식별 UA, 동시 4개, 요청 간 대기).
// 자동 제외 규칙은 2026-10-09 확대 표본(selection.md)과 같다.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { parse as parseDomain } from 'tldts';
import { loadRobots, isAllowed, BOT_TOKEN } from '../lib/robots.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const LIST = args[0];
const FROM = Number(opt('--from-rank', 1));
const WANT = Number(opt('--want', 100));
const OUT = opt('--out', 'candidates.json');

const PUBLIC_EDU = /\.(go|ac|re|or|mil|es|ms|hs|sc|kg|seoul|busan|daegu|incheon|gwangju|daejeon|ulsan|gyeonggi|gangwon|chungbuk|chungnam|jeonbuk|jeonnam|gyeongbuk|gyeongnam|jeju)\.kr$|^gov\.kr$/;
const reg = d => parseDomain(d).domain || d;

// 기존 표본 전체(모든 실험의 sites.csv)와 중복 제외
const existing = new Set();
const lists = ['experiment/sites.csv', ...readdirSync('experiment/runs').map(r => `experiment/runs/${r}/sites.csv`)].filter(existsSync);
for (const f of lists) for (const l of readFileSync(f, 'utf8').trim().split(/\r?\n/).slice(1)) {
  try { existing.add(reg(new URL(l.split(',')[1]).hostname)); } catch { /* 머리글 등 무시 */ }
}

const rows = readFileSync(LIST, 'utf8').trim().split(/\r?\n/).map(l => l.split(','))
  .map(([rank, domain]) => ({ rank: +rank, domain })).filter(r => r.rank >= FROM && /\.kr$/.test(r.domain));

const UA = `Mozilla/5.0 (compatible; ${BOT_TOKEN}/1.0; +privacy-policy research; candidate screening)`;
function decodeTitle(buf, contentType) {
  const head = buf.subarray(0, 4096).toString('latin1');
  const cs = (contentType.match(/charset=([\w-]+)/i) || head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  let html;
  try { html = new TextDecoder(cs.toLowerCase().replace(/^ks_c_5601-1987$/, 'euc-kr')).decode(buf); } catch { html = buf.toString('utf8'); }
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 80) || '';
}
async function home(domain) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`https://${domain}/`, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, 'accept-language': 'ko-KR' } });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, final: r.url, finalDomain: reg(new URL(r.url).hostname), title: decodeTitle(buf, r.headers.get('content-type') || '') };
  } catch (e) { return { status: 'ERR', error: e.name }; } finally { clearTimeout(t); }
}

const out = [];
let passed = 0, i = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function worker() {
  while (i < rows.length && passed < WANT) {
    const { rank, domain } = rows[i++];
    let c = { rank, domain };
    if (PUBLIC_EDU.test(domain)) c.rule = '공공·교육 도메인';
    else if (existing.has(reg(domain))) c.rule = '기존 표본 중복';
    else {
      const robots = await loadRobots(`https://${domain}`);
      if (robots.disallowAll || !isAllowed(robots, '/')) c.rule = 'robots.txt 금지/확인 불가';
      else {
        Object.assign(c, await home(domain));
        if (c.status !== 200) c.rule = c.status === 'ERR' ? '접속 오류' : `홈페이지 비정상 응답(${c.status})`;
        else if (c.finalDomain !== reg(domain)) c.rule = `다른 도메인으로 이동(${c.finalDomain})`;
        else passed++;
      }
      await sleep(500);
    }
    out.push(c);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
out.sort((a, b) => a.rank - b.rank);
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ screened: out.length, passed: out.filter(c => !c.rule).length, lastRank: out.at(-1)?.rank, existing: existing.size }));
