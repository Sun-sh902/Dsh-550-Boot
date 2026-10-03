# 致谢 / Credits

## 550C 片头动画与 HTML 源码 —— Voidpoket

这个插件的动画不是重写的，是**移植**的：`assets/550C-source.html` 是 **Voidpoket**（GitHub:
[@Voidpoket](https://github.com/Voidpoket)）提供的 550C 片头页面原稿，本仓库的 `scripts/extract.mjs`
只对它做定点改写（`:host` 作用域、可取消定时器、去掉页面级监听等），样式表、DOM 结构与动画脚本逐字保真。
配色（琥珀 CRT 阶梯）、面板布局、时间线节奏都出自这份原稿。

- 原稿：`assets/550C-source.html`（归档，构建的输入）
- 改写清单与理由：见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 的表格

> 若版权方希望采用不同的署名方式或许可条款，开个 issue 说明即可，这里按你的意思改。

## 上游插件工程 —— Ziyang Song

插件工程（宿主半边首帧注入、遮罩层挂载策略、内容增强层、设置行、验证脚手架）由
**Ziyang Song**（[@yannicksong0106](https://github.com/yannicksong0106)）编写，MIT 许可。
上游项目为 **[dsh-550c-boot](https://github.com/yannicksong0106/dsh-550c-boot)**；
本仓库以其 0.1.4 版本为移植与工程基础，保留原版权声明和 MIT 许可正文。

## 本仓库改造 —— Sun-sh902

**Sun-sh902**（[@Sun-sh902](https://github.com/Sun-sh902)）负责本仓库的改造：
550W 机型（完整档 15.45 s / 简易档 3.05 s）、550A 开发中占位、
终端工作台版式，以及 `tools/` 下的探针与验证工具和相应脚手架改造。

550W 已实装，550A 仍为矢量/CSS 的「正在开发」占位。
`assets/550w-wordmark.svg` 是参考影片画面自行**描摹**的矢量图，不是原创字标；
参考剧照不在公开仓库中，也未嵌入插件。代码的 MIT 许可不授予影片名称或相关标识的权利。

本项目是非官方的粉丝作品，与《流浪地球》系列电影及其版权方、与 DeepSeek 官方均无隶属关系。
影片名称与相关标识的权利归其各自所有者所有；仓库内的 550W 字标为参考影片画面自行描摹的矢量图，
仅用于学习与演示；如权利方有异议，请开 issue，我们会立即调整或移除。

## 依本文档之外的第三方

- 移植后的动画代码不引入任何运行时依赖；`react` 只是客户端插件可选的 external（设置行用）。
- 预览截图里的 550C 界面全部来自上面那份原稿，没有第三方素材。
- 550W 的参考图（用户提供的影片字标截图）只用于测量与描摹，**不在仓库里**，也没有被嵌进插件。
