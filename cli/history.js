// 실험 이력·누적 통계 생성 (결과 파일 읽기 전용, 재스캔 없음)
// 사용: node cli/history.js
// 출력: public/experiment-history.json  (웹 "실증 실험" 페이지용, 사이트명 없이 집계값만)
//       experiment/analysis/history.md    (연구용 요약)
// 판정은 저장된 결과(v1 규칙) 그대로 사용한다.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { parse as parseDomain } from 'tldts';

// 실험 회차: 본 실험 + experiment/runs/<회차>/run.json 이 있는 폴더 전부
//   run.json 예: {"purpose": "표본 3차 확대 (Tranco .kr)", "kind": "expand"}   kind: repeat | expand | sensitivity
// 새 실험 폴더에 run.json 만 만들면 자동으로 포함된다.
const RUNS = [
  { id: 'main', dir: 'experiment/results', purpose: '본 실험 (논문 1차 수치)', kind: 'main' },
  ...readdirSync('experiment/runs').filter(d => existsSync(`experiment/runs/${d}/run.json`)).sort()
    .map(d => ({ id: d, ...JSON.parse(readFileSync(`experiment/runs/${d}/run.json`, 'utf8')) })),
];

const siteKey = r => parseDomain(new URL(r.url).hostname).domain || new URL(r.url).hostname;
const ymd = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const r3 = x => +x.toFixed(3);
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function summarize(results) {
  const ok = results.filter(r => !r.error);
  const withPolicy = ok.filter(r => r.policy.found);
  const T = r => r.entities.filter(e => e.tracking);
  const pairs = withPolicy.reduce((a, r) => a + T(r).length, 0);
  const cnt = st => withPolicy.reduce((a, r) => a + T(r).filter(e => e.status === st).length, 0);
  return {
    attempted: results.length, scanned: ok.length, policyFound: withPolicy.length,
    robotsExcluded: results.filter(r => r.excluded === 'robots').length,
    blocked: results.filter(r => r.excluded === 'blocked').length,
    otherErrors: results.filter(r => r.error && !r.excluded).length,
    trackingPairs: pairs, explicit: cnt('explicit'), vague: cnt('vague'), undisclosed: cnt('undisclosed'),
    undisclosedRate: pairs ? r3(cnt('undisclosed') / pairs) : null,
    sitesWithUndisclosed: withPolicy.filter(r => r.metrics.undisclosed > 0).length,
    meanGap: withPolicy.length ? r3(mean(withPolicy.map(r => r.metrics.gapIndex))) : null,
    meanTrackers: withPolicy.length ? +mean(withPolicy.map(r => r.metrics.trackingEntities)).toFixed(1) : null,
    grades: withPolicy.reduce((a, r) => (a[r.metrics.grade] = (a[r.metrics.grade] || 0) + 1, a), {}),
  };
}

const runs = [];
const all = [];   // { run, kind, result }
for (const run of RUNS) {
  const dir = run.dir || `experiment/runs/${run.id}/results`;
  if (!existsSync(dir)) continue;
  const results = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
  if (!results.length) continue;
  const times = results.map(r => r.scannedAt).filter(Boolean).sort();
  // 목록보다 결과가 적으면 아직 검사 중인 회차
  const list = run.dir ? 'experiment/sites.csv' : `experiment/runs/${run.id}/sites.csv`;
  const planned = existsSync(list) ? readFileSync(list, 'utf8').trim().split(/\r?\n/).length - 1 : null;
  const inProgress = planned != null && results.length < planned;
  runs.push({ id: run.id, purpose: run.purpose, kind: run.kind, date: ymd(times[0]), firstAt: times[0], lastAt: times.at(-1), planned, inProgress, ...summarize(results) });
  results.forEach(r => all.push({ run: run.id, kind: run.kind, result: r }));
}

// 날짜별 검사 횟수 (모든 회차의 개별 검사 시도를 검사 시각 기준으로 집계)
const byDate = {};
for (const { result: r } of all) {
  const d = ymd(r.scannedAt);
  const x = byDate[d] ||= { date: d, attempted: 0, scanned: 0, policyFound: 0 };
  x.attempted++; if (!r.error) { x.scanned++; if (r.policy.found) x.policyFound++; }
}

