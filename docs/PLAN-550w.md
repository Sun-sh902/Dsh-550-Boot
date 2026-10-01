# 550W 片头：重做方案（Step 1：只交方案与静态图）

[← 回到 README](../README.md) · 机型模型见 [VARIANTS.md](VARIANTS.md) · 静态图工具 [`tools/mock-550w.mjs`](../tools/mock-550w.mjs)

> 状态：**第一版 550W（冷白地平线 + 网格 + 抽象仪表）已废弃**，本文是按新 spec 重做的方案。
> Step 1 只做三件事：正式时间线表、5 张关键帧静态图、复用清单 + 验收清单。**未写任何动画代码**；
> 实现（Step 2）等你批准。

一段话：**开场就是 550C 那套 logo 书写（字换成 550W）；随后进入月球发动机的控制界面；
沿用 550C"接入并掌控"的叙事推进；结尾「接入成功」定格。**

## 为什么第一版不成立

| 问题 | 新方案怎么解 |
|---|---|
| 开场与 550C 没有承继关系 | Act 1 **就是** 550C 的 boot stage（同一份 markup + 同一条时间线，只换尾字形与字幕） |
| 看不到"发动机"，也看不到月球 | Act 2 的主体是月球 + 三台发动机站点 + 一台发动机的剖面 |
| 没有叙事，只有动画依次出现 | 沿用 550C 的接管语汇：扫描 → 建链 → 握手 → 密钥 → 提权 → 控制总线 |
| 没有终点 | 结尾是 `#final` 式的「接入成功」横幅 + 机读副行，握持 ≥0.8s |

## 1. 正式时间线表（完整档，21.0s）

每拍把名字写进 stage 的 `data-phase`，截图与探针都按它断言。`可跳过` 一律为"是"：全程只需一次
`Esc` 或一次点击即撤销（沿用 550C 的 `sleep()/later()` 可取消骨架）。

| # | `data-phase` | 起止 | 时长 | 屏幕上发生什么 | DOM / CSS 原语 |
|---|---|---|---|---|---|
| 1 | `a0-boot` | 0.0–3.05 | 3.05s | **与 550C 完全同一套**：暗场 + 扫描线，`550` 逐路径书写，尾字形 **C→W**，底部字幕 `550W SYSTEM BOOT`，写完发光 | 550C 的 `#boot` / `.boot-stage` / `#logo` / `.boot-text`；逐路径 `clip-path` + 双 rAF（`250 + i*300`），冷白/青点缀 |
| 2 | `a1-moonrise` | 3.05–4.9 | 1.85s | boot 淡出，月球从下半屏升起并定住：弧面 + 经纬 + 晨昏线 | 550C 的 `#boot.fade`；`.moon`（SVG 球体 + 渐变本体 + `.terminator`），`transform/opacity` 过渡 |
| 3 | `a2-cluster` | 4.9–6.6 | 1.7s | 三处发动机站点逐个点亮并标号（01/02/03），基座环出现；顶部 HUD 起 `LUNAR ENGINE CLUSTER`。**月球是背景上下文**（缩到 ~30vh、偏左上），不套大圆环 | 550C 的 `#hud-top`/`#hud-bot`；`.moon`（本体渐变 + 经纬 + 晨昏线）、`.site`（点 + 环 + 中英双行标），`--i` 错帧 |
| 4 | `a3-cutaway` | 6.6–8.4 | 1.8s | 选中 01 号，**纵向贯通整屏**的剖面：能量注入口 → 燃烧室 → 磁约束线圈 ×4 → 喉部/转向环 → 喷口 bell → 基座环，**等离子体束贯穿出画**（强光柱 + 底部辉光） | 550C 的 `.win-popup` 装遥测；`.cut` 里一条 300×900 的纵向 SVG（`.shell`/`.chamber`/`.coil`/`.bell`/`.beam`/`.flow`），能量流是 `stroke-dashoffset` + 宽度脉冲 |
| 5 | `a4-link` | 8.4–10.2 | 1.8s | 建链：终端窗口打字，逐行 `BEACON → LINK UP → RTT 1.28 S`；三站点与月球之间画出链路弧 | 550C 的 `.win-popup` + `.ln` 打字机（`type()` 同款）；链路弧 SVG `stroke-dashoffset` |
| 6 | `a5-auth` | 10.2–11.8 | 1.6s | 握手 / 认证 / 密钥协商：窗口里滚 `.wp-row` 键值（非对称族、指纹、CRC32 行），进度条推进 | 550C 的 `.wp-row`/`.wp-log`/进度条；`enhance` 层的 CRC 与"数字自洽"标准 |
| 7 | `a6-privilege` | 11.8–13.0 | 1.2s | 提权：窗口转 `danger`，日志攀升到 `ROOT ON CONTROL BUS`，三站点加环 | 550C 的 `.win-popup.danger` + `.wp-alert-strip` |
| 8 | `b1-armed` | 13.0–14.4 | 1.4s | 接管确认：三站点转"已接入"（绿），剖面线圈充能发亮，遥测表开始跳动 | `.site.armed`；`.coil` 充电关键帧；遥测列（推力/比冲/等离子体温度/磁场） |
| 9 | `b2-countdown` | 14.4–18.6 | 4.2s | 点火倒计时 **`T-00:04.200 → T-00:00.000`（诚实时钟：读数与真实经过时间一致，±100ms）**，环形箍收紧，全场压暗；**点火拍借琥珀** | 全屏 `.dim`；`.count`（等宽、居中、字重拉满）；`.girt` 双环 `stroke-dashoffset`；20 Hz 写入（约 84 次），见下 |
| 10 | `b3-ignition` | 18.6–19.7 | 1.1s | **点火**：等离子体束贯穿画面，整屏冷白/青饱和 1–2 帧，推力/比冲读数飞跳 | 全屏脉冲层 + `.beam` 放大冲出；读数用 `--v` 关键帧跳变 |
| 11 | `b4-owned` | 19.7–21.0 | 1.3s | **接入成功**：三站点同时绿，日志 `CONTROL BUS OWNED`，`#final` 式横幅「接入成功」+ 机读副行，握持 ~0.9s 后淡出 | 550C 的 `#final`（同款边框 + 光晕 + 扫入）+ 副行；`finish()` 淡出 |

