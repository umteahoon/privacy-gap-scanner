// 평가자 2명이 각자 채운 파일을 labels.csv 에 합친다.
// 사용: node cli/merge-labels.js <평가자1.csv> <평가자2.csv>
//   - 각 파일은 labels_annotator_sample.csv(또는 labels_annotator.csv)를 복사해 annotator1 / annotator2 열만 채운 것
//   - 두 판정이 같으면 gold 자동 기입, 다르면 비워 두고 목록 출력 → 협의 후 labels.csv 의 gold 열에 직접 기입
import { readFileSync, writeFileSync } from 'node:fs';

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1);
}
const load = p => { const [h, ...d] = parseCsv(readFileSync(p, 'utf8').replace(/^﻿/, '')); return { h, d, c: Object.fromEntries(h.map((x, i) => [x, i])) }; };
const key = (r, c) => `${r[c.site]}\u0000${r[c.entity]}`;
const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

const [f1, f2] = process.argv.slice(2);
if (!f1 || !f2) { console.error('usage: node cli/merge-labels.js <평가자1.csv> <평가자2.csv>'); process.exit(1); }
const L = load('experiment/labels.csv'), A = load(f1), B = load(f2);
const a1 = new Map(A.d.map(r => [key(r, A.c), r[A.c.annotator1]?.trim()]).filter(([, v]) => v));
const a2 = new Map(B.d.map(r => [key(r, B.c), r[B.c.annotator2]?.trim()]).filter(([, v]) => v));
if (!a1.size || !a2.size) { console.error(`라벨이 비어 있습니다 (평가자1 ${a1.size}행, 평가자2 ${a2.size}행). 각 파일의 annotator1 / annotator2 열을 확인하세요.`); process.exit(1); }

const conflicts = [];
for (const r of L.d) {
  const k = key(r, L.c);
  if (a1.has(k)) r[L.c.annotator1] = a1.get(k);
  if (a2.has(k)) r[L.c.annotator2] = a2.get(k);
  const v1 = r[L.c.annotator1], v2 = r[L.c.annotator2];
  if (v1 && v2 && !r[L.c.gold]) { if (v1 === v2) r[L.c.gold] = v1; else conflicts.push(`${r[L.c.site]} / ${r[L.c.entity]}: ${v1} vs ${v2}`); }
}
writeFileSync('experiment/labels.csv', '﻿' + [L.h, ...L.d].map(r => r.map(csv).join(',')).join('\r\n') + '\r\n');
console.log(`합침: 평가자1 ${a1.size}행, 평가자2 ${a2.size}행, 판정 불일치 ${conflicts.length}행`);
if (conflicts.length) { console.log('협의 후 labels.csv 의 gold 열에 기입할 행:'); conflicts.forEach(c => console.log('  ' + c)); }
