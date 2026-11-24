# 变更提案 · uapis-key-fallback（自填 API Key + 无 Key 回退 Open-Meteo）

> 状态：**已确认**（用户指令 2026-11-24：自填 Key；无 Key 回退原始免 Key 接口）
> 提出日期：2026-11-24 · 影响能力域：`specs/capabilities/weather/`（主）
> 前置提案：`archive/2026-11-24-uapis-weather-source/`（其 FR-UW-01 免密钥直连假设被浏览器实测推翻）

## 1. 为什么改

uapis-weather-source 落地后的真浏览器验证（探针，2026-11-24）：

- **带 `Authorization: Bearer <key>` 跨域浏览器调用 → 200 可用**（应用源 127.0.0.1:5192，Edge 实测，preflight ACAO/Authorization 均放行）；
- **无 Key 跨域浏览器调用 → 被 ESA 防爬层拦截**（`TypeError: Failed to fetch`；与 FAQ Q22「跨域必须携带 Key」一致）。curl 无 Origin/无浏览器指纹可通，但浏览器世界不可用。

结论：浏览器直连 uapis 必须带 Key；而 Key 必须由用户自备（项目红线禁止发布者密钥进客户端）。为让免配置用户（公共 GitHub Pages 访客）保有实时天气，无 Key 时回退到应用原始的免 Key 数据源 Open-Meteo。

## 2. 改什么

- 新增设置项 `weather.apiKey`（kind: text，R3 注册）：用户自备的 uapis.cn Key（`uapi-` 开头），存本机 localStorage，不进仓库与打包产物。
- `WeatherService` 双源：Key 非空 → uapis（Bearer 头，adcode 优先，IP 定位）；Key 为空 → Open-Meteo 坐标直连（0.2.1 原始行为：geocoding 候选坐标、WMO 码映射、GPS + BigDataCloud 地名反查定位）。
- `Location` 扩为 `{name, adcode?, latitude?, longitude?}`：搜索候选恢复坐标必填；v1→v2 迁移恢复保留坐标。

**影响的既有需求**：FR-UW-01（修订：双源）、FR-UW-06（修订：定位双路径）、FR-WX-02/02a（解除废弃：作为无 Key 回退路径恢复）、FR-WX-17（修订：署名双源）。

## 3. 不改什么（边界）

- 不把任何发布者密钥写进仓库 / 打包产物 / GitHub Actions；用户 Key 只存本机 `desktop.v2.settings`。
- 不引入网关 / 服务端（那是商用化独立提案）。
- 自选天气模式、强度自动调节、缓存与竞态机制不动（强度推导在 Open-Meteo 档为分类基准，无图标强度语义）。
- uapis 的 hourly/minutely/indices/alerts 仍不引入。

## 4. 需求（EARS）

- **FR-UW-13** 当 `weather.apiKey` 非空时，系统应对全部 uapis 请求附加 `Authorization: Bearer <Key>` 头，并按 FR-UW-02/03/04 映射实况（含 IP 定位 FR-UW-06）。
- **FR-UW-14** 当 `weather.apiKey` 为空时，系统应回退 Open-Meteo 直连：城市搜索候选须含有限坐标并按坐标查询；WMO 码按七分类映射；「使用当前位置」走浏览器定位 + BigDataCloud 反查（0.2.1 原始行为）；uapis 域名零请求。
- **FR-UW-15** 城市搜索候选在两种模式下都应可接入：keyed 按候选名查 uapis 并回写 adcode；keyless 按候选坐标查 Open-Meteo。
- **FR-UW-16** 当 v1 位置迁移到 v2 时，系统应保留有限坐标（供回退模式使用），不兼容坐标的既有 v2 位置在回退刷新失败时应提示「该位置缺少坐标，请重新搜索城市」。
- **NFR-UW-04** 系统应始终不把任何密钥硬编码进仓库；测试用假 Key 断言头行为，绝不真联网。
- **NFR-UW-05** 配置导出备份应包含 `weather.apiKey`（用户自备凭据随备份走），导入校验沿用 schema 白名单。

## 5. 验收方式

| 需求 | 验证手段 |
| --- | --- |
| FR-UW-13 | 改写 keyed 用例：mock 断言 `Authorization: Bearer <假Key>` 头与 city 参数 |
| FR-UW-14 | 新增 keyless 默认用例：断言请求只发 api.open-meteo（uapis 计数为 0）、WMO 映射、reload 持久；恢复 GPS+BDC 定位用例 |
| FR-UW-15 | 搜索消歧用例双模式各一条 |
| FR-UW-16 | 迁移用例改 keyless：断言 v2 含坐标、旧键清理、幂等 |
| NFR-UW-04 | 提交前全仓密钥扫描（rg `uapi-` 字面量） |

## 6. 决策待办（需要人拍板）

- [x] ~~方向~~ → 用户已拍板：**自填 Key；无 Key 回退原始免 Key 接口**（2026-11-24，附个人 Key 验证可用）。
