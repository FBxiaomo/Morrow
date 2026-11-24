# 设计 · 2026-11-23-settings-right-dock

> 前置：proposal.md 已确认（两项决策待办均按提案倾向拍板）。

## 1. 架构影响

| 模块 | 改动 | 理由 |
| --- | --- | --- |
| `src/ui/customizer.ts` | 修改：`showModal()` → `show()`；打开时 `dialog.focus()`；删除「点击面板外关闭」监听 | 非模态是「主页面可交互」的最小实现路径；原生 dialog 语义、`close` 事件清理链全部保留 |
| `src/customizer.css` | 修改：`.customizer` 定位改为 `top/right/bottom:0 + left:auto` 右停靠（UA 样式会给非模态 dialog 保留 `left:0`，须显式覆盖），宽 `min(420px,100vw)`、`z-index:60`（非模态无 top layer 兜底）；删除 `::backdrop` | FR-DOCK-01/03 的几何承载 |
| `src/liquid-settings.css` | 修改：高度改 100dvh、圆角改左侧单侧、入场动画改右滑；`@media(max-width:700px)` 改全屏工作表；删除 `::backdrop` | 玻璃质感层与基础层同步 |
| `tests/settings-glass.spec.ts` | 新增用例 | FR-DOCK-01/02/03/04 验收 |
| `specs/capabilities/themes-personalization/spec.md` | 归档时合并 FR-DOCK 增量 | R1 |

## 2. 数据与迁移

无新增持久化键、无键变更。设置面板形态由视口宽度（CSS 媒体查询）决定，不落存储。

## 3. 预算与降级

纯 DOM/CSS 变更，无渲染循环参与。唯一动画为面板入场（一次性 320ms transform+opacity），`prefers-reduced-motion` 由 `responsive.css` 全局短路继续覆盖（NFR-DOCK-02）。`document.hidden` 停画与帧预算（R7）不受影响。

## 4. 关键实现决策

1. **保留 `<dialog>` 元素、只换 `show()`**：`.customizer` 选择器、`close` 事件清理（`customizing` 类移除、焦点还原）、关闭按钮与 Esc 链路（FR-SH-04）全部零改动；相比换成 `<aside>` 重写焦点管理，风险最小。
2. **Esc 关闭完全依赖既有 Shell 链路**：`show()` 不触发原生 `cancel`，但 `Shell.onKey` 的 `onEscape` → `customizer.close()` 链路已存在（`main.ts:168`），非模态下成为唯一 Esc 路径，行为与 FR-SH-04 断言一致。
3. **删除「点击面板外关闭」监听**：非模态下点击落在页面上、不进 dialog 事件流，该监听成为死代码；FR-DOCK-02 明确要求点击面板外不关闭。按「不保留死代码」纪律直接删除（R10 同精神）。
4. **焦点：打开时 `dialog.focus()`（`tabindex=-1`），关闭还原 `previousFocus`**：既有 `previousFocus` 捕获/还原逻辑保留；非模态不设焦点陷阱，Tab 可离开面板——这是「主页面可交互」（FR-DOCK-02）的有意取舍，写入能力规格约束。
5. **窄屏用 CSS 媒体查询切全屏工作表，不做 JS 分叉**：统一非模态代码路径（R2/R5 精神：少一条运行时分支），390px 视口下 `min(420px,100vw)` 天然铺满，媒体查询只调圆角与内边距。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| 非模态下面板不再拦截全局快捷键，用户在面板输入框内按 `S`/`1` 等可能误触 | Shell 已有 `typing` 判定（INPUT/SELECT/TEXTAREA/contentEditable 内不响应字母快捷键，`shell.ts:32`）；面板控件全部是标准表单元素，无新增暴露面。新增用例显式断言「面板持有焦点时按 `2` 生效」（即非输入态快捷键可用，符合诉求） |
| 时钟位置「靠右」时被边栏覆盖 | 已拍板接受（提案 §6）；规格未决事项登记，未来如需避让走独立提案 |
| `settings-float-in` 动画沿用旧关键帧在右停靠形态下视觉不自然 | 关键帧改为右滑入场（translateX），动画时长与缓动不变 |
| 全高度面板内容超长滚动 | `.customizer-content` 既有 `overflow-y:auto + overscroll-behavior:contain` 不变 |
