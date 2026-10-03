# 构建与验证

[← 回到 README](../README.md)

## 开发

```sh
npm run build              # extract + build（只重写 lib/client.js）
node --check lib/client.js
node --check lib/index.js  # 宿主半边是手写的，同样要过一遍
```

构建是**幂等**的：`npm run build` 后再 `git diff --exit-code -- lib/client.js` 必须是空的，
CI 就在盯这件事。

## 首帧 / 标题栏（不需要起 GUI）

`.verify/build-harness.mjs` + `.verify/run-harness.mjs` 把**真实的 index.html**（从 app.asar 里取出
的 web-frontend dist）用 **DSH 自己的行渲染器**（`.verify/dsh-render-rows.mjs`，逐字复制自
`@deepseek-ai/dsh-host-webserver`）套上**插件自己产出的行**，再用无头 Edge 跑：

```sh
node .verify/build-harness.mjs                      # 收集行 + 渲染 harness 页
node .verify/serve.mjs 3499                         # 静态服务器（后台）
node .verify/run-harness.mjs 3499                   # 跑六组探针 + 四张截图（含 darwin 拖拽守卫）
```

| 断言 | 结果 |
|---|---|
| 首帧早于任何插件代码（`coverApplied`） | true（控件页同页面为 false） |
| 首帧退役与遮罩挂载同一任务（`coverAfterModule`） | false（类已移除）、握手全局已消费 |
| 桌面平台下挂载配色（`data-platform=win32`） | `data-caption=windows`，`<head>` 有了换色样式表 |
| 配色随档位/方案 | 简易 `#050403`、完整 `#141008`，符号色 `#e8a020` |
| 预留规则存在、浏览器里塌成 0 | true / `padding-right: 0px` |
| 关闭档 | 不作画、不挂载、不定义握手全局 |
| macOS 拖拽守卫（`data-platform=darwin`） | 宿主带 `data-dsh-boot-splash`；computed `-webkit-app-region`：有守卫 `none`、抽掉守卫 `no-drag`（对照）、插回 `none`；官方 `[data-window-drag]` 行仍为 `drag`；点击后遮罩正常卸载 |

截图在 `.verify/shots/`：同样的页面，**有行**时是纯黑首帧，**抽掉行**时 HARNESS 卡片就在那儿。

## 泄漏回归（本地工具，不进 CI）

移植进来的片头会在覆写阶段开好几个窗口，每个窗口的时钟是一条 1s 的 `setInterval`。跳过（Esc / 点击）
是把整个 shadow root 拆掉，而不是逐个关窗，所以这些 interval 曾经会活到页面结束，顺带把弹窗 DOM 一起
钉在内存里。`tools/leak-audit.mjs` 就是这条回归的守卫：

```sh
npm run audit:leak                          # 默认 lib/client.js、完整档、8s 跳过
node tools/leak-audit.mjs --client lib/client.js --mode full --skip 8000 --settle 3500
```

它用桩 `window.__ModuleLoader__` + `require('react')` 桩在本地 HTML 里加载**真实的 `lib/client.js`**，
在 bundle 跑起来**之前**包住 `setInterval`/`clearInterval`（Map 记 id → 调用点栈）和
`EventTarget.prototype.addEventListener`，8s 时派发一次真的 `Escape`，再等 3.5s 断言**存活 interval = 0**，
并打印残留调用点。零依赖：Node ≥22 自带 `fetch` / `WebSocket`，Chrome 路径复用
[`scripts/browsers.mjs`](../scripts/browsers.mjs)（Windows + macOS）。退出码 0 通过、1 失败（含
"遮罩根本没挂上/没被跳过"这种没意义的运行）。残留 listener 只打印不判定：被拆下来的弹窗本来就还留着自己的
关闭按钮监听。

**故意不挂进 `npm run check`**：它需要一个浏览器，而上游 CI 只跑 `extract` + `build` + `node --check`，
把浏览器依赖塞进 `check` 等于让 CI 必挂。改移植代码（尤其 `scripts/extract.mjs` 的 rewrite 列表）时手动跑一次。

## 无头截图（本地工具，不进 CI）

改动画时间线、移植 CSS、配色或档位时，用它按毫秒看结果，不用起 DSH、不用重启：

