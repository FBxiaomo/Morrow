# 变更提案 · uapis-weather-source（天气数据源切换至 uapis.cn）

> 状态：**已验证**（实现与回归于 2026-11-24 完成，归档中）
> 提出日期：2026-11-24 · 提出人：用户指令（2026-11-24 会话）
> 影响能力域：`specs/capabilities/weather/`（主）、`specs/capabilities/atmosphere-rendering/`（仅数据输入不变性）

## 1. 为什么改

用户指定天气实况改用 `GET https://uapis.cn/api/v1/misc/weather`（免密钥公共接口，支持 `adcode` / `city` / 无参 IP 定位三种查询）。该接口是 `specs/capabilities/weather/spec.md`「未决事项」中预留的「网关化/数据源替换」独立变更提案的触发点：本提案即那次预留的落地。

现状三处依赖将被替代或瘦身：

- 实况 + 日出日落：`api.open-meteo.com/v1/forecast`（坐标查询）→ **uapis.cn**（`extended=true&forecast=true` 一次取齐）；
- 地名解析：`api-bdc.io`（BigDataCloud 免密钥端点）→ **移除**，IP 定位由 uapis 无参查询直接返回省市区；
- 城市搜索候选：`geocoding-api.open-meteo.com` → **保留**（用户决策：搜索消歧体验保留，仅不再消费其坐标）。

## 2. 改什么

天气「真实模式」的数据链路整条换到 uapis.cn；位置模型从 `{name, latitude, longitude}` 瘦身为 `{name, adcode?}`（坐标不再被任何天气请求消费）。城市搜索 UI 不变（geocoding 候选列表），选定后以候选 `name` 作为 `city` 参数查询；「使用当前位置」从「浏览器 GPS + 反查地名」改为「无参 IP 定位」。缓存 TTL 30 分钟、刷新时机、revision 竞态守卫、自选天气模式全部不动。

**影响的既有需求**：

| 既有需求 | 处置 |
| --- | --- |
| FR-WX-01 城市搜索候选 | 修订：geocoding 保留，选定后按名称接入（不再用坐标） |
| FR-WX-02 / FR-WX-02a GPS 定位与地名反查 | 废弃 → 由 FR-UW-06 IP 定位取代 |
| FR-WX-05 实况请求 | 修订：数据源与参数全换 |
| FR-WX-08 WMO 码映射 | 修订：改为高德系 `weather_icon` 映射 |
| FR-WX-17 署名 | 修订：uapis.cn / Open-Meteo / IP 定位说明 |
| FR-WX-03/04/06/07/09/10/11/12–16 | 不动（未找到文案沿用 FR-WX-03） |

## 3. 不改什么（边界）

- 自选天气（manual 模式）与氛围渲染管线**不动**：`WeatherInfo` 的 `category / isDay / sunrise / sunset` 语义不变，渲染层零改动即兼容。
- 城市搜索的候选列表交互（geocoding、六条上限、即时输入、竞态守卫）**不动**。
- 不引入 uapis 的 `hourly / minutely / indices / alerts / aqi` 等附加模块——氛围时钟用不上，明确排除。
- 不做「uapis 失败回退 Open-Meteo」的双源机制：降级走既有「显示上次天气」链，避免双源键语义分叉。
- 不动 `content.clockZone` 世界时钟链路（`cities.ts` 与天气无关）。
- 标识迁移 B 阶段（`horloge.*` → `morrow.*`）仍待确认，本提案新键沿用 `horloge.*` 命名空间，不抢跑。

## 4. 需求（EARS，确认后才可设计）

### 数据获取

- **FR-UW-01** 当真实天气需要刷新且位置已选定时，系统应以 `GET https://uapis.cn/api/v1/misc/weather?extended=true&forecast=true` 获取实况：位置含 `adcode` 时附加 `adcode` 参数（优先），否则附加 `city` 参数（位置名），12s 超时，带 revision 竞态守卫（旧响应晚到即丢弃）。
- **FR-UW-02** 当收到 uapis 响应时，系统应映射 `WeatherInfo`：`temp←temperature`、`label←weather` 文本、`category←weather_icon` 七分类、`city←city`（国内附带 `district` 时显示名取 `district`，否则 `city`）、`humidity←humidity`；扩展字段按需可选消费（`feelsLike←feels_like`、`windText←wind_direction + wind_power`）。`wind`（km/h 数字）、`cloudCover`、`precipitation` 字段从 `WeatherInfo` 移除（无渲染消费方，且 uapis 不稳定提供）。
- **FR-UW-03** 当响应含 `forecast[0].sunrise/sunset`（HH:MM）与 `report_time` 时，系统应换算当日日出日落 epoch（时区偏移取 `report_time` 内嵌偏移；国内无偏移格式按 `+08:00`），并以 `report_time` 是否落于其间判定 `isDay`；如果换算失败，则两字段缺省，渲染回退既有小时推断。
- **FR-UW-04** 系统应始终按高德系 `weather_icon` 映射七分类：`100/150-153`→晴；`101/102/103`→多云；`104`→阴；`302/303/304`→雷雨；`300-313` 其余→雨；`400-499`→雪；`500-508`→雾；未知回退多云。

