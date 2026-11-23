# 任务 · github-pages-deployment

> 前置：design.md 已获确认。完成后勾选并注明证据。

| # | 任务 | 映射需求 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T1 | `vite.config.ts` 设 `base: './'` | FR-GHP-01/NFR-GHP-01 | ✅ 完成 | `dist/index.html` 资源引用为 `./assets/…` |
| T2 | `public/sw.js` CORE 与缓存键改 `./` 相对形式 | FR-GHP-01/02 | ✅ 完成 | `dist/sw.js` CORE 与 match/put 键均为 `./` |
| T3 | `public/manifest.webmanifest` `start_url`/图标改 `./` | FR-GHP-01/02 | ✅ 完成 | `dist/manifest.webmanifest` `start_url: "./"` |
| T4 | `src/main.ts` SW 注册改 `import.meta.env.BASE_URL` | FR-GHP-02/NFR-GHP-02 | ✅ 完成 | 构建产物含 `BASE_URL` 拼接；dev 44 项全绿 |
| T5 | 新增 `public/.nojekyll` | FR-GHP-01 | ✅ 完成 | `dist/.nojekyll` 存在 |
| T6 | 新增 `.gitignore` 与 `.github/workflows/deploy.yml` | FR-GHP-03 | ✅ 完成 | 工作流含 configure-pages 自动开通 |
| T7 | 本地验证：`npm run build` + `npm test` 44 项 + `npm run preview` 冒烟 | NFR-GHP-01/02 | ✅ 完成 | `npm test`：44 passed (56.2s)；preview 冒烟见 T9 前记录 |
| T8 | git 化、首次提交、推送 `FBxiaomo/Morrow`，启用 Pages（Actions 来源），触发首次部署 | FR-GHP-03 | ☐ 未开始 | |
| T9 | 线上验收：主页无 404、SW 注册于 `/Morrow/sw.js`、PWA 可安装、天气可用 | FR-GHP-01/02 | ☐ 未开始 | |

## 完成门禁（全部满足才算完成）

- [ ] `npm run build` 全绿（tsc 含遗留模块）
- [ ] `npm test` 44 项全绿
- [ ] 版本三处同步不涉及（不发布新版本，保持 0.2.1）
- [ ] 规格增量合并进 `specs/capabilities/offline-pwa/spec.md`（部署渠道与路径约定）
- [ ] 本提案目录移入 `changes/archive/<日期>-<slug>/`
