# ChatCarry

把有用的 AI 对话带走：复制纯文本，或导出 Markdown。首版只支持 ChatGPT，后续平台分别接入。

**当前阶段实现了会话读取与分支校验。** 打开扩展会读取当前已保存对话并显示消息数量；渲染、复制和下载尚未实现，两个按钮保持禁用，不发布产品安装包。真实站点的支持范围与已知限制见实施报告。

## 开发环境

- Node.js **24.21.0**，由 `.nvmrc` 固定；可使用 `fnm install` / `fnm use`，或已有的 nvm。
- pnpm **12.9.1**，由 `package.json#packageManager` 固定。
- Vite、TypeScript、Oxlint、Oxfmt、Vitest、Playwright 等依赖使用精确版本，提交 `pnpm-lock.yaml`。
- 初始化版本记录见 [toolchain-resolved.json](docs/toolchain-resolved.json)。依赖已选定，日常安装不再解析 `latest`。

```bash
# 切换到 .nvmrc 指定的 Node 后执行；首次需要 npm registry 网络
node tools/bootstrap.mjs
# 安装独立测试浏览器，不使用个人 Chrome profile
node tools/pnpm.mjs exec playwright install chromium
# 本阶段的完整检查
node tools/pnpm.mjs check:reading
```

项目包装器会使用固定 pnpm，可绕过缺失或损坏的全局 pnpm/Corepack 入口。已有正确 pnpm 时也可直接执行 `pnpm <command>`。bootstrap 始终使用 frozen lockfile；锁文件缺失或与依赖不一致会失败，不会自动改版本。

## 日常开发

```bash
node tools/pnpm.mjs dev
```

在 `chrome://extensions` 开启开发者模式，加载 `dist/`；代码变化后刷新扩展。在已保存 ChatGPT 对话上点击工具栏图标，等待读取结果；本阶段两个交付按钮保持禁用。

[ui/preview.html](ui/preview.html) 是离线设计参考，使用演示数据，不属于生产扩展，也不进入 `dist/`。

## 检查命令及含义

以下命令均可通过 `node tools/pnpm.mjs <command>` 执行。

| 命令                  | 验证范围                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `check:foundation`    | 包结构、静态模块边界、格式、lint、全部 TS 类型、打包工具测试、生产构建、扩展壳浏览器测试 |
| `test:foundation`     | 隔离临时目录内的打包成功、ZIP 字节、拒绝占位代码、目录越界与额外权限                     |
| `test:foundation:e2e` | 明暗两种主题下加载构建后的扩展页面；先执行 `build`                                       |
| `test`                | 全部 Vitest 测试，包括保留的业务契约；本阶段预期失败                                     |
| `test:reading`        | 读取边界、分支与内容归一化、popup 总超时和旧结果丢弃                                     |
| `test:e2e`            | 生产压缩函数在真实 Chromium MAIN 环境读取合成页面；先执行 `build`                        |
| `check:reading`       | 基础检查 + 读取单元测试 + 合成读取浏览器测试                                             |
| `check`               | 完整产品工程检查；本阶段会因业务尚未实现而失败                                           |
| `package`             | 发布打包；存在业务占位时拒绝生成 ZIP                                                     |

**读取阶段通过不代表导出功能可用。** 没有删除、skip 或弱化原有业务断言；不将业务失败改成预期成功。

浏览器测试使用 Playwright 自带 Chromium 和独立临时 profile。测试副本追加公开 manifest key；读取测试另加仅用于合成页面的 ChatGPT host 权限，完整拦截 HTTP 请求。生产 JS 保持不变，生产 manifest 没有长期 host 权限。普通扩展 tab 测试与真实工具栏 activeTab 验收分开记录。

[GitHub Actions](.github/workflows/ci.yml) 当前运行明确命名的 Reading stage 检查，依赖与 Actions 提交均固定。业务阶段完成后，应切换为完整 `check` 门禁；推送前无法将本地结果称为远端 CI 通过。

## 方案与下一阶段

- [SPEC.md](SPEC.md)：产品范围和完整实现规格。
- [ACCEPTANCE.md](ACCEPTANCE.md)：业务与浏览器验收。
- [AGENTS.md](AGENTS.md) / [CODEX_TASK.md](CODEX_TASK.md)：当前阶段边界。
- [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md)：分阶段实际验证和剩余工作。
- [KIT_VALIDATION.md](KIT_VALIDATION.md) / [REVIEW.md](REVIEW.md)：原始实施包的历史检查，不能替代当前工程测试。
- [docs/ADDING_A_PLATFORM.md](docs/ADDING_A_PLATFORM.md)：后续平台接入边界。

当前只注册 ChatGPT，其他平台没有实现。下一步在用户明确开始后实现文本与 Markdown 渲染，再接入复制和下载。本阶段只使用用户指定会话验收，不推送、不发布。
