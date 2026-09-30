# 550W 片头：实施方案（已批准，已实现）

[← 回到 README](../README.md) · 机型模型见 [VARIANTS.md](VARIANTS.md)

> 状态：**P2 已实现**（commit `feat(550w): …`）。评审在本方案上补了四条加压与三个决策，
> 以下各节已按最终口径更新；改写过的三处标了 "★"。

550C 的原稿是"一台假终端在讲一个流程"：单平面、等宽文本、线性日志。550W 走另一条路——
**三层纵深 + 镜头运动 + 全屏冲击**，讲的是"算力过剩的机器在做并行推演和全球点火"。
本文只描述要做什么、怎么验收；**尚未写任何实现**。

## 1. 时间线表（完整档，目标 18.0s）

| # | 阶段 | 起止 | 时长 | 屏幕上发生什么 | DOM / CSS 原语 | 可跳过 |
|---|---|---|---|---|---|---|
| 0 | `w0-wake` 唤醒 | 0.0–1.4 | 1.4s | 近黑场；一条 1px 冷白地平线从中心弹出并拉满屏宽，右下角浮出机器刻印 | `.w0-field`（`radial-gradient` 星尘）、`.w0-horizon`（`scaleX` + `opacity` 关键帧）、`.w0-mark` | ✔ |
| 1 | `w1-grid` 全息网格展开 | 1.4–4.4 | 3.0s | 网格以透视展开成地板+天花板，**两层以不同速度漂移（视差）**；48 个发动机站点依次点亮 | `.w1-grid` ×3 层（`repeating-linear-gradient` + `mask-image`）、阶段边界写入 `--w-p0/--w-p1` 两个位移动画参数 | ✔ |
| 2 | `w2-parallel` 并行推演 | 4.4–7.0 | 2.6s | 12 条候选弹道**同时**画出；8 条被一道冷白细闪剪掉，剩下 4 条汇入轨道；每条带一个等宽读数 | `.w2-branches`（SVG `<path>` ×12，`stroke-dasharray/offset`）、`.w2-readout`（等宽，写入次数有限） | ✔ |
| 3 | `w3-network` 行星发动机网络 | 7.0–10.6 | 3.6s | 镜头拉远：球体缩小，站点连成环网；**闭合瞬间整屏青白 bloom**（冲击 #2） | `.w3-globe`（SVG：圆 + 经纬椭圆 + 站点圆点）、`.w3-links`（path 逐个点亮）、`.w3-bloom`（全屏 `radial-gradient` 缩放） | ✔ |
| 4 | `w4-alloc` 算力分配 | 10.6–13.4 | 2.8s | 12 条横向仪表并行填满、读数飞快跳动；网格继续漂移（"静"拍，为结尾蓄力） | `.w4-gauge` ×12（CSS 宽度变量 + 数字）、`.w4-tel` | ✔ |
| 5 | `w5-ignition` 点火倒计时 | 13.4–16.0 | 2.6s | 全场压暗到近黑（冲击 #3），中央一个亮点 + 收紧的环箍，巨型等宽 `03.000 → 00.000` | `.w5-dim`（全屏黑，`opacity`）、`.w5-ring`（SVG 圆箍 `stroke-dashoffset`）、`.w5-count` | ✔ |
| 6 | `w6-pulse` 脉冲 + 机读标识 | 16.0–18.0 | 2.0s | 全屏青白脉冲冲刷（冲击 #4，饱和度打满一帧）→ 回落黑场 → `550W` 字标定格 0.9s + 一行机读标识 → 淡出 | `.w6-pulse`（全屏 `radial-gradient` + `scale/opacity`）、`.w6-id`（SVG 字标 + 等宽行），最终握持交给现有的 `finish()` | ✔ |

★ 简易档 **3.0s**（评审定的，不是原方案的 4.2s）：`s0-wake` 0.0–0.8 地平线弹出 → `s1-ring`
0.8–2.2 球体展开 + 站点逐个点亮 + 环箍收紧 → `s2-id` 2.2–3.0 `550W` 字标写出，随后交给统一的 `finish()` 淡出。

