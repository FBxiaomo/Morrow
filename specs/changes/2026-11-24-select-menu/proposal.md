# 变更提案 · 2026-11-24-select-menu

> 状态：**已验证**（2026-11-24；build + 64 项回归全绿，待归档合并进能力规格）
> 提出日期：2026-11-24 · 提出人：用户（会话）
> 影响能力域：`specs/capabilities/settings-storage/`（FR-SS-08 控件体系修订）；`specs/capabilities/interaction-shell/`（仅键盘路径，不变）

## 1. 为什么改

设置面板中多选项设置（`appearance.position`、`appearance.motion`、`background.type`、`content.secondsStyle`、`weather.manual`、`weather.daytime`）由 `control()` 渲染为原生 `<select>`。展开后的浮层由浏览器/操作系统绘制：

- 选中项与悬停项使用系统强调色（当前为浅蓝 `#a8c7fa` 一系），与面板的墨绿玻璃语言完全脱节；
- 浮层圆角、边框、字号不受 CSS 控制，无法与 `segment` 按钮、面板按钮保持一致；
- 键盘路径由浏览器实现，无法统一为面板的按键语义。

用户截图指出：下拉**菜单**的观感与本产品不一致（原生蓝色高亮）。原生 `<select>` 的弹层样式在工程上不可定制，只能替换为自绘下拉菜单。

## 2. 改什么

`control()` 的 `kind: 'select'` 分支改渲染自绘下拉菜单组件（`src/ui/select-menu.ts`）：触发按钮沿用该行按钮的形制（42px 高、6px 圆角、玻璃底、统一 chevron），展开的 listbox 为面板同族浮层（深底、12px 圆角、行高 40px、选中/悬停用面板的鼠尾草高亮，选中项带勾选标记）。交互语义按 APG「按钮 + listbox」：点击开合、↑↓/Home/End 移动、Enter/Space 选择、Esc 关闭并归还焦点、点击外部关闭、滚动自动收起；同一时刻只允许一个菜单展开。

**影响的既有需求**：
- FR-SS-08：修订（控件体系新增自绘下拉菜单渲染契约，`data-setting` 锚点改由触发按钮承载）；
- FR-SS-01：不动（schema 的 `select` kind 与选项定义不变）；
- FR-SS-09：不动（禁用/隐藏规则仍由 `syncControls()` 单一实现，禁用态改为触发按钮 `disabled`）；
- FR-SEG-01…04：不动（二选项键已是 segment，本次不触碰）。

## 3. 不改什么（边界）

- 设置键、取值、默认值、校验白名单、持久化格式一律不动（无数据迁移，不触发存储注册表变更，R4）。
- 选项文案不动；schema 的 `kind: 'select'`/`segment` 划分不动。
- 字体选择（font-picker 卡片网格）、主题卡片、滑块、开关、颜色、文本控件不动。
- 面板几何（宽度、标签页、页脚、滚动容器）不动；弹出层挂载在 `body`，不参与面板布局。

## 4. 需求（EARS）

- **FR-SELMENU-01** 当用户点击 select 控件的触发按钮时，系统应在按钮下方（空间不足时上方）展开自绘 listbox，且同一时刻最多一个菜单处于展开状态。
- **FR-SELMENU-02** 当用户点击任一选项时，系统应立即写入该设置、即时持久化，触发按钮文案与主界面同步刷新，菜单关闭并把焦点归还触发按钮。
- **FR-SELMENU-03** 当菜单展开时，系统应支持 ↑/↓ 循环移动活动项、Home/End 跳转、Enter/Space 确认、Esc 关闭且不改变取值、Tab 关闭；活动项通过 `aria-activedescendant` 暴露。
- **FR-SELMENU-04** 如果菜单展开期间用户点击菜单与触发按钮之外、滚动页面或调整窗口，则系统应关闭菜单且不写入设置。
- **FR-SELMENU-05** 当 select 控件被 `syncControls()` 判定为禁用时，触发按钮应 `disabled` 且不可展开菜单；禁用规则本身不变。
- **FR-SELMENU-06** 系统应以自绘菜单替代设置面板中的全部原生 `<select>`，面板内不再渲染任何 `select` 元素。
- **NFR-SELMENU-01** 菜单与触发按钮在形状语言上应与面板按钮同族：触发按钮 42px 高、6px 圆角；菜单项 `min-height:40px`、文字 13px（≥ 11px，R9）；选中/悬停高亮使用面板调色，不使用系统强调色。
- **NFR-SELMENU-02** 菜单挂载于 `body`、`z-index` 高于设置面板，作为静态 DOM 不进入主绘制循环，无渲染预算变化。

## 5. 验收方式

| 需求 | 验证手段 |
| --- | --- |
| FR-SELMENU-01/02 | 新增 `tests/select-menu.spec.ts`：点击触发按钮 → listbox 可见、`aria-expanded=true`；点击选项 → `store.get(key)` 更新、按钮文案更新、菜单关闭 |
| FR-SELMENU-03 | 同文件键盘用例：↑/↓ 活动项移动、Enter 写入、Esc 关闭且取值不变 |
| FR-SELMENU-04 | 同文件：点击面板空白处、派发滚动后菜单关闭且取值不变 |
| FR-SELMENU-05 | 同文件：`weather.mode=live` 时 `weather.manual` 触发按钮禁用、点击不展开 |
| FR-SELMENU-06 | `polish` 字号下限用例继续通过；新增断言面板内 `select` 元素数为 0 |
| NFR-SELMENU-01 | 同文件样式断言：触发按钮高度与圆角、菜单项 `min-height` 与字号；验收截图入 `artifacts/` |
| 回归 | `npm run build` + 全量 `npm test`（49 项既有 + 新增） |

## 6. 决策待办（需要人拍板的问题）

- [ ] 菜单浮层的对齐方式：当前按「右缘与触发按钮对齐、宽度不小于触发按钮」实现；如需左对齐或等宽，请在验证后提出。
