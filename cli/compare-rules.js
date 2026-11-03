// 판정 규칙 v1 ↔ v2 비교 (저장된 원시 관측 데이터로 재분석만 수행, 새 스캔 없음, 원본 파일 수정 없음)
// node cli/compare-rules.js <결과폴더> [<결과폴더> ...] --out experiment/analysis/rules_v1_v2.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { reanalyze } from '../lib/scan.js';

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? args[oi + 1] : null;
const dirs = args.filter((a, i) => !a.startsWith('--') && !(oi >= 0 && i === oi + 1));

const sites = [];
let v1Mismatch = 0;
for (const d of dirs) for (const f of readdirSync(d).filter(f => f.endsWith('.json'))) {
  const stored = JSON.parse(readFileSync(`${d}/${f}`, 'utf8'));
  if (stored.error || !stored.raw) continue;
  const a = await reanalyze(stored.raw, { rules: 'v1' });
  const b = await reanalyze(stored.raw, { rules: 'v2' });
  // 재현성 확인: v1 재분석이 저장된 결과와 같아야 함
  if (JSON.stringify(a.metrics) !== JSON.stringify(stored.metrics)) v1Mismatch++;
  sites.push({ dir: d, site: stored.siteHost, category: stored.siteCategory, policyFound: a.policy.found, v1: a, v2: b });
}

const T = s => s.entities.filter(e => e.tracking);
const sum = (list, f) => list.reduce((x, s) => x + f(s), 0);
const withPolicy = sites.filter(s => s.policyFound);
const totals = v => {
  const pairs = sum(withPolicy, s => T(s[v]).length);
  const cnt = st => sum(withPolicy, s => T(s[v]).filter(e => e.status === st).length);
  const unk = sites.map(s => s[v].unknownThirdParties.length);
  const reqs = sum(sites, s => s[v].thirdPartyRequests);
  const unkReqs = sum(sites, s => s[v].unknownThirdParties.reduce((x, u) => x + u.requests, 0));
  return {
    sites: withPolicy.length, pairs,
    explicit: cnt('explicit'), vague: cnt('vague'), undisclosed: cnt('undisclosed'),
    undisclosedRate: +(cnt('undisclosed') / pairs).toFixed(3),
    sitesWithUndisclosed: withPolicy.filter(s => s[v].metrics.undisclosed > 0).length,
    meanGap: +(sum(withPolicy, s => s[v].metrics.gapIndex) / withPolicy.length).toFixed(3),
    gradeE: withPolicy.filter(s => s[v].metrics.grade === 'E').length,
    unknownDomainsMean: +(unk.reduce((a, b) => a + b, 0) / unk.length).toFixed(1),
    unknownRequestShare: +(unkReqs / reqs).toFixed(3),   // 제3자 요청 중 미분류 도메인 비중 (상한 50개 기준)
  };
};

// 같은 (사이트, 사업자) 쌍의 판정 변화
const changed = [];
const v2Only = [];
for (const s of withPolicy) {
  const m1 = new Map(T(s.v1).map(e => [e.id, e]));
  for (const e of T(s.v2)) {
    const o = m1.get(e.id);
    if (!o) { v2Only.push({ site: s.site, entity: e.name, status: e.status, unnamed: !!e.unnamed, loadedScript: e.loadedScript }); continue; }
    if (o.status !== e.status) changed.push({ site: s.site, entity: e.name, v1: o.status, v2: e.status, reason: e.nameOnlyIn || (o.tracking !== e.tracking ? 'category' : 'other'), nameEvidence: e.nameEvidence || null });
  }
}
const scriptShare = st => {
  const l = withPolicy.flatMap(s => T(s.v2).filter(e => e.status === st));
  return { n: l.length, scriptLoaded: l.filter(e => e.loadedScript).length };
};

const out = {
  generatedAt: new Date().toISOString(), dirs, sitesScanned: sites.length, v1ReanalysisMismatch: v1Mismatch,
  v1: totals('v1'), v2: totals('v2'),
  transitions: changed.reduce((a, c) => (a[`${c.v1}→${c.v2}`] = (a[`${c.v1}→${c.v2}`] || 0) + 1, a), {}),
  changed,
  v2OnlyPairs: { n: v2Only.length, unnamed: v2Only.filter(p => p.unnamed).length, undisclosed: v2Only.filter(p => p.status === 'undisclosed').length, list: v2Only },
  v2LoadedByScript: { explicit: scriptShare('explicit'), vague: scriptShare('vague'), undisclosed: scriptShare('undisclosed') },
};
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 2));
const { changed: _c, v2OnlyPairs: { list: _l, ...v2o }, ...brief } = out;
console.log(JSON.stringify({ ...brief, v2OnlyPairs: v2o }, null, 2));
console.error(`\n판정이 바뀐 쌍 ${changed.length}건:`);
changed.forEach(c => console.error(`  ${c.site} / ${c.entity}: ${c.v1} → ${c.v2} (${c.reason})`));
