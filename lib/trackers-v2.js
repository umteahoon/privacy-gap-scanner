// 판정 규칙 v2 지식베이스 (실험용). 기본값은 v1(trackers.js)이며, 논문 1차 수치는 v1 기준이다.
// 1) 기존 사업자에 누락 도메인 추가
// 2) 운영 주체가 확실한 광고·분석 사업자 추가
// 3) 운영 주체를 확신할 수 없지만 요청 경로(/pixel, usersync, ads.js, dsp 등)로 광고·식별자 동기화가 분명한 도메인은
//    "운영 주체 미확인"으로 등록한다 (사업자명을 지어내지 않고 도메인명으로 표시).
import { ENTITIES, VAGUE_PHRASES } from './trackers.js';

const DOMAIN_ADDS = {
  google: {
    'googletagservices.com': 'advertising', '2mdn.net': 'advertising', 'googleoptimize.com': 'analytics',
    'googleapis.com': 'cdn', 'googlevideo.com': 'video', 'ggpht.com': 'cdn', 'googleusercontent.com': 'cdn',
  },
  linkedin: { 'linkedin.com': 'advertising' },
  twitter: { 'twitter.com': 'social' },
  tiktok: { 'tiktokw.us': 'advertising' },
  adobe: { 'everesttech.net': 'advertising' },
  id5: { 'eu-1-id5-sync.com': 'advertising' },
  appsflyer: { 'appsflyersdk.com': 'attribution' },
  ab180: { 'abr.ge': 'attribution' },
  enliple: { 'megadata.co.kr': 'advertising' }, // enliple_min*.js, enp_tracker 를 배포하는 CDN
  naver: { 'navercorp.com': 'cdn' },
};