阶段数 11（要求 ≥6）；总长 21.0s（要求 18–22s，且长于 550C 的 11.5s）。

## 2. 复用清单（"辨识度"就来自这里）

| 复用什么 | 复用方式 | 具体落到 |
|---|---|---|
| 开场 boot stage | **同一份 markup + 同一条 `playBoot()` 时间线** | `src/variants/shared/boot.js`（见下"机制"），参数只有两个：尾字形组、字幕 |
| 接管叙事语汇 | 外观与节奏照搬：`.win-popup` / `.wp-title` / `.wp-log` / `.ln` / `#hud-top` / `#hud-bot` / 进度条 | 复用 550C 的 `CSS_550C`（Act 2/3 的样式表把它整段带上），只是内容换成月球发动机 |
| 结尾定格 | 同款横幅 | 550C 的 `#final` + `#final.show`，文字改「接入成功」 |
| 数字自洽 | 同一条标准：ID / 遥测 / 进度 / CRC 必须互相对得上 | 复用 `enhance` 层那套校验行写法（新的时间戳重映射 + 机读页脚） |

### 机制：抽一个**共享 boot 模块**，由生成器保证同源（已在 Step 1 落地）

`scripts/extract.mjs` 除 550C 自己的两份文件外，**再产出** `src/variants/shared/boot.js`：

```
src/variants/550c/{assets,show}.js   550C 自己那份（本次一个字都不改）
assets/boot-template.html            手维护的 boot 模板：550C 的 #boot markup，
                                     两个洞——尾字形组、第三个字形的 class
src/variants/shared/boot.js          由上面那份模板生成：BOOT_MARKUP_TEMPLATE +
                                     bootMarkupFor(tail, midClass) + playBootShared(deps)
```

`extract.mjs` 里两条 `must()` 断言，让"同源"成为构建期事实而不是口头承诺：

1. 把两个洞按 550C 的值（它的尾字形组、它的 `class="red"`）填回去，
   `assets/boot-template.html` 必须与从原稿抽出的 `BOOT_MARKUP` **逐字节相等**；
2. 共享时间线里必须出现与 550C 完全相同的常量串：`250 + i * 300`、`2400`、`+ 400`、`+ 600`。