```sh
npm run render:splash                                             # 3000/7000/11000/15000ms 四张
node tools/render-splash.mjs --shots 1500,7000 --mode full        # 指定时刻与档位
node tools/render-splash.mjs --escape 3000 --shots 3600           # 跳过后的那一帧
node tools/render-splash.mjs --client /tmp/other/lib/client.js    # 和别的构建对比
```

`tools/render-splash.mjs` 用桩 `window.__ModuleLoader__` + `require('react')` 桩把**真实的
`lib/client.js`** 装进本地 HTML，在无头 Chrome 里跑到指定毫秒截图，PNG 落在 `.render/`（已 gitignore），
末尾打印一次 `{loaded, storedMode, overlays}` 探针。零依赖，Chrome 路径同样复用
[`scripts/browsers.mjs`](../scripts/browsers.mjs)。和 `audit:leak` 一样**不挂进 `check`**：CI 没有浏览器。

它只覆盖**客户端半边**——宿主半边（`lib/index.js` 的首帧注入）要真机重启才能看，清单见
[VERIFY-MACOS.md](VERIFY-MACOS.md)。

## 机器维度与性能的本地工具（都不进 CI）

`tools/` 下的每个工具都是零依赖（Node ≥22 的 `fetch`/`WebSocket`）＋ `scripts/browsers.mjs` 找浏览器，
共用 `tools/lib/harness.mjs`（临时静态服务器 + 无头 Chrome + 极简 CDP + 桩页面）。全部**不挂**
`npm run check`：CI 没有浏览器，只跑 `extract` + `build` + `node --check`。

| 命令 | 查什么 |
|---|---|
| `npm run render:splash -- --variant 550c --shots 0,2000,…` | 按毫秒截图 + 结构探针（`data-phase`、`#b-*` 阶段/进度、窗口与日志行计数、视差矩阵） |
| `npm run render:splash -- --variant 550w --shots 700,1600,2400` | 未实装机型：`#wip` 占位里的「正在开发」在，约 2.8s 后探针的 `overlays` 归 0 |
| `npm run audit:leak -- --variant 550w` | 跳过之后没有残留 `setInterval`（打印调用点栈与残留监听器）；占位同样适用 |
| `npm run measure:perf -- --variant 550c` | long task / 主线程 busy 份额 / rAF 帧间隔 / CPU profile；帧间隔只作参考（本机同配置两次差 2×） |
| `npm run verify:reduced-motion -- --variant 550a` | reduce 下没存过偏好 → 只播简易档；显式选完整/关闭仍然赢 |
| `npm run verify:variant-bg` | 宿主半边首帧底色逐机型正确（含两个占位机型）、未知值回退 550C、`end()` 不留痕 |
| `npm run verify:skip -- --variants 550c --at 3000,9000,15000` | 真 `Esc` 与真点击在各阶段都能 <2s 收场，跳过提示同时消失，焦点不留在遮罩上 |
| `npm run verify:skip -- --variants 550w,550a --at 800,1600` | 约 2.2s 的「正在开发」占位里，两种手势同样都能收场 |

（`--variant` 缺省时用机型注册表的默认值 550C；`render:splash` 还支持 `--scheme` 看配色覆盖。）

## 真实 GUI

`scripts/verify.mjs` 用 DevTools 协议驱动真实浏览器，可以在**精确时刻**、**指定模式**下截图并读取
遮罩层的内部状态。普通 `--screenshot` 做不到：模式存在 localStorage 里，而且新 profile 的引导弹窗
挡在整个 shell 前面，不点掉它插件的槽位根本不存在。

```sh
node scripts/verify.mjs --url 'http://127.0.0.1:3080/?token=…' --mode simple --at 2600
node scripts/verify.mjs --url '…' --mode full  --at 7000
node scripts/verify.mjs --url '…' --mode off   --at 1000 --settings   # 设置行巡检
node scripts/verify.mjs --url '…' --mode full  --at 3000 --skip       # 跳过验证
```

已实测通过的项（web profile，`link:` 安装）：

