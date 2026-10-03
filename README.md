# Dsh-550-Boot

[中文](README.md) | [English](README.en.md)

[![Stars](https://img.shields.io/github/stars/Sun-sh902/Dsh-550-Boot?style=flat-square&logo=github&label=Stars)](https://github.com/Sun-sh902/Dsh-550-Boot/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/Sun-sh902/Dsh-550-Boot?style=flat-square)](https://github.com/Sun-sh902/Dsh-550-Boot/commits/main)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Topic](https://img.shields.io/badge/topic-dsh--plugin-blue?style=flat-square)](https://github.com/topics/dsh-plugin)
## 来源与致谢

本项目的上游是 **Ziyang Song（[@yannicksong0106](https://github.com/yannicksong0106)）** 的开源项目
**[dsh-550c-boot](https://github.com/yannicksong0106/dsh-550c-boot)**（MIT 许可）——
**550C 片头动画出自该项目**；其中 550C 动画的 HTML 原稿由
**Voidpoket（[@Voidpoket](https://github.com/Voidpoket)）** 提供。
本仓库在其基础上增加了 550W 与 550A 两个机型、终端工作台版式与相应的构建/验证脚手架。
感谢两位作者。

本仓库的新增改造由 **Sun-sh902**（[@Sun-sh902](https://github.com/Sun-sh902)）完成；550A 目前仅为开发中占位。

## 非官方声明

本项目是非官方的粉丝作品，与《流浪地球》系列电影及其版权方、与 DeepSeek 官方均无隶属关系。
影片名称与相关标识的权利归其各自所有者所有；仓库内的 550W 字标为参考影片画面自行描摹的矢量图，
仅用于学习与演示；如权利方有异议，请开 issue，我们会立即调整或移除。

**给 DeepSeek Harness（DSH）加上 550C / 550W 开机片头与 550A 开发中占位。**
每次启动客户端全屏播放，播完渐出，露出真正的界面。550C 保留上游移植流程；
550W 为 8 拍、6 个窗口的终端工作台，包含诚实倒计时、地球发动机淡蓝喷焰与 550C 式结尾。

![完整模式：47 节点逐点覆写](docs/preview-full.png)

- 🎬 **机型与档位独立**：550C 沿用上游流程；550W 简易档 3.05 秒 / 完整档 15.45 秒，可一键关闭；550A 仅占位
- ⏭️ **随时跳过**：点击画面或按 `Esc`
- 🖥️ **盖住 DSH 自己的开机卡片**：首帧由宿主半边在文档解析阶段注入，`HARNESS / Loading plugins…` 不会再露脸
- 🎨 **四套磷光配色**，默认是原作者的琥珀；桌面窗口右上角那三个原生按钮会被收编成同一套颜色

## 安装

```sh
# GitHub 直装；仓库带构建产物，无安装期脚本
dsh plugin --profile web add github:Sun-sh902/Dsh-550-Boot

# 桌面 profile 使用同一条 GitHub 路径
dsh plugin --profile desktop add github:Sun-sh902/Dsh-550-Boot
```

装完**必须重启一次 DSH**（bundle 在启动时装配）。升级或重装后请按 **Ctrl+Shift+R** 硬刷新——
DSH 的客户端 bundle 带 `max-age=31536000, immutable`，而 URL 上的 `rev` 是进程 nonce、不随内容变化，
普通 F5 会一直用第一次抓到的副本。

## 使用

模式开关在 **设置 → 通用 → 550C 开机动画**，旁边有「预览」按钮可以立刻看一遍。
同页选择 550C / 550W / 550A 与配色；旧设置行 id 和 localStorage 键为兼容已有偏好继续保留。

| 档位 | 时长 | 内容 |
|---|---|---|
| **简易** | 550W 3.05 秒；550C 沿用上游 | logo 逐路径书写 |
| **完整**（本仓库默认） | 550W 15.45 秒；550C 沿用上游 | 550C 覆写流程 / 550W 终端工作台、倒计时、喷焰与「接入成功」 |
| **关闭** | — | 不播放，一张黑屏都不会出现 |

- 动画**播完才渐出**，不等软件加载状态；无论 DSH 是否早已就绪都会完整播完；正常退场时间另计
- 系统开启减少动态效果时，未保存的模式偏好默认采用简易档；550W 的羽流为静态形状，不播放白闪
- 完整档下**点击画面或按 `Esc`** 跳过
- 偏好存在浏览器 `localStorage`（键 `dsh-550c-boot:mode`），与已装的第三方设置行做法一致
- 每次客户端加载都会播（刷新页面也算）；「每个会话只播一次」需要额外去重，目前故意不做

### 配色

| 方案 | 说明 |
|---|---|
| **琥珀**（默认） | 不覆盖机型自身 token：550C 为上游琥珀 CRT；550W 为中性工作台与红色警示 |
| 绿 | P1 绿磷光终端 |
| 青 | 冷青磷光 |
| 白 | P4 白/灰磷光 |

「琥珀」故意没有对应的 CSS 块：选它会把 `data-scheme` 整个清掉，默认值重新接管。
550W 结尾固定沿用 550C 琥珀，淡蓝色仅用于地球与 EARTH ENGINE 两处喷焰。

![简易模式](docs/preview-simple.png)
![青磷光配色](docs/preview-cyan.png)

## 兼容与限制

- **DSH 版本要求 `>=0.2.0-rc.1`**（`package.json#dsh.engines`）。宿主半边依赖 `webserver/index-inject`
  的行渲染行为，我只在 `0.2.0-rc.1` 上实测过，不声明没验过的下限。在更低的宿主（如 `0.1.7-rc.2`）上
  安装能过，但之后的应用内更新会被以 412 拒掉；需要 `0.1.7` 支持可以提 issue。
- 只能在 **Web UI 加载之后**覆盖全屏，做不到早于 Electron 窗口首帧（窗口本身仍有一瞬间空白）。
- 首帧是一块**纯色**（动画自己的底色），不是动画的第一帧画面——它只负责在插件求值前占住屏幕。
- 桌面窗口的原生按钮仍在，只是被改成同一套配色；要去掉得改桌面壳。
- macOS 上片头播放期间，顶部条带归窗口拖动，点击跳过请点别处或按 `Esc`。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 工程结构、为什么是「提取」而不是重写、启动时序与首帧注入策略 |
| [docs/ENHANCEMENTS.md](docs/ENHANCEMENTS.md) | 内容增强层：等宽字体、字符单元进度条、真实时钟戳、固件页脚与 CRC32 |
| [docs/DESKTOP-CHROME.md](docs/DESKTOP-CHROME.md) | 桌面标题栏三个按钮的让位与换色、macOS 拖拽守卫 |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | 构建与验证：harness 探针、真实 GUI 的 CDP 截图断言 |
| [docs/PUBLISHING.md](docs/PUBLISHING.md) | 本仓库发布：仅 GitHub 直装，含构建复现与署名检查 |
| [docs/PLAN-macos-and-update-check.md](docs/PLAN-macos-and-update-check.md) | 评估稿：macOS 适配待办、设置里的「检查更新」方案对比 |
| [docs/VARIANTS.md](docs/VARIANTS.md) | 机型维度（550C / 550W / 550A）：与档位、配色如何正交，新增机型要动什么；550C 与 550W 已实装，550A 仍是「正在开发」占位 |
| [LOCAL-CHANGES.md](LOCAL-CHANGES.md) | 本地改动（相对上游）：默认档 `full` 这一类重装后会被静默丢掉的偏离 |

> 顶部徽章使用 shields.io 外部图片，加载不出来不影响 README 本身。

## 致谢

动画与 HTML 原稿由 **Voidpoket**（[@Voidpoket](https://github.com/Voidpoket)）提供，插件工程与移植由
**Ziyang Song**（[@yannicksong0106](https://github.com/yannicksong0106)）完成。详见 [CREDITS.md](CREDITS.md)。

[MIT](LICENSE) © 2026 Ziyang Song；© 2026 Sun-sh902（本仓库改造）。完整三方署名见 [CREDITS.md](CREDITS.md)。
