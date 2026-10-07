// (선택) LLM 기반 약관 정보 추출. ANTHROPIC_API_KEY 가 없으면 건너뛰고 규칙 기반 판정만 사용한다.
import Anthropic from '@anthropic-ai/sdk';

const SCHEMA = {
  type: 'object',
  properties: {
    disclosed_parties: {
      type: 'array',
      description: '처리방침에 이름이 명시된 외부 사업자·도구 (제3자 제공처, 처리 위탁 수탁자, 행태정보 수집 사업자, 분석/광고 도구 등)',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', enum: ['third_party_provision', 'outsourcing', 'behavioral_ads', 'analytics_tool', 'other'] },
          evidence: { type: 'string', description: '근거가 되는 원문 구절 (100자 이내)' },
        },
        required: ['name', 'role', 'evidence'],
        additionalProperties: false,
      },
    },
    vague_disclosures: {
      type: 'array',
      description: '사업자명을 특정하지 않은 포괄적 고지 문구 (예: "광고 파트너 등")',
      items: { type: 'string' },
    },
    uses_cookies: { type: 'boolean' },
    collected_items: { type: 'array', items: { type: 'string' }, description: '자동 수집 항목 (쿠키, 접속 IP, 기기 식별자 등)' },
  },
  required: ['disclosed_parties', 'vague_disclosures', 'uses_cookies', 'collected_items'],
  additionalProperties: false,
};

const SYSTEM = `당신은 한국 개인정보보호법(PIPA) 기준으로 개인정보처리방침을 분석하는 도구다.
문서에 실제로 적힌 내용만 추출한다. 문서에 없는 사업자를 추정하거나 보충하지 않는다.
"Google Analytics", "카카오픽셀"처럼 도구명만 적힌 경우도 해당 사업자를 명시한 것으로 본다.`;

export function llmEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function extractPolicyLLM(policyText) {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.LLM_MODEL || 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `다음 개인정보처리방침을 분석하라.\n\n<policy>\n${policyText}\n</policy>` }],
  });
  if (response.stop_reason === 'refusal') throw new Error('LLM refusal');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { ...JSON.parse(text), model: response.model, usage: response.usage };
}
