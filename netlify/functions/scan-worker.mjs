// 백그라운드 스캔 워커: scan-create 에서만 호출 (검사별 일회용 토큰으로 보호)
import { blobStore } from '../../lib/blob-store.js';
import { runScan, consumeWorkerToken } from '../../lib/service.js';

export default async req => {
  const { id } = await req.json().catch(() => ({}));
  const store = blobStore();
  if (!(await consumeWorkerToken(store, id, req.headers.get('x-worker-token') || ''))) return;
  await runScan(store, id);
};

export const config = { path: '/api/internal/scan-worker', background: true };