### 搜索与定位

- **FR-UW-05** 当用户在设置页选定搜索候选时，系统应以该候选 `name` 作为 `city` 参数接入 uapis（Open-Meteo geocoding 仅承担候选展示，其坐标不再被消费）。
- **FR-UW-06** 当用户点击「使用当前位置」时，系统应无参调用 uapis（仅点击后发起），成功后以返回的显示名与 `adcode`（如响应提供）持久化位置；含 `adcode` 的位置后续刷新一律按 `adcode` 查询。
- **FR-UW-07** 如果 uapis 返回 404（城市未找到，实测响应体 `{"error":"LOCATION_NOT_FOUND"}`），系统应显示「未找到城市，请重选或使用 IP 定位」，不缓存失败结果。

### 状态与迁移

- **FR-UW-08** 如果刷新失败（网络不可用/超时/5xx），系统应维持 FR-WX-10 既有降级（显示上次天气 + 状态标注），成功后标注「天气已更新」。
- **FR-UW-09** 当启动检测到 `horloge.weather-location.v1`（旧坐标结构）时，系统应迁移为 v2（保留 `name` 尽力接入，坐标丢弃）；旧 `horloge.weather.v4` 缓存应作废清理；迁移幂等，失败不阻塞时钟。
- **FR-UW-10** 设置页署名应更新为「天气数据 uapis.cn · 城市搜索 Open-Meteo · 位置按网络 IP 判定」，移除 BigDataCloud 与浏览器定位说明。
- **FR-UW-11** 当 `weather.intensityAuto`（强度自动调节，新增设置键，默认关）开启且 `weather.mode` 为 `live` 时，系统应以实况推导氛围强度（`weather_icon` 的强度语义为基准，`wind_power` 等级均值作 ±5/级 修正，钳制 10–100、步进 5）驱动全部天气视觉，并禁用手动强度滑杆。
- **FR-UW-12** 当 `weather.mode` 为 `manual` 时，系统应禁用「强度自动调节」开关；当该开关关闭时，强度由手动滑杆决定（现状不变）。
- **NFR-UW-01** 系统应始终对 uapis 响应缺字段免疫：全部可选字段 + `Number.isFinite` 守卫（实测：国内 extended 无 `feels_like/cloud/precipitation`，国际无 `province/adcode`，字段存在性随数据源漂移）。
- **NFR-UW-02** 测试中 `uapis.cn` 与 `open-meteo.com` 两域名一律 mock/abort，绝不真联网（沿用 AGENTS.md §5 红线，对象扩充）。
- **NFR-UW-03** 版本 0.3.0 三处同步：`package.json`、README 标题区、设置面板「关于」（R11）。

## 5. 验收方式

| 需求 | 验证手段 |
| --- | --- |
| FR-UW-01/02/04 | 改写 `desktop.spec` 城市搜索用例：mock uapis，断言 `city` 参数与七分类 `data-weather` 通道 |
| FR-UW-03 | 单元级断言（页面内 evaluate）：构造含偏移/无偏移 `report_time` 的 mock，校验 `isDay/sunrise/sunset` epoch 与回退 |
| FR-UW-05 | 城市搜索消歧用例（London 双候选保留）+ 断言 uapis 收到 `city=London` |
| FR-UW-06 | 新增 IP 定位用例：无参 mock 返回常州 + adcode，断言显示名、`adcode` 后续刷新、reload 持久 |
| FR-UW-07 | 404 mock 用例：状态文案 + 不显示城市 |
| FR-UW-09 | 预置 v1/v4 旧键 → 断言 v2 接入与旧键清理，幂等 |
| FR-UW-08 | 既有「offline refresh keeps old weather」改 uapis abort |
| FR-UW-10 | 断言署名文案与链接 |
| FR-UW-11/12 | 新增用例：特大暴雨 + 8-9 级风推导强度 100、自动开/关粒子数变化、滑杆与开关的禁用态断言 |
| NFR-UW-02 | 全部 spec 的 abort 域名清单扩充检查 |
| 竞态（FR-UW-01 守卫） | 既有竞态用例改写：按 `city` 参数挂起/放行/abort 三路 |

## 6. 决策待办（需要人拍板）

- [x] ~~Open-Meteo 角色~~ → 用户已拍板：**保留搜索候选，数据源全换 uapis**（2026-11-24）。
- [x] ~~「使用当前位置」~~ → 用户已拍板：**改为 IP 定位**（2026-11-24）。
- [x] ~~版本号~~ → 用户已拍板：**0.3.0**（2026-11-24）。
- [x] ~~强度动态调节~~ → 用户中途追加（2026-11-24）：实况推导 + 开关控制，已并入 FR-UW-11/12。
- [ ] **需求区（§4）整体确认**：尤其 FR-UW-02 的字段取舍（`wind/cloudCover/precipitation` 移除、`windText` 文案化风力）与 FR-UW-09 的迁移口径（v4 缓存作废不迁移）。
- [ ] **已知限制接受**：国际同名城市由 uapis 端消歧（选「加拿大·伦敦」实际接入英国伦敦的天气）；国际城市 `wind_power` 有级数、国内可能是「4-5」区间格式，UI 统一显示为文本。