const named = (id, name, aliases, domains) => ({ id, name, aliases, domains });
const NEW_ENTITIES = [
  named('rtbhouse', 'RTB House', ['rtbhouse', 'rtb하우스', '알티비하우스'], { 'creativecdn.com': 'advertising' }),
  named('equativ', 'Equativ (Smart AdServer)', ['equativ', 'smartadserver', '스마트애드서버'], { 'smartadserver.com': 'advertising' }),
  named('indexexchange', 'Index Exchange', ['indexexchange', '인덱스익스체인지', 'casalemedia'], { 'casalemedia.com': 'advertising', 'indexww.com': 'advertising' }),
  named('quantcast', 'Quantcast', ['quantcast', '퀀트캐스트'], { 'quantserve.com': 'advertising', 'quantcount.com': 'advertising' }),
  named('liveramp', 'LiveRamp', ['liveramp', '라이브램프'], { 'rlcdn.com': 'advertising', 'pippio.com': 'advertising' }),
  named('bidswitch', 'Bidswitch (IPONWEB)', ['bidswitch', 'iponweb'], { 'bidswitch.net': 'advertising' }),
  named('freewheel', 'FreeWheel·Beeswax (Comcast)', ['freewheel', '프리휠', 'beeswax'], { 'bidr.io': 'advertising', 'fwmrm.net': 'advertising' }),
  named('tapad', 'Tapad (Experian)', ['tapad', '타패드'], { 'tapad.com': 'advertising' }),
  named('amobee', 'Amobee (Turn)', ['amobee', '아모비'], { 'turn.com': 'advertising' }),
  named('stackadapt', 'StackAdapt', ['stackadapt', '스택어댑트'], { 'stackadapt.com': 'advertising' }),
  named('adform', 'Adform', ['adform', '애드폼'], { 'adform.net': 'advertising' }),
  named('sharethrough', 'Sharethrough', ['sharethrough', '쉐어스루'], { 'sharethrough.com': 'advertising' }),
  named('epsilon', 'Epsilon (Conversant)', ['conversant', 'epsilon', '엡실론'], { 'dotomi.com': 'advertising' }),
  named('intentiq', 'Intent IQ', ['intentiq'], { 'intentiq.com': 'advertising' }),
  named('sovrn', 'Sovrn', ['sovrn', 'lijit'], { 'lijit.com': 'advertising' }),
  named('mediamath', 'MediaMath', ['mediamath', '미디어매스'], { 'mathtag.com': 'advertising' }),
  named('unruly', 'Unruly (RhythmOne)', ['unruly', 'rhythmone'], { '1rx.io': 'advertising' }),
  named('liveintent', 'LiveIntent', ['liveintent'], { 'liadm.com': 'advertising' }),
  named('appier', 'Appier', ['appier', '에이피어', '애피어'], { 'appier.net': 'advertising', 'adsappier.com': 'advertising', 'appiersig.com': 'advertising' }),
  named('moloco', 'Moloco', ['moloco', '몰로코'], { 'moloco.com': 'advertising' }),
  named('blis', 'Blis', ['blismedia', '블리스미디어'], { 'blismedia.com': 'advertising' }),
  named('deepintent', 'DeepIntent', ['deepintent'], { 'deepintent.com': 'advertising' }),
  named('basis', 'Basis Technologies (SiteScout)', ['basistechnologies', 'sitescout'], { 'sitescout.com': 'advertising' }),
  named('pulsepoint', 'PulsePoint', ['pulsepoint', '펄스포인트'], { 'contextweb.com': 'advertising' }),
  named('loopme', 'LoopMe', ['loopme', '루프미'], { 'loopme.me': 'advertising' }),
  named('improvedigital', 'Improve Digital', ['improvedigital'], { '360yield.com': 'advertising' }),
  named('smaato', 'Smaato', ['smaato', '스마토'], { 'smaato.net': 'advertising' }),
  named('triplelift', 'TripleLift', ['triplelift', '트리플리프트'], { '3lift.com': 'advertising' }),
  named('adroll', 'AdRoll', ['adroll', '애드롤'], { 'adroll.com': 'advertising' }),
  named('teads', 'Teads', ['teads.tv', 'teadsinc'], { 'teads.tv': 'advertising' }),
  named('33across', '33Across', ['33across'], { '33across.com': 'advertising' }),
  named('simplifi', 'Simpli.fi', ['simpli.fi', 'simplifi'], { 'simpli.fi': 'advertising' }),
  named('adkernel', 'AdKernel', ['adkernel'], { 'adkernel.com': 'advertising' }),
  named('inmobi', 'InMobi', ['inmobi', '인모비'], { 'inmobi.com': 'advertising' }),
  named('adition', 'ADITION', ['adition'], { 'adition.com': 'advertising' }),
  named('richaudience', 'Rich Audience', ['richaudience'], { 'richaudience.com': 'advertising' }),
  named('primis', 'Primis', ['primis'], { 'primis.tech': 'advertising' }),
  named('connatix', 'Connatix', ['connatix'], { 'connatix.com': 'advertising' }),
  named('anymind', 'AnyMind', ['anymind', '애니마인드'], { 'anymind360.com': 'advertising' }),
  named('geniee', 'Geniee', ['geniee'], { 'gssprt.jp': 'advertising', 'genieesspv.jp': 'advertising' }),
  named('logicad', 'Logicad (Sony)', ['logicad', '로지캐드'], { 'ladsp.com': 'advertising' }),
  named('bridgewell', 'Bridgewell', ['bridgewell', '브릿지웰'], { 'scupio.com': 'advertising' }),
  named('demandbase', 'Demandbase', ['demandbase'], { 'company-target.com': 'advertising' }),
  named('chartbeat', 'Chartbeat', ['chartbeat', '차트비트'], { 'chartbeat.com': 'analytics', 'chartbeat.net': 'analytics' }),
  named('salesforce', 'Salesforce (Evergage)', ['salesforce', '세일즈포스', 'evergage', 'interactionstudio'], { 'evergage.com': 'marketing', 'evgnet.com': 'marketing' }),
  named('disqus', 'Disqus', ['disqus', '디스커스'], { 'disqus.com': 'social' }),
  named('igaworks', '아이지에이웍스 (애드브릭스)', ['아이지에이웍스', 'igaworks', '애드브릭스', 'adbrix'], { 'igaw.io': 'advertising' }),
  named('coupang', '쿠팡 (쿠팡 파트너스)', ['쿠팡', 'coupang'], { 'ads-partners.coupang.com': 'advertising', 'logs-partners.coupang.com': 'advertising', 'coupangcdn.com': 'cdn' }),
  named('skplanet', 'SK플래닛', ['sk플래닛', 'skplanet', '에스케이플래닛'], { 'skplanet.com': 'advertising' }),
  named('nhn-ad', 'NHN 광고·태그 플랫폼', ['nhn', '엔에이치엔'], {
    'cm-exchange.toast.com': 'advertising', 'adlc-exchange.toast.com': 'advertising', 'tagmanager.toast.com': 'tag_manager', 'nhnace.com': 'advertising',
  }),
  named('zendesk', 'Zendesk', ['zendesk', '젠데스크'], { 'zendesk.com': 'chat', 'zdassets.com': 'chat' }),
  named('akamai', 'Akamai', ['akamai', '아카마이'], { 'go-mpulse.net': 'monitoring', 'akamaihd.net': 'cdn' }),
  named('aws-waf', 'AWS WAF', ['amazonwebservices', '아마존웹서비스'], { 'awswaf.com': 'security' }),
];

