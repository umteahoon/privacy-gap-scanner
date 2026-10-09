import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Grade, Chip, Metric, CATEGORY, GRADE_DESC, STATUS, pct } from '../ui.jsx';
import { buildPolicySuggestion } from '../../lib/suggest.js';
import { diagnose, LEVELS } from '../../lib/diagnose.js';

// 도메인·쿠키 이름은 점(.)·밑줄(_)·하이픈(-) 뒤에서만 줄바꿈되도록 <wbr> 삽입 (글자 중간 끊김 방지)
function Breakable({ text }) {
  const parts = String(text).split(/(?<=[._-])/);
  return <>{parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <wbr />}</span>)}</>;
}
const ymd = sec => { const d = new Date(sec * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const STAGES = [
  { key: 'runtime', label: '런타임 동작 수집' },
  { key: 'policy', label: '처리방침 탐색·추출' },
  { key: 'llm', label: 'LLM 항목 추출 (선택)' },
  { key: 'match', label: '교차 대조·지표 산출' },
];

export default function ScanReport() {
  const { id } = useParams();
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let timer, alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/scan/${id}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `결과를 불러오지 못했습니다 (HTTP ${r.status}).`);
        // 작업이 3분 넘게 대기 상태면 워커가 시작되지 않은 것으로 판단
        if (data.status === 'queued' && Date.now() - Date.parse(data.createdAt) > 180000) {
          throw new Error('검사가 시작되지 않았습니다. 잠시 후 다시 시도하세요.');
        }
        if (!alive) return;
        setRec(data);
        if (data.status === 'queued' || data.status === 'running') timer = setTimeout(poll, 2500);
      } catch (e) { if (alive) setError(e.message); }
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);

  if (error) return <div className="card"><p className="error">{error}</p><Link to="/">← 처음으로</Link></div>;
  if (!rec) return <div className="card">불러오는 중…</div>;
  if (rec.status !== 'done') return <Progress rec={rec} />;
  return <Report rec={rec} />;
}

