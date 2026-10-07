// 트래커 지식베이스: 요청 도메인 → 운영 주체(엔티티) 매핑 + 약관 본문 탐색용 별칭.
// domains 값은 해당 도메인의 기능 분류. TRACKING_CATEGORIES 에 속하는 도메인만 "공개 의무 대상"으로 판정한다.
// 해외 트래커는 Disconnect entities 목록을 참고했고, 국내 트래커(네이버·카카오·국내 광고/분석 솔루션)는 직접 구축했다.

export const TRACKING_CATEGORIES = new Set([
  'advertising', 'analytics', 'social', 'session_replay', 'attribution', 'marketing',
]);

export const CATEGORY_LABELS = {
  advertising: '광고/리타게팅',
  analytics: '웹 분석',
  social: '소셜 플러그인',
  session_replay: '세션 녹화/히트맵',
  attribution: '광고 성과 측정',
  marketing: '마케팅 자동화/CRM',
  tag_manager: '태그 관리자',
  chat: '고객 상담 채팅',
  cdn: 'CDN/정적 리소스',
  font: '웹 폰트',
  payment: '결제',
  map: '지도',
  video: '동영상',
  security: '보안/봇 방지',
  monitoring: '오류 모니터링',
  unknown: '미분류',
};

export const ENTITIES = [
  // ── 해외 주요 사업자 ──────────────────────────────────────────────
  {
    id: 'google', name: 'Google',
    aliases: ['google', '구글', 'googleanalytics', '구글애널리틱스', '구글어낼리틱스', 'ga4', 'googleads', '구글애즈', '구글광고',
      'doubleclick', '더블클릭', 'googletagmanager', '구글태그매니저', 'youtube', '유튜브', 'adsense', '애드센스'],
    domains: {
      'google-analytics.com': 'analytics', 'analytics.google.com': 'analytics',
      'googletagmanager.com': 'tag_manager',
      'doubleclick.net': 'advertising', 'googleadservices.com': 'advertising', 'googlesyndication.com': 'advertising',
      'adservice.google.com': 'advertising', 'pagead2.googlesyndication.com': 'advertising', 'google.com/pagead': 'advertising',
      'fonts.googleapis.com': 'font', 'fonts.gstatic.com': 'font',
      'ajax.googleapis.com': 'cdn', 'gstatic.com': 'cdn', 'recaptcha.net': 'security', 'google.com/recaptcha': 'security',
      'youtube.com': 'video', 'youtube-nocookie.com': 'video', 'ytimg.com': 'video',
      'maps.googleapis.com': 'map',
      'google.com': 'advertising', 'google.co.kr': 'advertising', 'adtrafficquality.google': 'advertising',
    },
  },
  {
    id: 'meta', name: 'Meta (Facebook)',
    aliases: ['facebook', '페이스북', 'metaplatforms', '메타플랫폼', 'metapixel', '메타픽셀', 'facebookpixel', '페이스북픽셀',
      'instagram', '인스타그램'],
    domains: { 'connect.facebook.net': 'advertising', 'facebook.com': 'advertising', 'facebook.net': 'advertising', 'instagram.com': 'social' },
  },
  {
    id: 'microsoft', name: 'Microsoft (Clarity/Bing)',
    aliases: ['microsoft', '마이크로소프트', 'clarity', '클래리티', 'bingads', '빙광고', 'microsoftadvertising'],
    domains: { 'clarity.ms': 'session_replay', 'bat.bing.com': 'advertising', 'bing.com': 'advertising' },
  },
  {
    id: 'tiktok', name: 'TikTok (ByteDance)',
    aliases: ['tiktok', '틱톡', 'bytedance', '바이트댄스'],
    domains: { 'analytics.tiktok.com': 'advertising', 'tiktok.com': 'social' },
  },
  {
    id: 'twitter', name: 'X (Twitter)',
    aliases: ['twitter', '트위터', 'x(트위터)', 'xcorp'],
    domains: { 'static.ads-twitter.com': 'advertising', 'ads-twitter.com': 'advertising', 'analytics.twitter.com': 'advertising', 't.co': 'advertising', 'platform.twitter.com': 'social' },
  },
  {
    id: 'linkedin', name: 'LinkedIn',
    aliases: ['linkedin', '링크드인'],
    domains: { 'snap.licdn.com': 'advertising', 'px.ads.linkedin.com': 'advertising', 'licdn.com': 'social' },
  },
  {
    id: 'pinterest', name: 'Pinterest',
    aliases: ['pinterest', '핀터레스트'],
    domains: { 'ct.pinterest.com': 'advertising', 'pinimg.com': 'social' },
  },
  {
    id: 'criteo', name: 'Criteo',
    aliases: ['criteo', '크리테오'],
    domains: { 'criteo.net': 'advertising', 'criteo.com': 'advertising' },
  },
  {
    id: 'taboola', name: 'Taboola',
    aliases: ['taboola', '타불라'],
    domains: { 'taboola.com': 'advertising' },
  },
  {
    id: 'hotjar', name: 'Hotjar',
    aliases: ['hotjar', '핫자'],
    domains: { 'hotjar.com': 'session_replay', 'hotjar.io': 'session_replay' },
  },
  {
    id: 'amplitude', name: 'Amplitude',
    aliases: ['amplitude', '앰플리튜드', '앰플리듀드'],
    domains: { 'amplitude.com': 'analytics' },
  },
  {
    id: 'mixpanel', name: 'Mixpanel',
    aliases: ['mixpanel', '믹스패널'],
    domains: { 'mixpanel.com': 'analytics', 'mxpnl.com': 'analytics' },
  },
  {
    id: 'appsflyer', name: 'AppsFlyer',
    aliases: ['appsflyer', '앱스플라이어'],
    domains: { 'appsflyer.com': 'attribution', 'onelink.me': 'attribution' },
  },
  {
    id: 'adobe', name: 'Adobe',
    aliases: ['adobe', '어도비'],
    domains: { 'demdex.net': 'advertising', 'omtrdc.net': 'analytics', 'adobedtm.com': 'tag_manager', 'typekit.net': 'font' },
  },
  {
    id: 'braze', name: 'Braze',
    aliases: ['braze', '브레이즈'],
    domains: { 'braze.com': 'marketing', 'appboycdn.com': 'marketing' },
  },
  {
    id: 'insider', name: 'Insider',
    aliases: ['useinsider', '인사이더'],
    domains: { 'useinsider.com': 'marketing' },
  },
  {
    id: 'onesignal', name: 'OneSignal',
    aliases: ['onesignal', '원시그널'],
    domains: { 'onesignal.com': 'marketing' },
  },
  {
    id: 'sentry', name: 'Sentry',
    aliases: ['sentry', '센트리', 'functionalsoftware'],
    domains: { 'sentry.io': 'monitoring', 'sentry-cdn.com': 'monitoring' },
  },
  {
    id: 'datadog', name: 'Datadog',
    aliases: ['datadog', '데이터독'],
    domains: { 'datadoghq.com': 'monitoring', 'browser-intake-datadoghq.com': 'monitoring', 'datadoghq-browser-agent.com': 'monitoring' },
  },
  {
    id: 'newrelic', name: 'New Relic',
    aliases: ['newrelic', '뉴렐릭'],
    domains: { 'nr-data.net': 'monitoring', 'newrelic.com': 'monitoring' },
  },
  {
    id: 'cloudflare', name: 'Cloudflare',
    aliases: ['cloudflare', '클라우드플레어'],
    domains: { 'cloudflareinsights.com': 'analytics', 'cdnjs.cloudflare.com': 'cdn', 'challenges.cloudflare.com': 'security' },
  },
  {
    id: 'openx', name: 'OpenX',
    aliases: ['openx', '오픈엑스'],
    domains: { 'openx.net': 'advertising', 'openxcdn.net': 'advertising' },
  },
  {
    id: 'thetradedesk', name: 'The Trade Desk',
    aliases: ['thetradedesk', '트레이드데스크', 'uid2'],
    domains: { 'adsrvr.org': 'advertising' },
  },
  {
    id: 'lotame', name: 'Lotame',
    aliases: ['lotame', '로타미'],
    domains: { 'crwdcntrl.net': 'advertising' },
  },
  {
    id: 'id5', name: 'ID5',
    aliases: ['id5'],
    domains: { 'id5-sync.com': 'advertising' },
  },
  {
    id: 'pubmatic', name: 'PubMatic',
    aliases: ['pubmatic', '퍼브매틱'],
    domains: { 'pubmatic.com': 'advertising' },
  },
  {
    id: 'rubicon', name: 'Magnite (Rubicon)',
    aliases: ['magnite', 'rubicon', '루비콘'],
    domains: { 'rubiconproject.com': 'advertising' },
  },
  {
    id: 'appnexus', name: 'Xandr (AppNexus)',
    aliases: ['xandr', 'appnexus', '앱넥서스'],
    domains: { 'adnxs.com': 'advertising' },
  },
  {
    id: 'amazon-ads', name: 'Amazon Ads',
    aliases: ['amazonadvertising', 'amazonads', '아마존광고', 'amazon', '아마존'],
    domains: { 'amazon-adsystem.com': 'advertising' },
  },
  {
    id: 'outbrain', name: 'Outbrain',
    aliases: ['outbrain', '아웃브레인'],
    domains: { 'outbrain.com': 'advertising', 'outbrainimg.com': 'advertising' },
  },
  {
    id: 'yahoo', name: 'Yahoo (Verizon Media)',
    aliases: ['yahoo', '야후'],
    domains: { 'yahoo.com': 'advertising', 'analytics.yahoo.com': 'analytics' },
  },
  {
    id: 'temu', name: 'Temu',
    aliases: ['temu', '테무'],
    domains: { 'temu.com': 'advertising' },
  },
  {
    id: 'opera-ads', name: 'Opera Ads',
    aliases: ['operaads', 'operasoftware', '오페라광고'],
    domains: { 'opera.com': 'advertising' },
  },
  {
    id: 'aws', name: 'Amazon Web Services (CloudFront)',
    aliases: ['amazonwebservices', '아마존웹서비스', 'cloudfront'],
    domains: { 'cloudfront.net': 'cdn', 'amazonaws.com': 'cdn' },
  },
  {
    id: 'maze', name: 'Maze',
    aliases: ['maze', '메이즈'],
    domains: { 'maze.co': 'session_replay' },
  },
  {
    id: 'cdn-public', name: '공개 CDN (jsDelivr/unpkg 등)',
    aliases: [],
    domains: { 'jsdelivr.net': 'cdn', 'unpkg.com': 'cdn', 'cdnjs.com': 'cdn', 'jquery.com': 'cdn', 'bootstrapcdn.com': 'cdn', 'fontawesome.com': 'font', 'jsdelivr.com': 'cdn' },
  },

  // ── 국내 사업자 ─────────────────────────────────────────────────
  {
    id: 'naver', name: '네이버',
    aliases: ['네이버', 'naver', '네이버애널리틱스', 'naveranalytics', '네이버프리미엄로그분석', '프리미엄로그분석', '네이버검색광고', '네이버광고'],
    domains: {
      'wcs.naver.net': 'analytics', 'wcs.naver.com': 'analytics', 'lcs.naver.com': 'analytics',
      'siape.veta.naver.com': 'advertising', 'veta.naver.com': 'advertising',
      'nid.naver.com': 'social', 'static.nid.naver.com': 'social',
      'pstatic.net': 'cdn', 'map.naver.com': 'map', 'naver.net': 'cdn', 'naver.com': 'cdn',
    },
  },
  {
    id: 'kakao', name: '카카오',
    aliases: ['카카오', 'kakao', '카카오픽셀', 'kakaopixel', '카카오모먼트', 'daum', '다음카카오'],
    domains: {
      'bc.ad.daum.net': 'advertising', 'ad.daum.net': 'advertising', 'kakaoad': 'advertising',
      'daumcdn.net/kas': 'advertising',
      'developers.kakao.com': 'social', 'kakaocdn.net': 'social', 'kakao.com': 'social',
      'daumcdn.net': 'cdn', 'map.kakao.com': 'map', 'dapi.kakao.com': 'map',
    },
  },
  {
    id: 'enliple', name: '엔라이플 (모비온)',
    aliases: ['엔라이플', 'enliple', '모비온', 'mobon'],
    domains: { 'mobon.net': 'advertising', 'enliple.com': 'advertising', 'mediacategory.com': 'advertising' },
  },
  {
    id: 'widerplanet', name: '와이더플래닛',
    aliases: ['와이더플래닛', 'widerplanet'],
    domains: { 'widerplanet.com': 'advertising' },
  },
  {
    id: 'dable', name: '데이블',
    aliases: ['데이블', 'dable'],
    domains: { 'dable.io': 'advertising' },
  },
  {
    id: 'acecounter', name: '에이스카운터',
    aliases: ['에이스카운터', 'acecounter'],
    domains: { 'acecounter.com': 'analytics' },
  },
  {
    id: 'bizspring', name: '비즈스프링 (로거)',
    aliases: ['비즈스프링', 'bizspring', 'logger.co.kr', '로거(logger)'],
    domains: { 'logger.co.kr': 'analytics', 'bizspring.net': 'analytics' },
  },
  {
    id: 'wisetracker', name: '와이즈트래커',
    aliases: ['와이즈트래커', 'wisetracker'],
    domains: { 'wisetracker.co.kr': 'analytics' },
  },
  {
    id: 'beusable', name: '포인터스 (뷰저블)',
    aliases: ['뷰저블', 'beusable', '포인터스'],
    domains: { 'beusable.net': 'session_replay' },
  },
  {
    id: 'groobee', name: '그루비',
    aliases: ['그루비', 'groobee'],
    domains: { 'groobee.net': 'marketing', 'groobee.io': 'marketing' },
  },
  {
    id: 'bigin', name: '빅인',
    aliases: ['빅인', 'bigin'],
    domains: { 'bigin.io': 'analytics' },
  },
  {
    id: 'ab180', name: '에이비일팔공 (에어브릿지)',
    aliases: ['에어브릿지', 'airbridge', 'ab180', '에이비일팔공'],
    domains: { 'airbridge.io': 'attribution' },
  },
  {
    id: 'hackle', name: '핵클',
    aliases: ['핵클', 'hackle'],
    domains: { 'hackle.io': 'analytics' },
  },
  {
    id: 'channelio', name: '채널코퍼레이션 (채널톡)',
    aliases: ['채널톡', '채널코퍼레이션', 'channeltalk', 'channel.io', 'channelcorp'],
    domains: { 'channel.io': 'chat' },
  },
  {
    id: 'daangn', name: '당근마켓',
    aliases: ['당근마켓', '당근', 'daangn', 'karrot'],
    domains: { 'daangn.com': 'advertising', 'karrotmarket.com': 'advertising' },
  },
  {
    id: 'pg', name: '결제대행(PG)',
    aliases: ['토스페이먼츠', 'kg이니시스', '이니시스', '나이스페이', 'nicepay', '포트원', 'portone', '아임포트', 'iamport', 'kcp'],
    domains: { 'tosspayments.com': 'payment', 'inicis.com': 'payment', 'nicepay.co.kr': 'payment', 'portone.io': 'payment', 'iamport.kr': 'payment', 'kcp.co.kr': 'payment' },
  },
];

