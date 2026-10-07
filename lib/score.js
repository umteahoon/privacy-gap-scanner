// 정량 지표 및 컴플라이언스 Gap 등급
const GRADES = ['A', 'B', 'C', 'D', 'E'];

export function computeMetrics({ entityRows, cookieRows, cookiePolicy, policyFound }) {
  const tracking = entityRows.filter(e => e.tracking);
  const N = tracking.length;
  const E = tracking.filter(e => e.status === 'explicit').length;
  const V = tracking.filter(e => e.status === 'vague').length;
  const U = tracking.filter(e => e.status === 'undisclosed').length;

  const thirdPartyCookies = cookieRows.filter(c => c.thirdParty);
  const undisclosedNames = new Set(tracking.filter(e => e.status === 'undisclosed').map(e => e.name));
  const undisclosedCookies = thirdPartyCookies.filter(c => c.entity && undisclosedNames.has(c.entity));
  const piiFlows = tracking.filter(e => e.pii.length > 0);
  const idFlowsUndisclosed = tracking.filter(e => e.status === 'undisclosed' && e.idParams.length > 0);

  const metrics = {
    trackingEntities: N, explicit: E, vague: V, undisclosed: U,
    policyCoverage: N ? +(E / N).toFixed(3) : null,                  // 약관 명시 정합성
    gapIndex: N ? +((U + 0.5 * V) / N).toFixed(3) : 0,                // 컴플라이언스 Gap 지수 (0=완전 고지, 1=전부 미고지)
    thirdPartyCookies: thirdPartyCookies.length,
    undisclosedTrackerCookies: undisclosedCookies.length,             // 쿠키·스토리지 무단 생성
    cookieNotMentioned: !!(cookiePolicy && !cookiePolicy.mentioned && cookieRows.length > 0),
    piiPatternHints: piiFlows.map(e => ({ name: e.name, pii: e.pii })),  // 참고: 이메일·전화번호 형태 문자열 전송 (오탐 가능)
    idParamFlowsUndisclosed: idFlowsUndisclosed.map(e => ({ name: e.name, params: e.idParams })),
  };

  if (!policyFound) {
    metrics.grade = 'N/A';
    metrics.gradeReason = '처리방침을 자동으로 찾지 못함 (약관 URL을 직접 입력해 재검사 필요)';
    return metrics;
  }
  let g = U === 0 ? (V === 0 ? 0 : 1) : U <= 2 ? 2 : U <= 5 ? 3 : 4;
  const reasons = [`미명시 ${U}개, 포괄 고지 ${V}개, 명시 ${E}개 (추적 사업자 ${N}개 중)`];
  if (metrics.cookieNotMentioned) { g = Math.min(4, g + 1); reasons.push('쿠키를 생성하지만 약관에 쿠키 고지가 없음'); }
  // 비로그인 탐색이므로 PII 패턴 일치는 실제 개인정보가 아닐 가능성이 높아 등급에 반영하지 않고 참고 정보로만 제공
  metrics.grade = GRADES[g];
  metrics.gradeReason = reasons.join(' / ');
  return metrics;
}
