# 变更提案 · 2026-11-24-font-lineup

> 状态：**已归档**（增量已合并进 `specs/capabilities/themes-personalization/spec.md`，FR-TH-12 修订）
> 提出日期：2026-11-24 · 提出人：用户（会话）
> 影响能力域：`specs/capabilities/themes-personalization/`（FR-TH-12 修订）

## 1. 为什么改

用户实测反馈两处缺陷（Windows 环境）：

1. 「衬线」与「优雅衬线」渲染完全一致——衬线栈里混入了打包的 Playfair Display，Windows 无 Didot/Bodoni，两选项同为 Playfair。
2. 「系统/轻盈/无衬线」几乎无差异——三者栈都依赖 macOS 字体（Avenir Next/Helvetica Neue），Windows 全部回退为微软雅黑/Segoe UI。

根因：内置风格多为「碰运气」的系统字体栈拼盘，跨平台不一致。修法为每个风格打包一个气质强烈、跨平台一致的 OFL 开源 webfont（数字子集仅 12–21KB）；另按用户要求新增「点阵」与中文装饰风格。汉仪为商业字库不可随项目分发，以站酷快乐体（OFL）替代其可爱手绘气质。

## 2. 改什么

**替换/修正**（值域不变，仅换栈首字体与字重）：

| 风格 | 旧（Windows 实际） | 新打包字体 |
| --- | --- | --- |
| 轻盈 · Light | ≈雅黑 | Josefin Sans 300（骨感几何细线，11.9KB） |
| 无衬线 | ≈雅黑 | Barlow Condensed 500（瘦高海报体，20.9KB） |
| 圆润 | ≈雅黑 | Quicksand 500（几何圆体，15.4KB） |
| 粗体 · Display | Arial Black | Bebas Neue 400（海报窄体，13.4KB） |
| 衬线 | =Playfair（重复） | 移除栈中打包 Playfair → 回 Georgia/宋体链 |

**新增**：
- 「点阵 · 像素」：缝合像素字体 Fusion Pixel 12px 比例版 zh-Hans 完整 woff2（OFL-1.1，678.5KB），全中文覆盖——日期、农历、城市名全部像素化。
- 「快乐体 · 站酷」：ZCOOL KuaiLe（OFL，TTF 1.44MB，按需加载）。

字体均经 Vite 打包、`font-display: swap` 回退、sw 惰性缓存（与得意黑同链路）；许可文件随附 `src/assets/fonts/`。字重联动：轻盈 200→300、粗体 800→400（对齐打包字体的真实字重面）。

**影响的既有需求**：FR-TH-12 修订（9 组 → 11 组内置字体，栈内容变更）；其余不动（卡片网格 UI、fontCustom、本机字体流程均不变，卡片自动读 schema 生成）。

## 3. 不改什么（边界）

- 不打包汉仪（商业授权）与霞鹜文楷、马善政（用户未选）。
- 不改卡片网格 UI、本机字体流程、主题默认字体（sky 等默认仍为 'serif'，Georgia 链）。
- 等宽（Consolas 可辨识）与系统（本义跟随系统）不动。

## 4. 需求（EARS）

- **FR-LINEUP-01** 系统应为「轻盈/无衬线/圆润/粗体」四风格各打包指定 webfont 并置于栈首：任一平台选择该风格时，时钟数字应以打包字体渲染（有测试断言）。
- **FR-LINEUP-02** 当用户选择「衬线」时，系统应使用系统衬线链（Georgia/宋体等）且**不得**渲染为 Playfair（与「优雅衬线」可区分，有测试断言）。
- **FR-LINEUP-03** 系统应新增「点阵 · 像素」（缝合像素 12px zh-Hans 全量）与「快乐体 · 站酷」（ZCOOL KuaiLe）两个选项，卡片预览即真实字形；中文文本（日期/农历/城市名）应同字体渲染（有 `document.fonts.load` 中文样本断言）。
- **FR-LINEUP-04** 当选择内置打包字体时，系统应使用该字体的真实字重面（轻盈 300、无衬线 500、圆润 500、海报/点阵/快乐体 400），不做伪粗合成（有 font-weight 断言）。
- **FR-LINEUP-05** 系统应随附全部新增字体的 OFL 许可文件（有文件存在断言）。

## 5. 验收方式

| 需求 | 验证手段 |
| --- | --- |
| FR-LINEUP-01/02/03/04 | 新增 `font-picker.spec` 用例：逐卡点击断言 `--clock-font` 家族与字重、`document.fonts.load` 成功、衬线不含 Playfair |
| FR-LINEUP-05 | 提案任务勾选证据（文件清单） |
| 回归 | 全量 `npm test`（卡片网格、主题默认、dock 断言不受影响） |

## 6. 决策待办（需要人拍板的问题）

- [x] 中文字体：站酷快乐体（会话确认；马善政楷书未选）。
- [x] 点阵覆盖：全中文 678KB（会话确认）。
- [x] 汉仪不可分发（商业授权）→ 以免费 OFL 字体替代（会话知情）。
