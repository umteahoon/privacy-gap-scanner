// 진단 요약 및 조치 권고 (검사 결과 → 우선순위별 항목). 브라우저·CLI 공용, 외부 의존성 없음.
// 판정 로직과 무관: 이미 계산된 결과만 읽는다. 법 위반을 단정하지 않고 "누락 가능성·확인 필요·조치 권고"로 표현한다.

export const LEVELS = {
  high: { label: '우선 조치', order: 0 },
  medium: { label: '권장', order: 1 },
  check: { label: '확인 필요', order: 2 },
  info: { label: '참고', order: 3 },
};

const LOGIN_CONTEXT = /(간편\s*(로그인|가입)|소셜\s*로그인|SNS\s*(로그인|계정)|계정\s*연동|로그인\s*회원)/;
const names = list => list.map(e => e.name).join(', ');

export function diagnose(result) {
  const items = [];
  const m = result.metrics || {};
  const tracking = (result.entities || []).filter(e => e.tracking);
  const undisclosed = tracking.filter(e => e.status === 'undisclosed');
  const vague = tracking.filter(e => e.status === 'vague');
  const scanSec = Date.parse(result.scannedAt) / 1000;

  const reason = result.policy?.reason || '';
  if (!result.policy?.found && /robots|blocked/.test(reason)) {
    // 사이트 문제가 아니라 접근 정책상 검사하지 않은 경우: 운영자 탓으로 보이지 않게 구분
    items.push({
      level: 'info',
      title: '처리방침 페이지는 접근 정책상 자동으로 확인하지 않았습니다',
      detail: /robots/.test(reason)
        ? '처리방침 페이지가 robots.txt로 자동화 접근이 제한되어 있어, 본 서비스는 해당 페이지를 열지 않았습니다. 그래서 고지 여부를 판정하지 못했습니다.'
        : '처리방침 페이지가 자동화 접근을 차단해 열 수 없었습니다. 그래서 고지 여부를 판정하지 못했습니다.',
      action: '아래 추적 사업자 목록을 처리방침과 직접 대조해 확인하세요. 처리방침을 자동 점검하려면 해당 경로의 robots.txt 정책을 검토하세요.',
    });
  } else if (!result.policy?.found) {
    items.push({
      level: 'high',
      title: '개인정보처리방침을 찾지 못했습니다',
      detail: `페이지에서 처리방침 링크를 자동으로 찾지 못했거나 열 수 없었습니다 (${result.policy?.reason || '사유 불명'}). 그래서 아래 사업자의 고지 여부를 판정하지 못했습니다.`,
      action: '모든 페이지 하단에 "개인정보처리방침" 링크를 눈에 띄게 게시하세요. 이미 게시되어 있다면 처리방침 주소를 직접 입력해 다시 검사하세요.',
    });
  }

  if (undisclosed.length) {
    items.push({
      level: 'high',
      title: `처리방침에 없는 추적 사업자 ${undisclosed.length}곳으로 데이터가 전송됩니다`,
      detail: `${names(undisclosed)}. 사업자명은 물론, 해당 기능(맞춤형 광고·분석 등)에 대한 포괄적 고지도 찾지 못했습니다.`,
      action: '아래 "처리방침 보완 초안"을 참고해 사업자를 처리방침에 추가하세요. 사용하지 않는 도구라면 사이트에서 해당 스크립트를 제거하세요. 광고 거래소를 통해 연쇄 호출된 사업자는 광고 플랫폼의 파트너 목록을 함께 확인하세요.',
      entities: undisclosed.map(e => e.name),
    });
  }

  if (m.cookieNotMentioned) {
    items.push({
      level: 'high',
      title: '쿠키를 생성하지만 처리방침에 쿠키 관련 고지가 없습니다',
      detail: `검사 중 제3자 쿠키 ${m.thirdPartyCookies}개를 포함한 쿠키 생성이 관측되었으나 처리방침에서 쿠키 관련 내용을 찾지 못했습니다.`,
      action: '쿠키의 설치·운영 목적과 이용자가 거부하는 방법(브라우저 설정 등)을 처리방침에 기재하세요.',
    });
  } else if (result.cookiePolicy && result.cookiePolicy.mentioned && !result.cookiePolicy.refusalGuide && (m.thirdPartyCookies || 0) > 0) {
    items.push({
      level: 'medium',
      title: '쿠키 거부 방법 안내를 찾지 못했습니다',
      detail: '처리방침에 쿠키 언급은 있으나, 이용자가 쿠키 저장을 거부하는 방법 안내를 찾지 못했습니다.',
      action: '브라우저별 쿠키 거부 방법과 맞춤형 광고 거부 방법을 안내하세요.',
    });
  }

  if (vague.length) {
    items.push({
      level: 'medium',
      title: `사업자명 없이 범주로만 고지된 사업자 ${vague.length}곳`,
      detail: `${names(vague)}. "맞춤형 광고", "행태정보" 같은 표현은 있으나 실제로 데이터를 받는 사업자 이름이 없습니다.`,
      action: '이용자가 누구에게 정보가 가는지 알 수 있도록 사업자명을 구체적으로 기재하세요 (보완 초안에 포함).',
      entities: vague.map(e => e.name),
    });
  }

  // 고지되지 않은 사업자의 장기 쿠키 (약 1년 이상: 만료일을 스캔 종료 기준으로 계산하므로 360일 이상)
  const undisclosedNames = new Set(undisclosed.map(e => e.name));
  const longCookies = (result.cookies || []).filter(c => c.thirdParty && undisclosedNames.has(c.entity) && c.expires > 0 && (c.expires - scanSec) / 86400 >= 360);
  if (longCookies.length) {
    const owners = [...new Set(longCookies.map(c => c.entity))];
    items.push({
      level: 'medium',
      title: `고지되지 않은 사업자가 약 1년 이상 유지되는 쿠키 ${longCookies.length}개를 생성합니다`,
      detail: `${owners.join(', ')}. 이용자가 모르는 사이 장기간 식별자가 유지될 수 있습니다.`,
      action: '해당 사업자를 고지하면서 보유기간을 함께 기재하고, 꼭 필요한 도구인지 검토하세요.',
    });
  }

  const idFlows = (m.idParamFlowsUndisclosed || []);
  if (idFlows.length) {
    items.push({
      level: 'medium',
      title: `고지되지 않은 사업자 ${idFlows.length}곳으로 식별용 파라미터가 전송됩니다`,
      detail: idFlows.map(f => `${f.name}(${f.params.join(', ')})`).join(', ') + '. 이용자·기기 식별에 쓰이는 이름의 파라미터입니다 (값은 저장하지 않음).',
      action: '어떤 정보가 전송되는지 확인하고 처리방침의 수집 항목에 반영하세요.',
    });
  }

  // 판정 한계: 로그인 맥락에서만 이름이 나와 "명시"로 판정된 경우
  const loginOnly = tracking.filter(e => e.status === 'explicit' && e.evidence && LOGIN_CONTEXT.test(e.evidence)
    && e.categories.some(c => c === 'advertising' || c === 'analytics' || c === 'session_replay'));
  if (loginOnly.length) {
    items.push({
      level: 'check',
      title: `로그인 연동 문맥에서 이름이 확인되어 "명시"로 판정된 사업자 ${loginOnly.length}곳`,
      detail: `${names(loginOnly)}. 처리방침의 해당 문구가 간편 로그인 안내일 뿐, 광고·분석 목적의 데이터 전송을 고지한 것이 아닐 수 있습니다.`,
      action: '광고·분석 목적의 고지가 따로 있는지 확인하고, 없다면 추가하세요.',
      entities: loginOnly.map(e => e.name),
    });
  }

  const unknown = result.unknownThirdParties || [];
  if (unknown.length >= 5) {
    const withCookie = unknown.filter(u => u.setsCookie).length;
    items.push({
      level: 'info',
      title: `분류되지 않은 외부 도메인 ${unknown.length}곳${unknown.length >= 50 ? ' 이상' : ''}`,
      detail: `자동 판정 대상에서 빠진 도메인입니다${withCookie ? ` (이 중 쿠키 생성 ${withCookie}곳)` : ''}. 자사 CDN일 수도 있고, 광고·분석 사업자일 수도 있습니다. 따라서 미명시 사업자 수는 실제보다 적게 집계되었을 수 있습니다.`,
      action: '리포트의 "미분류 외부 도메인" 목록에서 쿠키를 생성하는 도메인부터 운영 주체를 확인하세요.',
    });
  }

  if (!items.length) {
    items.push({
      level: 'info',
      title: '자동 검사 범위에서 발견된 문제가 없습니다',
      detail: '관측된 추적 사업자가 모두 처리방침에 이름으로 기재되어 있습니다.',
      action: '로그인 이후 화면, 앱 등 이번 검사 범위 밖의 영역도 정기적으로 점검하세요.',
    });
  }

  return items.sort((a, b) => LEVELS[a.level].order - LEVELS[b.level].order);
}
