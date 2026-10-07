// 실험 결과 재검증: 처리방침·방문 페이지가 현재 robots.txt 규칙(RFC 9309)에서 허용되는지 확인하고,
// 금지된 처리방침은 "확보 실패(policy-robots-disallowed)"로 바꿔 저장된 원시 데이터로 재판정한다.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { loadRobots, isAllowed } from '../lib/robots.js';
import { reanalyze } from '../lib/scan.js';

const cache = new Map();
const allowed = async u => {
  const url = new URL(u);
  if (!cache.has(url.origin)) cache.set(url.origin, await loadRobots(url.origin));
  return isAllowed(cache.get(url.origin), url.pathname + url.search);
};

const dir = 'experiment/results';
for (const f of readdirSync(dir)) {
  const r = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  if (r.error || !r.raw) continue;
  const issues = [];
  for (const p of r.raw.pages) if (p.url && !(await allowed(p.url))) issues.push(`page ${p.url}`);
  const pol = r.raw.policy;
  if (pol.found && !(await allowed(pol.url))) issues.push(`policy ${pol.url}`);
  if (!issues.length) continue;
  console.log(f, issues.join(' | '));
  if (pol.found && issues.some(i => i.startsWith('policy'))) {
    r.raw.policy = { found: false, url: pol.url, reason: 'policy-robots-disallowed' };
    const n = await reanalyze(r.raw);
    Object.assign(n, { scannedAt: r.scannedAt, siteCategory: r.siteCategory, raw: r.raw });
    writeFileSync(`${dir}/${f}`, JSON.stringify(n, null, 2));
  }
}
console.log('done');
