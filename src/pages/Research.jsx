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
      {hist && <Overview h={hist} />}
      {hist?.findings && <Findings h={hist} />}
      {hist && <History h={hist} />}

      <h2 className="section-divider">본 실험 상세 <span className="count">논문 수치 · {new Date(d.generatedAt).toLocaleDateString('ko-KR')} 수집</span></h2>
      <section className="card">
        <p className="eyebrow">실증 실험 · 본 실험 (논문 수치)</p>
        <h1 className="h1-sm">국내 웹사이트 {t.sites}곳 대조 결과</h1>
        <p className="muted">쇼핑·언론·여행·교육·금융 등 8개 업종에서 인지도가 높은 서비스를 연구자가 선정해 동일 조건에서 자동 스캔한 결과입니다. 사이트명은 익명 처리했습니다. ({new Date(d.generatedAt).toLocaleDateString('ko-KR')} 수집)</p>
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
          <p className="muted small">
            스캔에 성공한 {t.scanned}곳 기준입니다. 등급은 미명시 사업자 수로 정합니다: A 미명시·포괄 고지 없음, B 미명시 없음, C 미명시 1~2개, D 3~5개, E 6개 이상 (쿠키를 만들면서 처리방침에 쿠키 안내가 없으면 한 단계 낮춤).
            N/A는 사이트는 열렸지만 처리방침 링크를 찾지 못했거나, 처리방침 페이지가 robots.txt 금지·접근 차단이라 판정하지 않은 사이트입니다.
          </p>
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

// 맨 위: 지금까지 조사한 국내 사이트 수와 누적 결과
function Overview({ h }) {
  const c = h.cumulative;
  const first = h.byDate[0].date, last = h.byDate.at(-1).date;
  return (
    <section className="card">
      <p className="eyebrow">실증 실험 · 현재까지 누적 ({new Date(h.byDate.at(-1).date).toLocaleDateString('ko-KR')} 기준)</p>
      <h1 className="h1-sm">국내 웹사이트 {h.uniqueSites}곳을 조사했습니다</h1>
      <p className="muted">
        {first.replace(/-/g, '.')}부터 {last.replace(/-/g, '.')}까지 {h.runs.length}회차, {h.byDate.length}일에 걸쳐 총 {h.totalScans}회 검사했습니다.
        처리방침까지 확보해 판정한 {c.policyFound}곳 중 <b>{c.sitesWithUndisclosed}곳({pct(c.sitesWithUndisclosed / c.policyFound)})</b>에서 처리방침에 없는 추적 사업자로 데이터가 전송되었습니다.
      </p>
      <p className="muted small">같은 사이트를 여러 번 검사한 경우 가장 최근의 성공 결과 하나만 반영했습니다(조건을 바꾼 비교 실험 제외). 모든 검사는 robots.txt를 지키고 차단을 우회하지 않았으며, 사이트명은 공개하지 않습니다.</p>
      <div className="metrics">
        <Metric label="조사한 국내 사이트" value={h.uniqueSites} hint={`검사 ${h.totalScans}회`} />
        <Metric label="판정 완료" value={c.policyFound} hint={`스캔 성공 ${c.scanned}곳 중`} />
        <Metric label="미명시 보유 사이트" value={`${c.sitesWithUndisclosed}/${c.policyFound}`} tone="bad" hint={pct(c.sitesWithUndisclosed / c.policyFound)} />
        <Metric label="사이트–사업자 쌍" value={c.trackingPairs} hint={`사이트당 평균 ${c.meanTrackers}`} />
        <Metric label="미명시 쌍" value={c.undisclosed} tone="bad" hint={pct(c.undisclosedRate)} />
        <Metric label="포괄 고지 쌍" value={c.vague} tone="warn" hint={pct(c.vague / c.trackingPairs)} />
      </div>
    </section>
  );
}

