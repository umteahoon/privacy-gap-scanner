// v2 지식베이스에서만 새로 잡히는 (사이트, 사업자) 쌍의 보충 라벨링 파일 생성
// 기존 labels.csv / labels_A·B.xlsx 는 건드리지 않는다. 같은 표본 사이트(labels_annotator_sample.csv)만 대상.
// 사용: node cli/make-labels-v2extra.js
// 출력: experiment/labels_v2extra.csv (시스템 판정 포함, 평가자에게 보여주지 말 것)
//       experiment/labels_v2extra_annotator.csv, experiment/labels_v2extra_A.xlsx, _B.xlsx
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { reanalyze } from '../lib/scan.js';

const OUT = 'experiment/labels_v2extra.csv';
if (existsSync(OUT) && /"(명시|포괄|미명시)"/.test(readFileSync(OUT, 'utf8'))) {
  console.error(`${OUT} 에 이미 라벨이 있어 덮어쓰지 않습니다.`); process.exit(1);
}
const firstCol = l => (l.match(/^"((?:[^"]|"")*)"/) || [])[1];
const sampleSites = [...new Set(readFileSync('experiment/labels_annotator_sample.csv', 'utf8').replace(/^﻿/, '')
  .split(/\r?\n/).slice(1).map(firstCol).filter(Boolean))];
const v1Pairs = new Set(readFileSync('experiment/labels.csv', 'utf8').split(/\r?\n/).slice(1)
  .map(l => l.match(/^"((?:[^"]|"")*)","((?:[^"]|"")*)"/)).filter(Boolean).map(m => `${m[1]}\u0000${m[2]}`));

const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const write = (path, table) => writeFileSync(path, '﻿' + table.map(r => r.map(csv).join(',')).join('\r\n') + '\r\n');
const full = [['site', 'entity', 'categories', 'hosts', 'policy_url', 'system_status', 'system_evidence', 'annotator1', 'annotator2', 'gold', 'note']];
for (const site of sampleSites) {
  const stored = JSON.parse(readFileSync(`experiment/results/${site.replace(/^www\./, '')}.json`, 'utf8'));
  const r = await reanalyze(stored.raw, { rules: 'v2' });
  for (const e of r.entities.filter(e => e.tracking && !v1Pairs.has(`${site}\u0000${e.name}`))) {
    full.push([site, e.name, e.categories.join('|'), e.hosts.join(' '), r.policy.url, e.status, e.evidence || '', '', '', '', '']);
  }
}
write(OUT, full);
write('experiment/labels_v2extra_annotator.csv', full.map(r => r.filter((_, i) => i !== 5 && i !== 6)));
execFileSync(process.platform === 'win32' ? 'python' : 'python3',
  ['cli/labels_xlsx.py', 'make', 'experiment/labels_v2extra_annotator.csv', 'experiment/labels_v2extra'], { stdio: 'inherit' });
console.log(JSON.stringify({ sites: sampleSites.length, rows: full.length - 1 }));
