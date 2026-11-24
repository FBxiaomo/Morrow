# 任务 · 2026-11-24-font-cards

> 前置：design.md 已确认。每任务先测试后实现（RED→GREEN）。

| # | 任务 | 映射需求 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T1 | font-picker.spec 用例改写为卡片交互 + Playfair 新用例 + 手动输入移除断言（先 RED） | FR-FONT-01/02/03/05 | ☑ 完成 | RED：卡片定位超时、手动输入 count=1；实现后 3 项转绿 |
| T2 | `settings.ts` playfair 选项 + `FONT_STACKS`；`desktop.css` @font-face | FR-FONT-01/03 | ☑ 完成 | 构建产物 `playfair-display-latin-*.woff2` 21.85KB；`document.fonts.load` 断言通过 |
| T3 | `font-picker.ts` 卡片网格重写 + `customizer.ts` 移除 select 行与死特判 | FR-FONT-01/02/04/05 | ☑ 完成 | tsc 通过；卡片点击清空 fontCustom 断言通过 |
| T4 | `liquid-settings.css` 卡片样式与 `.font-manual/.font-picker-actions` 死样式清理 | FR-FONT-01/05 | ☑ 完成 | 死类无残留（grep 0 命中） |
| T5 | `desktop.spec:51` 同步改卡片交互 + 全量回归 | NFR-FONT-01 | ☑ 完成 | `npm run build` 全绿；49/49 全绿（2026-11-24 会话日志） |
| T6 | 验收截图 + 规格增量合并（FR-TH-12/13）+ 提案归档 | 全部 | ☑ 完成 | `artifacts/font-cards-2026-11-24/` 2 张；规格已修订 |

## 完成门禁（全部满足才算完成）

- [x] `npm run build` 全绿（tsc 含遗留模块）
- [x] `npm test` 49 项全绿（含 3 个改写用例 + 1 个新 Playfair 用例）
- [x] Playfair woff2 = 21.85KB（≤ 80KB）且 OFL 许可随附（`src/assets/fonts/Playfair-OFL.txt`）
- [x] 规格增量已合并（themes-personalization FR-TH-12/13）
- [x] 本提案目录移入 `changes/archive/2026-11-24-font-cards/`

## 实现备注

- 字体经 Vite 打包带 hash 文件名 → 无法进 sw CORE 稳定清单，走同源 GET 惰性缓存（与得意黑 1.15MB 同链路），首次加载后离线可用；提案 FR-FONT-03 措辞已随设计第 4 条同步。
- `.font-option`/`选择字体 X`/`已读取 N 个字体家族` 等测试锚点全部保留，CDP 平台字体比对用例零改动通过。
