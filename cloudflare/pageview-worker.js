/**
 * Cloudflare Worker — 글별 조회수 추적
 *
 * 설정 방법:
 * 1. Cloudflare 대시보드 → Workers & Pages → Create Worker
 * 2. 이 파일 내용 붙여넣기 후 Deploy
 * 3. Worker 설정 → Variables → KV Namespace Bindings
 *    Variable name: PAGEVIEWS  /  KV namespace: (새로 생성한 네임스페이스)
 * 4. Worker URL을 hugo.toml의 pageviewWorkerUrl에 입력
 */

const ALLOWED_ORIGINS = ['https://blog.kastori.dev', 'http://localhost:1313', 'http://localhost:8080'];

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const pageUrl = url.searchParams.get('url');

    if (!pageUrl) {
      return new Response(JSON.stringify({ error: 'url 파라미터가 필요합니다' }), {
        status: 400,
        headers: corsHeaders(origin),
      });
    }

    const key = `pv:${pageUrl}`;

    // GET — 조회수 반환
    if (request.method === 'GET') {
      const count = parseInt((await env.PAGEVIEWS.get(key)) || '0');
      return new Response(JSON.stringify({ count }), { headers: corsHeaders(origin) });
    }

    // POST — 조회수 증가 후 반환
    if (request.method === 'POST') {
      const current = parseInt((await env.PAGEVIEWS.get(key)) || '0');
      const next = current + 1;
      await env.PAGEVIEWS.put(key, String(next));
      return new Response(JSON.stringify({ count: next }), { headers: corsHeaders(origin) });
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};
