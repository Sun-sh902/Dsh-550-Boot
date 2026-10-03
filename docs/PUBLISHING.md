# 发布清单：Dsh-550-Boot

本仓库是 Sun-sh902 在 MIT 上游 dsh-550c-boot 0.1.4 基础上的独立衍生项目。
Ziyang Song 和 Voidpoket 的贡献见 [CREDITS.md](../CREDITS.md)，版权与许可见 [LICENSE](../LICENSE)。

本仓库仅提供 GitHub 直装，不发布 npm，不向上游或市场提交 issue / PR。
原来的市场投稿清单已随上游仓库独立出去，本仓库删除其本机遗留副本。
上游旧的 Hub issue、市场收录、npm 包名与 tarball 均属于上游历史，与本仓库发布状态无关。
package.json 中保留的 dshWorkshop / publishConfig 是兼容元数据，不表示本仓库已经上架或发布 npm。

## GitHub 直装

```sh
dsh plugin --profile web add github:Sun-sh902/Dsh-550-Boot
dsh plugin --profile desktop add github:Sun-sh902/Dsh-550-Boot
```

首次安装后需要重启 DSH；升级后硬刷新客户端。不要同时启用本插件与上游片头插件，
二者共享兼容用的设置行 id 与 localStorage 键，可能重复挂载。

## 提交前检查

- 保留 MIT 正文、Ziyang Song 的版权声明与 Voidpoket 原稿署名；550W 字标如实标为影片画面描摹。
- 检查敏感信息与作者邮箱；历史清理必须先备份，并由仓库所有者明确授权。
- .render/、.verify/、node_modules/、*.log 均由 .gitignore 排除，不进入公开仓库。
- 只通过构建生成 lib/client.js；550C 移植输入 assets/550C-source.html 及其生成源码保持字节一致。
- 包名、cordis.patch.yml 的挂载包名、浏览器模块 id 必须一致为 dsh-550-boot。
  为已有偏好兼容，boot-550c 等设置 id 与 dsh-550c-boot:* 存储键不改。

```sh
npm run build
npm run check
git diff --exit-code -- src/variants/550c assets/550C-source.html
git ls-files | grep -E '^\.render/|^\.verify/|ref-550w-mark'
```

最后一条应无输出；它是排除断言，无匹配时 grep 返回 1。

## 独立公开仓库

首次提交与所有验收成立后，由 Sun-sh902 账号创建 Dsh-550-Boot 公开仓库并推送 main。
不使用 fork，不覆盖同名仓库，不强制推送。遇到同名仓库或权限失败，停止并报告原始错误。

## 干净 clone 验证

```sh
git clone https://github.com/Sun-sh902/Dsh-550-Boot.git
cd Dsh-550-Boot
npm run build
npm run check
git diff --exit-code -- lib/client.js
```

构建本身不依赖 node_modules；如需使用依赖工具，可先 npm install --no-audit --no-fund。
本仓库沿用的 dependencies / dshWorkshop 等既有字段未因开源发布而删改。
