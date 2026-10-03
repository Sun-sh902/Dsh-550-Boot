# 机型维度：550C / 550W / 550A

[← 回到 README](../README.md) · 数据模型见 [`src/variants/registry.js`](../src/variants/registry.js)

设置 → 通用 → 550C 开机动画 里有三行，各管一个维度，彼此正交：

| 维度 | 设置行（id / order） | 键 | 取值 | 谁拥有它 |
|---|---|---|---|---|
| 机型 | `boot-550c-variant` / 28 | `dsh-550c-boot:variant` | `550c` / `550w` / `550a` | 该机型的 `src/variants/<id>/`：markup、样式表、时间线、内容层；未实装的机型走 `src/variants/wip/` |
| 档位 | `boot-550c` / 26 | `dsh-550c-boot:mode` | `off` / `simple` / `full` | 机型注册表条目里 `boot` / `app` 两段 markup 的出镜规则 |
| 配色 | `boot-550c-scheme` / 27 | `dsh-550c-boot:scheme` | `amber` / `green` / `cyan` / `white` | 机型样式表里的 `:host([data-scheme=…])` 覆盖块 |

三个键都是**独立的**：`boot-550c` / `boot-550c-scheme` 是已发布的老键，装着旧偏好的 profile
照旧能用；机型用的是新键，缺省 `550c`，**未知名/垃圾值/读不到 → 回退 550C**（`resolveVariant()`），
所以老 profile 或手改过的 localStorage 播放的东西一个字都不会变。

## 三个维度怎么叠加

1. **机型**先决定"播什么"：一套 markup、一张样式表、一条时间线、一个内容增强层。
2. **档位**决定"播多少"：`simple` 只挂 `boot`；`full` 追加该机型的 `app`（机型没有 app 面时，
   `app: null`，两档都只播 boot）。`off` 一张遮罩都不挂（宿主半边的注入脚本自己退出）。
3. **配色**最后覆盖"什么颜色"：以 `data-scheme` 落在遮罩宿主上，由**该机型自己的样式表**解释。

配色这一层要特别注意：**每个机型把四套配色映射到自己的 token 上**。也就是说
`amber` 是"不作任何覆盖"的默认档，另外三套是该机型自己写的一组
`:host([data-scheme="green"]){--amber:…;--bg:…}` 之类；某机型没有用到的 token 自然不变色——
覆盖只能改该机型样式表里确实存在的变量，不能凭空给某台机器变出一块它没有的面板。
（`--caption-fill` / `--caption-symbol` 是桌面标题栏那两条，同样按这套规则走。）

## 未实装的机型：「正在开发」占位

机型注册表条目上有一个可选的 `status`：没有它（现在只有 550C）表示这台机器的片头是自己实现的时间线；
`status: 'wip'` 表示它**只在选择器里占位**——它的 `boot` 由 `src/variants/wip/index.js` 的
`wipBootMarkup(<机型名>)` 生成，样式表是那份 `WIP_CSS`，时间线是 `createWipShow()`（两拍、约 2.2s），
`enhance` 是个返回空 disposer 的函数。占位不借用 550C 的任何像素。

选择器里的行为：点一台 `status: 'wip'` 的机器（现在只有 `550A`）会**立刻重播**这个占位（`mountOverlay(true)`），所以选项不会看起来没反应；**已实装的机器点下去只换选择、不播**（`550W` 从 3a 起就是这样，`tools/verify-variant-row.mjs` 盯着这条）；
设置行右侧同时挂一个「开发中」的小标签。这不违反「切机型不该播动画」那条——那条说的是**已实装**的机器
（换 550C 不会自己播），而未实装的机型点下去除了这个占位也没有别的东西可给。

关掉档位（`off`）时开局仍然什么都不挂：占位只在**点击**时出现，开机路径照旧听 `mode` 的。

## 首帧底色：两半边各存一份表

宿主半边（[`lib/index.js`](../lib/index.js)）在 shell 存在之前就要把屏幕涂上，所以它**不能**
引用注册表，而是自带一张同形状的表：

```js
const VARIANT_BG = { '550c': '#050403', '550w': '#04070a', '550a': '#0a0703' }
```

浏览器半边从注册表读同一个值，`mountOverlay()` 会把它 `--bg` 内联到遮罩宿主上，
所以"首帧底色 → 片头底色"是一条颜色，而不是换机型时闪一帧 550C 底。
`scripts/build.mjs` 逐条断言两张表一致、且每台注册的机器都有自己的底色——这条断言在
CI 已经在跑的 `npm run build` 里，不需要额外步骤。

## 新增一台机器要动什么

1. `src/variants/<id>/`：`assets.js` / `show.js`（可以是生成物，也可以是手写）、`enhance.js`、`index.js`；
   **片头还没做时不必造这些**——写一个 15 行的 `index.js`，`status: 'wip'` + `wipBootMarkup()` +
   `WIP_CSS` + `createWipShow` 就是一台"可选、有自己首帧底色、点了会说正在开发"的机器；
2. `src/variants/registry.js`：`VARIANT_VALUES` 加 id、`VARIANT_BG` 加底色、`VARIANTS` 加条目；
3. `lib/index.js`：`VARIANT_BG` 表加同一行（不改键、不改全局名）；
4. `scripts/build.mjs`：`PARTS` 里按顺序加上该机型的几个文件（引用 `WIP_CSS` 的条目要排在
   `src/variants/wip/index.js` **之后**，因为它在模块顶层就读这个常量）。

时间线必须只走 `createShow()` 提供的可取消骨架（`sleep()` / `later()`），并且任何
`setInterval` 都要能被 `cancel()` 清掉或自毁——`npm run audit:leak` 就是这条的守门人
（详见 [VERIFICATION.md](VERIFICATION.md)）。

## 现状

| 机型 | 时间线 | 状态 |
|---|---|---|
| 550C | 约 11.5s 完整 / 约 4s 简易 | 原作移植，逐字保真 |
| 550W | 完整 ≈15.45s / 简易 ≈3.05s | **已实装**：开场=550C 的开机装置 + 母版描摹的字标；完整档 8 拍 / 6 个窗口，长度由 550C 式窗口驻留推出（每个窗口 dwell 1500 ms 并自己退场），结尾停在「接入成功」横幅（[PLAN-550w.md](PLAN-550w.md)） |
| 550A | 约 2.2s「正在开发」占位 | **未实装**；同 550W，没有独立方案 |
