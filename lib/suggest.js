// 처리방침 보완 문구 초안 생성 (검사 결과 → 텍스트). 브라우저·CLI 공용, 외부 의존성 없음.
// 판정 로직과 무관: 이미 계산된 결과(entities, cookies)만 읽는다.
//
// 원칙
// - 법률 검토 전 참고용 초안임을 명시한다.
// - 확실하지 않은 정보(정식 상호, 거부 안내 링크 등)는 지어내지 않고 [ ] 빈칸으로 남긴다.
// - 실제 관측한 사실(관측 도메인, 쿠키 유효기간)은 근거로 함께 제시한다.

const PURPOSE = {
  advertising: '이용자 관심 기반 맞춤형 광고 제공 및 광고 효과 측정',
  analytics: '서비스 이용 통계 분석 및 서비스 개선',
  session_replay: '화면 이동·클릭 등 서비스 이용 행태 분석을 통한 서비스 개선',
  attribution: '광고 유입 경로 및 광고 성과 측정',
  marketing: '이용 행태 기반 마케팅 정보 제공',
  social: '소셜 로그인·공유 등 외부 서비스 연동 기능 제공',
};
const ORDER = ['advertising', 'session_replay', 'attribution', 'analytics', 'marketing', 'social'];

// 정식 상호를 확신할 수 있는 사업자만 기재 (그 외는 운영자가 확인해 채우도록 빈칸 처리)
const LEGAL_NAME = {
  google: 'Google LLC',
  meta: 'Meta Platforms, Inc.',
  microsoft: 'Microsoft Corporation',
  naver: '네이버 주식회사',
  kakao: '주식회사 카카오',
};

const primaryCategory = cats => ORDER.find(c => cats.includes(c)) || cats[0];

function cookieDaysByEntity(result) {
  const scanSec = Date.parse(result.scannedAt) / 1000;
  const map = {};
  for (const c of result.cookies || []) {
    if (!c.entity || !c.thirdParty) continue;
    const m = map[c.entity] ||= { count: 0, maxDays: 0, session: 0 };
    m.count++;
    if (c.expires > 0) m.maxDays = Math.max(m.maxDays, Math.round((c.expires - scanSec) / 86400));
    else m.session++;
  }
  return map;
}

const retentionText = ck => {
  if (!ck || !ck.count) return '[보유·이용기간 기재]';
  if (ck.maxDays >= 1) return `쿠키 유효기간 최대 ${ck.maxDays}일 (검사 시 관측값, 사업자 정책 확인 필요)`;
  return '브라우저 종료 시 삭제(세션 쿠키, 검사 시 관측값)';
};

// 보완이 필요한 사업자 목록: 미명시 + 포괄 고지 (명시는 제외)
export function entitiesToDisclose(result) {
  return (result.entities || []).filter(e => e.tracking && (e.status === 'undisclosed' || e.status === 'vague'));
}

export function buildPolicySuggestion(result) {
  const targets = entitiesToDisclose(result);
  if (!result.policy?.found || !targets.length) return null;
  const cookies = cookieDaysByEntity(result);
  const date = new Date(result.scannedAt).toLocaleDateString('ko-KR');
  const rows = targets
    .map(e => ({ e, cat: primaryCategory(e.categories) }))
    .sort((a, b) => ORDER.indexOf(a.cat) - ORDER.indexOf(b.cat) || a.e.name.localeCompare(b.e.name));

  const L = [];
  L.push('※ 본 문구는 자동 검사 결과를 바탕으로 만든 참고용 초안입니다. 실제 계약 관계, 정식 상호, 수집 항목, 보유기간, 거부 방법을 확인하고 법률 검토를 거친 뒤 반영하세요. [ ] 부분은 직접 채워야 합니다.');
  L.push(`※ 근거: ${result.siteHost} 검사(${date})에서 아래 사업자로의 데이터 전송이 관측되었으나 처리방침에 사업자명이 기재되지 않았습니다.`);
  L.push('※ 광고 거래소(실시간 경매)를 통해 연쇄 호출된 사업자는 직접 계약 관계가 없을 수 있습니다. 이용 중인 광고 플랫폼의 데이터 공유 파트너 목록을 함께 확인해 반영하세요.');
  L.push('');
  L.push('제○조 (행태정보의 수집·이용·제공 및 거부 등에 관한 사항)');
  L.push('');
  L.push('① 회사는 서비스 이용 과정에서 아래와 같이 외부 사업자가 이용자의 행태정보를 수집·처리할 수 있도록 허용하고 있습니다.');
  L.push('  - 수집 방법: 이용자가 회사 웹사이트를 방문할 때 쿠키, 스크립트 등을 통해 자동으로 수집·전송');
  L.push('  - 수집 항목: 웹사이트 방문 기록(접속 페이지, 접속 일시), 쿠키 식별자, 브라우저·기기 정보 [실제 항목 확인 후 수정]');
  L.push('');
  L.push('② 행태정보를 수집·처리하는 사업자');
  for (const { e, cat } of rows) {
    const legal = LEGAL_NAME[e.id] || `[정식 상호 기재 — 서비스명: ${e.name}]`;
    L.push(`  - ${legal}`);
    L.push(`      · 수집 목적: ${PURPOSE[cat] || '[수집 목적 기재]'}`);
    L.push(`      · 보유·이용기간: ${retentionText(cookies[e.name])}`);
  }
  L.push('');
  L.push('③ 이용자는 다음 방법으로 행태정보 수집을 거부하거나 삭제할 수 있습니다.');
  L.push('  - 웹 브라우저 설정: 쿠키 저장 거부 또는 삭제 (예: Chrome 설정 > 개인정보 및 보안 > 서드파티 쿠키)');
  L.push('  - 각 사업자가 제공하는 맞춤형 광고 거부 기능: [사업자별 거부 안내 페이지 주소 기재]');
  L.push('  - 쿠키 저장을 거부하면 맞춤형 광고 등 일부 기능 이용에 제한이 있을 수 있습니다.');
  L.push('');
  L.push('④ 회사는 만 14세 미만 아동임을 알고 있는 경우 해당 아동의 행태정보를 맞춤형 광고 목적으로 수집·이용하지 않습니다. [해당 여부 확인]');
  L.push('');
  L.push('⑤ 행태정보와 관련한 문의: [담당 부서, 연락처 기재]');

  return {
    text: L.join('\n'),
    count: rows.length,
    undisclosed: rows.filter(r => r.e.status === 'undisclosed').length,
    vague: rows.filter(r => r.e.status === 'vague').length,
  };
}
