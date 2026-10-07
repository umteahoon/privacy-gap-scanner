// Netlify Blobs 저장소 어댑터 (서버 함수에서만 접근 가능, 별도 키·외부 DB 불필요)
import { getStore } from '@netlify/blobs';

export function blobStore() {
  const store = getStore({ name: 'privacy-gap', consistency: 'strong' });
  return {
    getJSON: key => store.get(key, { type: 'json' }),
    setJSON: (key, value) => store.setJSON(key, value),
    delete: key => store.delete(key),
  };
}

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
});
