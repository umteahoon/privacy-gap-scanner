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

export function cookieDisclosure(policy) {
  const mentions = findTerm(policy, '쿠키') || findTerm(policy, 'cookie');
  const refusal = findTerm(policy, '쿠키설정거부') || findTerm(policy, '쿠키의설치운영및거부') || findTerm(policy, '쿠키저장을거부')
    || findTerm(policy, '쿠키의설치·운영및그거부') || findTerm(policy, '쿠키설치운영및거부')
    // 문구가 다양하므로, "쿠키" 언급 뒤 가까운 곳(400자 이내)에 거부·차단·삭제 방법 안내가 있으면 거부 안내로 인정
    || (/(쿠키|cookie)[\s\S]{0,400}?(거부|차단|허용하지|저장을\s*원하지|삭제할\s*수|설정을\s*변경)/i.test(policy.text) ? { term: 'near' } : null);
  // refusalGuide 는 진단·안내용 값으로 등급 산정에는 쓰이지 않음 (score.js 는 mentioned 만 사용)
  return { mentioned: !!mentions, refusalGuide: !!refusal, evidence: mentions?.evidence || null };
}
