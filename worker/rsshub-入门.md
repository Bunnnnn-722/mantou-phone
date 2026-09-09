# RSSHub 入门 · 把没有 RSS 的平台翻译成 RSS

## 一、它是什么

RSSHub 是一个开源的"万能翻译器"：你给它一个平台上的地址规则，它去替你抓，然后吐出一份标准 RSS。它本身不产内容，只是"翻译"——微博博主、豆瓣小组、B 站 UP 主、知乎回答、Telegram 频道……上千条路由，几乎覆盖中文互联网。

一句话理解：**平台没有 RSS？让 RSSHub 假装它有。**

它必须自己搭一台（公共实例已经限流不给用），你有那台法兰克福的 VPS，正合适。

## 二、起一台（Docker，十分钟）

在 VPS 上（SSH 进去）：

```bash
# 1. 装 Docker（已装可跳过）
curl -fsSL https://get.docker.com | sh

# 2. 建目录与配置
mkdir -p ~/rsshub && cd ~/rsshub
cat > docker-compose.yml <<'EOF'
services:
  rsshub:
    image: diygod/rsshub:chromium-bundled
    restart: always
    ports:
      - "1200:1200"
    environment:
      NODE_ENV: production
      CACHE_TYPE: redis
      REDIS_URL: redis://redis:6379/
      ALLOW_ORIGIN: "*"          # 关键：给小手机这类网页开 CORS
      ACCESS_KEY: "换成你自己的长密码" # 防止别人白嫖你的实例
    depends_on:
      - redis
  redis:
    image: redis:alpine
    restart: always
    volumes:
      - redis-data:/data
volumes:
  redis-data:
EOF

# 3. 启动
docker compose up -d
```

验证：浏览器打开 `http://你的VPS地址:1200/` 看到 RSSHub 欢迎页即可。

## 三、必须过 HTTPS 这一关（重要）

小手机跑在 `https://` 上，浏览器**禁止**它去请求 `http://` 的地址（混合内容拦截）。两条路二选一：

- **有域名**：在 VPS 上用 Caddy 反代自动上 HTTPS——
  ```bash
  apt install -y caddy
  cat > /etc/caddy/Caddyfile <<'EOF'
  rss.你的域名.com {
      reverse_proxy localhost:1200
  }
  EOF
  systemctl restart caddy
  ```
  DNS 把 `rss.你的域名.com` 指向 VPS 即可，证书自动签。
- **没域名**：用仓库里那个 Cloudflare Worker 当 HTTPS 桥——它可以替你去请求 `http://VPS:1200/...`。小手机的转发模板照旧填 Worker 地址，RSS 源地址写 `http://你的VPS:1200/路由?key=你的ACCESS_KEY`。

## 四、路由怎么写（拿几个你会用的）

RSSHub 的地址格式永远是：`https://你的RSSHub/路由参数?key=ACCESS_KEY`

| 想订什么 | 路由 | 参数怎么拿 |
|---|---|---|
| 微博某博主 | `/weibo/user/<uid>` | 网页版打开博主主页，地址栏 `weibo.com/u/` 后面那串数字 |
| 豆瓣小组 | `/douban/group/<组id>` | 小组地址 `douban.com/group/<这里>/` |
| B 站 UP 主动态 | `/bilibili/user/dynamic/<uid>` | 空间地址 `space.bilibili.com/<这里>` |
| B 站 UP 主投稿 | `/bilibili/user/video/<uid>` | 同上 |
| 知乎某人回答 | `/zhihu/people/answers/<id>` | 主页地址 `zhihu.com/people/<这里>` |
| Telegram 公开频道 | `/telegram/channel/<频道名>` | `t.me/<这里>` |
| 微信公众号（第三方镜像，时好时坏） | `/wechat/ce/<id>` 等 | 看文档 wechat 一节，能用哪条用哪条 |

**查路由的地方**：https://docs.rsshub.app/ ——左侧按平台分类，每条路由都写着参数含义和示例。规则：文档里写 `/weibo/user/:uid`，你就把 `:uid` 换成真值。

例：微博博主 uid 是 1234567890，你的 RSSHub 在 `https://rss.你的域名.com`，那订阅地址就是
`https://rss.你的域名.com/weibo/user/1234567890?key=你的ACCESS_KEY`

## 五、接进小手机

浮生记 → 右上「订阅」→ 类型选 RSS → 名称随意 → URL 填上面拼好的地址 → 添加。因为 RSSHub 配了 `ALLOW_ORIGIN: "*"`，走 HTTPS 的实例可以直连，不需要转发代理。

## 六、常见坑

- **微博／知乎这类路由需要 Cookie**：反爬严的平台，RSSHub 要你把自己账号的 Cookie 配进环境变量（文档每条路由会标「需要配置」），配了就稳定；不配可能拿不到或只拿到部分。
- **有些路由会失效**：平台改版就断，等 RSSHub 更新镜像即可（`docker compose pull && docker compose up -d`）。
- **别把 ACCESS_KEY 泄露**：它出现在订阅地址里，小手机的数据都在你本机，问题不大；但别把地址发出去。
