# ChatCarry

把有用的 AI 对话带走：复制纯文本，或导出 Markdown。当前只支持桌面 Chrome 中已登录的 ChatGPT 已保存会话。

**读取、转换、复制和下载已实现。** 两个按钮使用同一份当前分支快照，每次交付前重新核对页面；无法确认分支、仍在生成、正文未知或超出上限时明确失败。真实使用已验证一条用户授权会话，其他账号、长会话和再生成分支的实机覆盖仍有限，详见 [实施报告](IMPLEMENTATION_REPORT.md)。

## 本地安装

开发环境固定为 Node 24.21.0 与 pnpm 12.9.1。依赖版本见 [工具链记录](docs/toolchain-resolved.json)。

```bash
node tools/bootstrap.mjs
node tools/pnpm.mjs build
```

在 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，加载 `dist/`。代码更新后重新构建并刷新扩展。

打开一段已保存的 ChatGPT 对话，点击工具栏中的 ChatCarry，等待读取完成：

- **复制纯文本**：去除助手正文的排版标记，保留代码、列表和表格内容；用户字面原文保留。若浏览器拒绝复制，展开只读文本框供手动复制。
- **导出 Markdown**：保留 Markdown 源文，以中文/Emoji 标题生成安全的 `.md` 文件名。同名文件自动另取名称；界面区分下载启动、完成和中断。

每种输出最多 4 MiB（UTF-8），不截断。图片、文件与音频仅保留占位，不是完整媒体备份。仅支持当前已保存分支，不支持批量历史、共享或临时会话、其他 AI 平台。

## 开发和验证

```bash
# 独立测试浏览器，不使用个人 Chrome profile
node tools/pnpm.mjs exec playwright install chromium
node tools/pnpm.mjs check
node tools/pnpm.mjs package
# 监听构建；变化后在 Chrome 刷新扩展
node tools/pnpm.mjs dev
```

`check` 执行包结构与边界检查、格式、类型感知 lint、类型检查、全部单测、生产构建和浏览器用例。`package` 检查生产目录后生成 `release/chatcarry-0.1.0.zip`；ZIP 根目录直接包含 manifest，解压后也可本地加载。

在 GitHub 的 **Actions → Validation → Run workflow** 选择 `main`，也可手动运行同一套检查和打包。成功后，在该次运行底部的 **Artifacts** 下载 `chatcarry-extension`，解开外层压缩包即可得到扩展 ZIP；本地安装需再解压扩展 ZIP，然后加载其中含 `manifest.json` 的目录。

当前工作流只生成安装包，不上传商店或提交审核。首次上架须在商店后台创建条目并补齐资料；后续自动上传可使用官方 Chrome Web Store API v2，需另外配置 Google Cloud API 授权。商店图片和填写资料见 [商店文案](docs/store-draft.md)。

可分别运行 `test`、`test:reading`、`test:foundation`、`test:foundation:e2e`、`test:e2e`。读取阶段保留的 `check:reading` 是检查子集，不能替代完整 `check`。

浏览器用例使用临时 Chromium profile、下载目录和生产 JavaScript 的副本。测试只在临时 manifest 中增加公开 key 和合成页面权限；HTTP(S) 全部合成或阻止。仅替换当前标签页选择，真实 scripting、剪贴板、downloads API 与磁盘字节单独验证；事件竞态、取消与旧请求由单测补充。普通扩展 tab 的关闭测试不等于真实工具栏 popup 的所有生命周期行为。

[GitHub Actions](.github/workflows/ci.yml) 配置执行完整 `check` 与打包。依赖、Node/pnpm 和 Actions 提交固定；当前本地新增改动的 CI 必须在推送后另行核实。

## 隐私与资料

正文在本地转换，不上传到开发者服务器；读取会与 chatgpt.com 通信。复制内容由系统剪贴板管理；下载文件和浏览器下载记录（可能含正文 data URL）会保留数据。详见 [隐私说明](privacy.md)。没有后台采集、聊天数据库或其他平台的预授权。

- [SPEC.md](SPEC.md) / [ACCEPTANCE.md](ACCEPTANCE.md)：范围与验收条件。
- [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md)：实际验证、实机范围和剩余限制。
- [ui/preview.html](ui/preview.html)：离线视觉参考，演示逻辑不进入生产包。
- [docs/ADDING_A_PLATFORM.md](docs/ADDING_A_PLATFORM.md)：后续真实平台接入约束。
- [docs/store-draft.md](docs/store-draft.md)：尚未发布的商店文案。

项目未提交 Chrome Web Store，也不代表 OpenAI 官方授权。
