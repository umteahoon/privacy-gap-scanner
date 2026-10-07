// 개인정보처리방침 탐색·본문 추출
const POLICY_LINK_RE = /개인\s*정보\s*(처리|취급)\s*방침|privacy\s*policy/i;

// 현재 페이지에서 처리방침 링크 후보를 찾는다 (텍스트가 정확할수록 우선).
export async function findPolicyLink(page, { exclude } = {}) {
  const links = await page.$$eval('a', as => as.map((a, i) => ({
    i, text: (a.innerText || a.textContent || '').trim().slice(0, 60), href: a.href || '', raw: a.getAttribute('href') || '',
  })));
  const strip = u => (u || '').split('#')[0].replace(/\/$/, '');
  const hits = links.filter(l => /개인\s*정보\s*(처리|취급)\s*방침|privacy\s*policy/i.test(l.text) && (!exclude || strip(l.href) !== strip(exclude)));
  hits.sort((a, b) => a.text.length - b.text.length);
  return hits[0] || null;
}

async function frameTexts(page) {
  const texts = [];
  for (const f of page.frames()) {
    try {
      const t = await f.evaluate(() => document.body ? document.body.innerText : '');
      if (t) texts.push(t);
    } catch { /* 교차 출처 프레임 등은 건너뜀 */ }
  }
  return texts.join('\n');
}

function looksLikePolicy(text) {
  return text.length >= 800 && /개인\s*정보/.test(text) && /(수집|이용|제공|위탁)/.test(text);
}

// 처리방침 본문을 가져온다. policyUrl 이 주어지면 그대로 사용, 없으면 사이트 링크를 따라간다.
// 처리방침 본문을 가져온다. policyUrl 이 주어지면 그대로 사용, 없으면 사이트 링크를 따라간다.
// isAllowedUrl: robots.txt 허용 여부 확인 함수 (금지된 경로는 열지 않음)
export async function fetchPolicy(context, sitePage, { policyUrl, isAllowedUrl = async () => true } = {}) {
  let link = null;
  if (!policyUrl) {
    link = await findPolicyLink(sitePage);
    if (!link) return { found: false, reason: 'policy-link-not-found' };
    if (/^https?:/i.test(link.href)) policyUrl = link.href;
  }

  const page = await context.newPage();
  const load = async u => {
    if (!(await isAllowedUrl(u))) return { robots: true };
    const resp = await page.goto(u, { waitUntil: 'commit', timeout: 30000 });
    if (resp && resp.status() >= 400) return { status: resp.status() };
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    return { status: resp?.status() ?? null, text: await frameTexts(page) };
  };
  try {
    if (policyUrl) {
      let r = await load(policyUrl);
      if (r.robots) return { found: false, url: policyUrl, reason: 'policy-robots-disallowed' };
      if (r.status >= 400) return { found: false, url: policyUrl, reason: `policy-page-blocked (HTTP ${r.status})` };
      if (looksLikePolicy(r.text)) return { found: true, url: page.url(), text: r.text };
      // 여러 처리방침 링크만 나열된 목록형 페이지: 한 단계만 더 따라감
      const next = await findPolicyLink(page, { exclude: page.url() });
      if (next && /^https?:/i.test(next.href)) {
        const listUrl = page.url();
        r = await load(next.href);
        if (r.text && looksLikePolicy(r.text)) return { found: true, url: page.url(), text: r.text, viaIndex: listUrl };
      }
      return { found: false, url: page.url(), reason: 'policy-page-unrecognized', text: r.text || '' };
    }
    // javascript: 링크·모달형: 원래 페이지에서 클릭 후 팝업 또는 모달 본문을 수집
    const popupPromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await sitePage.locator('a').nth(link.i).click({ timeout: 5000 }).catch(() => {});
    const popup = await popupPromise;
    const target = popup || sitePage;
    await target.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await target.waitForTimeout(1500);
    const text = await frameTexts(target);
    if (looksLikePolicy(text)) return { found: true, url: target.url(), text, viaClick: true };
    return { found: false, reason: 'policy-modal-unrecognized' };
  } catch (e) {
    return { found: false, url: policyUrl, reason: 'policy-load-failed: ' + e.message.split('\n')[0] };
  } finally {
    await page.close().catch(() => {});
  }
}

export { POLICY_LINK_RE };
