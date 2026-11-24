# 设计 · 2026-11-24-font-cards

> 前置：proposal.md 已确认（方案 A + 仅新增 Playfair）。

## 1. 架构影响

| 模块 | 改动 | 理由 |
| --- | --- | --- |
| `src/ui/font-picker.ts` | 重写：内置风格卡片网格（数据驱动自 `GLOBAL_SETTINGS` 的 `appearance.font` options + `FONT_STACKS`）+ 本机字体分区（读取/搜索/点选流程与文案保留） | FR-FONT-01/04/05 的承载；R3 精神——选项仍以 schema 为单一事实源 |
| `src/ui/customizer.ts` | `renderAppearance`：`字体与字形` 组不再生成 `appearance.font` 的 select 行；删除 `control()` 中该键的清空特判（死代码） | 卡片网格接管选择；清空 `fontCustom` 逻辑随卡片点击事件进 FontPicker |
| `src/data/settings.ts` | `appearance.font` 新增 `playfair` 选项；`FONT_STACKS.playfair` 以 '"Playfair Display", …旧衬线链' 前置 | 不改默认值，无迁移 |
| `src/desktop.css` | 新增 Playfair `@font-face`（相对路径、`font-display: swap`） | 与得意黑同款声明方式，适配 `base:'./'` 的 Pages 子路径 |
| `src/assets/fonts/` | 新增 `playfair-display-latin.woff2`（21.8KB）与 `Playfair-OFL.txt` | OFL 1.1 要求随附许可 |
| `public/sw.js` | CORE 增加字体 URL，`CACHE` 升 `horloge-shell-v2` | 离线首开可用；缓存版本升级使既有安装刷新清单 |
| `src/liquid-settings.css` | `.font-grid/.font-card` 新样式；`.font-option` 改卡片式；删除 `.font-manual/.font-picker-actions` 等死样式 | FR-FONT-05 |
| `tests/font-picker.spec.ts` | 用例 1/2/4 改为卡片交互；新增 Playfair 用例 | 见 tasks |

## 2. 数据与迁移

无存储键变更：`appearance.font` 值域新增 `playfair`（旧值语义不变），`appearance.fontCustom` 不动。不需要迁移。

## 3. 预算与降级

- 字体资产：Playfair latin 子集 woff2 **21.8KB**（预算 ≤ 80KB，达成）；进 sw CORE，离线可用。
- 字体加载降级链：`@font-face` 未就绪 → `FONT_STACKS.playfair` 后续系统衬线（Didot/Bodoni/Georgia/宋体）→ 视觉近似，`font-display: swap` 保证无白屏（与得意黑同链路）。
- 无渲染循环改动；卡片预览为纯 DOM 文本，不涉预算（R7 不适用）。

## 4. 关键实现决策

1. **选项数据仍以 schema 为源**：卡片网格遍历 `GLOBAL_SETTINGS` 中 `appearance.font` 的 options 与 `FONT_STACKS` 生成，不在 FontPicker 里手写字体清单（R3 精神）；后续加字体 = 加 option + 栈 + 文件三处。
2. **内置与本机同一网格视觉语言、不同分区**：内置 `.font-card`、本机沿用 `.font-option` 类名（测试锚点：`选择字体 X` aria-label、CDP 平台字体比对 `.font-option strong` 均保留），样式统一为 2 列卡片。
3. **点击内置卡片即清空本机覆盖**：沿用既有语义（原 select 特判），清除按钮删除（R10 同精神：不留冗余控件）。
4. **Playfair 打包方式与得意黑一致**：`src/assets/fonts/` + `desktop.css` 相对路径 `@font-face`，Vite 打进 `dist/assets/` 并带 hash；sw CORE 用构建后稳定 URL——注意：Vite 会给字体加 hash 文件名，sw 无法预知 → 字体经 CSS `url()` 引用，sw 对同源 GET 惰性缓存（fetch handler 现有行为）即可覆盖字体请求；**CORE 只登记 URL 稳定的 public 资源，字体依赖惰性缓存 + `caches.match` 兜底**。PWA 首开在线加载一次后离线可用，与现状图片资源一致。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| 惰性缓存下离线首开缺 Playfair（回退系统衬线，不破功能） | 与主题图片现状一致；CORE 预装需无 hash 稳定 URL，代价是绕过 Vite 资产管线——不做 |
| 卡片预览触发 9 个字体栈首次排版，设置页打开变慢 | 全部为文本排版，无网络请求（仅 Playfair 22KB 懒加载）；实测用例断言打开后立即可点 |
| 本机字体数百个时卡片网格过长 | 保留搜索 + 50 条分页（既有行为） |
| 测试锚点漂移（select 消失） | 用例 1/2/4 同步改写，CDP 平台字体验证保留 `.font-option strong` 锚点 |
