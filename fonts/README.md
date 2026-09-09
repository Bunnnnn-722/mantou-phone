# fonts/

星空装帧的标题字体 **朝华标题A v1.001**（特里王，免费商用，不许单独或打包转卖）。

- `chaohua/ChaoHuaTitleA-00..17.woff2`：从猫啃网原包（https://www.maoken.com/freefonts/27668.html）的 TTF 用 fontTools 子集化，字集＝ASCII＋GB2312 全部＋CJK 标点＋全角区（7532 字），按码位分 18 包，共约 3.8MB，浏览器只拉页面用到的包。
- `chaohua/chaohua.css`：@font-face 清单（unicode-range），index.html 直接引。
- 字集外的字按字回落到汇文明朝体，不报错。
- 原始 TTF 不入仓库（40MB）。要重切：装 `fonttools brotli`，字集与分包逻辑见 git 历史里 9b5619a 之后的提交说明。

正文的汇文明朝体走 jsDelivr 分包 CDN，不放这里。
