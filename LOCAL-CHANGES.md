# 本地改动（相对上游）

这个目录**不是**上游仓库的克隆，而是一份带本地改动的检出版本：上游 `0.1.4` 的 GitHub tarball 解包
（解出来时没有 `.git`），本地 `git init` 后补了 baseline commit `08f8ec8`，之后的改动都在这个仓库里。

这份文件只记**重装 / 更新时会被静默丢掉的东西**，其余改动 `git log` 里都有。

## 有意偏离上游：默认档是 `full`

| | 上游 | 本地 |
|---|---|---|
| `src/client.js` 的 `DEFAULT_MODE` | `'simple'`（只播 logo，约 4s） | **`'full'`**（完整覆写流程，约 11.5s） |

这是有意为之：本机默认就要看完整片头。设置里的「关闭 / 简易 / 完整」仍然按浏览器优先级更高 ——
显式的选择存在 `localStorage['dsh-550c-boot:mode']`，`DEFAULT_MODE` 只是**没有存过偏好时**的兜底
（唯一例外：系统开了「减弱动态效果」时兜底走 `'simple'`，见 `src/client.js` 的 `readMode()`）。

### 为什么它不会被静默丢掉

- 改在**源码**里，`npm run build` 会把它带进 `lib/client.js`；CI 的
  `git diff --exit-code -- lib/client.js` 守着"产物必须由源码复现"这条。
- desktop profile 用 `link:` 指向本目录（`ls -l ~/.dsh/profiles/desktop/node_modules/dsh-550c-boot`
  应当是指向 `~/dev/dsh-550c-boot` 的 symlink），所以改完**重启 DSH** 即生效，不再需要去 patch 安装副本。
- `~/.dsh/dsh-550c-boot-default-full.sh` 是"profile 装的是 git 包、每次更新会被 pnpm 重新解包覆盖"那
  种情况的补丁脚本。切到 `link:` 之后它已经不需要了；万一退回 git 包安装，它仍然可用（脚本自己会判断
  目标是 `simple` 还是已经是 `full`）。

### 什么时候必须再确认一次

- 从**新的上游 tarball** 重新解包（新目录里这行会回到 `'simple'`）；
- `dsh plugin --profile desktop add github:yannicksong0106/dsh-550c-boot`（退回 git 包安装）。
  这一条要特别小心：**它会把本地改动整套换掉**——包不在 npm 上（`npm view dsh-550c-boot` 是 404），
  git 包装的是上游那份 `src/client.js`，`DEFAULT_MODE` 会回到 `'simple'`，所以退回去之后必须重新打一遍
  （改 `src/client.js`，或恢复成本仓库的 `link:` 安装）；
- 任何"从上游同步 `src/`"的操作。

一行检查：

```sh
grep -n "const DEFAULT_MODE = " src/client.js      # 期望：const DEFAULT_MODE = 'full'
```

## 这个检出相对上游还多了什么

全部以 commit 的形式在上游之上，没有额外的 patch 文件：

```sh
git log --oneline 08f8ec8..HEAD
```

要点：首帧上限 3s 与 `#root` 指纹兜底（`lib/index.js`）、`prefers-reduced-motion` 兜底到简易档和
播放中点「预览」重播（`src/client.js`）、弹窗时钟自停（`scripts/extract.mjs` 的 rewrite，不是
`assets/550C-source.html`）、macOS 浏览器探测与泄漏审计（`scripts/browsers.mjs`、`tools/leak-audit.mjs`）。
重建目录后要么 cherry-pick 这些 commit，要么照着 `git log -p` 重做。

## 重建后自查

```sh
npm run build && git diff --exit-code -- lib/client.js    # 产物与源码一致（CI 也在盯）
npm run check                                             # 两半都能解析
npm run audit:leak                                        # 跳过片头后不残留 interval（需要 Chrome）
grep -n "const DEFAULT_MODE = " src/client.js             # 仍然是 'full'
```
