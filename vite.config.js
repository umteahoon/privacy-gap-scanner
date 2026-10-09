import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 로컬 개발/시연용 API: Netlify Functions 와 동일한 엔드포인트를 메모리 저장소로 흉내 낸다.
// (netlify-cli 없이 `npm run dev` 만으로 전체 기능 동작, 발표장 오프라인 백업용으로도 사용)
function localApi() {
  return {
    name: 'local-scan-api',
    configureServer(server) {
      const mem = new Map();
      const store = { getJSON: async k => mem.get(k) ?? null, setJSON: async (k, v) => { mem.set(k, structuredClone(v)); }, delete: async k => { mem.delete(k); } };
      const send = (res, status, data) => { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        const svc = await server.ssrLoadModule('/lib/service.js');
        try {
          if (req.method === 'POST' && req.url === '/api/scan') {
            let raw = ''; for await (const c of req) raw += c;
            let body;
            try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: '잘못된 요청 본문' }); }
            const r = await svc.createScan(store, { url: body.url, policyUrl: body.policyUrl, ip: req.socket.remoteAddress, agree: body.agree });
            if (!r.reused) svc.runScan(store, r.id);
            return send(res, 200, { id: r.id, reused: r.reused });   // 배포 함수와 동일하게 내부 토큰은 응답하지 않음
          }
          const m = req.url.match(/^\/api\/scan\/([0-9a-f-]{36})$/);
          if (req.method === 'GET' && m) {
            const rec = await svc.getScan(store, m[1]);
            return rec ? send(res, 200, rec) : send(res, 404, { error: '검사 기록을 찾을 수 없습니다.' });
          }
          send(res, 404, { error: 'Not found' });
        } catch (e) {
          send(res, e.status || 400, { error: e.message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
});
