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

## 部署

```bash
npm install
npm run build
npm run deploy
```

本地调试：

```bash
npm run dev
```

默认 `wrangler.toml` 不包含密钥，可以直接提交。需要 KV 缓存时，把 KV namespace 加到 `wrangler.toml`：

```toml
kv_namespaces = [
  { binding = "PT_GEN_STORE", id = "your-kv-namespace-id" }
]
```

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
