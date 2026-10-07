// 사용법: node cli/scan.js <URL> [--policy <처리방침 URL>] [--out result.json]
import { writeFileSync } from 'node:fs';
import { scanSite } from '../lib/scan.js';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (!url) { console.error('usage: node cli/scan.js <URL> [--policy URL] [--out file]'); process.exit(1); }

const result = await scanSite(url, {
  policyUrl: opt('--policy'),
  onProgress: (stage, msg) => console.error(`[${stage}] ${msg}`),
});

const m = result.metrics;
console.error(`\n등급 ${m.grade} — ${m.gradeReason}`);
console.error(`처리방침: ${result.policy.found ? result.policy.url : '미발견 (' + result.policy.reason + ')'}`);
for (const e of result.entities) {
  console.error(`  ${e.tracking ? '●' : '○'} ${e.name.padEnd(24)} ${e.categories.join(',').padEnd(22)} ${e.status}${e.matched ? ' ← "' + e.matched + '"' : ''}`);
}
if (result.unknownThirdParties.length) console.error(`  미분류 제3자 도메인: ${result.unknownThirdParties.map(u => u.domain).join(', ')}`);
const out = opt('--out');
if (out) writeFileSync(out, JSON.stringify(result, null, 2));
else console.log(JSON.stringify(result.metrics, null, 2));