| 项 | 证据 |
|---|---|
| 简易模式播放 | 2.6s 截图：logo 正在逐路径书写，红 0 已发光，`550C SYSTEM BOOT` 打字机 |
| 简易模式收尾 | 7s 时 `host: false`，屏幕顶层元素变回 DSH 输入框 |
| 完整模式播放 | 7s 时 `appInShadow: true`、63 行日志、47 节点全部 `done` |
| 完整模式收尾 | 15s 时 `host: false`，遮罩已卸载 |
| 关闭档 | `--mode off` 时 `host: false`，遮罩从不挂载 |
| 通用设置行 | `rowTitle: "550C 开机动画"`，三档 `["关闭","简易","完整"]`，当前档高亮，`预览` 按钮在 |
| Esc 跳过 | 3s 时 `hostBefore: true` → Esc 后 `hostAfterEsc: false` |

截图存在 `.verify/shots/`；README 顶部那三张对外预览在 [`docs/`](.)。
`.verify/` 整个目录已 gitignore —— 里面有从 app.asar 取出的 DSH 包文件，不该进仓库。

> web profile 首次启动会串联几个引导弹窗（内测声明 → API Key），它们盖在整个 shell 之上，
> 所以全新 profile 下动画会被弹窗挡住。桌面 profile 的引导已经走完，不存在这个问题。

## 550W 的时间线探针（15.45 s 版，R4）

550C 是移植，验的是"逐字节保真"；550W 是自建时间线，验的是"表与其实现一致 + 画面不静止"。
下面全部跑真机无头、真 `lib/client.js`，输出是表不是叙述。

```bash
node tools/probe-550w.mjs --viewport 1920x1080     # 拍点 / 倒计时 / 白闪 / 横幅 / 运动 / 白底帧 / CRC
node tools/probe-550w.mjs --viewport 1280x900
node tools/probe-550w.mjs --reduced                # 期望 0 次白闪、0 张整屏白底帧
node tools/motion-sheet.mjs --viewport 1920x1080   # 连拍与双帧证据（带构造性校验与逐格 changed cells）
node tools/verify-variant-row.mjs                  # 选中不自动播、「开发中」只挂 wip 机型
node tools/measure-550w-wordmark.mjs               # 字标几何与主色对回母版
```

| 项 | 目标 | 实测 1920×1080 | 实测 1280×900 |
|---|---|---|---|
| 拍点偏差（7 拍 + 收尾，对 PLAN §1） | ≤ 150 ms | 最差 12 ms | 最差 12 ms |
| 全片长度 | 15.45 s ±0.4 | 15.45 s | 15.45 s |
| 倒计时 T-02.399 → T-00.000 | 2400 ms ±100 | 2400 ms | 2400 ms |
| 全片白闪 | 恰好 1 次、< 1 s | 1 次 / 200 ms | 1 次 / 200 ms |
| **静止窗口（≥500 ms 无显著变化）** | **0 个** | **0** | **0** |
| **硬切预算：单帧 changed cells 上限** | **≤ 15 %**（除按时间豁免的整屏事件） | **9.0–9.6 %**（连跑两次） | **12.9–13.1 %**（连跑两次） |
| 每拍 changed cells ①（均值，`b2-ignition` 除外） | > 0 | a1 5.1 / a2 6.2 / a3 4.4 / a4 4.1 / b1 2.8 / b3 2.1 % | a1 7.4 / a2 8.1 / a3 7.4 / a4 6.2 / b1 4.1 / b3 2.9 % |
| 每拍 changed cells ② intra-beat（基准夹回本拍首帧） | 仅报告 | a1 3.8 / a2 5.9 / a3 4.1 / a4 3.6 / b1 2.7 / b3 1.5 % | a1 5.3 / a2 7.8 / a3 7.2 / a4 5.4 / b1 3.9 / b3 2.1 % |
| 每拍 changed cells p95 | 仅报告 | 最高 8.8 %（a2-cutaway） | 最高 12.8 %（a3-link） |
| 窗口实测驻留 | 每拍 1500 ms 里活 ~1100 ms、自己退场 | target/cut/link/priv/armed 1103–1104 ms，meter 2603 ms（占屏幕 5.8–13.9 %） | 同 |
| 结尾横幅 | 与 550C `#final` **同一套 device**（font-size / padding / letter-spacing / weight 逐项相等） | 58px / `52px 110px` / 15.08px / 500（宽度 513 px，四字文案，仅记录） | 同 |
| 白卡 / 第二场景 | 无 | 无（R1 决定：停在「接入成功」） | 无 |
| 主线程 busy / long task / 帧间隔 p95 / 掉帧率 | ≤5 % / 0 / —— / —— | 2.3 % / 0 / 16.8 ms / 0.00 % | —— |

