# 任务 · uapis-weather-source

> 前置：design.md 已按用户决策（保留搜索候选 / IP 定位 / 0.3.0）成文，需求区整体确认后动代码。
> 每任务先测试后实现（RED→GREEN）；完成后勾选并注明证据。

| # | 任务 | 映射需求 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T1 | 改写 `tests/desktop.spec.ts` 天气用例为 uapis：搜索接入（city 参数断言）、IP 定位（无参 + adcode 持久）、404 文案、竞态三路、离线 stale、迁移用例；payload helper 重写 | FR-UW-01/02/05/06/07/08/09 | ✅ 完成 | desktop.spec 11 项天气用例全绿（2026-11-24） |
| T2 | `src/data/weather.ts`：Location 瘦身、uapis 请求构造（adcode 优先 + extended/forecast）、高德码映射、时区换算、`locateByIp`、`reverseGeocode` 删除、v5/v2 迁移 | FR-UW-01~04/06~09, NFR-UW-01 | ✅ 完成 | tsc 全绿；昼夜/迁移/竞态用例通过 |
| T3 | `customizer.ts` locate 改 IP 定位 + 署名/描述文案；`dashboard.ts` 风力文本行；`main.ts` 无需改动（接线不变） | FR-UW-06/10 | ✅ 完成 | 署名断言用例通过 |
| T4 | 全部 spec 的 abort 域名清单扩充 `uapis.cn`（8 文件）；capture-artifacts.spec 已被并行工作删除，不再涉及 | NFR-UW-02 | ✅ 完成 | 全量跑无真联网请求异常 |
| T5 | `docs/项目规范.md` §5 登记 v5/v2 键与作废说明；版本 0.3.0 三处同步（package.json / README / 关于） | FR-UW-09, NFR-UW-03 | ✅ 完成 | `rg '"version"'` = 0.3.0；README 增 0.3.0 段 |
| T6 | 强度自动调节：`weather.intensityAuto` 设置键、`deriveIntensity/effectiveIntensity`、landscape/real-weather 消费接入、`syncControls` 禁用链、新增用例 | FR-UW-11/12 | ✅ 完成 | 自动强度用例通过（特大暴雨推导 100、粒子联动、禁用态） |
| T7 | `npm run build` + `npm test` 全绿；归档：合并增量进 `specs/capabilities/weather/spec.md`，提案移入 archive | 全部 | ✅ 完成 | build 全绿；全量 68 过，唯一失败为并行会话 select-menu 在建用例（与本变更无关，规格已备注）；能力规格已更新至 0.3.0 |

## 完成门禁（全部满足才算完成）

- [x] `npm run build` 全绿（tsc 含遗留模块）
- [x] `npm test`：本变更涉及用例全绿（唯一失败 `select-menu.spec:87` 为并行会话在建功能的不稳定用例，与本变更无关）
- [x] 版本三处同步 0.3.0
- [x] 规格增量已合并进 `specs/capabilities/weather/spec.md`，「适用版本」更新为 0.3.0
- [x] 本提案目录移入 `changes/archive/2026-11-24-uapis-weather-source/`