实测过的活性：在 `assets/boot-template.html` 里改一个字节（`<div id="boot">` → `<div id="boot" >`），
`node scripts/extract.mjs` 立即以 exit 1 失败并指出是这条断言；改回来即通过，且 `lib/client.js` 不变。

**为什么这让 550C 不变**：550C 播放的是它自己那份生成文件（本方案不改它，验收第 2 条就是
`git diff` 不碰 `src/variants/550c/`）；共享模块只被 550W 引用。两边同源由**生成器 + 构建断言**锁住，
而不是靠人眼比对。

**为什么不是"直接引用 550C 的常量"**：`playBoot()` 是 `createShow()` 闭包里的私有函数（550C 只导出
`{start, cancel}`），而且它硬编码了字幕与尾字形；要"只换两处"就必须有参数孔，而参数孔只能落在生成器里。
**为什么不是"把 550C 的 playBoot 抽出来两边共用"**：那要改 550C 的文件，直接违反验收第 2 条。

### 尾字形 W：**描**参考图，不凭印象画

`.render/ref-550w-mark.webp`（1860×722）被逐像素量过：白的 `550`、红的字形（掩膜 bbox x 860–1381、
y 85–591、色值 `rgb(231,20,27)`）、以及它右边那个**白 V**（x 1372–1772）。把两块掩膜各自描成闭合轮廓
（边界追踪 → Ramer-Douglas-Peucker 1.6px），得到 51 点与 25 点的两条 path，用**一个**
`translate(55.4 3.1) scale(0.3638)` 放进 boot 的 viewBox：高度对齐 550 的 187 单位，
横向刻意**与第三个字形互相穿插**（不是并排挂在右边）。

仍然是**两条 path**，但拆成**两个组**（`#wRing` 红环+斜杠、`#wLeg` 白 V）——550C 的 `#cee` 也是两条，
于是 `#logo path` 数（6）与 **5 个组**、以及 `playBoot()` 的节拍（`250 + i*300`，i=0…5）
三方都与 550C 对齐。红的身份从第三个字形挪到尾字形（第三个字形改回白），与参考图一致。

三个配色候选（`.render/550w-step1-w-candidates.png`，参考图在最上）：
① 全红 ② 左红右白 ③ 红 0 + 白 W。**我的判断是 ②**，理由是量出来的：
参考图里红掩膜只覆盖到 x 1381，而白 V（x 1372–1772）整体是白的——即 W 的左半（环+斜杠）是红的、
右半（那个 V）是白的；③ 把红放到"0"上，而参考图里的红环并不是 0。**由你挑**，我按你挑的那张实现。

## 3. Step 1 的静态关键帧（`.render/`）

`npm run mock:550w` 产出（**摆拍**，不是真时间线；第 ① 张用的就是 550C 的真实样式表与真实 boot markup）：

| 文件 | 内容 | 证明什么 |
|---|---|---|
| `550w-step1-1-boot-midwrite.png` | ① 开场 logo 写到一半 | 与 550C 同款暗场/扫描线/书写；尾字形是 W、字幕是 `550W SYSTEM BOOT` |
| `550w-step1-2-moon-cluster.png` | ② 月球 + 三台发动机集群标记 | 主体是月球（弧面/经纬/晨昏线）+ 3 个站点 + 基座环；HUD 用的是 550C 的壳 |
| `550w-step1-3-cutaway-energy.png` | ③ 发动机剖面 + 能量流 | 喷口/转向环/磁场线圈/等离子体束 + 能量流 + 遥测；日志窗口是 550C 的 `.win-popup` |
| `550w-step1-4-countdown-dim.png` | ④ 点火倒计时压暗那一刻 | 巨型等宽倒计时 + 环形箍 + 压暗 + 琥珀告警条 |
| `550w-step1-5-owned.png` | ⑤「接入成功」定格 | 550C 的 `#final` 横幅换文字 + 机读副行 + 三站点"已接入" |

## 4. Step 2 验收用例清单

