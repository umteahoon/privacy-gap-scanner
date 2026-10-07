// 입력 URL 검증 + SSRF 방지 (사설망·로컬·메타데이터 주소로의 스캔 차단)
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const PRIVATE_V4 = [
  ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['0.0.0.0', 8], ['100.64.0.0', 10], ['198.18.0.0', 15], ['224.0.0.0', 4],
];
const ip4 = s => s.split('.').reduce((a, b) => (a << 8) + +b, 0) >>> 0;

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const v = ip4(ip);
    return PRIVATE_V4.some(([base, bits]) => (v >>> (32 - bits)) === (ip4(base) >>> (32 - bits)));
  }
  const l = ip.toLowerCase();
  if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7));
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

export function normalizeTargetUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('URL을 입력하세요.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw new Error('올바른 URL 형식이 아닙니다.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('http/https 주소만 검사할 수 있습니다.');
  if (u.username || u.password) throw new Error('인증 정보가 포함된 URL은 허용되지 않습니다.');
  const h = u.hostname;
  if (net.isIP(h.replace(/^\[|\]$/g, ''))) throw new Error('IP 주소가 아닌 도메인을 입력하세요.');
  if (!h.includes('.') || /(^|\.)(localhost|local|internal|lan|home)$/i.test(h)) throw new Error('공개 도메인만 검사할 수 있습니다.');
  u.hash = '';
  return u;
}

export async function assertPublicHost(hostname) {
  const addrs = await lookup(hostname, { all: true }).catch(() => { throw new Error('도메인을 찾을 수 없습니다.'); });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('공개 인터넷 주소가 아닌 대상은 검사할 수 없습니다.');
}