// 개별 사업자명이 없을 때 "포괄적 고지"로 인정할 범주별 표현 (공백 제거 후 비교)
export const VAGUE_PHRASES = {
  advertising: ['맞춤형광고', '행태정보', '광고플랫폼', '광고사업자', '광고대행', '리타게팅', '리타겟팅', '타겟광고', '타깃광고', '온라인광고'],
  analytics: ['웹로그분석', '로그분석', '분석도구', '분석툴', '이용통계', '방문통계', '접속통계', '통계분석'],
  social: ['소셜로그인', '간편로그인', 'sns로그인', '소셜미디어'],
  session_replay: ['화면이용패턴', '이용행태분석', '히트맵', '세션녹화'],
  attribution: ['광고성과', '성과측정', '어트리뷰션', '광고효과'],
  marketing: ['마케팅자동화', '푸시', 'crm', '마케팅솔루션'],
};

export function normalize(s) {
  return String(s || '').toLowerCase().replace(/[\s·・\-_'"“”‘’()（）\[\]]/g, '');
}

// "host" (+path) 를 엔티티와 도메인 분류로 매핑. 가장 길게 일치하는 규칙을 우선한다.
export function classifyRequest(host, path = '') {
  let best = null;
  for (const e of ENTITIES) {
    for (const [rule, category] of Object.entries(e.domains)) {
      const [rHost, rPath] = rule.split(/\/(.*)/s);
      const hostOk = rHost.includes('.')
        ? host === rHost || host.endsWith('.' + rHost)
        : host.includes(rHost);
      if (!hostOk) continue;
      if (rPath && !path.startsWith('/' + rPath)) continue;
      if (!best || rule.length > best.rule.length) best = { entity: e, category, rule };
    }
  }
  return best;
}

export function entityById(id) {
  return ENTITIES.find(e => e.id === id);
}
