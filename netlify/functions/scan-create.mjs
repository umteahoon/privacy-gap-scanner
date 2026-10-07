// POST /api/scan  { url, policyUrl? } → { id }
import { blobStore, json } from '../../lib/blob-store.js';
import { createScan } from '../../lib/service.js';

export default async (req, context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = process.env.SCAN_WORKER_SECRET;
  if (!secret) return json({ error: '서버 설정 오류: SCAN_WORKER_SECRET 환경변수가 없습니다.' }, 500);
  if (Number(req.headers.get('content-length') || 0) > 8192) return json({ error: '요청이 너무 큽니다.' }, 413);
  let body;
  try { body = await req.json(); } catch { return json({ error: '잘못된 요청 본문' }, 400); }
  const store = blobStore();
  try {
    const { id, reused } = await createScan(store, { url: body.url, policyUrl: body.policyUrl, ip: context.ip, agree: body.agree });
    if (!reused) {
      // 백그라운드 함수 호출 (즉시 202 응답, 최대 15분 실행)
      const origin = new URL(req.url).origin;
      const r = await fetch(`${origin}/api/internal/scan-worker`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-worker-secret': secret }, body: JSON.stringify({ id }),
      });
      if (r.status >= 400) return json({ error: '검사 작업을 시작하지 못했습니다.' }, 502);
    }
    return json({ id, reused });
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
};

export const config = { path: '/api/scan', method: 'POST' };
