# 更新日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号用 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.1.0] - 2026-10-03

### 独立仓库首发

- 从 Ziyang Song 的 MIT 上游 `dsh-550c-boot` 0.1.4 分出独立仓库
  `Sun-sh902/Dsh-550-Boot`，包名为 `dsh-550-boot`；保留 Voidpoket 的动画原稿署名与上游版权许可。
- 汇总本仓库 550W 两档、550A 占位、终端工作台、550C 字体/结尾对齐、地球发动机淡蓝喷焰与验证工具。
- 仅提供 GitHub 直装；移除上游市场投稿清单，加入影片字标描摹与非官方粉丝作品免责声明。
- 清理当前文件及历史中的私人路径，仅将 Sun-sh902 的作者邮箱映射到 GitHub noreply；原作者名与其他邮箱不变。

以下为本仓库开发记录；后面的 0.1.4 等条目属于上游版本历史，并非本仓库版本号倒退。

### 变更（R4：不再一闪一闪 / 每拍一个焦点 / 时间线由窗口推出）

- **长度由窗口驻留推出，总长 12.0 s → 15.45 s**：`BEAT_550W` / `RUN_550W_MS` / 探针表 / PLAN §1 一起改。
  每个窗口拿到一个完整驻留（1500 ms 的拍里活 ~1100 ms），由**它自己的 dwell** 在拍尾前 600 ms 退场，
  下一拍的窗口在拍边界上进——**没有任何窗口被下一拍的边界杀掉**（新增"窗口实测驻留"探针，实时报出
  target/cut/link/priv/armed 1103–1104 ms、meter 2603 ms）。`KEY NEGOTIATION` 不再单独占一拍：
  「密钥协商通过」并入 `RELAY LINK` 自己的 `.wp-log`，窗口数 7 → **6**。
- **换拍改成交叉淡出 + "一拍只换一件事"**：场景层 320 ms 交叉淡出、比窗口晚 250 ms 进场，
  上一拍的场景层在拍尾前 500 ms 先让位；窗口的进出各自 320 ms / 160 ms。态势显示（月球、站点、
  弹阵）改成**常驻背景**——以前每拍各有一套 `--moon/--mx/--my`，换拍时整块月球跳位，而那在
  1280×900 下占屏 24 %；取景推入（`pushIn` / `camPush`）也从 `[data-phase]` 挪到元素上，
  否则拍一换动画被撤掉、月球会从推入一半的位置弹回原样。
- **删掉整族"飘来飘去的线段"**：`.arcs`（dashed 链路弧 + `drawLine` 自绘）、`.relay`（虚线字形）、
  `.gauge` + `.gauge-val`、`.jets` 两条 dasharray 喷流、`.girt-box` 两个巨环、`.site i.ring.b`、
  `.cut` 的 dasharray 自绘、`.ping`、整屏横带 `.sweep` + `frameSweep`、`.pi.gone::before`。
  留下的是 1px solid 的面板边框、`.lab::before` 那根短线、弹阵点阵，和**一条**剖面实线。
- **所有循环 ≥3.2 s 且不再摆不透明度**：`ringPulse .7s` / `beamFlow .34|.6s` / `beamPulse 1.1s` /
  `coilCharge 1.1s` / `fieldPulse 1.2s` / `winScan .9s`（两处）/ `scanDown 1.4s` / `dataSweep 1.8s` /
  `planScan 1.6s` / `girtTighten 1.5|1.8s` 全部删掉或换成 ≥3.2 s 的 transform 循环。
  大图层在窗口打开期间冻结（`#scene.win`），运动由窗口自己的扫描线/秒表、`SYSTEM STREAM`
  与 HUD 兜底——**静止窗口仍是 0**，主线程 busy 4.8 % → **2.3 %**。
