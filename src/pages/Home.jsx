import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const STEPS = [
  { n: '01', t: '런타임 동작 수집', d: '헤드리스 브라우저로 사이트를 탐색하며 외부 요청 도메인, 쿠키, 스토리지 변화를 가로챕니다.' },
  { n: '02', t: '처리방침 분석', d: '사이트의 개인정보처리방침을 찾아 본문을 추출하고 고지된 사업자·도구·범주를 식별합니다.' },
  { n: '03', t: '교차 대조', d: '실제 데이터가 전송된 사업자 하나하나를 약관과 1:1로 대조해 명시 / 포괄 고지 / 미명시로 판정합니다.' },
];

export default function Home() {
  const nav = useNavigate();
  const [url, setUrl] = useState('');
  const [policyUrl, setPolicyUrl] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [agree, setAgree] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/scan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, policyUrl: policyUrl || undefined, agree }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `검사를 시작하지 못했습니다 (HTTP ${r.status}).`);
      nav(`/scan/${data.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">개인정보처리방침 ↔ 실제 브라우저 동작</p>
        <h1>약관에 적힌 것과<br />실제로 일어나는 일을 대조합니다</h1>
        <p className="lede">웹사이트 주소를 입력하면 실제로 데이터를 받아가는 외부 사업자를 찾아내고, 그 사업자가 개인정보처리방침에 고지되어 있는지 하나씩 확인합니다.</p>
        <form className="scan-form" onSubmit={submit}>
          <div className="input-row">
            <input type="text" inputMode="url" placeholder="예: www.example.co.kr" value={url} onChange={e => setUrl(e.target.value)} required aria-label="검사할 웹사이트 주소" />
            <button type="submit" disabled={busy || !agree}>{busy ? '시작 중…' : '검사 시작'}</button>
          </div>
          <button type="button" className="link-btn" onClick={() => setShowPolicy(v => !v)}>
            {showPolicy ? '− ' : '+ '}처리방침 주소 직접 입력 (자동 탐색 실패 시)
          </button>
          {showPolicy && (
            <input type="text" inputMode="url" className="policy-input" placeholder="예: www.example.co.kr/privacy" value={policyUrl} onChange={e => setPolicyUrl(e.target.value)} aria-label="개인정보처리방침 주소" />
          )}
          <label className="agree">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} required />
            <span>공개된 웹사이트의 기술적 점검·연구 목적으로만 사용하며, <Link to="/about">이용 안내</Link>(robots.txt 준수, 결과는 법률 판단이 아님)에 동의합니다.</span>
          </label>
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      <section className="steps">
        {STEPS.map(s => (
          <div key={s.n} className="step">
            <span className="step-n">{s.n}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </section>

    </>
  );
}
