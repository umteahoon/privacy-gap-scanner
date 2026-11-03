// 약관 고지 여부 판정 (규칙 기반)
// 판정 단계: 명시(explicit) > 포괄 고지(vague) > 미명시(undisclosed)
import { normalize, VAGUE_PHRASES, TRACKING_CATEGORIES } from './trackers.js';

// 정규화 문자열 위치 → 원문 위치 대응표를 만들어 근거 문장을 원문에서 잘라낸다.
function buildIndex(text) {
  const map = [];
  let norm = '';
  for (let i = 0; i < text.length; i++) {
    const c = normalize(text[i]);
    if (c) { norm += c; for (let k = 0; k < c.length; k++) map.push(i); }
  }
  return { norm, map };
}

function snippet(text, start, len = 80) {
  const s = Math.max(0, start - 40);
  return text.slice(s, start + len).replace(/\s+/g, ' ').trim();
}

export function preparePolicy(text) {
  const { norm, map } = buildIndex(text || '');
  return { text: text || '', norm, map };
}

function findTerm(policy, term) {
  const t = normalize(term);
  if (!t) return null;
  const idx = policy.norm.indexOf(t);
  if (idx < 0) return null;
  return { term, evidence: snippet(policy.text, policy.map[idx]) };
}

// entity: trackers.js 엔티티, categories: 관측된 기능 분류 목록, extraNames: LLM 이 추출한 고지 사업자명(선택)
export function judgeEntity(policy, entity, categories, extraNames = []) {
  for (const alias of entity.aliases) {
    const hit = findTerm(policy, alias);
    if (hit) return { status: 'explicit', matched: hit.term, evidence: hit.evidence, method: 'rule' };
  }
  const aliasSet = entity.aliases.map(normalize);
  for (const n of extraNames) {
    const nn = normalize(n.name);
    if (aliasSet.some(a => a && (nn.includes(a) || a.includes(nn) && nn.length >= 3))) {
      return { status: 'explicit', matched: n.name, evidence: n.evidence || '', method: 'llm' };
    }
  }
  for (const cat of categories) {
    if (!TRACKING_CATEGORIES.has(cat)) continue;
    for (const phrase of VAGUE_PHRASES[cat] || []) {
      const hit = findTerm(policy, phrase);
      if (hit) return { status: 'vague', matched: hit.term, evidence: hit.evidence, method: 'rule' };
    }
  }
  return { status: 'undisclosed', matched: null, evidence: null, method: 'rule' };
}

// ── 판정 규칙 v2 (실험용): 라벨링 가이드의 "맥락" 기준을 반영 ─────────────────────
// 이름이 아래 문맥에서만 나오면 "명시"로 보지 않는다 (가이드: 로그인 제공자로만 적혀 있으면 명시 아님).
//  - 브라우저·앱 마켓 이름: "Microsoft Edge : 설정…", "구글 크롬", "구글 플레이"
//  - 간편로그인·외부 계정: "[카카오 로그인 회원] 필수: 이메일", "Kakao : 이름, 이메일 주소"
//  - SNS 채널 링크 목록: "네이버블로그 페이스북 인스타그램 유튜브"
// 단, 로그인 문맥이라도 가까운 곳(앞뒤 50자)에 광고·분석·쿠키 등 추적 관련 표현이 있으면 고지로 인정한다.
const V2_AFTER_NON_DISCLOSURE = /^[\s()·:：]*(크롬|chrome|엣지|edge|익스플로러|internet\s*explorer|explorer|웨일|whale|플레이|play\s*(스토어|store)?|앱\s*스토어|app\s*store)/i;
const V2_LOGIN = /(간편\s*(로그인|가입|인증)|소셜\s*(로그인|계정)|SNS\s*(ID|로그인|계정|연동|회원)|외부\s*계정|계정\s*(연동|연결)|아이디로\s*로그인|로그인\s*(회원|서비스|시|연동))/i;
const V2_ACCOUNT_FIELDS = /^[\s()·:：\]]*(\[?\s*(필수|선택)\s*\]?\s*[:：]?\s*)?(이메일|[Ee]-?[Mm]ail|이름|성명|(CI|DI)(?![A-Za-z])|연계정보|프로필|닉네임|별명|휴대\s*(폰|전화)|성별|생일|출생|연령|식별자|계정)/;
// 로그인 문맥을 고지로 되돌리는 표현. 로그인 목적 문구에도 흔히 쓰이는 '통계'·'분석'·'마케팅'·'광고성 정보'는 제외
// (예: "이용자 식별, 통계, 계정 연동", "마케팅 활용 및 광고성 정보 전달")
const V2_TRACKING_CONTEXT = /(광고(?!성)|행태|쿠키|cookie|픽셀|pixel|트래킹|tracking|애널리틱스|analytics|리타게팅|리타겟팅|웹\s*로그\s*분석|로그\s*분석)/i;
// CI·DI 는 대문자 약어만 (영문 단어 속 'ci' 오인 방지)
const V2_ACCOUNT_ITEMS = /(이메일|[Ee]-?[Mm]ail|(?<![A-Za-z])(CI|DI)(?![A-Za-z])|연계정보|프로필|닉네임)/g;
// 처리방침 페이지에 함께 추출된 SNS 채널 링크 목록 ("네이버블로그 페이스북 인스타그램 유튜브 …")
const V2_SNS_WORDS = /(블로그|포스트|유튜브|유투브|youtube|인스타그램|instagram|페이스북|facebook|플러스\s*친구|트위터|twitter|카카오\s*(톡\s*)?채널|틱톡|플레이\s*스토어|앱\s*스토어)/gi;