**运动口径**：探针以 960×540 无损 PNG 截图流（~30 Hz）抓整段，缩到 96×54 灰度后逐帧差分。
"某一刻在动" 的定义是：相邻帧、或与 250 ms 前、或与 500 ms 前的帧相比，有 >0.15 % 的格子变化超过
8 个灰阶；连续 ≥500 ms 都判定为"没动"的区间即静止窗口（目标 0）。

每拍的 changed cells 给**两列，都是该拍内所有帧的平均值**（不是最大值——探针里那个函数以前叫
`peakOf`，其实一直在求和再除以帧数，R2 收尾时已改名 `meanOf`）：

- ① `mean over frames of max(adjacent, -250, -500)`：某一帧的相邻帧、250 ms 前、500 ms 前三个基准里
  **变化最大**的那个，再对该拍所有帧取平均。上一拍的变化会被第一帧带进来；
- ② `bases clamped to the beat's first frame`：同样的三个基准，但 −250 / −500 的基准帧被夹回**本拍首帧**，
  首帧自身的相邻项记 0，所以这一列只描述这一拍自己。

两列的差别在 `b3-owned` 上最大（R3 口径）：探针值含上一拍 `b2-ignition` 的白闪残余，
`intra-beat` 那一列才是横幅握持本身的数（R3 实测 ~3.5 %）。R4 把白闪的尾巴按时间排除之后，
两列都只剩横幅自己（R4：1920 下 2.1 / 1.5 %）。

### 硬切预算（R4 新增，这条是给"一闪一闪"上锁的）

`changed` 是一个**均值**，均值会把"某一帧整块跳变"平均掉。R4 因此加了一条上限：整段里**除按时间
豁免的整屏事件之外，任何单帧的 `changed` 不得超过 15 %**，超了直接 FAIL，并打印最差那一帧的 ms 与数值，
同时打印每拍 `changed` 的 p95。

豁免的三段（都不隐藏，逐条打印数值）：

1. **a0 开场 + boot→app 交接**（0–3950 ms）。a0 被任务书冻结，也已经被静止窗口指标排除；
   交接是 550C 自己的装置（它的 boot stage 把画面交给自己的 app face），只是 550W 交接露出来的是
   占屏 24 % 的态势显示，而 **550C 同一处只有 4 %**（同页面同尺子实测）——这是 R4 报告里必须报的偏离。
2. **`b2-ignition` 的白闪及其尾巴**：按 DOM 实测的 `.flash` 透明度衰减（12979 ms 0.92 → 13279 ms 0.02）
   定界，边界取「事件本身 ±560 ms」（560 = 指标的 500 ms 回溯 + 一个采样周期）。
3. **客户端 620 ms 退场**（`t > RUN_MS`）：那是 DSH 掩码的收场，不是某一拍。

**参考机对照**：550C 自己开一个窗口，在同一把尺子下是 **18.8 %**（1280×900，实测 4488 ms）；
550W 现在最差换拍是 **12.9–13.1 %**（1280×900，连跑两次）。也就是说这条 15 % 的线在"一个 640 px 窗口进场"
这件事上比基准机还严，550W 已经跑在线的内侧、也在 550C 的内侧。

**探针自身修过的一处时钟 bug（R4）**：帧的 `metadata.timestamp` 是 epoch 时间，DOM 采样是
`performance.now()`，两者要落在同一条轴上才能比。以前那个 offset 是在 `Page.navigate` **之前**
取的（还是旧文档的 `performance.now()`），帧的时间轴整体偏了约 600 ms —— 结果是白闪的豁免带落在
错误的时刻，白闪尾巴被算成"下一拍的换拍跳变"（1280×900 上偶发报 71–92 %）。现在 offset 由页面
自己的第一个任务记下（`window.__clock`），两条轴严格对齐；修好后 1920 连跑两次都是 9.0–9.6 %，
1280 是 12.9–13.1 %，不再抖。

为了让这条线真的成立，`assets.js` 里改了三件事（都有注释）：**一拍只换一件事**（场景层比窗口晚
250 ms 进场；上一拍的场景层在拍尾前 500 ms 先让位）、**态势显示是常驻背景**（以前每一拍各有
一套 `--moon/--mx/--my`，换拍时整块月球跳位，而那在 1280×900 下占屏 24 %）、**取景推入挂在元素上
而不是挂在 `[data-phase]` 上**（挂在拍上，拍一换动画被撤掉，月球会从推入一半的位置弹回原样）。

