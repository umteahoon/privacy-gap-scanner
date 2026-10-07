export const STATUS = {
  explicit: { label: '명시', cls: 'ok', desc: '약관에 사업자·도구명이 직접 기재됨' },
  vague: { label: '포괄 고지', cls: 'warn', desc: '사업자명 없이 범주로만 고지됨 (예: "광고 파트너 등")' },
  undisclosed: { label: '미명시', cls: 'bad', desc: '약관 어디에도 고지되지 않음' },
  'no-policy': { label: '약관 없음', cls: 'muted', desc: '처리방침을 찾지 못함' },
};

export const CATEGORY = {
  advertising: '광고/리타게팅', analytics: '웹 분석', social: '소셜 플러그인', session_replay: '세션 녹화/히트맵',
  attribution: '광고 성과 측정', marketing: '마케팅 자동화', tag_manager: '태그 관리자', chat: '상담 채팅', cdn: 'CDN',
  font: '웹 폰트', payment: '결제', map: '지도', video: '동영상', security: '보안', monitoring: '오류 모니터링',
};

export const GRADE_DESC = {
  A: '관측된 추적 사업자가 모두 약관에 명시됨',
  B: '미명시는 없으나 포괄적 고지에 의존',
  C: '미명시 추적 사업자 1–2개',
  D: '미명시 추적 사업자 3–5개',
  E: '미명시 추적 사업자 6개 이상 (쿠키 미고지 시 한 단계 하향)',
  'N/A': '처리방침을 찾지 못해 판정 불가',
};

export function Grade({ g, size = 'lg' }) {
  return <span className={`grade grade-${g === 'N/A' ? 'na' : g} grade-${size}`}>{g}</span>;
}

export function Chip({ status }) {
  const s = STATUS[status] || { label: status, cls: 'muted' };
  return <span className={`chip chip-${s.cls}`} title={s.desc}>{s.label}</span>;
}

export function Metric({ label, value, hint, tone }) {
  return (
    <div className={`metric ${tone ? 'metric-' + tone : ''}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {hint && <div className="metric-hint">{hint}</div>}
    </div>
  );
}

export const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
