# 架构事实 · Morrow

> 长期稳定的技术事实：模块图、数据流、存储、渲染管线、测试探针。
> 模块增删在此登记；行为细节在 `specs/capabilities/`。基线 0.2.1。

## 1. 技术栈

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 语言 | TypeScript（strict, ES2022, 纯 ESM） | 全仓库含遗留模块必须过 tsc |
| 构建 | Vite 8（rolldown 底座），chunkSizeWarningLimit 900 | `build` = `tsc && vite build` |
| 渲染 | 原生 Canvas2D 为主循环 + 可选 WebGL（窗玻璃/体积云） | Three.js 仅遗留模块引用，主链路不依赖 |
| 测试 | Playwright（Edge 通道，40 项） | 驱动方式 `window.desktop` 探针 |
| 存储 | localStorage + IndexedDB，全部本机 | 注册表见下 §4 |
| 天气 | Open-Meteo 直连（geocoding + forecast）；定位地名解析 BigDataCloud（免密钥） | 商用前网关化，见产品文档 P0 |

## 2. 模块图（现役，行数为 0.2.1 基线参考）

```
src/
  main.ts(192)      装配根：8 CSS 副作用导入 → SettingsStore(+迁移钩子) →
                    ThemeManager / WeatherService / Landscape → UI 组件回调接线 →
                    appearance() 映射 → store.onChange 分发 → 三定时器
                    (200ms tick / 30min 天气 / 60s 重绘失效) → Shell → PWA 注册
  data/
    settings.ts(179)   SettingsStore + GLOBAL_SETTINGS(37键) + FONT_STACKS(8栈)
    themes.ts(94)      TEMES 四主题常量 + ThemeManager(每主题 profile) + 背景图存取
    weather.ts(217)    WeatherService：geocoding 搜索 / 反向地名解析 / forecast / 缓存 TTL / revision
    pomodoro.ts(187)   PomodoroService：时间戳驱动状态机 + 历史(≤100条)
    cities.ts(80)      城市三级解析 + 世界时钟格式化
    lunar.ts(102)      农历/节气/月相
    audio.ts(122)      麦克风频段包络（实验功能，本机处理）
    snow.ts / scenery.ts   雪色 / 场景板映射
  ui/
    dashboard.ts(169)  主桌面 DOM + tick(200ms) + 主题切换动画 + 溢出缩字
    customizer.ts(452) 设置面板：五分页 / schema 控件 / 城市搜索 / 图片上传
                       / 导入导出 / 清空 / 存储失败态 / toast
    focus.ts(198)      专注弹窗三态：setup → running → review
    shell.ts(70)       快捷键守卫 + 3600ms 闲置
    font-picker.ts(92) 本机字体（DEV /__local-fonts 中间件，PROD queryLocalFonts）
    icons.ts(28)       19 个内联 SVG
  atmosphere/
    landscape.ts(582)      唯一主绘制循环：天气插值、昼夜相位、背景合成、
                           帧率预算、DPR、画布调度、diagnostics
    photographic.ts(324)   摄影板调色 + studio 室内光/墙面投影
    real-weather.ts(302)   写实粒子 + 数字打湿互动 + Canvas 玻璃回退
    glyph-surface.ts(87)   字形像素碰撞面（DOM Range 逐字测量 → alpha 蒙版）
    window-glass.ts(199)   WebGL 玻璃雨（零库 GLSL，失败回退 Canvas）
    volumetric.ts(215)     体积云 raymarch（写实、云量>0.25、非 studio）
public/
  sw.js               PWA：核心缓存 + 导航 network-first + 同源 cache-first
  manifest.webmanifest  standalone 应用清单
```

## 3. 关键数据流

```
用户操作 → Customizer 控件 → store.set(key, value)
  → schema 校验（失败回默认） → localStorage 写入（失败 → persistent=false
    → onPersistenceChange → 「仅本次有效」状态条）
  → onChange 监听分发：
      appearance.* / theme → main.appearance() → CSS 变量 + body.dataset
      focus.*              → 重读时长
      general.wake         → WakeLock 更新
      audio.enabled        → 麦克风开关（audioRevision 竞态守卫）
      theme                → ThemeManager.switch：保存旧 profile → apply 新 profile

Landscape（rAF 循环）每帧：
  weather.state 插值(≈1.4s) → 昼夜相位 → 背景合成（scene/gradient/solid/image
  → photographic 板）→ 效果画布（写实粒子 or 窗玻璃合成）→ diagnostics

PomodoroService（200ms tick 驱动 normalize）：
  elapsed = (pausedAt ?? now) - startedAt   ← 永不累积，休眠不丢精度
  超阶段 → advance(work→short/long, cycle%4) → 'phase' 事件 → FocusDialog toast+通知
  长时间离开 → 'return' 事件 → 暂停等待确认，不虚构补算
```

## 4. 存储与外部边界

- 存储注册表：见 `docs/项目规范.md` §5.2（8 个键位 + 迁移状态）。
- 网络：天气数据仅 Open-Meteo 两个域名（geocoding 10s 超时 / forecast 12s 超时），30 分钟 TTL + `online`/`visibilitychange` 触发，无重试轰炸；定位后的地名解析走 BigDataCloud 免密钥客户端端点（10s 超时，仅点击「使用当前位置」后触发，失败回退「当前位置」占位）。
- 测试探针：`window.desktop = { store, themes, weather, landscape, dashboard, customizer, focusDialog, pomodoro, audio }`。
- 状态通道：`body.dataset`（theme/position/motion/weather/phase/customizer/customFont/weatherQuality/windowGlass/cloudRenderer）+ 唯一自定义事件 `clock-layoutchange`。

## 5. 渲染管线与回退链

```
背景：scene(摄影板，day/dusk/night/dark 调色) / gradient / solid / image(IndexedDB)
效果层（写实档）：
  studio    → 粒子与其他主题同源（写实雨雪 + 数字打湿）；室内光 + 墙面投影作为氛围叠加（亮度蒙版 luma 192–226）
  window    → 窗玻璃（WebGL 优先；失败/丢上下文 → Canvas 水珠回退 → 简单水滴）
  其他主题  → 写实粒子雨/雪 + 数字打湿（glyph-surface 像素碰撞）+ 体积云(条件)
轻量档：全部退化为轻量绘制，DPR=1，帧预算 66ms
```

- 画面层级（window 主题，测试断言）：背景 → `.weather-fx` 效果 → `.window-glass`(z4) → `.window-frame`(body 子元素) → `.desktop` 时钟；玻璃内数字保持干燥（wetClock 对 window 无效）。

## 6. 遗留边界

`src/core | scenes | layers | styles | audio/audio.ts | ui/panel.ts | ui/editorial.ts | atmosphere/index.ts | style.css` 为 v3 残留：可编译、不可达、禁止扩展（`docs/项目规范.md` §11）。Three.js 依赖只存在于遗留模块。

## 7. 已知架构债

| 债 | 影响 | 处置 |
| --- | --- | --- |
| ThemeManager.apply 逐键 store.set | 主题切换时多次持久化与刷新 | 变更提案候选（事务式 applyProfile） |
| 遗留模块未归档 | 编译负担、误引用风险 | 独立提案 |
| `appearance.exposure` 无消费方 | schema 与行为漂移 | 清理提案（删键需迁移旧值） |
| 测试仅 Edge+dev server | 生产与跨浏览器盲区 | 审查 P1，扩矩阵是独立提案 |
