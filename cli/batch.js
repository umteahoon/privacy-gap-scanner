// 실험용 일괄 스캔: node cli/batch.js [experiment/sites.csv] [--concurrency 3]
// 결과: experiment/results/<도메인>.json, experiment/summary.csv, experiment/labels.csv(정답지 라벨링 양식),
//       public/experiment-summary.json(웹 대시보드용, 사이트명 익명화)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { scanSite, reanalyze } from '../lib/scan.js';
import { CATEGORY_LABELS } from '../lib/trackers.js';

const args = process.argv.slice(2);
const listPath = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || 'experiment/sites.csv';
const ci = args.indexOf('--concurrency');
const concurrency = ci >= 0 ? +args[ci + 1] : 3;
const force = args.includes('--force');
const reanalyzeOnly = args.includes('--reanalyze');   // 기존 원시 데이터로 판정만 다시 수행

const rows = readFileSync(listPath, 'utf8').trim().split(/\r?\n/).slice(1).map(l => {
  const [category, url, policy_url] = l.split(',');
  return { category, url, policy_url: policy_url || undefined };
});
mkdirSync('experiment/results', { recursive: true });
const fileFor = url => `experiment/results/${new URL(url).hostname.replace(/^www\./, '')}.json`;

let next = 0;
async function worker() {
  while (next < rows.length) {
    const row = rows[next++];
    const f = fileFor(row.url);
    if (reanalyzeOnly) {
      const old = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
      if (old?.raw) {
        const r = await reanalyze(old.raw);
        Object.assign(r, { scannedAt: old.scannedAt, siteCategory: row.category, raw: old.raw });
        writeFileSync(f, JSON.stringify(r, null, 2));
      }
      continue;
    }
    if (!force && existsSync(f)) { console.error(`skip ${row.url}`); continue; }
    const t = Date.now();
    try {
      const r = await scanSite(row.url, { policyUrl: row.policy_url, keepRaw: true });
      r.siteCategory = row.category;
      writeFileSync(f, JSON.stringify(r, null, 2));
      console.error(`ok   ${row.url}  grade=${r.metrics.grade} U=${r.metrics.undisclosed}/${r.metrics.trackingEntities} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
    } catch (e) {
      writeFileSync(f, JSON.stringify({ url: row.url, siteCategory: row.category, error: e.message.split('\n')[0], excluded: e.code || null, scannedAt: new Date().toISOString() }, null, 2));
      console.error(`${e.code ? 'SKIP' : 'FAIL'} ${row.url}  ${e.message.split('\n')[0]}`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

// ── 집계 ──
const results = rows.map(r => JSON.parse(readFileSync(fileFor(r.url), 'utf8')));
const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

const summary = [['site', 'category', 'ok', 'policy_found', 'tracking_entities', 'explicit', 'vague', 'undisclosed', 'policy_coverage', 'gap_index', 'third_party_cookies', 'grade', 'duration_s', 'error']];
const labels = [['site', 'entity', 'categories', 'hosts', 'system_status', 'system_evidence', 'annotator1', 'annotator2', 'gold', 'note']];
for (const r of results) {
  const site = new URL(r.url).hostname;
  if (r.error) { summary.push([site, r.siteCategory, 0, '', '', '', '', '', '', '', '', '', '', r.error]); continue; }
  const m = r.metrics;
  summary.push([site, r.siteCategory, 1, r.policy.found ? 1 : 0, m.trackingEntities, m.explicit, m.vague, m.undisclosed, m.policyCoverage, m.gapIndex, m.thirdPartyCookies, m.grade, (r.durationMs / 1000).toFixed(0), r.policy.found ? '' : r.policy.reason]);
  for (const e of r.entities.filter(e => e.tracking)) {
    labels.push([site, e.name, e.categories.join('|'), e.hosts.join(' '), e.status, e.evidence || '', '', '', '', '']);
  }
}
writeFileSync('experiment/summary.csv', '﻿' + summary.map(r => r.map(csv).join(',')).join('\n'));
if (!existsSync('experiment/labels.csv') || force) {
  writeFileSync('experiment/labels.csv', '﻿' + labels.map(r => r.map(csv).join(',')).join('\n'));
} else {
  writeFileSync('experiment/labels.new.csv', '﻿' + labels.map(r => r.map(csv).join(',')).join('\n'));
  console.error('labels.csv 가 이미 있어 labels.new.csv 로 저장 (기존 라벨 보존)');
}

// 대시보드용 익명 집계
const ok = results.filter(r => !r.error);
const withPolicy = ok.filter(r => r.policy.found);
const entityFreq = {};
for (const r of withPolicy) for (const e of r.entities.filter(e => e.tracking)) {
  const f = entityFreq[e.name] ||= { name: e.name, sites: 0, undisclosed: 0, vague: 0, categories: new Set() };
  f.sites++; if (e.status === 'undisclosed') f.undisclosed++; if (e.status === 'vague') f.vague++;
  e.categories.forEach(c => f.categories.add(CATEGORY_LABELS[c] || c));
}
const byCat = {};
// 익명화: 사이트 목록 순서로 역추적되지 않도록 업종·지표 기준으로 정렬한 뒤 ID 부여
const anon = ok.map(r => ({
  category: r.siteCategory, policyFound: r.policy.found,
  ...(({ trackingEntities, explicit, vague, undisclosed, gapIndex, policyCoverage, thirdPartyCookies, grade }) =>
    ({ trackingEntities, explicit, vague, undisclosed, gapIndex, policyCoverage, thirdPartyCookies, grade }))(r.metrics),
})).sort((a, b) => a.category.localeCompare(b.category) || a.gapIndex - b.gapIndex || a.trackingEntities - b.trackingEntities)
  .map((s, i) => ({ id: `S${String(i + 1).padStart(2, '0')}`, ...s }));
for (const s of anon) {
  const c = byCat[s.category] ||= { category: s.category, sites: 0, avgGap: 0, avgTrackers: 0, withUndisclosed: 0 };
  c.sites++; c.avgGap += s.gapIndex; c.avgTrackers += s.trackingEntities; if (s.undisclosed > 0) c.withUndisclosed++;
}
Object.values(byCat).forEach(c => { c.avgGap = +(c.avgGap / c.sites).toFixed(3); c.avgTrackers = +(c.avgTrackers / c.sites).toFixed(1); });
const out = {
  generatedAt: new Date().toISOString(),
  totals: {
    sites: rows.length, scanned: ok.length, failed: results.length - ok.length, policyFound: withPolicy.length,
    blocked: results.filter(r => r.excluded === 'blocked').length,
    robotsExcluded: results.filter(r => r.excluded === 'robots').length,
    otherErrors: results.filter(r => r.error && !r.excluded).length,
    sitesWithUndisclosed: withPolicy.filter(r => r.metrics.undisclosed > 0).length,
    trackingPairs: withPolicy.reduce((a, r) => a + r.metrics.trackingEntities, 0),
    undisclosedPairs: withPolicy.reduce((a, r) => a + r.metrics.undisclosed, 0),
    vaguePairs: withPolicy.reduce((a, r) => a + r.metrics.vague, 0),
    grades: anon.reduce((a, s) => (a[s.grade] = (a[s.grade] || 0) + 1, a), {}),
  },
  byCategory: Object.values(byCat),
  topEntities: Object.values(entityFreq).map(f => ({ ...f, categories: [...f.categories] })).sort((a, b) => b.sites - a.sites).slice(0, 20),
  sites: anon,
};
mkdirSync('public', { recursive: true });
writeFileSync('public/experiment-summary.json', JSON.stringify(out, null, 2));
console.error(`\n완료: ${ok.length}/${rows.length} 성공, 처리방침 발견 ${withPolicy.length}, 미명시 트래커 보유 사이트 ${out.totals.sitesWithUndisclosed}`);
