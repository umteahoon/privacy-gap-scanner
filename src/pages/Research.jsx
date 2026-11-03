import { useEffect, useState } from 'react';
import { Grade, Metric, pct } from '../ui.jsx';

export default function Research() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [hist, setHist] = useState(null);
  useEffect(() => {
    fetch('/experiment-history.json').then(r => (r.ok ? r.json() : null)).then(setHist).catch(() => {});
    fetch('/experiment-summary.json').then(r => { if (!r.ok) throw new Error('실험 결과 파일이 없습니다. `npm run batch` 실행 후 다시 배포하세요.'); return r.json(); })
      .then(setD).catch(e => setErr(e.message));
  }, []);
  if (err) return <div className="card"><p className="error">{err}</p></div>;
  if (!d) return <div className="card">불러오는 중…</div>;
  const t = d.totals;
  const gradeMax = Math.max(...Object.values(t.grades));
  return (
    <>
      <section className="card">
        <p className="eyebrow">실증 실험 · 본 실험 (논문 수치)</p>
        <h1 className="h1-sm">국내 웹사이트 {t.sites}곳 대조 결과</h1>
        <p className="muted">쇼핑·언론·여행·교육·금융 등 업종별 주요 사이트를 대상으로 동일 조건에서 자동 스캔한 결과입니다. 사이트명은 익명 처리했습니다. ({new Date(d.generatedAt).toLocaleDateString('ko-KR')} 수집)</p>
        <p className="muted small">robots.txt로 자동화 접근을 금지했거나({t.robotsExcluded ?? 0}곳) 자동화 브라우저를 차단한({t.blocked ?? 0}곳) 사이트는 운영자의 접근 정책을 존중해 우회하지 않고 제외했습니다. 기타 접속 오류 {t.otherErrors ?? 0}곳.</p>
        <div className="metrics">
          <Metric label="스캔 성공" value={`${t.scanned}/${t.sites}`} hint={`정책상 제외 ${(t.robotsExcluded ?? 0) + (t.blocked ?? 0)}곳`} />
          <Metric label="처리방침 자동 탐지" value={`${t.policyFound}/${t.scanned}`} />
          <Metric label="미명시 트래커 보유 사이트" value={`${t.sitesWithUndisclosed}/${t.policyFound}`} tone="bad" hint={pct(t.sitesWithUndisclosed / t.policyFound)} />
          <Metric label="사이트–사업자 쌍" value={t.trackingPairs} hint="관측된 추적 관계" />
          <Metric label="미명시 쌍" value={t.undisclosedPairs} tone="bad" hint={pct(t.undisclosedPairs / t.trackingPairs)} />
          <Metric label="포괄 고지 쌍" value={t.vaguePairs} tone="warn" hint={pct(t.vaguePairs / t.trackingPairs)} />
        </div>
      </section>

      {hist && <History h={hist} />}

      <div className="grid-2">
        <section className="card">
          <h2>등급 분포</h2>
          <div className="bars">
            {['A', 'B', 'C', 'D', 'E', 'N/A'].map(g => (
              <div key={g} className="bar-row">
                <Grade g={g} size="sm" />
                <div className="bar-track"><div className={`bar-fill fill-${g === 'N/A' ? 'na' : g}`} style={{ width: `${((t.grades[g] || 0) / gradeMax) * 100}%` }} /></div>
                <span className="bar-val">{t.grades[g] || 0}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>업종별 <span className="count">처리방침 확보 사이트</span></h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>업종</th><th>사이트</th><th>평균 추적 사업자</th><th>미명시 보유</th><th>평균 Gap</th></tr></thead>
              <tbody>{d.byCategory.map(c => (
                <tr key={c.category}><td>{c.category}</td><td>{c.sites}</td><td>{c.avgTrackers}</td><td>{c.withUndisclosed}</td><td>{c.avgGap.toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>많이 관측된 추적 사업자</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>사업자</th><th>기능</th><th>관측 사이트</th><th>미명시</th><th>포괄 고지</th><th>미명시 비율</th></tr></thead>
            <tbody>{d.topEntities.map(e => (
              <tr key={e.name}>
                <td><b>{e.name}</b></td><td className="small">{e.categories.join(', ')}</td><td>{e.sites}</td><td>{e.undisclosed}</td><td>{e.vague}</td>
                <td><div className="inline-bar"><div style={{ width: pct(e.undisclosed / e.sites) }} /></div>{pct(e.undisclosed / e.sites)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <details className="card">
        <summary><h2>사이트별 결과 (익명)</h2></summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>ID</th><th>업종</th><th>등급</th><th>추적</th><th>명시</th><th>포괄</th><th>미명시</th><th>Gap</th><th>제3자 쿠키</th></tr></thead>
            <tbody>{d.sites.map(s => (
              <tr key={s.id}><td>{s.id}</td><td>{s.category}</td><td><Grade g={s.grade} size="sm" /></td><td>{s.trackingEntities}</td><td>{s.explicit}</td><td>{s.vague}</td><td>{s.undisclosed}</td><td>{s.gapIndex.toFixed(2)}</td><td>{s.thirdPartyCookies}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}

const KIND = { main: '본 실험', repeat: '반복 측정', expand: '표본 확대', sensitivity: '조건 비교' };

function History({ h }) {
  const c = h.cumulative;
  const maxDay = Math.max(...h.byDate.map(d => d.attempted));
  return (
    <section className="card">
      <h2>검사 이력 및 누적 통계 <span className="count">{new Date(h.generatedAt).toLocaleDateString('ko-KR')} 기준</span></h2>
      <p className="muted small">
        본 실험 이후 반복 측정과 표본 확대를 이어 왔습니다. 모든 검사는 연구용 로컬 환경에서 같은 방식으로 수행했습니다(robots.txt 준수, 차단 우회 없음).
        누적 통계는 같은 사이트를 여러 번 검사한 경우 가장 최근의 성공 결과 하나만 반영합니다. 조건을 바꾼 비교 실험은 제외합니다.
      </p>
      <div className="metrics">
        <Metric label="누적 검사 횟수" value={h.totalScans} hint={`${h.runs.length}회차 · ${h.byDate.length}일`} />
        <Metric label="검사한 고유 사이트" value={h.uniqueSites} hint={`정책상 제외 ${c.robotsExcluded + c.blocked}곳`} />
        <Metric label="처리방침 확보" value={c.policyFound} hint="판정 가능 사이트" />
        <Metric label="미명시 보유 사이트" value={`${c.sitesWithUndisclosed}/${c.policyFound}`} tone="bad" hint={pct(c.sitesWithUndisclosed / c.policyFound)} />
        <Metric label="사이트–사업자 쌍" value={c.trackingPairs} hint={`사이트당 평균 ${c.meanTrackers}`} />
        <Metric label="미명시 쌍" value={c.undisclosed} tone="bad" hint={pct(c.undisclosedRate)} />
      </div>

      <div className="grid-2 history-grid">
        <div>
          <h3>날짜별 검사 수</h3>
          <div className="bars">
            {h.byDate.map(d => (
              <div key={d.date} className="bar-row">
                <span className="bar-label">{d.date.slice(5).replace('-', '/')}</span>
                <div className="bar-track"><div className="bar-fill fill-accent" style={{ width: `${(d.attempted / maxDay) * 100}%` }} /></div>
                <span className="bar-val wide">{d.attempted}</span>
              </div>
            ))}
          </div>
          <p className="muted small">막대: 검사 시도 수 (성공·제외 포함)</p>
        </div>
        <div>
          <h3>업종별 누적</h3>
          <div className="table-scroll">
            <table>
              <thead><tr><th>업종</th><th>사이트</th><th>추적 쌍</th><th>미명시율</th><th>미명시 보유</th></tr></thead>
              <tbody>{h.cumulativeByCategory.map(x => (
                <tr key={x.category}><td>{x.category}</td><td>{x.sites}</td><td>{x.pairs}</td><td>{pct(x.undisclosedRate)}</td><td>{x.withUndisclosed}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>

      <h3>회차별 결과</h3>
      <div className="table-scroll">
        <table className="runs">
          <thead><tr><th>날짜</th><th>구분</th><th>내용</th><th>시도</th><th>성공</th><th>처리방침</th><th>정책상 제외</th><th>미명시율</th><th>미명시 보유</th></tr></thead>
          <tbody>{h.runs.map(r => (
            <tr key={r.id}>
              <td className="nowrap">{r.date}</td><td className="nowrap">{KIND[r.kind] || r.kind}</td><td className="small">{r.purpose}{r.inProgress && <span className="tag tag-progress">진행 중 {r.attempted}/{r.planned}</span>}</td>
              <td>{r.attempted}</td><td>{r.scanned}</td><td>{r.policyFound}</td><td>{r.robotsExcluded + r.blocked}</td>
              <td>{pct(r.undisclosedRate)}</td><td>{r.sitesWithUndisclosed}/{r.policyFound}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