// 운영 주체 미확인 광고·식별자 도메인 (값: 판단 근거가 된 관측 요청 경로)
const UNNAMED_AD_DOMAINS = {
  'ad4989.co.kr': '광고 소재·스크립트', 'digitalcamp.co.kr': 'tracker·ssp 경로', 'interworksmedia.co.kr': 'tm/ads.js',
  'mobwithad.com': 'prebid·ssp 스크립트', 'aceplanet.co.kr': 'ad.* 광고 서버', 'adpnut.com': 'dspserver', 'acrosspf.com': 'acrossadx·uids',
  'mman.kr': 'cm·aud tracking', 'innorame.com': 'imp(노출) iframe', 'bidence.net': 'dsp sync', 'ctnsnet.com': 'cm(쿠키 매칭)',
  'n-bridge.io': 'ad.* 동적 광고', 'nsmartad.com': 'partners banner', 'mci1.co.kr': 'delivery js', 'contentsfeed.com': 'RealMedia ads',
  'spadsync.com': 'sync', 'im-apps.net': 'dmp·sync', 'mygaru.com': 'ident id', 'mgaru.dev': 'id 스크립트', 'fusion-platform.com': 'id 연동 스크립트',
  'uni1id.com': 'fp(핑거프린트)', 'ocmthood.com': 'activity 수집', 'tune720.com': 'tracking API', 'adop.cc': '광고 스크립트',
};
const UNNAMED = Object.entries(UNNAMED_AD_DOMAINS).map(([d, why]) => ({
  id: `unnamed:${d}`, name: `${d} (운영 주체 미확인)`, aliases: [d], domains: { [d]: 'advertising' }, unnamed: true, basis: why,
}));

export const ENTITIES_V2 = [
  ...ENTITIES.map(e => (DOMAIN_ADDS[e.id] ? { ...e, domains: { ...e.domains, ...DOMAIN_ADDS[e.id] } } : e)),
  ...NEW_ENTITIES,
  ...UNNAMED,
];

// '푸시'는 앱 푸시 알림 안내에 주로 쓰여 마케팅 트래커의 포괄 고지로 보기 어려워 제외
export const VAGUE_PHRASES_V2 = { ...VAGUE_PHRASES, marketing: VAGUE_PHRASES.marketing.filter(p => p !== '푸시') };
