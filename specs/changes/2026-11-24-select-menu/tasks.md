# 任务 · 2026-11-24-select-menu

| # | 任务 | 需求 | 状态 |
| --- | --- | --- | --- |
| T1 | 新增 `src/ui/select-menu.ts`：触发按钮 + listbox 浮层、开合/定位/键盘/收起/sync/dispose | FR-SELMENU-01/03/04 | ☑ |
| T2 | `customizer.ts`：`control()` select 分支接入组件；`syncControls()` 与重渲染/关闭时同步与回收 | FR-SELMENU-02/05 | ☑ |
| T3 | 样式：`.select-trigger`、`.select-menu`、`.select-option`；移除原生 select 死样式 | NFR-SELMENU-01 | ☑ |
| T4 | 新增 `tests/select-menu.spec.ts`：开合、写入、键盘、外部点击/滚动、禁用、无原生 select、尺寸与字号 | FR-SELMENU-01…06 | ☑ |
| T5 | `npm run build` + 全量 `npm test` + 验收截图入 `artifacts/select-menu-2026-11-24/` | 全部 | ☑ |

## 验证记录（2026-11-24）

- `npm run build`：通过（tsc strict + vite build）。
- `npm test`：**64 项全绿**（既有 49 + 新增 7 + 工作区既有提案新增 8）。
- 既有用例同步修订：`desktop.spec` 背景上传断言由 `toHaveValue('image')` 改为触发按钮文案断言（控件形态由原生 select 变为按钮）。
- 浮层无障碍名取 `${label}选项`，避免与触发按钮的 `aria-label` 同名导致 `getByLabel` 命中两个元素。
- 验收截图：`desktop-menu.png`（1440×900）、`mobile-menu.png`（390×844）。
