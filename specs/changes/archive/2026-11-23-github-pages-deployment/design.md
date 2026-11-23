# 设计 · github-pages-deployment

> 前置：proposal.md 已获确认。本文档回答「怎么改」：架构影响、数据、降级、预算。

## 1. 架构影响

| 模块 | 改动 | 理由 |
| --- | --- | --- |
| `vite.config.ts` | 修改：`build.base` 设为 `'./'`（写入顶层 `base`） | 产物资源引用从根路径改为相对路径，根/子路径部署通吃 |
| `public/sw.js` | 修改：CORE 清单与缓存键 `/xxx` → `./xxx` | SW 内相对 URL 按脚本自身 URL 解析；`/Morrow/sw.js` 解析出 `/Morrow/index.html` 等，作用域自动正确 |
| `public/manifest.webmanifest` | 修改：`start_url` 与图标 `/xxx` → `./xxx` | 清单内相对 URL 按清单 URL 解析，与部署深度解耦 |
| `src/main.ts` | 修改：`register('/sw.js')` → `register(import.meta.env.BASE_URL + 'sw.js')` | dev 下 BASE_URL 为 `/`，行为不变；prod 为 `./`，随部署路径解析（PROD 门控不受测试影响） |
| `public/.nojekyll` | 新增空文件 | 防止未来切回分支部署时 Jekyll 忽略下划线资源 |
| `.github/workflows/deploy.yml` | 新增 | checkout → Node 22 → `npm ci` → `npm run build` → upload-pages-artifact → deploy-pages |
| `.gitignore` | 新增 | 排除 `node_modules/`、`dist/`、`test-results/`、`artifacts/`、`.acl-recovery/` 等本地产物 |

## 2. 数据与迁移

无新增持久化键，无浏览器存储结构变化。Service Worker 缓存名保持 `horloge-shell-v1`（R4：线上无历史用户，不涉及键迁移）。缓存条目键从根路径（`/index.html`）变为部署路径（`/Morrow/index.html`），由 SW 重新预缓存，属首次部署一次性行为。

## 3. 预算与降级

无渲染预算变化（不触碰渲染管线，R7 不涉及）。部署链路降级：Actions 失败 → Pages 保持上一发布版本不变（Pages 原子发布）；本地始终可用 `npm run build` + `npm run preview` 完整验证。SW 注册失败时既有 catch 保持静默降级（在线可用，R6 的 Web 回退链不涉及）。

## 4. 关键实现决策

1. **选相对路径（`base: './'`）而非硬编码 `base: '/Morrow/'`**：同一份产物在根路径、子路径、本地 preview 全部正确（NFR-GHP-01），未来自定义域名零改动；硬编码则每换渠道必重构建。
2. **SW 用 `'./'` 相对形式而非拼接作用域**：SW 规范保证相对 URL 按脚本位置解析，避免手写作用域字符串在两种部署深度下出错；`caches.match('./index.html')` 按解析后的键匹配，导航回退语义与旧实现一致。
3. **注册路径用 `import.meta.env.BASE_URL` 而非字面量 `'/sw.js'`**：dev 下保持 `/sw.js` 不破坏本地行为，prod 下自动随 base 走，一个表达式覆盖两种环境。
4. **CI 用 `npm ci` 而非 `npm install`**：仓库已有 `package-lock.json`，保证云端构建与本机构建产物一致性。
5. **Pages 来源设为 GitHub Actions 而非分支发布**：与工作流配套，发布 `dist/` 产物而非整仓源码，仓库不受构建产物污染。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| GitHub Pages 子路径下仍有未发现的根路径引用 | 全仓 grep 绝对路径字面量已确认仅 4 处；线上验收逐项检查网络面板 404 |
| 首次部署时 Pages 未启用 Actions 来源导致工作流失败 | 部署时先启用（API 或仓库设置），失败可手动重跑工作流 |
| CI 环境与本地 Node 版本差异导致构建分歧 | 工作流固定 Node 22 LTS，与本地大版本一致 |
| 公开仓库暴露本机路径等隐私信息 | `.gitignore` 排除本机恢复目录与测试产物；源码均为项目文件 |