- **新增探针"硬切预算"**：除按时间豁免的三段整屏事件（a0 开场 + boot→app 交接、点火白闪及其尾巴、
  客户端 620 ms 退场）之外，任何单帧 `changed cells` **≤15 %**，超了直接 FAIL 并打印最差帧 ms 与数值，
  同时打印每拍 p95。实测 1920×1080 = **9.0–9.6 %**、1280×900 = **12.9–13.1 %**、reduced = **10.2 %**（各连跑两次）；
  **550C 自己开一个窗口在同一把尺子下是 18.8 %**（1280×900），所以这条线比基准机还严。
- **修掉探针自身的一处时钟对齐 bug**：帧的 `metadata.timestamp`（epoch）与 DOM 采样的
  `performance.now()` 以前对齐的是 `Page.navigate` **之前**那个文档的时钟，帧的时间轴整体偏 ~600 ms，
  于是白闪的豁免带落在错误时刻、白闪尾巴被误报成"下一拍的换拍跳变"（1280 上偶发 71–92 %）。
  现在 offset 由页面自己的第一个任务记下，两条轴严格对齐；修好后 1920 连跑两次都是 9.0 %。
- `#dim` 只挂一次：第一个窗口进场时 `.show`，最后一个窗口退场时才撤（以前每个窗口开关一次）。
  白闪仍是全片唯一一次整屏亮暗跳变，并明确按 DOM 实测的衰减曲线定界。

### 新增

- **550W 片头实装**（`src/variants/550w/`）：开场沿用 550C 的开机装置与节奏，字标换成一整块
  **母版描摹**的字标；完整档接着播月面接管的 **8 拍 / 6 个窗口**（月球升起并自转 → 剖面 → 建链/提权
  一条连续终端流 → 武装 → 诚实时钟 2.4 s 倒计时 → 点火 → 接入成功），简易档只播开场（约 3.05 s）。
  结尾停在「接入成功」——**就是 550C 的 `#final` 装置**（同一套 padding/字号/clip-path 扫入/两条光柱，
  颜色换成本机 token），一行大字、无副标题，握持 ≥900 ms；**没有白卡、没有整屏白底帧**。
  （完整档总长见上方 R4 条目：12.0 s → 15.45 s。）
  b2/b3 一律走**点火**口径；「引爆 DETONATION」只作为 `prefers-reduced-motion` 的静态替代表达。
- **窗口系统与叙述都回到 550C**：`.win-popup` 的尺寸（`min-width:640px` / `max-width:min(980px,94vw)`）、
  入场（opacity + scale(.9)→1 + translateY(-6px)→0）、`.wp-title` 三钮、`.wp-body`、`.wp-status` 秒表逐项照抄，
  停靠位用 550C 的 tr / tl / l / br / center；`a1` 新增 `TARGET ACQUISITION` 窗口，`b1` 的倒计时搬进居中
  `DETONATION WINDOW` 的 `.wp-meter .big`，`a3` 的三个窗口改成**一个站稳下一个才出现**（各驻留 1500–1700 ms），
  有窗口时 `#dim` 把背景压暗一档。`［系统流］` 改成 550C `#mainBody` 那样一步一句的白话叙述
  （检测到月球发动机集群 → … → 控制总线接管完成），数字仍只用 §1 常量与运行期自洽值。
- **两处真 bug 修复**：① `RELAY LINK` 与 `PRIVILEGE ESCALATION` 曾同时标成 `data-p="link"`，
  `show.js` 的 Map 后写覆盖前写 → a3 没有建链、`priv` 是死键；现已拆成 `link`/`priv`，并在
  `scripts/build.mjs` 加了"550W 的 `.popup[data-p]` 不得重复"的构建断言。② 底栏 `#b-stage` 曾直接印
  机器 id（`STAGE a1-moonrise`），现改为白话阶段名（目标识别 / 剖面测绘 / 建立链路 / 鉴权协商 /
  权限提升 / 武装 / 点火窗口 / 点火 / 接入成功），`data-phase` 仍是机器 id。
