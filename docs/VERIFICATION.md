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
