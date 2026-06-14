# PT-Gen on Cloudflare Workers

这是一个修复后的 `pt-gen-cfworker` 版本，基于 [Rhilip/pt-gen-cfworker](https://github.com/Rhilip/pt-gen-cfworker) 继续维护，使 PT-Gen 可以用现代 Wrangler 部署到 Cloudflare Workers。

## 修复重点

- 更新到 Wrangler 4 的构建和部署方式。
- 修复 `package-lock.json` 中过期的淘宝 npm 源，干净环境可直接安装依赖。
- 修复 JSON 响应默认体被复用污染的问题。
- Douban 详情优先使用桌面页完整解析，遇到验证跳转时回退到 `rexxar`/移动页接口。
- Bangumi 详情改用 v0 JSON API，恢复 Staff、Cast、标签和评分。
- Steam 使用商店页和 `appdetails` API 互相补全，恢复截图、配置、官网和基础信息。
- Epic 修复新版商店内容字段缺失时的崩溃。
- Indienova 修复空元素判断和链接输出。
- IMDb 搜索可用；详情页被 AWS WAF 拦截时回退到静态 suggestion/ratings 接口生成基础条目。

## 部署方式

推荐用 Wrangler 部署；不想装 Wrangler 时，也可以把项目打包成一个 `dist/worker.js`，然后整段复制到 Cloudflare Workers 控制台。

### 方式一：Wrangler 部署

```bash
npm install
cp wrangler.toml.sample wrangler.toml
npx wrangler@4.98.0 login
npm run smoke
npm run deploy
```

`wrangler.toml.sample` 是可提交的示例配置；实际部署前复制一份为 `wrangler.toml`，然后按自己的 Worker 名称和 KV 配置修改。里面最重要的是这几项：

```toml
name = "ptgen"
main = "dist/worker.js"
compatibility_date = "2026-06-05"
workers_dev = true

[build]
command = "npm run build"
```

也就是说，Wrangler 部署前会先跑 `npm run build`，把源码和依赖打包成 `dist/worker.js`，再把这个单文件上传到 Cloudflare Workers。

常用命令：

```bash
npm run dev      # 本地调试
npm run deploy   # 部署到 Cloudflare Workers
npm run smoke    # 构建并跑一轮 Worker 烟测
```

需要 KV 缓存时，先创建 KV namespace：

```bash
npx wrangler@4.98.0 kv namespace create PT_GEN_STORE
```

然后把返回的 `id` 填进 `wrangler.toml`：

```toml
kv_namespaces = [
  { binding = "PT_GEN_STORE", id = "your-kv-namespace-id" }
]
```

需要配置密钥或 Cookie 时，推荐用 Wrangler secret：

```bash
npx wrangler@4.98.0 secret put APIKEY
npx wrangler@4.98.0 secret put DOUBAN_COOKIE
npx wrangler@4.98.0 secret put INDIENOVA_COOKIE
```

非敏感变量也可以写在 `wrangler.toml` 的 `[vars]` 下面：

```toml
[vars]
AUTHOR = "your-name"
DISABLE_SEARCH = "1"
```

### 方式二：手动复制到 Cloudflare 控制台

这种方式不需要 Wrangler 登录，只需要本地能跑 Node/npm。

```bash
npm install
npm run build
```

构建完成后，打开：

```bash
dist/worker.js
```

`dist/worker.js` 是打包后的 Module Worker 单文件。在 Cloudflare 控制台里创建 Worker，然后进入在线编辑器：

1. 删除编辑器里默认生成的示例代码。
2. 把 `dist/worker.js` 的全部内容复制进去。
3. 保存并部署。

注意：不要复制 `index.js`、`app.js` 或 `lib/` 里的源码。Cloudflare 控制台里要粘贴的是打包后的单文件 `dist/worker.js`。如果控制台让你选择 Worker 格式，选择默认的 Module Worker。

如果要配置 `APIKEY`、`DOUBAN_COOKIE`、`INDIENOVA_COOKIE`、`DISABLE_SEARCH`、`AUTHOR` 或 KV binding，可以在 Cloudflare 控制台的 Worker 设置页里添加变量、Secret 和 KV 绑定。变量名必须和上面的名字完全一致。

部署后可以用这个条目检查豆瓣海报和简介是否正常：

```text
/?site=douban&sid=37116446
```

返回的 `format` 应该以 `[img]https://img1.doubanio.com/view/photo/l_ratio_poster/public/p2931851430.jpg[/img]` 开头，并包含“潮汕阿嬷叶淑柔……”简介。

## 请求方式

搜索：

```text
/?search=关键词&source=douban
```

生成：

```text
/?url=https://movie.douban.com/subject/1292052/
/?site=douban&sid=1292052
```

## 支持来源

| 来源 | 搜索 | 生成 | 说明 |
| --- | --- | --- | --- |
| douban | 支持 | 支持 | 详情使用桌面页、rexxar 与移动页多级回退 |
| bangumi | 支持 | 支持 | 详情使用 Bangumi v0 API |
| imdb | 支持 | 支持 | 页面被 WAF 拦截时使用静态接口生成基础信息 |
| steam | 不支持 | 支持 | 使用商店页和 appdetails API 互补 |
| indienova | 不支持 | 支持 | 可配置 `INDIENOVA_COOKIE` |
| epic | 不支持 | 支持 | 支持新版 `store.epicgames.com/.../p/{slug}` 链接 |

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `AUTHOR` | 重写返回里的作者名 |
| `APIKEY` | 启用后请求必须携带 `&apikey={APIKEY}` |
| `DISABLE_SEARCH` | 设置为非空值时禁用搜索 |
| `DOUBAN_COOKIE` | 豆瓣 Cookie，可提高部分详情页访问成功率 |
| `INDIENOVA_COOKIE` | Indienova Cookie |
| `PT_GEN_STORE` | Cloudflare KV binding，用于缓存生成结果 |

## 验证结果

本地 Worker 烟测覆盖了首页、OPTIONS、搜索、生成和 URL 自动识别：

- Douban 搜索和详情生成成功。
- Bangumi 搜索和详情生成成功。
- IMDb 搜索和详情生成成功；详情在页面受阻时会降级为静态接口基础信息。
- Steam、Epic、Indienova 详情生成成功。
- Douban、Steam、Epic 的 `url=` 自动识别生成成功。
- `APIKEY` 与 `DISABLE_SEARCH` 环境变量行为正常。

## License

MIT
