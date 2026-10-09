// 두 측정의 재현성 비교 (결과 파일 읽기 전용)
// 사용: node cli/compare-runs.js <기준 결과 폴더> <반복 결과 폴더> <사이트 목록> [출력 이름]
// 출력: experiment/analysis/<이름>.md, .json  (사업자·지표 단위 집계, 실명 사이트 목록은 포함하지 않음)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const [A, B, LIST, NAME = 'repeatability'] = process.argv.slice(2);
const rows = readFileSync(LIST, 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const load = (dir, url) => { const f = `${dir}/${new URL(url).hostname.replace(/^www\./, '')}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '-');
const median = xs => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

const per = [];
const statusAgree = { same: 0, diff: 0 };
const flip = {};
const entityStability = {};   // 사업자별: 두 측정 모두 관측 / 한쪽만 관측
const total = { a: { n: 0, U: 0, V: 0, E: 0 }, b: { n: 0, U: 0, V: 0, E: 0 } };
for (const [cat, url] of rows) {
  const a = load(A, url), b = load(B, url);
  if (!a || !b || a.error || b.error || !a.policy.found || !b.policy.found) { per.push({ cat, comparable: false, reason: !b ? 'missing' : b.error ? 'error' : 'policy' }); continue; }
  const ta = new Map(a.entities.filter(e => e.tracking).map(e => [e.id, e]));
  const tb = new Map(b.entities.filter(e => e.tracking).map(e => [e.id, e]));
  const inter = [...ta.keys()].filter(k => tb.has(k));
  const union = new Set([...ta.keys(), ...tb.keys()]);
  for (const k of union) {
    const s = entityStability[k] ||= { name: (ta.get(k) || tb.get(k)).name, both: 0, onlyA: 0, onlyB: 0 };
    if (ta.has(k) && tb.has(k)) s.both++; else if (ta.has(k)) s.onlyA++; else s.onlyB++;
  }
  for (const k of inter) {
    const sa = ta.get(k).status, sb = tb.get(k).status;
    if (sa === sb) statusAgree.same++; else { statusAgree.diff++; const key = `${sa}→${sb}`; flip[key] = (flip[key] || 0) + 1; }
  }
  for (const [t, r] of [[total.a, a], [total.b, b]]) { t.n += r.metrics.trackingEntities; t.U += r.metrics.undisclosed; t.V += r.metrics.vague; t.E += r.metrics.explicit; }
  per.push({
    cat, comparable: true, jaccard: union.size ? inter.length / union.size : 1,
    nA: ta.size, nB: tb.size, uA: a.metrics.undisclosed, uB: b.metrics.undisclosed,
    gradeA: a.metrics.grade, gradeB: b.metrics.grade, gapA: a.metrics.gapIndex, gapB: b.metrics.gapIndex,
    policySameUrl: a.policy.url === b.policy.url,
  });
}
const cmp = per.filter(p => p.comparable);
const gradeSame = cmp.filter(p => p.gradeA === p.gradeB).length;
const gradeWithin1 = cmp.filter(p => Math.abs('ABCDE'.indexOf(p.gradeA) - 'ABCDE'.indexOf(p.gradeB)) <= 1).length;
const hasU = p => (p ? 1 : 0);
const uPresenceSame = cmp.filter(p => hasU(p.uA) === hasU(p.uB)).length;
const jac = cmp.map(p => p.jaccard);
const byCat = {};
for (const p of cmp) (byCat[p.cat] ||= []).push(p.jaccard);

const L = [];
L.push(`# 재현성 비교: ${NAME}`, '', `기준 측정: \`${A}\` / 반복 측정: \`${B}\`. 비교 가능 사이트 ${cmp.length}곳 (두 측정 모두 처리방침 확보). 비교 불가 ${per.length - cmp.length}곳.`, '');
L.push('## 1. 집계 지표', '', '| 지표 | 기준 측정 | 반복 측정 |', '|---|---|---|');
L.push(`| 사이트–사업자 쌍 | ${total.a.n} | ${total.b.n} |`);
L.push(`| 명시 | ${total.a.E} (${pct(total.a.E, total.a.n)}) | ${total.b.E} (${pct(total.b.E, total.b.n)}) |`);
L.push(`| 포괄 고지 | ${total.a.V} (${pct(total.a.V, total.a.n)}) | ${total.b.V} (${pct(total.b.V, total.b.n)}) |`);
L.push(`| 미명시 | ${total.a.U} (${pct(total.a.U, total.a.n)}) | ${total.b.U} (${pct(total.b.U, total.b.n)}) |`);
L.push(`| 미명시 보유 사이트 | ${cmp.filter(p => p.uA > 0).length}/${cmp.length} | ${cmp.filter(p => p.uB > 0).length}/${cmp.length} |`);
L.push('', '## 2. 사이트 단위 일치도', '');
L.push(`- 관측된 추적 사업자 집합의 Jaccard 유사도: 평균 ${mean(jac).toFixed(2)}, 중앙값 ${median(jac).toFixed(2)}, 최소 ${Math.min(...jac).toFixed(2)}`);
L.push(`- 등급 완전 일치 ${gradeSame}/${cmp.length} (${pct(gradeSame, cmp.length)}), ±1등급 이내 ${gradeWithin1}/${cmp.length} (${pct(gradeWithin1, cmp.length)})`);
L.push(`- "미명시 사업자 보유 여부" 일치 ${uPresenceSame}/${cmp.length} (${pct(uPresenceSame, cmp.length)})`);
L.push(`- 두 측정 모두 관측된 사업자의 판정 일치 ${statusAgree.same}/${statusAgree.same + statusAgree.diff} (${pct(statusAgree.same, statusAgree.same + statusAgree.diff)})${statusAgree.diff ? ' / 바뀐 유형: ' + Object.entries(flip).map(([k, v]) => `${k} ${v}`).join(', ') : ''}`);
L.push(`- 처리방침 URL 동일 ${cmp.filter(p => p.policySameUrl).length}/${cmp.length}`);
L.push('', '**업종별 평균 Jaccard**: ' + Object.entries(byCat).map(([k, v]) => `${k} ${mean(v).toFixed(2)}`).join(' · '));
const unstable = Object.values(entityStability).filter(s => s.onlyA + s.onlyB > 0).sort((x, y) => (y.onlyA + y.onlyB) - (x.onlyA + x.onlyB)).slice(0, 12);
L.push('', '## 3. 측정마다 관측 여부가 달라진 사업자 (상위)', '', '| 사업자 | 두 측정 모두 | 기준만 | 반복만 |', '|---|---|---|---|');
for (const s of unstable) L.push(`| ${s.name} | ${s.both} | ${s.onlyA} | ${s.onlyB} |`);
L.push('', '해석 참고: 광고 지면을 실시간 경매로 판매하는 사이트는 방문할 때마다 낙찰 사업자가 달라질 수 있어, 사업자 집합이 측정마다 일부 달라지는 것이 정상입니다.');

mkdirSync('experiment/analysis', { recursive: true });
writeFileSync(`experiment/analysis/${NAME}.md`, L.join('\n') + '\n');
writeFileSync(`experiment/analysis/${NAME}.json`, JSON.stringify({ total, statusAgree, flip, gradeSame, gradeWithin1, uPresenceSame, comparable: cmp.length, jaccard: { mean: mean(jac), median: median(jac) }, perCategoryJaccard: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, mean(v)])), entityStability }, null, 2));
console.log(L.join('\n'));
