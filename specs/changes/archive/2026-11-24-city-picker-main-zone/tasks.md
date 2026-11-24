# 任务 · 2026-11-24-city-picker-main-zone

> 前置：design.md 已确认。每任务先测试后实现（RED→GREEN）；完成后勾选并注明证据。

| # | 任务 | 映射需求 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T1 | `cities.ts`：`searchCities`（中文+英文别名双向匹配、前缀优先、≤8 条、附当前时间）与 `CLOCK_ZONE_OPTIONS`（CITY_ZONES 去重 + 代表城市名） | FR-TD-17/20、FR-TD-22 | ✅ 完成 | tsc 全绿；`polish.spec` 搜索/兜底/时区用例 |
| T2 | `settings.ts`：注册 `content.clockZone`（select，`auto` + `CLOCK_ZONE_OPTIONS`，默认 `auto`） | FR-TD-22/23 | ✅ 完成 | `polish.spec` 坏值回退 `auto` 用例（localStorage 预置 `Mars/Olympus`） |
| T3 | 先写 RED 用例：搜索「巴黎」出结果、点击添加、chip 移除、满 5 禁用、IANA 兜底、无效 chip | FR-TD-17~21 | ✅ 完成 | RED 阶段 6 用例全失败（实现不存在）；GREEN 后 `polish.spec` 6 用例全绿 |
| T4 | `customizer.ts` 世界时钟组改造（搜索+结果+chips+状态行）+ `customizer.css` / `liquid-settings.css` 样式 | FR-TD-17~21、NFR-TD-02 | ✅ 完成 | `polish.spec` 40px/11px 断言；截图 `artifacts/city-picker-2026-11-24/` |
| T5 | 先写 RED 用例：`setFixedTime` + `content.clockZone='Asia/Tokyo'` 主时钟/日期/农历按东京；切回 `auto` 恢复；坏值回退 | FR-TD-22/23 | ✅ 完成 | RED 阶段失败确认；GREEN 后端到端用例过（上海 23:30 = 东京 00:30 次日，农历按东京当日） |
| T6 | `lunar.ts` 支持 zone；`dashboard.ts` tick 按时区渲染 + formatter 缓存 + `lastMinute` 含 zone | FR-TD-22/23 | ✅ 完成 | 同上；`npm run build` 全绿 |
| T7 | 重写 `polish.spec` 既有 `unresolvable cities` 用例（对齐 FR-TD-13 修订后的交互） | FR-TD-13/12/21 | ✅ 完成 | 用例改为 chips 驱动，保留时钟页无效行断言 |
| T8 | `npm run build` + `npm test` 全量回归；截图入 `artifacts/`；合并规格增量；提案归档 | 全部 | ✅ 完成 | 构建绿；回归 61 过 3 败（3 败均归因并行 select-menu 提案半成品，失败元素 `content.secondsStyle`/`background.type` 与本变更无交集）；规格增量已并入 `time-display/spec.md`、`settings-storage/spec.md`（FR-SS-01 38 键）、`docs/项目规范.md` §5.1 |

## 完成门禁（全部满足才算完成）

- [x] `npm run build` 全绿（tsc 含遗留模块）
- [x] `npm test` 全量回归：本变更全部用例绿；3 个失败用例属并行 select-menu 提案（`select-menu.spec:86`、`desktop.spec:176`、`settings-glass.spec:68`，aria-label 重复冲突），待其提案自行收口
- [x] 规格增量已合并进 `specs/capabilities/time-display/spec.md`（FR-TD-06/07/13 修订，FR-TD-17~23、NFR-TD-02 新增）
- [x] `settings-storage/spec.md` FR-SS-01 与 `docs/项目规范.md` §5.1 键数同步（37→38，含 `content.clockZone`）
- [x] 版本三处同步不涉及（非发布，版本保持 0.2.1）
- [x] 本提案目录移入 `changes/archive/2026-11-24-city-picker-main-zone/`