**预算账（R2 → R4）**：五个窗口常驻会让 busy 从 3.9 % 涨到 5.7 %（去掉窗口的 A/B 实测），所以窗口
改成**按拍挂载**；连续动画的元素加 `will-change` 又是 0.4–0.8 pp。R4 反过来把大图层在窗口打开期间
**冻结**（`#scene.win` 上的 `animation-play-state:paused`），只在窗口自己、`SYSTEM STREAM` 与 HUD 上
保留运动——实测 busy 从 4.8 % 降到 **2.3 %**，静止窗口仍是 0（说明"屏幕没静止"这件事不靠大图层兜）。

两条教训：R1→R2，**慢漂移等于静止**（第一版 keyframes 是 ±5 px / 11 s，逐帧亚像素，探针如实报"没动"）；
R2→R4，**面积等于跳变**（一个 640 px 窗口在 1280×900 下占屏 ~19 %，只要它一次性进出，单帧就会
撞上 15 % 的线），所以长度的推导、图层的让位顺序和窗口的进场时长都要围绕这个量来做。

跳过与减少动效的口径（R4 实测）：`verify:skip --variants 550w --at 1500,5300,11500,14500`
（a0 / a2 / b1 / b3 各真 Esc + 真点击，收场 668–701 ms）、`verify:reduced-motion --variant 550w`、
`audit:leak --variant 550w --skip 8000`（0 残留）。

b3 的口径：常态是**点火 IGNITION**（白闪 + 「［点火］IGNITION」静态印记），
`prefers-reduced-motion` 下白闪不出现、换成 skill §5 那句静态替代「［引爆］DETONATION」。

## 550W 光学精修（2026-10-03）

最新结果覆盖上述历史外观数据；8 拍 / 15.45s、六窗口 dwell、共享 a0 不变。
`probe-550w.mjs` 现在将 opening ≤35% / exit ≤30% 作为实际失败门槛，而非只打印 informational。

| 正常动效指标 | 1920×1080 | 1280×900 |
|---|---:|---:|
| 最差拍点误差 | 13ms | 9ms |
| 倒计时首尾 | 2400ms | 2417ms |
| 白闪 / 非事件白底 | 1 / 0 | 1 / 0 |
| 静止窗口 | 0 | 0 |
| 最差换拍 | 8.7% | 11.2% |
| worstOpening | 25.0% @3657ms | 34.7% @3650ms |
| worstExit | 11.6% @17154ms | 15.8% @17149ms |

1920 上一轮基线是 opening 54.1% / exit 46.8%。新版本显影从 2350ms 开始（在不透明 boot 下），
四组相隔 180ms；中央组 1.9s 显影，总跨度 2.44s。正常结束的分组内容淡出 + 底色退场约 1.96s，
不是延长内容时间线。Esc / 点击仍在 668–673ms 内移除；泄漏审计 surviving intervals=0 / listeners=0。

`node tools/verify-550w-optics.mjs <输出目录>` 加载真实 bundle，四个 scheme 逐一断言：
四层窗口投影、标题渐变/8px 辉光、token 驱动的结尾辉光、6px 圆 LED、72 根刻度、静态新增几何，
a1 结束前核心终端 5 行、右栏可见 16 行；并产出整屏配色截图、结尾特写与逐条 550C 来源的光学清单。
1920 横幅 1144.8px，550C 1170px。CSS 字面计数（含 repeating 和 keyframe 两端）：
linear-gradient 6/18、text-shadow 6/4、box-shadow 5/15、drop-shadow 6/7（550W/550C）。

Reduced 探针 PASS：12ms 误差、2450ms 倒数、白闪 0 / 白底 0；连续装饰动画按偏好停用。
其静止窗口实测 2 段（开场末尾与退场），保留原探针 informational 口径，不冒称正常档的 0。
`check` / frozen diff / leak / variant-bg / variant-row / skip 均 PASS，无依赖新增、无 commit、无 DSH 重启。
最终构建 MD5 `f09940494380e80f6ab39021e31c1222` 两次一致。真实 bundle 性能：busy 1.8%、long task 0、
掉帧 0/1047；正常完整档退场后遮罩于 17433ms 移除，内容时钟仍在 15450ms 结束。