★ 倒计时刷新率：**20 Hz（50 ms 一跳，53 次写入）**，不是按帧写。理由 —— 毫秒读数在它自己的分辨率之上
本来就不诚实，而这个尺寸下 20 Hz 已经读作连续滚动；按帧写是 156 次、没人读得过来。CSS 计数器 /
`@property` 能做到零写入，但零填充的 `03.000` 恰好是它表达不了的格式。实测次数见验收报告
（`npm run measure:perf` 打印 `countdown textContent writes`）。

★ 跳过提示：550W 是**第一台真正用上 `#hint` 的机器**（550C 的样式里一直有 `#hint` / `#hint.show`，
但它的 markup 被抽取时丢掉了那个元素，所以 550C 依旧不显示）。550W 在阶段 3 之后（进入 `w4-alloc` 时）
`classList.add('show')`，跳过或结束时立刻移除。

每个阶段把名字写进 stage 的 `data-phase`（`w0-wake`…`w6-pulse`），这样截图/探针能直接断言"第几拍"，
而不是靠数秒猜。

## 2. 与 550C 的对照（为什么"更震撼"，逐条对着可验收量）

| 硬指标 | 550C 现状 | 550W 方案 | 怎么验 |
|---|---|---|---|
| ≥6 个可辨识阶段 | 5 个（开机 → HUD → 链路 → 覆写 → SYSTEM IS REWRITTEN） | **7 个**（上表 0–6） | 探针读 `data-phase`，9 张截图各对应一拍 |
| ≥2 次全屏冲击 | 1 次（结尾字标横幅） | **4 次**：网格展开、网络闭合 bloom、点火压黑、结尾脉冲 | 9 张截图里的 4 张（1.4s / 10.6s / 13.4s / 16.2s 附近）能直接看出来 |
| 结尾机型标识定格 | `SYSTEM IS REWRITTEN` | `550W` + 机读标识行，定格 ~0.9s | 最后两张截图 |
| ≥3 层纵深 + 有视差 | 1 层（HUD 窗口平面） | 3 层：场（网格/星尘，慢）/ 球体+HUD（中）/ 前景（弹道、仪表、脉冲，快）。视差比值 **0.35 : 1 : 2.2**（CSS 变量 35/100/220 px） | 同一时刻读三层的 `transform.m42`，比值须落在 ±10% 内，并在**两个不同阶段**各测一次 |
| 12–24s | 11.5s | **18.0s** | `data-phase` 时间线探针 + 截图 |
| 点击 / Esc 立刻跳过 | ✔ | ✔（同一套 `createShow()` 骨架：`sleep()`/`later()`） | 现有 P1 验收 + 每阶段抽一次跳过 |
| reduced-motion 只播简易档 | ✔ | ✔（轴正交，`readMode()` 不动） | `verify-p2-reduced-motion.mjs` |
| 无 long task / 平均帧 < 20ms | 0 / 16.7ms | 预算同上：只动 `transform`/`opacity`/`stroke-*`，不进 rAF 死循环、不读布局 | `measure-perf.mjs`（贴数据） |
| 退场干净、无泄漏 | ✔ | ✔（不用 `setInterval`；确需周期动画一律走 CSS 关键帧） | `npm run audit:leak` + 监听器残留打印 |

另外两条"为什么更震撼"的设计理由（不可量化，但影响观感）：
- **镜头会动**：550C 是固定机位把窗口一张张推上来；550W 在阶段 3 拉远、阶段 5 压黑、阶段 6 饱和，
  构图在整屏尺度上变化，而不是在窗口尺度上变化。
- **节奏不均**：550C 由打字速度决定，接近匀速；550W 的节拍是 1.4 → 3.0 → 2.6 → 3.6 → 2.8 → 2.6 → 2.0，
  两个最大的冲击压在最后 5 秒。

## 3. token / CSS 结构 / 新文件

**文件清单**（全部新增在机型目录内，除标"改"的两处）：

```
src/variants/550w/assets.js    新：CSS_550W + BOOT_MARKUP_550W + APP_MARKUP_550W（手写，矢量+CSS）
src/variants/550w/show.js      新：createShow550W(stage, {mode, cancelled})（只走 sleep/later）
src/variants/550w/enhance.js   新：enhanceShow550W —— 等宽栈 + 数字/时间自洽 + 机读页脚（可先做空实现）
src/variants/550w/index.js     改：占位条目换成真条目（id/label 不变，watchdogMs.full → 45000）
tools/render-splash.mjs        改：加 --scheme，截图探针加 data-phase / 三层 transform
```

