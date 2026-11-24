# 变更提案 · 2026-11-24-segment-buttons

> 状态：**已归档**（增量已合并进 `specs/capabilities/settings-storage/spec.md`：FR-SS-01/02 修订、FR-SS-17 新增；全量 64 项验证全绿，2026-11-24）
> 提出日期：2026-11-24 · 提出人：用户（会话）
> 影响能力域：`specs/capabilities/settings-storage/`（FR-SS-01/02 修订、FR-SS-17 新增）；范围 B 另涉 `specs/capabilities/weather/`（仅验收锚点变更，行为不变）

## 1. 为什么改

设置面板的选项型控件一律由 `control()` 渲染为 `<select>` 下拉（`src/ui/customizer.ts`）。其中部分设置只有两个选项：

- `content.format` 制式：24 小时 / 12 小时
- `weather.quality` 天气画质：轻量 · 日常常驻 / 写实 · 细节与互动
- `weather.mode` 天气来源：真实天气 / 自选天气

两选项下拉需要「点开 → 移动 → 再选」，而二选一语义天然适合并排按钮一键切换（与主题卡片、开关控件的操作粒度一致）。用户提出：时间制式这类两选项设置不应使用下拉菜单，直接用按钮切换。

## 2. 改什么

给设置 schema 新增控件型 **segment（分段按钮）**：kind 为 `segment` 的设置渲染为并排按钮组，当前生效项高亮（`aria-pressed`），点击即写入并持久保存。取值域、默认值、持久化键与校验行为与 `select` 完全一致，存量用户数据无需迁移。

**范围建议（待拍板）**：仅改 `content.format`，或把全部两选项设置（上述 3 键）一并改为 segment，确立「两选项 = 按钮、多选项 = 下拉」的一致规则。

**影响的既有需求**：
- FR-SS-01：修订（kind 清单增加 `segment`）；
- FR-SS-08：修订（控件体系补 segment 渲染契约）；
- FR-WX-12/16、FR-TD-01/02：不动（取值与行为不变，仅控件形态变化；`T` 快捷键切换制式不受影响）。

## 3. 不改什么（边界）

- 存储键名、取值（`'24'/'12'`、`'light'/'realistic'`、`'live'/'manual'`）、默认值、校验白名单一律不动；无数据迁移，不触发存储注册表变更（R4）。
- 选项文案不动（「轻量 · 日常常驻」等保持原文）。
- 多选项（≥3）设置仍为下拉：时间位置、动态效果、背景、秒的显示、自选天气、天空时段、字体。
- `syncControls()` 依赖禁用规则不动；本批 3 键当前均不在禁用清单内，但 segment 必须与既有控件共享同一禁用机制。
- 不新增设置键（R3 仅 kind 变更，无新键注册）。

## 4. 需求（EARS）

- **FR-SEG-01** 当设置键 kind 为 `segment` 时，系统应以并排分段按钮呈现其全部选项，当前生效项高亮且 `aria-pressed="true"`、其余为 `false`；同键不得再渲染下拉框（DOM 断言）。
- **FR-SEG-02** 当用户点击任一分段按钮时，系统应立即写入该设置并即时持久保存，面板高亮与主界面同步刷新（store 断言 + 按钮状态断言）。
- **FR-SEG-03** 如果 localStorage 中 segment 键的存量值合法，系统应不加迁移地继续生效；如果值非法，系统应回退默认值（沿用 options 白名单校验，不抛错）。
- **FR-SEG-04**（范围 B）系统应将 `weather.quality` 与 `weather.mode` 一并改为 segment；`weather-v5.spec` 的 `selectOption` 锚点同步改写为按钮点击。
- **NFR-SEG-01** 系统应保证分段按钮文字 ≥ 11px、触控目标 ≥ 40px（R9），且设置面板打开不改变主画面几何（既有 settings-glass 断言继续成立）。

## 5. 验收方式

| 需求 | 验证手段 |
| --- | --- |
| FR-SEG-01/02 | 新增 settings-glass 用例：显示页制式两按钮无下拉、`aria-pressed` 断言、点击「12 小时」→ `store.get('content.format') === '12'` 且高亮互换 |
| FR-SEG-03 | 既有 desktop.spec 损坏设置回退用例（校验逻辑复用 select 白名单） |
| FR-SEG-04 | 改写 `weather-v5.spec` 天气画质 `selectOption` 为按钮点击；全量回归 |
| NFR-SEG-01 | 既有 settings-glass / polish 几何与字号断言 + 验收截图入 `artifacts/` |

## 6. 决策待办（需要人拍板的问题）

- [x] **范围**：A 仅时间制式 / B 全部两选项设置（制式 + 天气画质 + 天气来源）。倾向 B：避免「同为二选一、一处按钮一处下拉」的不一致；后果是天气页两处控件形态一并变化，`weather-v5.spec` 一个既有锚点需改写。→ **已拍板 B**（会话确认，2026-11-24）。