// 누적 고유 사이트: 같은 사이트를 여러 번 검사했으면 가장 최근의 성공 결과를 대표로 사용
// (수집 깊이 비교 회차는 측정 조건이 달라 대표 결과에서 제외)
const latest = new Map();
for (const x of all.filter(x => x.kind !== 'sensitivity')) {
  const k = siteKey(x.result);
  const cur = latest.get(k);
  const better = !cur || (cur.result.error && !x.result.error) || (!!cur.result.error === !!x.result.error && x.result.scannedAt > cur.result.scannedAt);
  if (better) latest.set(k, x);
}
const pooled = [...latest.values()].map(x => x.result);
const cumulative = summarize(pooled);
const byCategory = {};
for (const r of pooled.filter(r => !r.error && r.policy.found)) {
  const c = byCategory[r.siteCategory] ||= { category: r.siteCategory, sites: 0, pairs: 0, undisclosed: 0, withUndisclosed: 0 };
  c.sites++; c.pairs += r.metrics.trackingEntities; c.undisclosed += r.metrics.undisclosed; if (r.metrics.undisclosed > 0) c.withUndisclosed++;
}
const out = {
  generatedAt: new Date().toISOString(),
  rules: 'v1',
  totalScans: all.length,
  uniqueSites: latest.size,
  cumulative,
  cumulativeByCategory: Object.values(byCategory).map(c => ({ ...c, undisclosedRate: c.pairs ? r3(c.undisclosed / c.pairs) : null }))
    .sort((a, b) => b.sites - a.sites),
  runs: runs.sort((a, b) => a.firstAt.localeCompare(b.firstAt)),
  byDate: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
};
writeFileSync('public/experiment-history.json', JSON.stringify(out, null, 2));

const pct = x => (x == null ? '-' : (x * 100).toFixed(1) + '%');
const L = ['# 실험 이력 및 누적 통계', '', `생성: ${out.generatedAt} · 판정 규칙 v1 · 전체 검사 ${out.totalScans}회 · 고유 사이트 ${out.uniqueSites}곳`, '',
  '## 회차별', '', '| 날짜 | 회차 | 목적 | 시도 | 성공 | 처리방침 확보 | 정책상 제외(robots/차단) | 오류 | 추적 쌍 | 미명시율 | 미명시 보유 사이트 |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...out.runs.map(r => `| ${r.date} | ${r.id} | ${r.purpose}${r.inProgress ? ` (진행 중 ${r.attempted}/${r.planned})` : ''} | ${r.attempted} | ${r.scanned} | ${r.policyFound} | ${r.robotsExcluded}/${r.blocked} | ${r.otherErrors} | ${r.trackingPairs} | ${pct(r.undisclosedRate)} | ${r.sitesWithUndisclosed}/${r.policyFound} |`),
  '', '## 날짜별 검사 횟수', '', '| 날짜 | 시도 | 성공 | 처리방침 확보 |', '|---|---|---|---|',
  ...out.byDate.map(d => `| ${d.date} | ${d.attempted} | ${d.scanned} | ${d.policyFound} |`),
  '', '## 누적 (고유 사이트, 사이트별 최신 성공 결과 기준, 수집 깊이 비교 회차 제외)', '',
  `- 고유 사이트 ${out.uniqueSites}곳 중 스캔 성공 ${cumulative.scanned}, 처리방침 확보 ${cumulative.policyFound}, 정책상 제외 robots ${cumulative.robotsExcluded}·차단 ${cumulative.blocked}, 오류 ${cumulative.otherErrors}`,
  `- 추적 쌍 ${cumulative.trackingPairs}: 명시 ${cumulative.explicit}, 포괄 ${cumulative.vague}, 미명시 ${cumulative.undisclosed} (${pct(cumulative.undisclosedRate)})`,
  `- 미명시 보유 사이트 ${cumulative.sitesWithUndisclosed}/${cumulative.policyFound}, 평균 Gap ${cumulative.meanGap}`,
  '', '| 업종 | 사이트 | 추적 쌍 | 미명시율 | 미명시 보유 |', '|---|---|---|---|---|',
  ...out.cumulativeByCategory.map(c => `| ${c.category} | ${c.sites} | ${c.pairs} | ${pct(c.undisclosedRate)} | ${c.withUndisclosed} |`)];
writeFileSync('experiment/analysis/history.md', L.join('\n') + '\n');
console.log(L.slice(0, 14).join('\n'));
