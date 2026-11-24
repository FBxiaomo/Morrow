# 设计 · 2026-11-24-select-menu

## 架构影响

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `src/ui/select-menu.ts`（新增） | `SelectMenu` 组件：触发按钮 + 挂载到 `body` 的 `role="listbox"` 浮层；开合、活动项、键盘、外部点击/滚动收起、`sync()`、`dispose()` | 只依赖 DOM 与既有 `icon()`；不持有 store，写入经构造传入的 `onChange` 回调，保持 `control()` 是唯一 schema→控件出口 |
| `src/ui/customizer.ts` | `control()` 的 `select` 分支改由 `SelectMenu` 渲染，触发按钮承载 `data-setting` 与 `aria-label`；`render()` 前 `dispose()` 旧菜单；`syncControls()` 新增 `.select-trigger` 分支（更新文案、选中态、禁用并收起）；`close()` 时收起所有菜单 | 禁用规则仍只在 `syncControls()` 一处计算，触发按钮为 `<button>`，天然支持 `disabled` |
| `src/liquid-settings.css` | 用 `.select-trigger`（42px、6px 圆角、玻璃底、统一 chevron、`aria-expanded` 态）与 `.select-menu` / `.select-option`（深底浮层、12px 圆角、40px 行高、鼠尾草高亮、勾选标记）替换原 `select` 样式；删除 `.customizer select option` | 调色全部取自面板既有值，不引入系统强调色 |
| `src/customizer.css` | 共享规则中去掉 `select` 选择器，避免死样式 | 文本输入、城市搜索样式不变 |

## 交互契约

- 触发按钮：`aria-haspopup="listbox"`、`aria-expanded`、`aria-controls`、`aria-activedescendant`（展开时）。
- 浮层：`role="listbox"`，选项 `role="option" aria-selected`，选中项带 `.select-check`（复用 `icon('check')`）。
- 键盘：↑/↓ 循环、Home/End、Enter/Space 确认、Esc 关闭不写入、Tab 关闭；`Space`/方向键 `preventDefault` 防页面滚动。
- 定位：`position: fixed`，右缘与触发按钮对齐、宽度取 `max(触发按钮宽, 最长选项文本 + 内边距)`，钳制在视口内；下方空间不足时向上翻转；`max-height: 320px` 内部滚动。
- 收起时机：选择完成、Esc、外部 `pointerdown`、任意滚动（捕获阶段）、窗口 resize、触发禁用、面板重渲染/关闭。

## 预算

- 静态 DOM，无渲染循环与像素预算影响；无异步链路（无竞态守卫需求）。
- 可读性：触发按钮与菜单项 13px ≥ 11px（R9）；菜单项 `min-height:40px` 满足触控目标。
- `prefers-reduced-motion`：仅颜色过渡，无位移/缩放动画。

## 降级链

- 组件不依赖 WebGL/Canvas；无回退分支。
- 选项为空或取值不在白名单时：`sync()` 回退显示第一个选项文案，写入仍受 `validate()` 白名单保护（FR-SS-02 不变）。

## 测试影响

- 新增 `tests/select-menu.spec.ts`（开合、选中写入、键盘、外部点击/滚动、禁用、无原生 select、样式指标）。
- 既有 49 项继续通过；`settings-glass.spec` 的「三键无原生下拉」断言在面板不再渲染任何 `select` 后依然成立。
- 既有 `[data-setting]` 锚点由触发按钮承载，`desktop.spec`/`polish.spec` 的选择器无需改动。
