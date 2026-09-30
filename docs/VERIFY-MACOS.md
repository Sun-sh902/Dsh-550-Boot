# macOS 真机验收清单

[← 回到 README](../README.md) · 自动化能覆盖的部分见 [VERIFICATION.md](VERIFICATION.md)

本地自动化（`npm run audit:leak`、`scripts/verify.mjs`、`*verify-p*.mjs` 快循环）只跑得动**客户端半边**：
宿主半边（`lib/index.js` 的首帧）是在 **DSH 启动时**装配进 index 注入表的，客户端 bundle 的 URL 又带
进程 nonce。所以下面这五项必须由人在真机上过一遍。

## 怎么让改动生效

```sh
# 一次性：让 profile 指向源码而不是 git 包，之后改完重启就生效
/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh \
  plugin --profile desktop add link:$HOME/dev/dsh-550-Boot
ls -l ~/.dsh/profiles/desktop/node_modules/dsh-550c-boot   # 必须是 symlink
```

之后每次改源码：**退出 DeepSeek Harness → 重新打开 → `Ctrl+Shift+R`**（客户端 bundle 的 `rev` 是
进程 nonce + immutable，不硬刷会沿用旧文件）。重启会结束当前会话，所以这一步不在自动化里做。
（切到 `link:` 之后 `~/.dsh/dsh-550c-boot-default-full.sh` 不再需要：默认档已经写在源码里。）

## 五项

| # | 怎么看 | 期望 |
|---|---|---|
| 1 | 冷启动，盯着从窗口出现到片头动起来那一段 | 不出现 `HARNESS / Loading plugins…` 卡片，也不出现超过约 3s 的纯色块；片头应在几百毫秒内接上 |
| 2 | 完整档播一遍，再点一下片子、再按一次 `Esc` | 完整档跑到 `SYSTEM IS REWRITTEN` 后淡出；点击和 `Esc` 都能立刻跳过并正常露出界面 |
| 3 | 片头播放中，用鼠标拖窗口顶部标题区（traffic light 那一带） | 窗口能被拖动、双击能缩放；片头不会把手势吃掉 |
| 4 | 设置 → 通用 → 550C 开机动画：切 关闭 / 简易 / 完整，再换配色，再点「预览」 | 三档与四种配色都立即生效；**播放中点「预览」要重新从头播**，且屏幕上始终只有一个遮罩 |
| 5 | 连着重启两次（其中一次中途按 `Esc` 跳过），打开 DevTools 控制台 | 没有残留报错，没有 `[dsh-550c-boot] watchdog fired` 日志；跳过之后也没有本该消失的定时器在跑 |

第 1、2、5 项直接对应本轮改动（首帧上限与退役条件、跳过路径的定时器）；第 3、4 项是回归面：拖拽守卫和
设置行没被碰到。

## 失败时先看哪

- 第 1 项出问题 → `lib/index.js`（`FIRST_FRAME_MAX_MS`、那条 watch 的判据）。
- 第 2 项出问题 → `src/client.js` 的 `mountOverlay()` / `finish()`，或 `src/show.js` 的 `createShow()`。
- 第 4 项"预览不重播"→ `src/client.js` `mountOverlay()` 的 `force` 分支。
- 第 5 项"定时器还在跑"→ 先在仓库根跑 `npm run audit:leak`，它会把残留 interval 的调用点栈打出来。

## 回到可控状态

```sh
# 看 profile 里到底装的什么
ls -l ~/.dsh/profiles/desktop/node_modules/dsh-550c-boot

# 退回 git 包（需要用发布版时）
/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh \
  plugin --profile desktop add dsh-550c-boot
```
