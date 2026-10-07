// robots.txt 준수: 사이트 운영자가 자동화 접근을 금지한 경로는 방문하지 않는다.
export const BOT_TOKEN = 'PrivacyGapScanner';

function parseRobots(text) {
  const groups = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'allow' || key === 'disallow')) {
      cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  return groups;
}

const toRe = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));

export async function loadRobots(origin, timeoutMs = 8000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(origin + '/robots.txt', { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': `${BOT_TOKEN}/1.0` } });
    clearTimeout(t);
    if (!r.ok) return { groups: [], status: r.status };
    return { groups: parseRobots((await r.text()).slice(0, 500000)), status: r.status };
  } catch {
    return { groups: [], status: null };
  }
}

// 가장 구체적인 User-agent 그룹을 고르고, 가장 긴 경로 규칙을 적용 (RFC 9309)
export function isAllowed(robots, pathWithQuery) {
  const token = BOT_TOKEN.toLowerCase();
  const group = robots.groups.find(g => g.agents.some(a => a !== '*' && token.includes(a)))
    || robots.groups.find(g => g.agents.includes('*'));
  if (!group) return true;
  let best = null;
  for (const r of group.rules) {
    if (!r.path) continue;
    if (toRe(r.path).test(pathWithQuery) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