| # | 断言 | 命令 |
|---|---|---|
| 1 | **开场同源**：3000ms 与 550C 同毫秒对比结构，且 `#bootText` = `550W SYSTEM BOOT`、`#logo path` 数 = 6（与 550C 相同） | `npm run render:splash -- --variant 550w --shots 3000` 与 `--variant 550c --shots 3000` |
| 2 | **550C 逐字节回归**：550C 探针与基线一致；`git diff` 不含 `src/variants/550c/` | 同上 + `git diff --stat` |
| 3 | **发动机主体存在**：探针数到月球 1、站点 3、剖面 1、束流层 1 | `render:splash` 探针新增 `moon/sites/cutaway/beam` 计数 |
| 4 | 结尾横幅文字 = 「接入成功」，`#final.show` 持续 ≥0.8s | 探针按 100ms 采样 `#final` 文本与 class |
| 5 | 总时长 18–22s；`data-phase` ≥6 且每拍都有 | `render:splash --shots 0,2000,…,20000` 的 `phase` 列 |
| 6 | `long task = 0`、主线程 **busy ≤ 5%**（550C 同法对照，基线实测 5.0%）；**帧间隔只作参考**——本机同配置两次跑差 2×，不可复现 | `npm run measure:perf -- --variant 550w` / `--variant 550c`（已输出 busy%） |
| 7 | 3s / 9s / 15s 各一次真 `Esc` + 一次真点击 → 遮罩 <2s 消失、提示不残留 | `npm run verify:skip -- --variants 550w --at 3000,9000,15000` |
| 8 | 跳过 0 残留；退场后 `activeElement` 不在遮罩上 | `npm run audit:leak -- --variant 550w` + 第 7 条的 `focusOnSplash=false` |
| 9 | 四套配色仍给不同 token、结构不变 | `render:splash --variant 550w --scheme amber/green/cyan/white` |
| 10 | 构建门槛 | `node scripts/extract.mjs && node scripts/build.mjs && node --check lib/client.js && node --check lib/index.js` + `git diff --exit-code -- lib/client.js` + `npm run check` |
| 11 | 交付九宫格 PNG + 四关键拍（**来自真时间线 `render:splash`，不是 mock**） | `.render/`，每张标注 `data-phase` |

另外两条在 Step 1 就已经做成**机器断言**的（mock 里现在就在跑，实现时搬到 `render:splash` 探针）：

- 结尾横幅宽度 ≥ 550C `#final` 在同一视口下的 **0.8×**（Step 1 实测：1150 px vs 1142 px，比值 **1.007**）；
- 横幅/副标题与任何 `.site` 标签**矩形不相交**（Step 1 修完为 0 个重叠）。

`b4-owned` 那一拍**站点标签让位给横幅**（`display:none`），这是上面第二条断言要求的；
实现时同步写进时间线。

Step 2 会**删掉**现版 `src/variants/550w/{assets,show,enhance}.js` 的内容并重写（只保留机型注册表条目、
宿主首帧底色、`#hint` 用法、定时器纪律与 `tools/`）。ACT 2/3 里的 `#hint`（点击 / Esc 跳过）沿用现版做法。

## 5. 已经按评审定的（不再问）

1. **倒计时改成诚实时钟**：`T-00:04.200 → T-00:00.000`，4.2s 走完，读数与真实经过时间一致（±100ms），
   20 Hz 写入（约 84 次），总长仍是 21.0s。
2. **结尾横幅不再复用 550C 的 `#final` 样式**：那个样式里 `box-shadow` / `text-shadow` 硬编码了琥珀
   （`rgba(232,160,32,…)`），照抄就等于把暖晕带进来。550W 写自己的 `.w-final`，**全部走 token**，
   于是四套 scheme 继续生效；宽度按"≥ 550C 真机横幅的 0.8×"来卡（Step 1 实测 1.007×）。
3. **B 帧（发动机）改成纵向主体**：能量注入口 → 燃烧室 → 磁约束线圈 → 喉部/转向环 → 喷口 bell → 基座环，
   等离子体束贯穿出画；月球退成背景上下文（更小、偏一侧，不再被大圆环套住）。

## 6. 只剩一件要你拍板：W 的配色

三个候选见 `.render/550w-step1-w-candidates.png`（参考图在最上面）：① 全红 ② 左红右白 ③ 红 0 + 白 W。
**我认为是 ②**（参考图里红掩膜止于 x 1381，白 V 整块是白的）。你挑一张，我按它实现；
形状已经按参考图描好，换配色只是改两个 fill。
