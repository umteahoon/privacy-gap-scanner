// 정답지 대비 성능 평가: node cli/eval.js [labels.csv ...] [--rules v2]
//   --rules v2: 시스템 판정을 저장된 원시 데이터로 v2 규칙 재분석해 비교 (같은 정답지로 v1·v2 비교)
//   예) v1: node cli/eval.js
//       v2: node cli/eval.js experiment/labels.csv experiment/labels_v2extra.csv --rules v2
// labels.csv 의 annotator1 / annotator2 / gold 열에 명시·포괄·미명시(또는 explicit·vague·undisclosed)를 입력한 뒤 실행.
// gold 가 비어 있으면 두 평가자 일치 시 그 값을, 한 명만 입력했으면 그 값을 정답으로 사용한다.
import { readFileSync, existsSync } from 'node:fs';
import { reanalyze } from '../lib/scan.js';

const MAP = { 명시: 'explicit', 포괄: 'vague', '포괄 고지': 'vague', 미명시: 'undisclosed', explicit: 'explicit', vague: 'vague', undisclosed: 'undisclosed' };
const norm = v => MAP[String(v || '').trim()] || null;

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
  return rows;
}

const argv = process.argv.slice(2);
const ri = argv.indexOf('--rules');
const RULES = ri >= 0 ? argv[ri + 1] : 'v1';
const paths = argv.filter((a, i) => !a.startsWith('--') && !(ri >= 0 && i === ri + 1));
if (!paths.length) paths.push('experiment/labels.csv');
const rows = [];
for (const path of paths) {
  const [head, ...data] = parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  const c = Object.fromEntries(head.map((h, i) => [h, i]));
  data.filter(r => r.length > 1).forEach(r => rows.push(Object.fromEntries(Object.entries(c).map(([k, i]) => [k, r[i]]))));
}

// v2: 사이트별 원시 데이터를 재분석해 사업자별 판정으로 교체 (v2에서 추적 사업자가 아니게 된 쌍은 제외)
const v2Status = new Map();
if (RULES === 'v2') {
  for (const site of new Set(rows.map(r => r.site))) {
    const f = `experiment/results/${site.replace(/^www\./, '')}.json`;
    if (!existsSync(f)) continue;
    const r = await reanalyze(JSON.parse(readFileSync(f, 'utf8')).raw, { rules: 'v2' });
    r.entities.filter(e => e.tracking).forEach(e => v2Status.set(`${site}\u0000${e.name}`, e.status));
  }
}
const col = { site: 'site', entity: 'entity', system_status: 'system_status', annotator1: 'annotator1', annotator2: 'annotator2', gold: 'gold' };
const items = rows.map(r => {
  const a1 = norm(r[col.annotator1]), a2 = norm(r[col.annotator2]);
  const gold = norm(r[col.gold]) || (a1 && a2 ? (a1 === a2 ? a1 : null) : a1 || a2);
  const sys = RULES === 'v2' ? norm(v2Status.get(`${r[col.site]}\u0000${r[col.entity]}`)) : norm(r[col.system_status]);
  return { site: r[col.site], entity: r[col.entity], sys, a1, a2, gold };
});

const labeled = items.filter(i => i.gold && i.sys);
if (!labeled.length) { console.error('라벨이 입력된 행이 없습니다. labels.csv 의 annotator1/annotator2/gold 열을 채우세요.'); process.exit(1); }

const classes = ['explicit', 'vague', 'undisclosed'];
const cm = Object.fromEntries(classes.map(g => [g, Object.fromEntries(classes.map(s => [s, 0]))]));
labeled.forEach(i => cm[i.gold][i.sys]++);

function prf(pos) {
  const tp = labeled.filter(i => pos(i.sys) && pos(i.gold)).length;
  const fp = labeled.filter(i => pos(i.sys) && !pos(i.gold)).length;
  const fn = labeled.filter(i => !pos(i.sys) && pos(i.gold)).length;
  const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, precision: +p.toFixed(3), recall: +r.toFixed(3), f1: +(p + r ? 2 * p * r / (p + r) : 0).toFixed(3) };
}

function kappa(pairs) {
  const n = pairs.length; if (!n) return null;
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const pe = classes.reduce((s, c) => s + (pairs.filter(([a]) => a === c).length / n) * (pairs.filter(([, b]) => b === c).length / n), 0);
  return +((po - pe) / (1 - pe || 1)).toFixed(3);
}

const both = items.filter(i => i.a1 && i.a2).map(i => [i.a1, i.a2]);
const result = {
  rules: RULES, files: paths,
  labeledPairs: labeled.length,
  sites: new Set(labeled.map(i => i.site)).size,
  accuracy3: +(labeled.filter(i => i.sys === i.gold).length / labeled.length).toFixed(3),
  undisclosedDetection: prf(s => s === 'undisclosed'),
  insufficientDisclosureDetection: prf(s => s === 'undisclosed' || s === 'vague'),
  interAnnotatorKappa: kappa(both), annotatorPairs: both.length,
  confusion_gold_by_system: cm,
};
console.log(JSON.stringify(result, null, 2));
const errs = labeled.filter(i => i.sys !== i.gold);
if (errs.length) {
  console.error(`\n오판정 ${errs.length}건:`);
  errs.forEach(i => console.error(`  ${i.site} / ${i.entity}: 시스템=${i.sys}, 정답=${i.gold}`));
}
