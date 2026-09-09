/* 小手机 · 浮生记转发代理（Cloudflare Worker）
   用途：帮浏览器拉取不带 CORS 头的 RSS/Atom/JSON Feed。只转发 GET，只允许 http(s)，加 CORS 头，不存任何数据。
   用法：https://<你的名字>.workers.dev/?u=<encodeURIComponent(源地址)>
   在小手机设置里填「转发代理 URL 模板」：https://<你的名字>.workers.dev/?u={url}
   可选：在 Worker 的「设置 → 变量」加一个 KEY，防止别人拿到地址白嫖；模板改成 …/?k=<KEY>&u={url} */
export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'GET') return new Response('only GET', { status: 405, headers: cors });
    const q = new URL(req.url).searchParams;
    if (env && env.KEY && q.get('k') !== env.KEY) return new Response('bad key', { status: 401, headers: cors });
    const u = q.get('u');
    if (!u || !/^https?:\/\//i.test(u)) return new Response('missing ?u=<url>', { status: 400, headers: cors });
    try {
      const r = await fetch(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; mantou-phone-rss/1.0; +https://github.com/Bunnnnn-722/mantou-phone)',
          'Accept': 'application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/xml, application/json, text/html;q=0.5, */*;q=0.1',
        },
        cf: { cacheTtl: 300, cacheEverything: true }, // 边缘缓存 5 分钟，省源站也省你的额度
        redirect: 'follow',
      });
      const body = await r.arrayBuffer();
      const h = new Headers(cors);
      h.set('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
      h.set('X-Proxy-Status', String(r.status));
      return new Response(body, { status: r.status, headers: h });
    } catch (e) {
      return new Response('upstream error: ' + (e && e.message), { status: 502, headers: cors });
    }
  },
};