- **550W 全片"活屏幕"**：每一拍至少两层在动（月球自转与推入、晨昏线扫过、站点环脉冲、弹阵呼吸、
  参数表数字扫描、等离子束流动、线圈依次充能、剖面自绘、窗口扫描线、RTT 光点往返、环箍收紧、
  全场压暗、横幅扫入与光柱），外加一条持续滚动的 `［系统流］SYSTEM STREAM`。运动全部是 CSS 动画
  + 可取消的计时链，只动 `transform`/`opacity`/`filter`/`stroke-dashoffset`，
  `prefers-reduced-motion` 整块关掉；静止窗口指标为 **0**（逐帧差分）。
- `assets/550w-wordmark.svg` + `tools/trace-550w-mark.mjs`：字标不是画的，是从
  `.render/ref-550w-mark.webp` 逐墨块描出来的（边界追踪 → RDP 1.6px，5 个墨块，0 个内孔）。
  `tools/measure-550w-wordmark.mjs` 把几何与主色对回母版（红白最小间距 9.6 % cap、正交接触 0、
  主色 Δ ≤ 4/通道）。
- `tools/probe-550w.mjs`：时间线探针（八节）——拍点偏差（1920 / 1280 实测最差都是 12 ms，表值 ±150 ms）、
  倒计时诚实性（**T-00:02.399 → T-00:00.000 = 2400 ms**，两档实测都是 2400 ms，±100 ms）、
  全片白闪次数（**1 次 / 200 ms**）、结尾横幅与 550C `#final` 的装置逐项相等、
  窗口实测驻留、静止窗口（0 个）、**硬切预算（单帧 ≤15 %）**、整屏白底帧（白闪外 0 张），
  以及每拍 changed cells 三列（`mean over frames of max(adjacent, -250, -500)`、
  `bases clamped to the beat's first frame`、p95）。
- `tools/verify-variant-row.mjs`（`npm run verify:variant-row`）：驱动真设置行验证"选中不自动播、
  「开发中」标签只挂在 wip 机型上"。

### 变更

- **机型选择器**：550W 去掉 `status: 'wip'`，点它不再重播占位、右侧「开发中」标签消失（550A 仍有）；
  行文案改成按注册表动态生成，不再写死哪几台未实装。
- **550W 首帧底色 `#04070a` → `#030303`**（`src/variants/registry.js` 与 `lib/index.js` 两张表同改）。
- `render-splash.mjs` 新增 `--viewport WxH`（默认仍是真机窗口）；`verify-skip` / `measure-perf`
  的说明与探针适配 550W 的 `[data-phase]` 与 `#b-count`。

### 修复

- **机型底色与样式表漂移**：`mountOverlay()` 会把 `VARIANT_BG[id]` 内联成 `--bg`，内联永远赢，
  所以 550W 之前整段跑在偏蓝的 `#04070a` 上，而样式表里写的 `#030303` 是死代码。
  `scripts/build.mjs` 现在断言**每台机型的 `VARIANT_BG` 等于它样式表里声明的默认 `--bg`**
  （只声明 `var(--bg, …)` 的占位机型会打印一行说明并跳过）。
- **接线漏文件是静默的**：产物必须同时含 `BOOT_MARKUP_550W` / `CSS_550W` / `createShow550W` /
  `enhanceShow550W` 四个标识符，缺一个 `npm run build` 直接报错（`PARTS` 漏 `shared/boot.js`
  的后果是"代码全对、屏幕是占位"）。

### 移除

- 上一轮撤下的 550W 第一/第二版实现与占位脚手架不再需要：550W 现在有自己的 markup、样式表、
  时间线与内容层；「正在开发」占位只服务 550A（`src/variants/wip/index.js` 保留）。

## [0.1.4] - 2026-09-30

### 修复

- **macOS 三处收尾**（此前只做了"不吞掉窗口拖拽"）：
  - HUD 让位常量从拍脑袋的 `86px` 改成按 shell 自己数字推导的 **76px**（红绿灯 x=16 + shell 给它们
    留的 52px 条宽 + 8px 呼吸位）；
  - **全屏时让位塌成 0**：macOS 全屏收红绿灯、Windows 全屏收 overlay 按钮，preload 用
    `html[data-fullscreen]` 报这件事；插件用 `MutationObserver` 盯这个属性并镜像到宿主元素，
    所以片头正在放的时候切全屏也跟得上；
  - **HUD 条带标 `data-window-drag`**：这是官方 base.css 认的标记（"被标记行的空白段可拖、
    控件仍可点"），补上之后完整档片头期间窗口不再拖不动。
