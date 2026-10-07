// 다층 대조 스캔: (1) 런타임 동작 수집 → (2) 처리방침 추출 → (3) 교차 대조 → (4) 지표 산출
import { parse as parseDomain } from 'tldts';
import { launchBrowser } from './browser.js';
import { fetchPolicy } from './policy.js';
import { classifyRequest, TRACKING_CATEGORIES } from './trackers.js';
import { preparePolicy, judgeEntity, cookieDisclosure } from './disclosure.js';
import { llmEnabled, extractPolicyLLM } from './llm.js';
import { computeMetrics } from './score.js';
import { loadRobots, isAllowed, BOT_TOKEN } from './robots.js';
import { isPrivateIp } from './guard.js';
import net from 'node:net';

const PII_RE = {
  email: /(?<![\w.+-])[\w.+-]+(@|%40)[a-z0-9-]+\.(?!(?:png|jpe?g|gif|svg|webp|css|js)\b)[a-z]{2,}(?![\w])/i,
  phone: /(?<!\d)01[016789]-?\d{3,4}-?\d{4}(?!\d)/,
};
const ID_PARAM_RE = /^(uid|user_?id|member_?id|email|em|phone|ph|ud\[[a-z]+\]|cid|_ga|fbp|_fbp|gclid|fbclid)$/i;

const regDomain = h => parseDomain(h).domain || h;