function Progress({ rec }) {
  const idx = STAGES.findIndex(s => s.key === rec.stage);
  return (
    <section className="card progress">
      <h2>{rec.url.replace(/^https?:\/\//, '')} 검사 {rec.status === 'error' ? '실패' : '중'}</h2>
      {rec.status === 'error' ? (
        <>
          <p className="error">{rec.message}</p>
          <p className="muted">{rec.blocked
            ? '본 서비스는 사이트 운영자의 접근 정책(robots.txt, 자동화 접근 차단)을 우회하지 않습니다. 해당 사이트는 검사할 수 없습니다.'
            : '접속 지연 등으로 실패할 수 있습니다. 잠시 후 다시 시도하거나 처리방침 주소를 직접 입력해 보세요.'}</p>
          <Link to="/">← 다시 검사하기</Link>
        </>
      ) : (
        <>
          <ol className="stages">
            {STAGES.map((s, i) => (
              <li key={s.key} className={i < idx ? 'done' : i === idx ? 'active' : ''}>{s.label}</li>
            ))}
          </ol>
          <p className="muted live">{rec.message}</p>
          <p className="muted small">보통 40초–2분 정도 걸립니다. 이 페이지를 닫아도 검사는 계속되며, 주소로 다시 확인할 수 있습니다.</p>
        </>
      )}
    </section>
  );
}

function Report({ rec }) {
  const r = rec.result;
  const m = r.metrics;
  const tracking = r.entities.filter(e => e.tracking);
  const other = r.entities.filter(e => !e.tracking);
  const tpCookies = r.cookies.filter(c => c.thirdParty);
  return (
    <>
      <div className="report-actions no-print">
        <button type="button" className="btn-secondary" onClick={() => printReport(r)}>PDF로 저장 / 인쇄</button>
      </div>
      <section className="card report-head">
        <div className="report-grade">
          <Grade g={m.grade} />
          <div>
            <p className="eyebrow">컴플라이언스 Gap 등급</p>
            <h2>{r.siteHost}</h2>
            <p className="muted">{GRADE_DESC[m.grade]}</p>
            <p className="small muted">{m.gradeReason}</p>
          </div>
        </div>
        <div className="metrics">
          <Metric label="추적 사업자" value={m.trackingEntities} hint="광고·분석·소셜 등" />
          <Metric label="미명시" value={m.undisclosed} tone={m.undisclosed ? 'bad' : 'ok'} />
          <Metric label="포괄 고지" value={m.vague} tone={m.vague ? 'warn' : undefined} />
          <Metric label="약관 명시율" value={pct(m.policyCoverage)} hint="Policy Coverage" />
          <Metric label="Gap 지수" value={m.gapIndex.toFixed(2)} hint="0 = 완전 고지" />
          <Metric label="제3자 쿠키" value={m.thirdPartyCookies} />
        </div>
        <p className="small muted meta">
          처리방침: {r.policy.found && /^https?:\/\//.test(r.policy.url || '') ? <a href={r.policy.url} target="_blank" rel="noreferrer noopener">{r.policy.url}</a> : `찾지 못함 (${r.policy.reason})`}
          {' · '}탐색 페이지 {r.pages.length}개 · 요청 {r.requestsTotal}건 (제3자 {r.thirdPartyRequests}건) · {(r.durationMs / 1000).toFixed(0)}초 · {new Date(r.scannedAt).toLocaleString('ko-KR')}
        </p>
      </section>

      <Diagnosis result={r} />

      {m.piiPatternHints?.length > 0 && (
        <section className="card alert">
          <h3>추가 확인 사항</h3>
          <ul>
            {m.piiPatternHints?.map(f => <li key={f.name}><b>{f.name}</b>(으)로 {f.pii.join(', ')}와 형태가 같은 문자열이 전송되었습니다. 로그인하지 않은 상태의 검사이므로 실제 개인정보가 아닐 수 있습니다(참고용, 등급 미반영).</li>)}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>추적 사업자 대조 결과</h2>
        <p className="muted small">실제 데이터 전송이 관측된 사업자별로 처리방침 고지 여부를 판정했습니다. {Object.entries(STATUS).slice(0, 3).map(([k, v]) => `${v.label}: ${v.desc}`).join(' · ')}</p>
        <EntityTable rows={tracking} />
      </section>

      <Suggestion result={r} />

      {other.length > 0 && (
        <section className="card">
          <h2>기타 외부 리소스</h2>
          <p className="muted small">CDN·폰트·결제·지도 등 기능 제공 목적으로 분류되어 등급 산정에서 제외된 사업자입니다.</p>
          <EntityTable rows={other} compact />
        </section>
      )}

      {r.unknownThirdParties.length > 0 && (
        <section className="card">
          <h2>미분류 외부 도메인 <span className="count">{r.unknownThirdParties.length}</span></h2>
          <p className="muted small">지식베이스에 없는 도메인입니다. 사이트 자체 CDN일 수도 있어 등급에는 반영하지 않으며, 수동 검토가 필요합니다.</p>
          <div className="tags">
            {r.unknownThirdParties.map(u => <span key={u.domain} className={`tag ${u.setsCookie ? 'tag-cookie' : ''}`} title={u.hosts.join(', ')}>{u.domain} · {u.requests}{u.setsCookie ? ' · 쿠키' : ''}</span>)}
          </div>
        </section>
      )}

      {r.llm && !r.llm.error && (
        <section className="card">
          <h2>LLM 약관 추출 결과</h2>
          <p className="muted small">{r.llm.model} · 고지된 외부 사업자 {r.llm.disclosed_parties.length}곳</p>
          <div className="tags">{r.llm.disclosed_parties.map((p, i) => <span key={i} className="tag" title={p.evidence}>{p.name}</span>)}</div>
          {r.llm.vague_disclosures.length > 0 && <p className="small">포괄 고지 문구: {r.llm.vague_disclosures.join(' / ')}</p>}
        </section>
      )}

      <details className="card">
        <summary><h2>쿠키 목록 <span className="count">{r.cookies.length}</span> (제3자 {tpCookies.length})</h2></summary>
        <div className="table-scroll">
          <table className="cookies">
            <thead><tr><th>이름</th><th>도메인</th><th>구분</th><th>사업자</th><th>만료</th></tr></thead>
            <tbody>
              {r.cookies.map((c, i) => (
                <tr key={i}>
                  <td className="mono"><Breakable text={c.name} /></td><td className="mono"><Breakable text={c.domain} /></td>
                  <td className="nowrap">{c.thirdParty ? '제3자' : '자사'}</td><td>{c.entity || '–'}</td>
                  <td className="nowrap">{c.expires > 0 ? ymd(c.expires) : '세션'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="center"><Link to="/">← 다른 사이트 검사하기</Link></p>
    </>
  );
}

function Diagnosis({ result }) {
  const items = diagnose(result);
  const counts = Object.fromEntries(Object.keys(LEVELS).map(k => [k, items.filter(i => i.level === k).length]));
  return (
    <section className="card diagnosis">
      <h2>진단 요약 및 조치 권고</h2>
      <p className="muted small">
        {Object.entries(LEVELS).filter(([k]) => counts[k]).map(([k, v]) => `${v.label} ${counts[k]}건`).join(' · ')}
        {' — '}자동 검사로 확인한 고지 누락 가능성과 조치 방향입니다. 법률 위반 여부에 대한 판단이 아니며, 최종 반영 전 담당자 확인과 법률 검토를 권장합니다.
      </p>
      <ol className="diag-list">
        {items.map((it, i) => (
          <li key={i} className={`diag diag-${it.level}`}>
            <span className={`diag-badge diag-badge-${it.level}`}>{LEVELS[it.level].label}</span>
            <div>
              <b>{it.title}</b>
              <p className="small">{it.detail}</p>
              <p className="small diag-action"><b>조치:</b> {it.action}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// 인쇄 시 접힌 영역(쿠키 목록)까지 펼쳐서 출력하고, PDF 기본 파일명이 되도록 문서 제목을 잠시 바꿈
function printReport(r) {
  const closed = [...document.querySelectorAll('details:not([open])')];
  const title = document.title;
  closed.forEach(d => d.setAttribute('open', ''));
  document.title = `처리방침점검_${r.siteHost}_${r.scannedAt.slice(0, 10)}`;
  window.addEventListener('afterprint', () => { closed.forEach(d => d.removeAttribute('open')); document.title = title; }, { once: true });
  window.print();
}

function Suggestion({ result }) {
  const [copied, setCopied] = useState(false);
  const s = buildPolicySuggestion(result);
  if (!s) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(s.text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + s.text], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `처리방침_보완초안_${result.siteHost}.txt` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="card suggestion">
      <h2>처리방침 보완 초안 <span className="count">{s.count}개 사업자</span></h2>
      <p className="muted small">
        미명시 {s.undisclosed}개, 포괄 고지 {s.vague}개 사업자를 이름까지 고지하도록 만든 조항 초안입니다.
        관측한 쿠키 유효기간을 근거로 넣었으며, <b>정식 상호·거부 안내 링크 등 [ ] 부분은 직접 확인해 채워야 합니다.</b> 법률 검토 전 참고용입니다.
      </p>
      <textarea className="suggestion-text" readOnly value={s.text} rows={Math.min(24, s.text.split('\n').length + 1)} aria-label="처리방침 보완 초안" />
      <pre className="suggestion-print print-only">{s.text}</pre>
      <div className="suggestion-actions no-print">
        <button type="button" onClick={copy}>{copied ? '복사됨' : '문구 복사'}</button>
        <button type="button" className="btn-secondary" onClick={download}>텍스트 파일로 저장</button>
      </div>
    </section>
  );
}

function EntityTable({ rows, compact }) {
  if (!rows.length) return <p className="muted">해당 없음</p>;
  return (
    <div className="table-scroll">
      <table className="entities">
        <thead>
          <tr><th>사업자</th><th>기능</th>{!compact && <th>판정</th>}<th>관측 도메인</th>{!compact && <th>약관 근거</th>}</tr>
        </thead>
        <tbody>
          {rows.map(e => (
            <tr key={e.id} className={!compact ? `row-${e.status}` : ''}>
              <td><b>{e.name}</b><div className="small muted">요청 {e.requests}건{e.setsCookie ? ' · 쿠키 생성' : ''}{e.idParams?.length ? ` · 식별 파라미터 ${e.idParams.join(', ')}` : ''}</div></td>
              <td>{e.categories.map(c => CATEGORY[c] || c).join(', ')}</td>
              {!compact && <td><Chip status={e.status} /></td>}
              <td className="mono small hosts">
                {e.hosts.slice(0, 4).map(h => <div key={h}><Breakable text={h} /></div>)}
                {e.hosts.length > 4 && <div className="muted">외 {e.hosts.length - 4}개</div>}
              </td>
              {!compact && <td className="small">{e.evidence ? <>“…{e.evidence}…”<div className="muted">매칭어: {e.matched}{e.method === 'llm' ? ' (LLM)' : ''}</div></> : <span className="muted">–</span>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
