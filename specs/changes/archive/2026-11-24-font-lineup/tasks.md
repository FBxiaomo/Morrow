# 任务 · 2026-11-24-font-lineup

> 前置：proposal.md 已确认（会话拍板）。每任务先测试后实现（RED→GREEN）。

| # | 任务 | 映射需求 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T1 | 新增 `font-lineup.spec`：四组替换栈断言、衬线去 Playfair、点阵/快乐体中文覆盖（先 RED） | FR-LINEUP-01/02/03 | ☑ 完成 | RED：Josefin 断言收到旧 Avenir 栈、点阵卡片不存在；实现后 2/2 转绿 |
| T2 | 下载并入库字体资产（Josefin 11.9KB / Barlow 20.9KB / Quicksand 15.4KB / Bebas 13.4KB / 缝合像素 zh-Hans 678.5KB / 站酷快乐体 TTF 1.44MB）+ 六份 OFL 许可 | FR-LINEUP-05 | ☑ 完成 | `src/assets/fonts/` 文件清单（含 FusionPixel-OFL.txt / ZCOOLKuaiLe-OFL.txt 等） |
| T3 | `settings.ts` 栈替换与新增 `pixel`/`kuaile` 选项；`main.ts` 字重对齐（light 300、display 400）；`desktop.css` 六条 @font-face | FR-LINEUP-01/03/04 | ☑ 完成 | `npm run build` 全绿；font-lineup 2/2、font-picker 6/6 转绿 |
| T4 | 全量回归 | NFR（回归） | ☑ 完成 | 字体相关 20 项全绿；其余失败均属并行会话在途提案（select-menu / city-picker），非本变更引入（详见完成门禁备注） |
| T5 | 规格增量合并（FR-TH-12 修订：11 组、字重、许可）+ 提案归档 | 全部 | ☑ 完成 | themes-personalization spec 已更新 |

## 完成门禁（全部满足才算完成）

- [x] `npm run build` 全绿（tsc 含遗留模块）
- [x] 字体相关规格全绿（font-lineup 2 + font-picker 6 + 涉面板 polish 断言）
- [x] 新增资产总体积 ≈ 2.2MB（六字体 + 六许可），全部 OFL 随附
- [x] 规格增量已合并（FR-TH-12）
- [x] 本提案目录移入 `changes/archive/<日期>-<slug>/`

## 环境备注（并行开发冲突记录）

- 本次验证期间另一会话在同一工作树并行推进 `select-menu` / `segment-buttons` / `city-picker` 三个提案：测试端口（5192）与 `test-results/` 目录多次被占用/争抢，全量套件先后出现 3 个与其在途 DOM 改版相关的失败（`背景`/`秒的显示` 双 aria-label、`.segment`/`.city-chip` 元素未就绪），均不属于本变更；其中 segment 用例的 `await` 笔误已由该会话自行修复。
- 本变更自身的验收以独立跑的字体规格（font-lineup / font-picker / polish 面板断言）为准，均绿；且在本变更落地后的首次全量（52 项）中，除上述并行冲突项外全部通过。
