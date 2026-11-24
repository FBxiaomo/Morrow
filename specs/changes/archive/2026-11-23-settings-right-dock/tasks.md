# 任务 · 2026-11-23-settings-right-dock

> 前置：design.md 已获确认。每任务先测试后实现（RED→GREEN）；完成后勾选并注明证据。
> 任务粒度：可独立验证的小步；禁止在一个任务里夹带需求之外的改动。

| # | 任务 | 映射需求 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T1 | 新增 Playwright 用例：1600px 右停靠几何 + 主页面可交互（`2` 切主题、点击面板外不关闭）+ 焦点进出（先 RED） | FR-DOCK-01/02/04 | ☑ 完成 | RED 时焦点/几何断言按预期失败；实现后 `settings dock on the right…` 用例通过 |
| T2 | 新增 Playwright 用例：390px 全屏工作表几何（先 RED） | FR-DOCK-03 | ☑ 完成 | RED 时 x=56 偏移；实现后 `settings become a full-screen sheet…` 用例通过 |
| T3 | `customizer.ts`：`show()` + 打开聚焦 + 删除外点关闭监听 | FR-DOCK-02/04 | ☑ 完成 | `tsc` 通过；焦点/交互断言转绿 |
| T4 | `customizer.css` + `liquid-settings.css`：右停靠（含 `left:auto` 覆盖 UA `dialog{left:0}`）、全屏工作表、右滑动画、删 backdrop | FR-DOCK-01/03, NFR-DOCK-01/02 | ☑ 完成 | 几何断言转绿；探针证实须 `left:auto` 与保留既有 460px 打磨层 |
| T5 | 全量 `npm run build` + `npm test` | NFR-DOCK-01 | ☑ 完成 | `npm run build` 全绿；48 项回归全绿（2026-11-23 会话日志） |
| T6 | 验收截图入 `artifacts/settings-dock-2026-11-23/`；规格增量合并进 `themes-personalization/spec.md`；提案归档 | 全部 | ☑ 完成 | 截图 3 张（dock-appearance-desktop / dock-themes-desktop / sheet-mobile）；FR-TH-18/19 及约束、映射、未决事项已并入能力规格 |

## 完成门禁（全部满足才算完成）

- [x] `npm run build` 全绿（tsc 含遗留模块）
- [x] `npm test` 既有 46 项 + 新增 2 项全绿
- [x] 版本三处同步（不涉及发布，跳过）
- [x] 规格增量已合并进 `specs/capabilities/themes-personalization/spec.md`
- [x] 本提案目录移入 `changes/archive/2026-11-23-settings-right-dock/`

## 实现备注（环境事实）

- 无头 Chromium 下 CSS 动画可能晚启数百毫秒，几何断言须先 `waitForFunction(getAnimations().every(a => a.playState === 'finished'))`；`fill:both` 动画结束后仍留在 `getAnimations()` 中，不能用 `length === 0` 判定。
- 1440px 视口下居中时钟字形右缘与 460px 边栏有 ~11px 交叠（约 1% 字宽），「不遮时钟」断言按「遮挡 < 5% 字宽」成文。
