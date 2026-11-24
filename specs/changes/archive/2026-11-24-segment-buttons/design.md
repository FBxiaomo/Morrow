# 设计 · 2026-11-24-segment-buttons

## 架构影响

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `src/data/settings.ts` | `SettingSchema` union 新增 `segment` 分支（与 select 同形：options + default）；`validate()` 白名单校验分支覆盖 `select \| segment`；`content.format` / `weather.quality` / `weather.mode` 三键 kind 改为 `segment` | 取值域与默认值不变 → 无数据迁移，不触发存储注册表变更（R4） |
| `src/ui/customizer.ts` | `control()` 新增 segment 分支：渲染 `div.segment[role=group][data-setting=key]`，每选项一个 `button.segment-option[data-value]`，点击即 `store.set`；segment 行容器用 `div` 而非 `label`（label 会把点击转发给首个 labelable 后代，点设置名会误切到第一项）；`syncControls()` 把 disabled 计算上移，segment 容器按 `data-value === 当前值` 切换 `.selected` 与 `aria-pressed`，逐按钮应用 disabled | 主题卡片同款 aria-pressed + .selected 语义；按钮不携带 `data-setting`，容器独占，保住「同键不重复出现」断言 |
| `src/customizer.css` | 新增 `.segment` / `.segment-option` / `.selected` 样式 | 贴合现有控件语言：`#1c2728` 底、`--border` 描边、选中态用 `.primary` 同款 `#c3d4bf`；`flex-wrap:wrap` 兜底窄视口长文案堆叠 |
| `src/ui/panel.ts`（遗留） | 不动 | if/else 链对 segment 自然落空，tsc 通过；遗留模块不开发新功能 |

## 预算

- 无渲染预算影响：设置面板为静态 DOM，不进主绘制循环，`prefers-reduced-motion` 不涉及。
- 控件预算：按钮文字 11px（R9 下限）、`min-height:40px`（R9 触控目标）、行高沿用 `.setting-row` 47px。

## 降级链

- 无 WebGL/异步链路。存量非法值回默认（FR-SEG-03），复用 select 白名单校验。
- 导入旧配置（`app: horloge-finale` v1）含这三键时：逐键按 schema 白名单校验，kind 变化不影响导入兼容。

## 测试影响

- `settings-glass.spec` 新增 segment 用例（三键无下拉、aria-pressed、点击写入与高亮互换、按钮 ≥ 40px）。
- `weather-v5.spec` 天气画质锚点：`selectOption('light')` → 点击「轻量 · 日常常驻」按钮。
- 既有断言必须继续成立：`desktop.spec` 损坏数据回退、`settings-glass.spec` 同键不重复、`polish.spec` 文字 ≥ 11px 与面板几何稳定。
