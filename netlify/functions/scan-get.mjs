// GET /api/scan/:id → 진행 상태 및 결과
import { blobStore, json } from '../../lib/blob-store.js';
import { getScan } from '../../lib/service.js';

export default async (req, context) => {
  const rec = await getScan(blobStore(), context.params.id);
  return rec ? json(rec) : json({ error: '검사 기록을 찾을 수 없습니다.' }, 404);
};

export const config = { path: '/api/scan/:id', method: 'GET' };
