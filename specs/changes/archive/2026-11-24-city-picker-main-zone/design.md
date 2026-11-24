# 设计 · 2026-11-24-city-picker-main-zone

> 前置：proposal.md 已确认（2026-11-24）。

## 1. 架构影响

| 模块 | 改动 | 理由 |
| --- | --- | --- |
| `src/data/cities.ts` | 新增 `searchCities(query, now)` 与 `CLOCK_ZONE_OPTIONS`（去重时区 + 代表城市名，自 `CITY_ZONES` 派生） | 搜索数据源与主时钟下拉共用一份内置表，避免两处列表漂移 |
| `src/data/settings.ts` | `GLOBAL_SETTINGS` 新增 `content.clockZone`（select：`auto` + `CLOCK_ZONE_OPTIONS`，默认 `auto`） | R3：新设置键必须注册；select 白名单校验天然实现 FR-TD-23 坏值回退 |
| `src/data/lunar.ts` | `lunarInfo(date, zone?)`：农历 formatter 与公历年月日按 `timeZone` 取值；`auto`/缺省保持本机行为 | FR-TD-22 农历/节气整体跟随 |
| `src/ui/dashboard.ts` | `tick()`：非 `auto` 时经缓存的 `Intl.DateTimeFormat` 取时:分与日期；`lastMinute` 键扩为 `` `${zone}:${hh}:${mm}` `` | FR-TD-22 |
| `src/ui/customizer.ts` | `renderContent` 世界时钟组改为「开关 + 搜索框 + 结果列表 + chips + 状态行」；删除文本框即时校验 `validateCities` | FR-TD-17~21，修订 FR-TD-13 |
| `src/customizer.css`、`src/liquid-settings.css` | 新增 `.city-picker` 系列样式（结果项 ≥ 40px、文字 ≥ 13px） | NFR-TD-02；沿用 `.city-search` 视觉语言 |
| `tests/polish.spec.ts` | 重写 `unresolvable cities` 用例（文本框已不存在）；新增搜索/chips/时区用例 | FR-TD-17~23 验收 |

`main.ts` **不改**：`dashboard.refresh()` 已订阅 `store.onChange` 且清空 `lastMinute`，`content.clockZone` 切换自动触发全量重绘。

## 2. 数据与迁移

- **无新 localStorage 键**：`content.clockZone` 是 `desktop.v2.settings`（已登记 §5.2）内的字段，仅按 R3 注册进 `GLOBAL_SETTINGS`；`settings-storage` 规格「37 键」计数 → 38。
- `content.cities` 键名、逗号分隔格式、默认值全部不变：旧数据、主题 profile、导入导出零迁移。
- `content.cities` 的 schema 条目保留 `text` 注册（校验、默认值、导入导出仍走 schema），但设置面板不再为其生成散文本框，改用复合控件——**先例**：`weather.city` 同为注册键，其 UI 是 `renderWeather` 内手写的搜索块，R3 的约束对象是「键必须注册、默认走 schema 控件」，复合交互允许特化。

## 3. 预算与降级

- 非渲染循环变更，无 WebGL/帧预算影响。
- UI tick（200ms）开销：非 `auto` 时至多 2 次 `Intl.DateTimeFormat.formatToParts`（时:分 1 次 + 分钟边界的日期 1 次）；formatter 实例按 zone 用 `Map` 缓存，避免每 tick 构造。分钟内 `textContent` 比较短路，DOM 写入量与现状一致。
- 降级链：select 白名单先挡非法 zone（回 `auto`，FR-TD-23）；若运行时 `Intl` 对某 zone 抛错（白名单已逐一通过 `resolveCity` 同源校验，理论不可达），`tick` 内 catch 回本机字段，时钟不停摆。
- 农历 formatter 的 `timeZone` 选项沿用 `lunarInfo` 现有 try/catch 降级路径（Intl 中文日历不可用时只显示公历）。

## 4. 关键实现决策

1. **'auto' 保持本机快路径**：`tick()` 在 `auto` 时继续用 `now.getHours()` 等本机字段，既有 46 项断言与默认体验零扰动；非 `auto` 才走 Intl 分支。
2. **`lastMinute` 键含 zone**：`` `${zone}:${hh}:${mm}` ``，杜绝「切回同分钟数的时区不重绘日期/农历」的错帧。
3. **搜索纯本地**：中文名 substring + `EN_ALIASES` 小写 substring 双向匹配，前缀命中优先排序，≤ 8 条结果；每条附 `formatCityTime` 当前时间。不联网、不新增探针字段。
4. **chips 与搜索状态行复用既有文案源**：无效 chip 的 title 与 `.world-clocks` 行同用 `resolveCity` 的 reason 文案（FR-TD-12 同源），单点维护。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| `polish.spec` 既有 `unresolvable cities` 用例驱动方式失效（无文本框） | 同任务内重写为 `store.set` 预置 + chips 断言，保持对 FR-TD-12/13 的覆盖 |
| 切换时区后秒进度/月相被误改 | 规格已钉死：秒为全局、月相为天文近似，用例断言不受 zone 影响 |
| 搜索结果项在 liquid 覆盖层下字号/触控不达标 | `liquid-settings.css` 同模式追加覆盖；字号断言用例扫描 `.customizer` 全树自动覆盖新控件 |
| `CLOCK_ZONE_OPTIONS` 静态生成时序 | 由模块常量派生（`settings.ts` 导入 `cities.ts`，无循环依赖），注册时即冻结 |
