# PT-Gen on Cloudflare Workers

这是一个修复后的 `pt-gen-cfworker` 版本，基于 [Rhilip/pt-gen-cfworker](https://github.com/Rhilip/pt-gen-cfworker) 继续维护，使 PT-Gen 可以用现代 Wrangler 部署到 Cloudflare Workers。

## 修复重点

- 更新到 Wrangler 4 的构建和部署方式。
- 修复 `package-lock.json` 中过期的淘宝 npm 源，干净环境可直接安装依赖。
- 修复 JSON 响应默认体被复用污染的问题。
- Douban 详情改用移动页和 `subject_abstract` 组合解析，避免桌面页验证跳转导致生成失败。
- Bangumi 详情改用 v0 JSON API，恢复 Staff、Cast、标签和评分。
- Steam 修复官网链接、语言支持判断和标题重复问题。
- Epic 修复新版商店内容字段缺失时的崩溃。
- Indienova 修复空元素判断和链接输出。
- IMDb 搜索可用；IMDb 详情页目前经常被 AWS WAF 拦截，Worker 会返回明确错误，不再抛内部异常。

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
| douban | 支持 | 支持 | 详情使用移动页和摘要接口 |
| bangumi | 支持 | 支持 | 详情使用 Bangumi v0 API |
| imdb | 支持 | 受限 | 详情页可能被 AWS WAF 拦截 |
| steam | 不支持 | 支持 | Steam 仍可能按访问来源限制请求 |
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

本地 Worker 烟测覆盖了 Douban、Bangumi、IMDb、Steam、Epic、Indienova：

- Douban 搜索和详情生成成功。
- Bangumi 搜索和详情生成成功。
- IMDb 搜索成功，详情返回上游阻断错误。
- Steam、Epic、Indienova 详情生成成功。

## License

MIT
