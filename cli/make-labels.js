// 정답지 라벨링 파일 생성 (결과 파일은 읽기만 함, 재스캔·재분석 없음)
// 사용: node cli/make-labels.js [--sample 18] [--seed 20261009]
// 출력:
//   experiment/labels.csv                    시스템 판정 포함 원본 (평가 스크립트 입력, 평가자에게 보여주지 말 것)
//   experiment/labels_annotator.csv          평가자용 (시스템 판정 열 제거, 처리방침 URL 포함)
//   experiment/labels_annotator_sample.csv   평가자용 무작위 표본 (행이 많을 때)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const SAMPLE_SITES = opt('--sample', 18);
const SEED = opt('--seed', 20261009);

const rows = readFileSync('experiment/sites.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const results = rows.map(([category, url]) => JSON.parse(readFileSync(`experiment/results/${new URL(url).hostname.replace(/^www\./, '')}.json`, 'utf8')));
const analyzed = results.filter(r => !r.error && r.policy.found);   // 논문 분석 대상과 동일 (처리방침 확보 사이트)

const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const write = (path, table) => writeFileSync(path, '﻿' + table.map(r => r.map(csv).join(',')).join('\r\n') + '\r\n');

const full = [['site', 'entity', 'categories', 'hosts', 'policy_url', 'system_status', 'system_evidence', 'annotator1', 'annotator2', 'gold', 'note']];
for (const r of analyzed) {
  const site = new URL(r.url).hostname;
  for (const e of r.entities.filter(e => e.tracking)) {
    full.push([site, e.name, e.categories.join('|'), e.hosts.join(' '), r.policy.url, e.status, e.evidence || '', '', '', '', '']);
  }
}

if (existsSync('experiment/labels.csv')) {
  const old = readFileSync('experiment/labels.csv', 'utf8');
  const filled = old.split(/\r?\n/).slice(1).some(l => /"(명시|포괄|미명시|explicit|vague|undisclosed)"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*$/.test(l));
  if (filled) { console.error('labels.csv 에 이미 라벨이 있어 덮어쓰지 않습니다.'); process.exit(1); }
}
write('experiment/labels.csv', full);

// 평가자용: 시스템 판정(system_status, system_evidence) 제거 → 독립 판정 보장
const drop = new Set([5, 6]);
const strip = t => t.map(r => r.filter((_, i) => !drop.has(i)));
write('experiment/labels_annotator.csv', strip(full));

// 고정 seed 무작위 사이트 표본 (mulberry32)
let s = SEED >>> 0;
const rand = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const sites = [...new Set(full.slice(1).map(r => r[0]))];
for (let i = sites.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [sites[i], sites[j]] = [sites[j], sites[i]]; }
const pick = new Set(sites.slice(0, SAMPLE_SITES));
const sample = [full[0], ...full.slice(1).filter(r => pick.has(r[0]))];
write('experiment/labels_annotator_sample.csv', strip(sample));

console.log(JSON.stringify({
  analyzedSites: analyzed.length, totalRows: full.length - 1,
  sample: { seed: SEED, sites: pick.size, rows: sample.length - 1 },
}));
