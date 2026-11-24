# 任务 · uapis-key-fallback

> 前置：proposal.md 已确认（用户指令 2026-11-24）。

| # | 任务 | 映射需求 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T1 | `weather.apiKey` 设置键（R3 schema 注册）+ `WeatherService` 构造注入 Key provider + uapis 请求 Bearer 头 | FR-UW-13 | ✅ 完成 | tsc 全绿；keyed 搜索用例断言 `Bearer uapi-testkey` 头 |
| T2 | keyless 回退 Open-Meteo：`fetchOpenMeteo`/`mapWmo` 恢复、`Location` 扩坐标、候选坐标必填过滤、`setCity` 免 Key 时先 geocode | FR-UW-14/15 | ✅ 完成 | keyless 默认用例：Open-Meteo 坐标查询、uapis 零请求、reload 持久 |
| T3 | 定位双路径：keyed uapis IP / keyless GPS + BigDataCloud 反查（`reverseGeocode` 恢复） | FR-UW-06, FR-WX-02/02a | ✅ 完成 | 两组定位用例均绿 |
| T4 | v1→v2 迁移保留坐标 | FR-UW-16 | ✅ 完成 | 迁移用例断言 v2 含名称与坐标、幂等 |
| T5 | customizer：Key 输入组（schema 生成）、locate 分支、署名双源；AGENTS.md R12 精确化；README 0.3.0 段更新；注册表 39 键 | FR-WX-17, NFR-UW-04/05 | ✅ 完成 | 署名三链接断言；全仓密钥扫描零命中 |
| T6 | `npm run build` + `npm test` 全绿；归档合并进能力规格 | 全部 | ✅ 完成 | build 全绿；全量 70 过（唯一失败为并行会话 select-menu 在建用例，与本变更无关）；能力规格已合并至 0.3.0 |

## 完成门禁（全部满足才算完成）

- [x] `npm run build` 全绿（tsc 含遗留模块）
- [x] `npm test`：本变更涉及用例全绿（keyed 9 例 + keyless 3 例 + 署名）
- [x] 无任何真实密钥进入仓库（rg `uapi-` 扫描仅测试假 Key `uapi-testkey`）
- [x] 规格增量已合并进 `specs/capabilities/weather/spec.md`
- [x] 本提案目录移入 `changes/archive/2026-11-24-uapis-key-fallback/`