- darwin 上不再注入标题栏换色样式表：preload 的探针元素只在 win32 创建，那边没有可改的条带。

## [0.1.3] - 2026-09-30

### 修复

- **片头到对话页的交接改成两段式**。原来整屏一次性 cross-fade，而片头结尾是一枚放大的高对比度
  logo，那半秒里会有一枚灰色 logo 幽灵盖在已经加载好的对话页上（用真实时间的逐帧截图确认过）。
  现在：内容先淡进片头自己的底色（`--bg`，由遮罩自己绘制）→ 一屏干净的黑 → 再淡出黑底露出对话页。
  总时长 620ms（内容 200ms，黑底延迟 200ms 后 420ms 淡出）。

## [0.1.2] - 2026-09-30

### 变更

- **桌面标题栏条带改为透明**：片头播放期间，右上角那几个原生按钮**浮在动画上**，不再压着一条
  不透明的色带。做法是把 preload 探针元素的 `background-color` 设成 `transparent`、符号色设成当前
  配色 —— 探针这两个 computed 值就是 `setTitleBarOverlay({color, symbolColor})` 的来源。
- 两处只在真机暴露的坑修掉了：颜色必须写在探针元素**自己**身上（app 把 token 定义在 `body` 上，
  `:root` 上的 `!important` 因"最近祖先"规则压不过它，整段片头条带都不变）；读配色要等增强层样式表
  挂上之后再读，否则静默落到兜底值。

## [0.1.1] - 2026-09-29

### 修复

- **macOS：片头播放期间窗口拖不动**。官方基础样式表把每个 body 直接子元素都算成
  `-webkit-app-region: no-drag`，铺满视口的遮罩会把整扇窗口从 macOS 可拖拽区域里减掉，
  双击缩放也失效。现在宿主元素带 `data-dsh-boot-splash`（`dsh-web-all` 全家桶豁免的标记之一），
  并自带一条 `-webkit-app-region: initial !important` 覆盖没装全家桶的纯 DSH。
  点击 / `Esc` 跳过不受影响。

### 文档

- README 重排为「是什么 / 装 / 怎么用 / 配色 / 兼容与限制 / 文档索引」，工程细节拆进 `docs/`：
  `ARCHITECTURE.md`、`ENHANCEMENTS.md`、`DESKTOP-CHROME.md`、`VERIFICATION.md`。
- 新增 `docs/PLAN-macos-and-update-check.md`：macOS 适配待办与设置里「检查更新」的方案评估。
- 新增 README 顶部实时徽章（Stars / Downloads / 最近提交 / 许可 / topic / 访客）。

## [0.1.0] - 2026-09-28

### 新增

- 550C 开机片头：简易档约 4 秒、完整档约 16 秒，点击画面或 `Esc` 跳过，播完渐出。
- 首帧由宿主半边经 `webserver/index-inject` 在文档解析阶段注入 —— DSH 自己的
  `HARNESS / Loading plugins…` 卡片不会露脸；卡片消失或进入失败态时首帧自行退役，另有 12s 上限。
- 通用设置里的设置行：三档（关闭 / 简易 / 完整）、四套配色（琥珀 / 绿 / 青 / 白）与「预览」按钮。
- 桌面窗口右上角原生按钮的收编：`#hud-top` 按 `env(titlebar-area-width)` 让位，
  条带底色与符号色跟随当前配色（走 `dsh-desktop:windows-appearance`）。
- 内容增强层：等宽字体栈、字符单元进度条、块光标与真实时钟戳、固件注入页脚（行号 / 地址 / CRC32）、
  集群节点信号条。

[0.1.1]: https://github.com/yannicksong0106/dsh-550c-boot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yannicksong0106/dsh-550c-boot/releases/tag/v0.1.0
