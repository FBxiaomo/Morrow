# 任务 · 2026-11-24-segment-buttons

| # | 任务 | 需求 | 状态 |
| --- | --- | --- | --- |
| T1 | `settings.ts`：schema union 新增 `segment`；`validate()` 白名单覆盖；三键 kind 改 `segment` | FR-SEG-03 | ☑ tsc 通过 |
| T2 | `customizer.ts`：`control()` segment 渲染（div 行容器 + 按钮组）；`syncControls()` segment 分支 | FR-SEG-01 | ☑ |
| T3 | `customizer.css`：`.segment` 样式（11px 文字、40px 触控目标、选中态、wrap 兜底） | NFR-SEG-01 | ☑ |
| T4 | `settings-glass.spec` 新增用例：三键无下拉、aria-pressed 断言、点击「12 小时」→ store=12 且高亮互换 | FR-SEG-01/02/04 | ☑ 用例三处漏 await 已修复，待终验跑绿 |
| T5 | `weather-v5.spec` 天气画质 `selectOption` → 按钮点击改写 | FR-SEG-04 | ☑ 单独重跑通过 |
| T6 | `npm run build` + 全量 `npm test` + 验收截图 | 全部 | ☑ 机器安静后全量 64 项全绿（含本提案用例与另一会话 select-menu/city-picker 增量），截图 `artifacts/settings-glass-segment.png` |
