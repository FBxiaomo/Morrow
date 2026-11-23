# 任务 · morrow-identity-migration（B 阶段）

> 前置：design.md 已获确认。A 阶段（显示层更名）已于 2026-11-22 完成，不占任务位。

| # | 任务 | 映射需求 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T1 | 迁移用例先行：预置全套旧键数据 → 断言升级后存活 + 旧键清空 + 幂等（RED） | FR-MIG-01/02 | ☐ 未开始 | |
| T2 | `settings.ts`：键名替换 + 读旧写新 + `experience.version` 6 钩子 + 清空入口更新 | FR-MIG-01/02/07 | ☐ 未开始 | |
| T3 | `pomodoro.ts`：快照与历史键迁移 | FR-MIG-01/02 | ☐ 未开始 | |
| T4 | `themes.ts`：profile 键迁移 + IndexedDB `morrow-images` 复制与删旧 | FR-MIG-01/02/07 | ☐ 未开始 | |
| T5 | `weather.ts`：位置键迁移，缓存键直接换新不读旧 | FR-MIG-01 | ☐ 未开始 | |
| T6 | `customizer.ts`：导出 `app:'morrow'` + 导入白名单 + 清空数据双套清理；用例（旧/新备份均可导入） | FR-MIG-03/07 | ☐ 未开始 | |
| T7 | `focus.ts` 通知 tag、`sw.js` 缓存名与预缓存、`morrow-mark.svg` 改名与两处引用 | FR-MIG-04/05/06 | ☐ 未开始 | |
| T8 | 全仓库 `horloge` 收口 grep（遗留模块豁免）；更新项目规范 §2/§5.2 与能力规格 FR-SS-13、FR-PWA-02/06 | NFR-MIG-01 | ☐ 未开始 | |

## 完成门禁（全部满足才算完成）

- [ ] `npm run build` 全绿（tsc 含遗留模块）
- [ ] `npm test` 40 项 + 新增迁移用例全绿
- [ ] `npm run preview` 人工验收：旧缓存清理、图标加载、离线重开
- [ ] 版本三处同步（建议 0.2.2）
- [ ] 规格增量合并：`settings-storage` / `offline-pwa` / `themes-personalization` spec.md 的键名与需求修订
- [ ] 本提案目录移入 `changes/archive/<日期>-morrow-identity-migration/`
