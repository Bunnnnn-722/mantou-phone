# 浮生记转发代理 · 五分钟部署（Cloudflare Worker，免费）

只在你订阅的源「直连被拦」（源站没给 CORS 头）时才需要。少数派这类自带 CORS 的源不用它；Reddit 走 OAuth 也不用它。

一、打开 https://dash.cloudflare.com → 登录（没有就注册，免费）→ 左侧「Workers 和 Pages」→「创建」→「创建 Worker」。
二、名字随意（比如 `fusheng`），点「部署」。
三、部署完点「编辑代码」，把 `rss-proxy.js` 的全部内容粘贴进去覆盖，右上「部署」。
四、页面上会显示你的地址，形如 `https://fusheng.<你的用户名>.workers.dev`。
五、回小手机 → 设置 → 「浮生记 · 订阅」→ 转发代理 URL 模板 填：
    `https://fusheng.<你的用户名>.workers.dev/?u={url}`
    （`{url}` 原样保留，小手机会替换成源地址。）

六（可选）、不想让拿到地址的人白嫖：Worker 页面「设置 → 变量和机密」加一个变量 `KEY`，值随意（一串长密码），模板改成 `https://fusheng.<你的用户名>.workers.dev/?k=你的KEY&u={url}`。

说明：免费额度每天 10 万次请求，够用一辈子；它只转发 GET，不记录、不存储；边缘缓存 5 分钟。国内访问 workers.dev 域名有时不稳，不稳就绑一个自己的域名。