**token 集**（550W 自己的那套，命名与 550C 不冲突）：

```
--w-bg       近黑底（默认 #04070a，也是宿主半边首帧表里的值）
--w-field    背景场（星尘/网格底色）
--w-grid     网格线（冷白，低透明度）
--w-ice      主冷白（文字、字标、球体轮廓）
--w-cyan     青（能量、链接点亮、脉冲）
--w-dim      次级文字
--w-ink      高对比文字（读数、倒计时）
--w-warn     仅告警拍使用（尽量少用）
```

**配色维度**：`:host([data-scheme="green"|"cyan"|"white"])` 三个覆盖块把上面这些 token 映射到对应色系；
`amber` 依旧什么都不覆盖 = 该机型自己的默认（550W 的默认就是冷白/青）。机型没定义的 token 不会被改，
所以覆盖不会给机器变出一块它没有的面板——这条关系写在 [VARIANTS.md](VARIANTS.md) 里。

**结构原语**（三层，全部在 shadow root 内）：

```
.w-stage[data-phase]        固定定位、perspective:900px
  .w-layer[data-depth="0"]  背景场：星尘 + 3 层网格（最慢）
  .w-layer[data-depth="1"]  中景：球体/网络/仪表（1×）
  .w-layer[data-depth="2"]  前景：弹道、脉冲、字标（最快）
  .w-bloom/.w5-dim/.w6-pulse  三个全屏"冲击层"（各自独立，便于单独验收）
```

时间线只做三件事：`sleep()` 到拍点 → 改 `data-phase` 与少量 CSS 变量 → 让 CSS 关键帧演完。
**没有 `setInterval`**；确需循环的光效一律用 CSS `animation`，由 `cancel()` 撤掉宿主即可。

## 4. 验收用例清单（P2 实现后逐条跑，报告里贴真实输出）

1. 构建门槛：`extract && build && node --check ×2`、`git diff --exit-code -- lib/client.js`、`npm run check`。
2. 结构 + 阶段：`npm run render:splash -- --variant 550w --mode full --shots 0,2000,4000,6000,8000,10000,12000,14000,16000`
   九张 PNG 落 `.render/`，每张附探针（`data-phase`、三层 `transform`、球体节点数、仪表数、剩余 overlay 数），
   报告里列出"文件名 → 阶段"。
3. 深度与视差：同一时刻三层的位移比 ≠ 1（用 3 的探针数据断言），且 `data-depth` 0/1/2 都存在。
4. 冲击时刻：在 1.4s / 10.6s / 13.4s / 16.2s 附近各截一张，人工判断"整屏突变"（我会把四张单独列出来）。
5. 跳过：在 3s / 9s / 15s 各派发一次真 `Esc` 与一次真点击 → 遮罩 <2s 内消失；`npm run audit:leak` PASS（0 残留）。
6. 退场：片头播完 → `.dsh550c-host` 0 个、`document.activeElement` 不在遮罩上、无监听器残留。
7. 性能：`measure-perf.mjs --mode full`（550W）→ long task 0、平均帧 < 20ms，贴数据。
8. reduced-motion：`npm run verify:reduced-motion -- --variant 550w` 三项 PASS（550W 下只播简易档）。
9. 配色正交：`render:splash --scheme` 同一时刻拍 4 张（amber/green/cyan/white）× 550W，证明四套覆盖都作用在同一套 token 上。
10. 设置面：机型行三个按钮可选；**切机型不自动播放**（点按钮后 overlay 仍为 0），点「预览」才播当前机型+档位+配色。
11. 首帧：`npm run verify:variant-bg` —— `550W` 的首帧底色与宿主半边表一致（底色若调整则两表同改）。
12. 550C 回归：`render:splash --variant 550c` 的结构探针与 P1 基线一致（popups/nodeGrid/stage）。

## 5. 评审结论（已按此实现）

1. **配色行文案**：改成机型无关的一句 —— "琥珀是各机型自己的默认配色；另外三套是全局覆盖"，
   按钮标签与两个键都没动。
2. **时长**：完整档 **18.0s** 照原方案，不砍到 15s。
3. **简易档**：**3.0s**（不是 4.2s，也不是 2.5s）。
4. **watchdog**：`550w` 的 `watchdogMs.full` **保持 30000**（18.0s + 0.6s 淡出，留 10s 余量），
   不改成"阶段推进超时"。
