# 桌面标题栏与 macOS 拖拽

[← 回到 README](../README.md)

## Windows：那三个原生按钮

桌面壳给 Electron 的是 `titleBarStyle:'hidden'` + `titleBarOverlay`（高 40，宽约 3×46=138，
`color: chromeFallbackFill()` 暗色 `#1b1b1c`，`symbolColor: #f9fafb`），也就是说
**─ □ ✕ 是浏览器进程画在网页之上的**：文档里任何 z-index 都碰不到它，插件也删不掉它（原作自己的
─ □ ✕ 在假窗口标题栏里，那是设计的一部分，与本条无关）。

插件不试图盖它，而是**收编它**：

- **让位**：`#hud-top` 按 `env(titlebar-area-width)` 预留出条带宽度，HUD 自己的 `TIME / ● REC`
  不再被压在按钮底下；普通浏览器标签页没有这个 env，预留自然塌成 0。
- **条带透明**：桌面 preload 会建一个探针元素，把它的 computed `background-color` / `color` 经
  `dsh-desktop:windows-appearance` 交给 `setTitleBarOverlay({color, symbolColor})`，并且 `<head>`
  一变就重量一次。两个值都接受 alpha，所以片头挂载时把探针的底色设成 **`transparent`**
  （preload 用 canvas 归一化成 `rgba(0, 0, 0, 0)`，主进程的颜色校验接受它），符号色设成当前配色 ——
  那几个按钮就**浮在动画上**，不再压着一条不透明的色带；卸载时移除这张样式表，`<head>` 的这次变更
  本身就是重量触发，主题自动还原。

两个实现上的坑（都在真机上量到过）：

1. 颜色必须写在**探针元素自己**身上，不能写 `:root`。探针是 body 级 `<span>`，内联样式读的是
   `var(--dsw-specific-sidebar-fill)` / `var(--dsw-alias-label-primary)`，而 app 把这两个变量定义在
   `body` 上 —— 自定义属性按**最近祖先**解析，`html` 上的 `!important` 压不过 `body` 上的普通声明，
   所以 `:root` 方案在真机上完全没生效（整段片头条带都没变）。
2. 读配色要等增强层样式表挂上之后再读：`--caption-symbol` 由 `src/enhance.js` 定义，早读会静默
   落到兜底值，条带就一直是错的颜色。

## macOS：不吞掉窗口拖拽

官方基础样式表把**每个 body 直接子元素**都算成 `-webkit-app-region: no-drag`（选择器只放过应用
自己的根元素），于是铺满视口的 body 级元素会**把整扇窗口从 macOS 可拖拽区域里减掉**：片头在放的
时候，标题栏拖不动、双击缩放也失效。`pointer-events: none` 不豁免这件事，只有元素自己声明才行。

所以遮罩挂载时同时做两件事：

- 宿主元素带 `data-dsh-boot-splash` —— 这是 `dsh-web` 全家桶（`dsh-web-all`）专门豁免的三个标记之一；
- 自己往 `<head>` 塞一张 `html[data-platform="darwin"] body>.dsh550c-host{-webkit-app-region:initial !important}`
  —— 没装全家桶的纯 DSH 靠这一条。

`initial` 是初始值（`none`），作用是让元素**退出** app-region 计算，而不是把整块遮罩变成拖拽把手，
所以点击跳过照旧有效；`!important` 是必需的，官方那条选择器权重更高。看得到的区别：加了这条，
遮罩的 computed `-webkit-app-region` 是 `none`，官方 `[data-window-drag]` 标题栏行保持 `drag`；
去掉它，遮罩变成 `no-drag`（就是被吃掉的 bug）。`.verify/run-harness.mjs` 的
`darwin · window drag guard` 用例把这四个值都断言了。顶部 40px 条带在这段时间归窗口拖动，
点击跳过请点别处或按 `Esc`。

## macOS：让位、全屏与 HUD 条带

macOS 没有 `titleBarOverlay`（整个 shell 里 `titlebar-area` 零命中），红绿灯由
`titleBarStyle:'hiddenInset'` + `trafficLightPosition{x:16,y:18}` 画，所以 Windows 那套
`env(titlebar-area-width)` 在 mac 上不存在。三处按 shell 自己的数字补齐：

| 项 | 做法 | 依据 |
|---|---|---|
| HUD 让位 | `:host([data-caption="darwin"]) #hud-top{padding-left:76px}` | 16（x）+ 52（shell 自己给红绿灯留的条宽）+ 8 呼吸位 |
| 全屏塌陷 | `[data-fullscreen]` 时 `padding-left/right:0` | 全屏时 macOS 收红绿灯、Windows 收 overlay 按钮；preload 用 `html[data-fullscreen]` 报这件事 |
| 窗口可拖 | `#hud-top` 标 `data-window-drag` | 官方 base.css 把该标记变成 darwin 唯一那条 drag 规则；被标记行的空白段可拖、控件仍可点 |

全屏标记由 `client.js` 用 `MutationObserver` 盯 `html[data-fullscreen]` 并镜像到宿主元素上，
所以**片头正在放的时候**用户切全屏也跟得上，不是只在挂载那一刻读一次。

darwin 上不再注入标题栏换色：preload 的探针元素只在 win32 创建
（`syncWindowsAppearance()` 在非 win32 直接返回），那边根本没有可改的条带，注入纯属多余的
`<head>` 变更。

`initial` 是初始值（`none`），作用是让元素**退出** app-region 计算，而不是把整块遮罩变成拖拽把手，
所以点击跳过照旧有效；`!important` 是必需的，官方那条选择器权重更高。看得到的区别：加了这条，
遮罩的 computed `-webkit-app-region` 是 `none`，官方 `[data-window-drag]` 标题栏行保持 `drag`；
去掉它，遮罩变成 `no-drag`（就是被吃掉的 bug）。`.verify/run-harness.mjs` 的
`darwin · window drag guard` 用例把这四个值都断言了；HUD 让位那三处由
`darwin · HUD reserve`（76px）、`…fullscreen before mount`、`…fullscreen after mount`（0px）覆盖。
顶部 40px 条带在这段时间归窗口拖动，点击跳过请点别处或按 `Esc`。
