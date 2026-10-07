// 백그라운드 스캔 워커: scan-create 에서만 호출 (공유 비밀키로 보호)
import { timingSafeEqual } from 'node:crypto';
import { blobStore } from '../../lib/blob-store.js';
import { runScan } from '../../lib/service.js';

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async req => {
  const secret = process.env.SCAN_WORKER_SECRET || '';
  const given = req.headers.get('x-worker-secret') || '';
  if (!secret || !same(given, secret)) return;
  const { id } = await req.json().catch(() => ({}));
  if (!id) return;
  await runScan(blobStore(), id);
};

export const config = { path: '/api/internal/scan-worker', background: true };