// 실험에서 드러난 문제와 실험의 한계 (수치는 모두 누적 결과에서 계산)
function Findings({ h }) {
  const c = h.cumulative, f = h.findings;
  const cats = h.cumulativeByCategory.filter(x => x.sites >= 20);   // 표본이 작은 업종은 비교에서 제외
  const worst = cats.reduce((a, b) => (b.undisclosedRate > a.undisclosedRate ? b : a));
  const best = cats.reduce((a, b) => (b.undisclosedRate < a.undisclosedRate ? b : a));
  const top = f.topUndisclosed;
  return (
    <div className="grid-2">
      <section className="card">
        <h2>실험에서 드러난 문제</h2>
        <ul className="findings">
          <li><b>처리방침에 추적 사업자 이름이 하나도 없는 사이트가 {f.noNamedTracker}곳</b>입니다. 추적 사업자가 관측된 {f.sitesWithTrackers}곳의 {pct(f.noNamedTracker / f.sitesWithTrackers)}로, 고지가 있더라도 “맞춤형 광고” 같은 범주 표현에 그칩니다.</li>
          <li><b>광고 거래 사업자가 특히 빠집니다.</b> {f.majorPlatforms.join('·')}처럼 대부분의 사이트에서 쓰는 대형 플랫폼은 미명시 {pct(f.majorUndisclosedRate)}지만, {top.slice(0, 3).map(x => `${x.name}(${pct(x.rate)})`).join(', ')} 등 광고 사업자는 대부분 고지되지 않았습니다.</li>
          <li><b>고지되지 않은 사업자가 식별자를 남깁니다.</b> {f.undisclosedSetsCookie}곳({pct(f.undisclosedSetsCookie / f.sites)})에서 미명시 사업자가 쿠키를 만들었고, {f.undisclosedGetsId}곳에서는 식별용 파라미터가 전송되었습니다.</li>
          <li><b>업종 차이가 큽니다.</b> {worst.category}은 미명시율 {pct(worst.undisclosedRate)}({worst.sites}곳), {best.category}은 {pct(best.undisclosedRate)}({best.sites}곳)입니다. 광고 지면을 실시간 경매로 파는 사이트일수록 광고 거래소를 거쳐 연쇄 호출되는 사업자가 많은 것으로 보입니다.</li>
        </ul>
      </section>
      <section className="card">
        <h2>실험의 한계</h2>
        <ul className="findings">
          <li><b>판정하지 못한 사이트가 있습니다.</b> robots.txt 금지({c.robotsExcluded}곳)·자동화 차단({c.blocked}곳) 사이트는 우회하지 않고 제외했고, {f.policyNotFound}곳은 처리방침을 찾지 못했거나 처리방침 페이지에 접근할 수 없었습니다.</li>
          <li><b>미명시 수치는 하한값입니다.</b> 지식베이스에 없는 도메인은 판정에서 빠지므로 실제 미고지 사업자는 더 많을 수 있습니다.</li>
          <li><b>문맥 오판이 있습니다.</b> 간편 로그인 안내에 나온 “구글”·“카카오”처럼 광고 고지가 아닌 문장의 사업자명도 명시로 판정되는 경우가 확인되었습니다.</li>
          <li><b>정확도 평가가 남아 있습니다.</b> 연구자가 처리방침을 직접 읽어 붙인 정답과 비교하는 정밀도·재현율 평가는 진행 중입니다. 결과는 법률 판단이 아닌 기술적 불일치 탐지입니다.</li>
        </ul>
      </section>
    </div>
  );
}

function History({ h }) {
  const maxDay = Math.max(...h.byDate.map(d => d.attempted));
  return (
    <section className="card">
      <h2>검사 이력 <span className="count">{new Date(h.byDate.at(-1).date).toLocaleDateString('ko-KR')} 기준</span></h2>
      <p className="muted small">
        본 실험 이후 반복 측정과 표본 확대를 이어 왔습니다. 모든 검사는 연구용 로컬 환경에서 같은 방식으로 수행했습니다(robots.txt 준수, 차단 우회 없음).
      </p>

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
