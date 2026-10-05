> 修订 2.0 说明：以下为上一版保存的来源与版本观测。本轮沿用工具选择，没有重新安装或复核全部版本；执行时以官方稳定版本与实际兼容性检查为准。新增平台边界依据见文末。

# 技术依据与版本记录

核实日期：2026-10-04。这里把事实依据与本项目设计决策分开。

## 版本基线

| 工具                                         | 本次核实结果                                | 执行策略                                       |
| -------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Vite                                         | 8.3.2，官方 Release 标记 Latest，2026-10-01 | bootstrap 再读 npm latest；写精确版本          |
| TypeScript                                   | 7.0.2，npm latest；7.0 已正式发布           | 使用正式 typescript/tsc，不使用 native-preview |
| Oxlint                                       | 1.86.0，2026-09-28 官方 Release             | 同时检查类型感知包兼容性                       |
| Oxfmt                                        | 0.71.0，正式 latest 标签，版本仍为 0.x      | 锁定，不把 0.x 描述成 1.0 稳定 API             |
| Node                                         | 24 LTS；26 当时为 Current                   | 选 LTS，而非为“最新”切 Current                 |
| oxlint-tsgolint                              | v7 正式公告与 TypeScript 7.0.2 对齐         | 执行时检查实际版本/依赖/CLI                    |
| pnpm / Vitest / Playwright / marked / @types | 本包不猜补丁版本                            | 执行时从 registry 解析、记录并锁定             |

没有在本次无网络的容器里安装这些 npm 包；上述来自网页核实。不能把该表当成项目构建已通过的证据。

## S1 · Vite 与 Rolldown

- https://github.com/vitejs/vite/releases
- https://vite.dev/blog/announcing-vite8
- https://vite.dev/config/build-options
- https://vite.dev/guide/

支持的事实：Vite 8 正式采用 Rolldown；当前 Release 可核实补丁版。Vite 8 的底层构建配置使用 rolldownOptions；本项目只有单 HTML 入口，无需定制这项配置。

## S2 · TypeScript 7

- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://registry.npmjs.org/typescript/latest

支持的事实：TypeScript 7 已正式提供原生 Go 编译器，常规包仍为 typescript，命令仍为 tsc。不能把 TS 原生实现称为 Rust。

## S3 · Oxlint 类型感知

- https://oxc.rs/docs/guide/usage/linter/type-aware
- https://oxc.rs/blog/2026-07-22-type-aware-linting-stable
- https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-floating-promises.html
- https://github.com/oxc-project/oxc/releases

支持的事实：类型感知需要 oxlint-tsgolint；Oxlint 与 tsgolint 分别承担 Rust lint 与 Go 类型相关工作。需要与实际 TypeScript 版本兼容，不是开一个无依赖开关即可。

## S4 · Oxfmt

- https://oxc.rs/docs/guide/usage/formatter.html
- https://oxc.rs/docs/guide/usage/formatter/config.html
- https://oxc.rs/docs/guide/usage/formatter/editors.html
- https://github.com/oxc-project/oxc/releases/tag/oxfmt_v0.71.0

支持的事实：可用独立 npm CLI；oxfmt --check；支持配置与官方编辑器扩展。并非所有格式处理都必然纯 Rust；选用的是这一工具，而非“整条链100% Rust”的宣传。

## S5 · 用户触发的权限

- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab

支持的事实：activeTab 由用户动作触发临时访问，不必默认申请全站长期权限。具体行为必须真实工具栏验收。

## S6 · 脚本注入

- https://developer.chrome.com/docs/extensions/reference/api/scripting

支持的事实：注入函数会序列化并失去闭包；异步函数可返回 Promise；只指定目标 tab 顶层。函数安全、自包含仍由本项目实现与测试负责。

## S7 · popup 生命周期

- https://developer.chrome.com/docs/extensions/develop/ui/add-popup

支持的事实：popup 不是常驻页面，失焦会关闭。本项目“准备中关闭就丢弃”是主动选择，不是 Chrome 自动提供后台任务保证。

## S8 · 下载状态

- https://developer.chrome.com/docs/extensions/reference/api/downloads

支持的事实：downloadId、onChanged、search({id})、filename、uniquify；启动与完成不同。没有从该页推导出本项目4 MiB一定可用。

## S9 · data URL 的实现依据

- https://chromium.googlesource.com/chromium/src/+/4a8573cb240df29b0e4d9820303538fb28e31d84/chrome/browser/extensions/api/downloads/downloads_api_browsertest.cc

Chromium 历史测试包含 Downloads API 的 data URL 下载案例。本项目仍必须测试当下浏览器、UTF-8、上限、popup 关闭及磁盘字节。
浏览器下载记录可能包含来源 URL；因此本项目不承诺“本机不留聊天痕迹”。

## S10 · Playwright 扩展测试

- https://playwright.dev/docs/chrome-extensions

支持的事实：扩展测试用 persistent Chromium context；官方示例常通过 service worker 取 ID，但本项目没有 worker，不应反向加架构只为套示例。

## S11 · Markdown token 与 Node

- https://marked.js.org/using_pro
- https://nodejs.org/en/about/previous-releases

支持的事实：marked 提供 lexer/token 等扩展能力；Node24 当时仍为 LTS。纯文本输出的具体规则是本项目产品决定，不是 marked 的默认行为。

## S12 · 内部会话数据：参考，不是契约

- https://github.com/devcxl/chatgpt-markdown-exporter
- https://github.com/rashidazarang/chatgpt-chat-exporter

这些维护者的一手项目说明展示了从 ChatGPT 会话记录导出的实际路线，以及页面虚拟化、分支等兼容性问题。它们不是 OpenAI 官方接口文档，也不能证明本包候选端点在用户所有工作区都可调用。

本次读取到了仓库说明，但部分 raw 源文件抓取失败；本包没有声称完成逐文件源码审计。Codex 应核对实际响应和选用依赖的许可证；不要把第三方代码无署名搬入项目。

## S13 · 服务条款与官方替代途径

- https://openai.com/policies/terms-of-use/
- https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data

条款含程序化提取限制。适用地区、账户协议、是否有例外应另行确认；本包没有找到可依赖的“自用扩展自动获豁免”官方说明。官方数据导出不属于这次两个按钮的实现范围。

## S14 · 商店政策，发布前复核

- https://developer.chrome.com/docs/webstore/program-policies/policies
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

发布前核实最小权限、隐私披露、数据处理和远程代码规则。本包不代替法律意见，不自动发布。

## 修订 2.0 补充依据

- Chrome activeTab：用户主动动作授予当前 tab 的临时 host 访问，不等于所有未来域名永久授权。
  https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- Chrome permissions：声明与按需权限需要和实际能力一致，未来新平台如需额外权限应单独评估。
  https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- GitHub 创建仓库：仓库在选定 owner 下创建；本包只有命名建议，没有执行创建。
  https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository

平台接口设计是本项目的工程决策，不是声称五个平台已经有统一可用 API。
