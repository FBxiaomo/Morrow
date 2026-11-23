# 变更提案 · github-pages-deployment

> 状态：**已确认 → 实现中**
> 提出日期：2026-11-23 · 提出人：仓库所有者（FBxiaomo）
> 影响能力域：`specs/capabilities/offline-pwa/`（部署渠道相关条目）

## 1. 为什么改

项目此前仅在本机 dev server（127.0.0.1:5190）与 `npm run preview` 下验证，没有公开可访问的部署渠道。仓库已建为 GitHub 公开仓库 `FBxiaomo/Morrow`，目标是通过 GitHub Pages 发布可安装 PWA。但当前生产构建假设「站点部署在域名根路径」，存在 4 处根路径绝对引用（`vite.config.ts` 无 `base`、`public/sw.js` 的 CORE 清单与缓存键、`public/manifest.webmanifest` 的 `start_url` 与图标、`src/main.ts` 的 `/sw.js` 注册）。项目仓库部署在 `https://fbxiaomo.github.io/Morrow/` 子路径下，这些引用会 404，Service Worker 无法注册，PWA 安装与离线缓存全部失效。

## 2. 改什么

构建产物与 PWA 资源引用全部改为**相对路径**：`vite.config.ts` 增加 `base: './'`；`public/sw.js` 的 CORE 清单与缓存键改 `./` 形式；`public/manifest.webmanifest` 的 `start_url` 与图标改 `./`；`src/main.ts` 的 SW 注册改用 `import.meta.env.BASE_URL`。另新增 `public/.nojekyll` 保险文件与 GitHub Actions 部署工作流 `.github/workflows/deploy.yml`（push `main` 自动构建发布，保留 workflow_dispatch 手动入口）。同一份构建产物在根路径、`/Morrow/` 子路径、本地 `npm run preview` 下均正确，未来接自定义域名无需再改。

**影响的既有需求**：offline-pwa 域中「生产版本注册离线应用缓存」的 FR 条目行为不变，仅修正其在子路径部署下的可达性（修订：资源定位方式从根路径改为相对路径）。

## 3. 不改什么（边界）

- 不改任何渲染、计时、天气、设置逻辑；不改存储键；不 bump 版本（保持 0.2.1，R11 不涉及）。
- 不引入新依赖、不引入 API key、不改动 Open-Meteo 直连方式（R12）。
- 不迁移仓库 `sw.js` 的缓存版本号 `horloge-shell-v1`：离线缓存键不变，线上首次部署无历史用户，无需迁移（R4 不触发）。
- 不新增 Playwright 用例：44 项既有用例全部运行在 dev server，SW 注册为 `PROD` 门控，行为不受影响；子路径正确性由线上人工验收覆盖。

## 4. 需求（EARS，确认后才可设计）

- **FR-GHP-01** 当生产构建被部署在 `https://fbxiaomo.github.io/Morrow/` 子路径下时，系统应使所有静态资源（JS/CSS/图标/清单/SW 脚本）经相对路径解析可达。
- **FR-GHP-02** 当用户首次访问已部署页面时，系统应在 `/Morrow/sw.js` 成功注册 Service Worker 并预缓存核心界面（manifest、图标、index.html）。
- **FR-GHP-03** 当 push 提交到 `main` 分支时，GitHub Actions 应自动完成 `npm ci` → `npm run build` → Pages 发布，且支持手动触发。
- **NFR-GHP-01** 系统应始终在根路径部署（本地 preview、未来自定义域名）下保持与子路径部署完全一致的可用性。
- **NFR-GHP-02** 本地开发（`npm run dev`）与全部 44 项回归用例应不受本次改动影响。

## 5. 验收方式

| 需求 | 验证手段 |
| --- | --- |
| FR-GHP-01 | `npm run build` 后检查 `dist/index.html` 资源引用为相对路径；线上打开主页无 404 |
| FR-GHP-02 | 线上人工验收：DevTools → Application → Service Worker 注册于 `/Morrow/sw.js`，PWA 可安装 |
| FR-GHP-03 | push 后观察 Actions 运行记录全绿，Pages URL 更新 |
| NFR-GHP-01 | `npm run preview` 本地冒烟通过 |
| NFR-GHP-02 | `npm test` 44 项全绿 |

## 6. 决策待办（需要人拍板的问题）

- [x] 仓库可见性 → 公开（GitHub Free 的 Pages 仅支持公开仓库，本项目无密钥，已拍板）
- [x] 部署触发 → push `main` 自动部署 + 手动入口（已拍板）
- [x] 仓库地址 → `https://github.com/FBxiaomo/Morrow.git`（已建空仓）
