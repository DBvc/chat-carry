# ChatCarry 实施包修订 2.0 验证

日期：2026-10-04。验证对象是方案、starter 与离线原型，不是已完成的 Chrome 扩展。

| 实际检查         | 结果及边界                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| verify-kit       | PASS：文件、相对链接、JSON、Node 脚本语法、16 个原有合成场景的手工路径标签                                                                              |
| check-boundaries | PASS：三个 core 模块无平台导入；仅一个 ChatGPT 注册；权限未增加。仅静态辅助检查                                                                         |
| 原有样本与范围   | PASS：5 个输入/期望文件字节不变，依赖声明、运行环境目标及四项权限不变                                                                                   |
| 局部 TypeScript  | PASS：环境自带 TS 5.8.3 检查 10 个 starter 源文件类型；12 个源/测试 TS 文件语法无错误。不等于目标工具链完整类型检查                                     |
| 适配边界执行     | PASS：本地转译后执行 resolver 的 3 个正例、10 个拒绝来源；complete/partial/unknown、空正文、来源空 ID 和媒体 warning 门禁。不是 Vitest 或浏览器集成测试 |
| 打包器隔离检查   | PASS：合成 dist 的 ZIP CRC、根 manifest、文件字节与 chatcarry 前缀；有 stub 时拒绝发布。没有生成真实产品 dist                                           |
| UI 原型          | PASS：离线 HTML 的品牌/来源标签、恰好两个主要动作、9 个状态、重试和手工复制兜底、演示 MD 字节                                                           |
| 原型视觉         | PASS：重渲染浅色、深色和 390px 窄屏参考页，无横向溢出；已查看默认与窄屏截图                                                                             |
| 原型请求与错误   | PASS：无外部请求、无 pageerror；不代表真实扩展权限已验收                                                                                                |

机器可读记录见 [docs/kit-validation.json](docs/kit-validation.json)。

## 未完成的验证

制作环境 Node 22.16.0，目标环境沿用 Node 24。本轮没有执行依赖 bootstrap、目标版本
TypeScript/Oxlint/Oxfmt、Vite 构建、Vitest 业务或真实扩展 E2E。没有编造锁文件。

Playwright 自带浏览器缺失，改用已经安装的 Chromium 144.0.7559.96 载入自包含 HTML，
未安装新浏览器、未访问用户 profile。检查的是离线原型，不是 Chrome 工具栏 popup。
真实剪贴板成功、activeTab 授权、关闭 popup 后下载和真实 ChatGPT 均未完成验证。

DeepSeek、Claude、Grok、Gemini 没有实现或注册，更没有实测。Fixture AI 只是用于验证通用模型与渲染接口的人工测试数据。
业务 stub 仍抛 NOT_IMPLEMENTED；发布脚本拒绝把 starter 冒充成品。未创建 GitHub 仓库。

Codex 最终仍须按 [ACCEPTANCE.md](ACCEPTANCE.md) 实现并验收，缺少授权真实会话时报告 LIVE_NOT_VERIFIED。