export async function scanSite(inputUrl, { policyUrl, subpages = 2, dwellMs = 4000, useLLM = llmEnabled(), keepRaw = false, onProgress = () => {} } = {}) {
  const started = Date.now();
  const url = new URL(inputUrl).toString();
  const siteHost = new URL(url).hostname;
  const siteDomain = regDomain(siteHost);
  const siteEntity = classifyRequest(siteHost)?.entity?.id || null;

  // robots.txt 확인: 운영자가 자동화 접근을 금지한 경우 검사하지 않음
  onProgress('runtime', 'robots.txt 접근 정책 확인');
  const robots = await loadRobots(new URL(url).origin);
  const pathOf = h => { const u = new URL(h); return u.pathname + u.search; };
  if (!isAllowed(robots, pathOf(url))) {
    throw Object.assign(new Error('사이트의 robots.txt가 자동화 접근을 허용하지 않아 검사하지 않았습니다.'), { code: 'robots' });
  }

  const browser = await launchBrowser();
  // 자동화 도구임을 숨기지 않고 User-Agent에 스캐너 식별자를 명시
  const probe = await browser.newPage();
  const baseUA = await probe.evaluate(() => navigator.userAgent).catch(() => '');
  await probe.close();
  const context = await browser.newContext({
    locale: 'ko-KR', viewport: { width: 1366, height: 900 },
    userAgent: `${baseUA} ${BOT_TOKEN}/1.0 (+privacy-policy research; no login, no form submission)`.trim(),
  });
  // 내부망·로컬 주소로의 요청 차단 (리다이렉트·하위 리소스를 통한 SSRF 방지)
  await context.route('**/*', route => {
    try {
      const h = new URL(route.request().url()).hostname.replace(/^\[|\]$/g, '');
      if (h === 'localhost' || h.endsWith('.localhost') || (net.isIP(h) && isPrivateIp(h))) return route.abort('blockedbyclient');
    } catch { /* 무시 */ }
    return route.continue();
  });
  const requests = [];
  const pages = [];
  context.on('request', req => {
    try {
      const u = new URL(req.url());
      if (!/^https?:$/.test(u.protocol)) return;
      const body = req.postData() || '';
      requests.push({
        host: u.hostname, path: u.pathname, type: req.resourceType(), method: req.method(),
        params: [...u.searchParams.keys()].slice(0, 40),
        pii: Object.entries(PII_RE).filter(([, re]) => re.test(decodeURIComponent(u.search)) || re.test(body)).map(([k]) => k),
        ts: Date.now() - started,
      });
    } catch { /* 잘못된 URL 무시 */ }
  });

  let policy = { found: false, reason: 'not-attempted' };
  try {
    onProgress('runtime', '대상 사이트 접속 및 런타임 동작 수집');
    const page = await context.newPage();
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.mouse.wheel(0, 2500).catch(() => {});
    await page.waitForTimeout(dwellMs);
    pages.push({ url: page.url(), status: resp?.status() ?? null, title: await page.title().catch(() => '') });
    const title = pages[0].title || '';
    if (resp && (resp.status() >= 400 || /access denied|forbidden|잠시만 기다리십시오|just a moment|attention required/i.test(title))) {
      throw Object.assign(new Error(`대상 사이트가 접근을 거부했습니다 (HTTP ${resp.status()}). 자동화 브라우저를 차단하는 사이트일 수 있습니다.`), { code: 'blocked' });
    }

    // 하위 페이지 탐색 (같은 사이트 내부 링크 중 처리방침·로그인 등 제외)
    const internal = await page.$$eval('a[href]', (as, dom) => [...new Set(as.map(a => a.href))]
      .filter(h => { try { const u = new URL(h); return /^https?:$/.test(u.protocol) && (u.hostname === dom || u.hostname.endsWith('.' + dom)); } catch { return false; } })
      .filter(h => !/(privacy|policy|login|logout|join|signup|member|cart|order|pay|mypage|javascript|#)/i.test(h)), siteDomain).catch(() => []);
    const picks = internal.filter((h, i) => i % Math.max(1, Math.floor(internal.length / (subpages + 1))) === 0).slice(1, subpages + 1);
    for (const href of picks.filter(h => isAllowed(robots, pathOf(h)))) {
      onProgress('runtime', `하위 페이지 탐색: ${href}`);
      const p = await context.newPage();
      try {
        const r = await p.goto(href, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await p.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        await p.mouse.wheel(0, 2500).catch(() => {});
        await p.waitForTimeout(Math.min(dwellMs, 3000));
        pages.push({ url: p.url(), status: r?.status() ?? null, title: await p.title().catch(() => '') });
      } catch (e) {
        pages.push({ url: href, error: e.message.split('\n')[0] });
      } finally { await p.close().catch(() => {}); }
    }

    const cookies = await context.cookies();
    const storageKeys = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })).catch(() => ({ local: [], session: [] }));

    onProgress('policy', '개인정보처리방침 탐색 및 본문 추출');
    // 지연 로딩되는 푸터까지 렌더링되도록 페이지 끝으로 스크롤
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(1500);
    // 처리방침이 다른 서브도메인에 있으면 그 도메인의 robots.txt도 방문 전에 확인
    const robotsCache = new Map([[new URL(url).origin, robots]]);
    const isAllowedUrl = async u => {
      const o = new URL(u).origin;
      if (!robotsCache.has(o)) robotsCache.set(o, await loadRobots(o));
      return isAllowed(robotsCache.get(o), pathOf(u));
    };
    policy = await fetchPolicy(context, page, { policyUrl, isAllowedUrl });

    await browser.close();
    // 쿠키 값은 저장하지 않음 (이름·도메인·속성만 사용)
    const raw = { url, siteHost, siteDomain, siteEntity, pages, requests, cookies: cookies.map(({ value, ...c }) => c), storageKeys, policy };
    const result = await analyze({ ...raw, useLLM, onProgress, started });
    if (keepRaw) result.raw = { ...raw, durationMs: result.durationMs };   // 실험 재현·재분석용 (로컬 실험에서만 사용)
    return result;
  } catch (e) {
    await browser.close().catch(() => {});
    throw e;
  }
}

// 저장된 원시 관측 데이터로 판정만 다시 수행 (지식베이스·판정 규칙 개선 후 재분석용)
export function reanalyze(raw, { useLLM = false } = {}) {
  return analyze({ ...raw, useLLM, onProgress: () => {}, started: Date.now() - (raw.durationMs || 0) });
}

async function analyze({ url, siteHost, siteDomain, siteEntity, pages, requests, cookies, storageKeys, policy, useLLM, onProgress, started }) {
  onProgress('match', '런타임 동작과 약관 교차 대조');
  // 엔티티 단위 집계
  const entities = new Map();
  const unknown = new Map();
  const cookieDomains = new Set(cookies.map(c => regDomain(c.domain.replace(/^\./, ''))));
  for (const r of requests) {
    const rd = regDomain(r.host);
    if (rd === siteDomain) continue;
    const c = classifyRequest(r.host, r.path);
    if (!c) {
      const u = unknown.get(rd) || { domain: rd, hosts: new Set(), requests: 0 };
      u.hosts.add(r.host); u.requests++; unknown.set(rd, u);
      continue;
    }
    if (c.entity.id === siteEntity) continue; // 사이트 운영 주체 자신의 도메인
    const e = entities.get(c.entity.id) || { id: c.entity.id, name: c.entity.name, entity: c.entity, categories: new Set(), hosts: new Set(), requests: 0, idParams: new Set(), pii: new Set(), firstSeenMs: r.ts };
    e.categories.add(c.category); e.hosts.add(r.host); e.requests++;
    r.params.filter(p => ID_PARAM_RE.test(p)).forEach(p => e.idParams.add(p));
    r.pii.forEach(p => e.pii.add(p));
    e.firstSeenMs = Math.min(e.firstSeenMs, r.ts);
    entities.set(c.entity.id, e);
  }

  let llm = null;
  if (policy.found && useLLM) {
    onProgress('llm', 'LLM 기반 약관 항목 추출');
    try { llm = await extractPolicyLLM(policy.text.slice(0, 200000)); }
    catch (e) { llm = { error: e.message }; }
  }

  const prepared = preparePolicy(policy.found ? policy.text : '');
  const entityRows = [...entities.values()].map(e => {
    const categories = [...e.categories];
    const tracking = categories.some(c => TRACKING_CATEGORIES.has(c));
    const judged = policy.found
      ? judgeEntity(prepared, e.entity, categories, llm?.disclosed_parties || [])
      : { status: 'no-policy', matched: null, evidence: null, method: null };
    const entityDomains = Object.keys(e.entity.domains).map(d => d.split('/')[0]);
    const setsCookie = [...cookieDomains].some(cd => entityDomains.some(d => d === cd || d.endsWith('.' + cd) || cd.endsWith('.' + d)));
    return {
      id: e.id, name: e.name, categories, tracking, hosts: [...e.hosts], requests: e.requests,
      idParams: [...e.idParams], pii: [...e.pii], setsCookie, firstSeenMs: e.firstSeenMs, ...judged,
    };
  }).sort((a, b) => Number(b.tracking) - Number(a.tracking) || b.requests - a.requests);

  const cookieRows = cookies.map(c => {
    const d = c.domain.replace(/^\./, '');
    const cls = classifyRequest(d);
    return { name: c.name, domain: d, thirdParty: regDomain(d) !== siteDomain, entity: cls?.entity?.name || null, expires: c.expires, httpOnly: c.httpOnly, sameSite: c.sameSite };
  });

  const cookiePolicy = policy.found ? cookieDisclosure(prepared) : null;
  const metrics = computeMetrics({ entityRows, cookieRows, cookiePolicy, policyFound: policy.found });

  return {
    version: 1,
    url, siteHost, siteDomain,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    pages,
    policy: { found: policy.found, url: policy.url || null, reason: policy.reason || null, length: policy.text?.length || 0, excerpt: policy.found ? policy.text.slice(0, 600) : null },
    llm: llm && !llm.error ? { model: llm.model, disclosed_parties: llm.disclosed_parties, vague_disclosures: llm.vague_disclosures, uses_cookies: llm.uses_cookies, collected_items: llm.collected_items } : (llm?.error ? { error: llm.error } : null),
    requestsTotal: requests.length,
    thirdPartyRequests: requests.filter(r => regDomain(r.host) !== siteDomain).length,
    entities: entityRows,
    unknownThirdParties: [...unknown.values()].map(u => ({ domain: u.domain, hosts: [...u.hosts], requests: u.requests, setsCookie: cookieDomains.has(u.domain) }))
      .sort((a, b) => b.requests - a.requests).slice(0, 50),
    cookies: cookieRows,
    cookiePolicy,
    storage: storageKeys,
    metrics,
  };
}