function occurrences(policy, term) {
  const t = normalize(term);
  const out = [];
  if (!t) return out;
  for (let i = policy.norm.indexOf(t); i >= 0; i = policy.norm.indexOf(t, i + 1)) {
    const start = policy.map[i], end = policy.map[i + t.length - 1] + 1;
    out.push({ start, end });
  }
  return out;
}

export function occurrenceContext(policy, { start, end }) {
  const after = policy.text.slice(end, end + 40);
  const win = policy.text.slice(Math.max(0, start - 80), end + 80);
  const near = policy.text.slice(Math.max(0, start - 50), end + 50);
  // 브라우저·앱 마켓 이름은 쿠키 거부 안내 속에 나오므로 주변의 '광고·쿠키' 표현과 무관하게 비고지로 본다
  if (V2_AFTER_NON_DISCLOSURE.test(after)) return 'browser_or_store';
  if (V2_TRACKING_CONTEXT.test(near)) return 'disclosure';
  if (V2_LOGIN.test(win) || V2_ACCOUNT_FIELDS.test(after)) return 'login';
  // 간편가입 제공 항목 목록: 주변에 계정 항목(이메일·CI·프로필 등)이 2번 이상 나열됨
  if ((win.match(V2_ACCOUNT_ITEMS) || []).length >= 2) return 'login';
  if ((policy.text.slice(Math.max(0, start - 40), end + 40).match(V2_SNS_WORDS) || []).length >= 3) return 'sns_links';
  return 'disclosure';
}

export function judgeEntityV2(policy, entity, categories, extraNames = [], vaguePhrases = VAGUE_PHRASES) {
  let excluded = null;
  for (const alias of entity.aliases) {
    for (const occ of occurrences(policy, alias)) {
      const ctx = occurrenceContext(policy, occ);
      if (ctx === 'disclosure') return { status: 'explicit', matched: alias, evidence: snippet(policy.text, occ.start), method: 'rule-v2' };
      excluded ||= { alias, ctx, evidence: snippet(policy.text, occ.start) };
    }
  }
  const aliasSet = entity.aliases.map(normalize);
  for (const n of extraNames) {
    const nn = normalize(n.name);
    if (aliasSet.some(a => a && (nn.includes(a) || a.includes(nn) && nn.length >= 3))) {
      return { status: 'explicit', matched: n.name, evidence: n.evidence || '', method: 'llm' };
    }
  }
  // 이름이 비고지 문맥에서만 나온 경우, 그 사실을 남겨 리포트·오판정 분석에 쓴다
  const note = excluded ? { nameOnlyIn: excluded.ctx, nameEvidence: excluded.evidence } : {};
  for (const cat of categories) {
    if (!TRACKING_CATEGORIES.has(cat)) continue;
    for (const phrase of vaguePhrases[cat] || []) {
      const hit = findTerm(policy, phrase);
      if (hit) return { status: 'vague', matched: hit.term, evidence: hit.evidence, method: 'rule-v2', ...note };
    }
  }
  return { status: 'undisclosed', matched: null, evidence: null, method: 'rule-v2', ...note };
}

export function cookieDisclosure(policy) {
  const mentions = findTerm(policy, '쿠키') || findTerm(policy, 'cookie');
  const refusal = findTerm(policy, '쿠키설정거부') || findTerm(policy, '쿠키의설치운영및거부') || findTerm(policy, '쿠키저장을거부')
    || findTerm(policy, '쿠키의설치·운영및그거부') || findTerm(policy, '쿠키설치운영및거부')
    // 문구가 다양하므로, "쿠키" 언급 뒤 가까운 곳(400자 이내)에 거부·차단·삭제 방법 안내가 있으면 거부 안내로 인정
    || (/(쿠키|cookie)[\s\S]{0,400}?(거부|차단|허용하지|저장을\s*원하지|삭제할\s*수|설정을\s*변경)/i.test(policy.text) ? { term: 'near' } : null);
  // refusalGuide 는 진단·안내용 값으로 등급 산정에는 쓰이지 않음 (score.js 는 mentioned 만 사용)
  return { mentioned: !!mentions, refusalGuide: !!refusal, evidence: mentions?.evidence || null };
}
