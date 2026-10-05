# 验收与完成条件

本表是行为要求，不是“支持更多功能”的待办清单。对应 SPEC 的既定范围。

## 1. 纯函数与数据测试

| ID  | 用例                                    | 必须满足                                        |
| --- | --------------------------------------- | ----------------------------------------------- |
| D01 | 简单两条消息                            | 两种输出与 expected 文件精确匹配                |
| D02 | 两次相同“继续”                          | 两条都保留，不能按文本去重                      |
| D03 | 多分支，选中第二版                      | 只导出 current_node 祖先路径，不包含第一版      |
| D04 | mapping key 与 message.id 不同          | ID 匹配与分支核对仍正确                         |
| D05 | 断裂父链/环                             | 明确失败，不输出截断路径                        |
| D06 | 人工生成 240 条长会话                   | 首尾、中间、数量和顺序都对；不依赖 DOM 挂载数量 |
| D07 | in_progress / 页面生成中                | 两按钮不可交付半截回答                          |
| D08 | 用户含 Markdown 字面符号                | TXT 不误删用户的 `a_b`、`*`、`#`                |
| D09 | 代码含反引号和特殊引用 token            | 代码字节/空白不被正文清洗破坏                   |
| D10 | 标题、链接、列表、任务列表、表格、LaTeX | TXT 可读；MD 保留源结构                         |
| D11 | hidden / system / tool / analysis       | 不进入用户导出文件                              |
| D12 | 已知图片/附件                           | 明确占位与 warning，不能当作已备份文件          |
| D13 | 未知正文结构                            | CONTENT_UNSUPPORTED，不用空字符串掩盖           |
| D14 | 原始内部引用 token                      | 非代码区变成说明；代码区不修改；不编造 URL      |
| D15 | 空会话/只剩内部消息                     | 不覆盖剪贴板，不写只有标题的文件                |
| D16 | filename 中文、Emoji、路径、CON、过长   | 单一安全 .md 文件名，无目录穿越和覆盖           |
| D17 | 4 MiB 输出与超过上限                    | 边界样本正确；超限明确拒绝，不切片              |
| D18 | UI 输入 `<img onerror>` 等              | 不执行 HTML，不额外发网络请求                   |

初始 fixtures 均为合成数据，只说明本项目应如何处理这些结构。不能据此宣称当前 ChatGPT 一定返回完全相同字段。

## 2. 浏览器与操作测试

| ID  | 用例                                          | 必须满足                                           |
| --- | --------------------------------------------- | -------------------------------------------------- |
| B01 | 打开非 ChatGPT / 相似恶意域名                 | 无注入、无网络、无剪贴板修改                       |
| B02 | shared / temporary / 新会话                   | 明确不支持，不能误导出其他会话                     |
| B03 | 权限拒绝、401、403、404、429、超时、HTML 响应 | 一种可理解错误；无无限重试                         |
| B04 | 读取期间切换路由/分支                         | 丢弃旧结果；不混内容                               |
| B05 | 重试后旧请求较晚返回                          | 旧 requestId 不更新 UI                             |
| B06 | 开 popup，不点击                              | 可以准备快照；不能写剪贴板或下载                   |
| B07 | 复制成功/权限失败                             | 成功后反馈；失败显示同一文本手动复制；不回读剪贴板 |
| B08 | 中文/Emoji 的真实下载                         | 磁盘字节等于 Markdown UTF-8，扩展名为 .md          |
| B09 | 下载返回 ID，尚未 complete                    | 显示启动，不虚报完成；处理先到事件/补查竞态        |
| B10 | 下载取消、中断、同名文件                      | 能重试，不覆盖，不删除历史                         |
| B11 | 读取中关闭 popup                              | 无迟到复制/下载；重新打开重新准备                  |
| B12 | 下载已提交后关闭 popup                        | 磁盘文件仍完整；4 MiB 边界也测试                   |
| B13 | Vite 压缩构建的 MAIN 函数                     | 无闭包 helper 错误；只顶层注入                     |
| B14 | 探针显示与 current_node 分支冲突              | 不盲目导出错误版本                                 |
| B15 | 已登录响应含额外敏感元数据                    | popup 只收到白名单投影；token 不在日志/消息/文件   |

### 实际扩展测试的边界

Playwright 使用自带 Chromium 的 persistent context。生产 manifest 无 service worker，**不能照抄等待 worker 来取得扩展 ID** 的示例。

可为测试构建单独的 `dist-test`：生成临时公开 manifest key 得到固定 ID；对本地 fixture origin 添加仅测试用 host_permissions；正式 dist 不得含该 key、测试权限、测试 URL 或测试选择器。

通过真实 chrome.scripting 和 chrome.downloads 验证生产逻辑。若自动化需要替换“当前活动标签页选择”，只在测试 harness 里替换这个窄边界，并在报告注明。不得把这种测试说成验证了浏览器工具栏点击授予 activeTab 的全过程。

生产包的真实工具栏打开、权限提示、剪贴板聚焦行为仍要做人工或可用浏览器自动化 smoke test。单独打开 chrome-extension://.../index.html 作为普通 tab 不等价于真实 popup，尤其不能据此证明关闭 popup 的行为。

测试可以拦截固定同源请求并返回 fixtures；不能在正式源码加入 `?mock`、伪造 token、演示成功或任意 URL 覆写接口。

## 3. UI 验收

正常屏幕上仅两个主要按钮。336px 宽，不横向滚动。长标题不推挤按钮；中文错误不截断。深色、浅色各检查一次。

加载、可用、复制成功、下载启动、警告、错误、手动复制各检查一次。状态只能影响必要位置，不把每次反馈弹成对话框。

Tab 顺序、Enter/Space 激活、focus-visible、aria-live 和 reduced-motion 都检查。不以图标或颜色作为唯一说明。

原型的状态下拉、主题切换、演示文字绝不能留在正式 popup。

## 4. 工程质量门禁

```bash
node tools/verify-kit.mjs
node tools/check-boundaries.mjs
node tools/pnpm.mjs format:check
node tools/pnpm.mjs lint
node tools/pnpm.mjs typecheck
node tools/pnpm.mjs test
node tools/pnpm.mjs build
node tools/pnpm.mjs test:e2e
node tools/pnpm.mjs package
```

必须记录每条命令真实结果。格式、类型、lint、单测、构建失败时不能宣布完成。不允许 `--passWithNoTests`、删除断言、跳过失败测试或把错误改为 console.log。

Codex 还应生成一个最小 CI 工作流：安装已锁定的 pnpm/Node，执行 format、lint、typecheck、unit、build 与浏览器测试。使用执行时核实的官方 GitHub Actions 稳定版本并锁定提交，不从记忆猜版本。无需 Husky、Changesets 或复杂发布流水线。

`dist/` 不得包含文档、fixtures、.env、token、远程脚本、演示页、测试权限或源码 stub。ZIP 根目录直接是 manifest.json，不再套 dist/ 一层。

打包工具必须读取 dist 并验证 manifest 与引用资源存在，不能打包整个项目目录。

## 5. 真实账号验收门

仅在用户已经授权的浏览器会话可用时执行，或者给用户自行核验。不要索取密码、Cookie、token、完整 HAR 或复制浏览器 profile。

必须至少验证：普通文字一段、含代码/表格一段、一个长会话、一条再生成分支、复制与下载各一次。记录 Chrome 版本、日期、会话类型与通过/失败，不记录正文或 URL。

无账号时完成其他所有开发，不阻塞在“请先登录”反复提问。最终报告明确写：

```text
工程实现：已完成/未完成
离线 fixtures：PASS / FAIL / BLOCKED
浏览器合成环境：PASS / FAIL / BLOCKED
真实 ChatGPT：LIVE_VERIFIED / LIVE_NOT_VERIFIED
```

**LIVE_NOT_VERIFIED 不能等价于“保证现在可用”。** 首次真实响应若字段变化，局部修正 `providers/chatgpt/capture.ts` / `providers/chatgpt/normalize.ts`，并补不含真实数据的回归样本。

## 6. Codex 自审三轮

第一轮，产品与复杂度：删除多余主入口、占位设置、超出薄适配边界的未来框架和不必要权限；保留 SPEC 明确要求的 ChatAdapter，不再按旧方案删除它。

第二轮，正确性：检查 branch、null root、空内容、unknown、Promise、UTF-8、文件名、超时、旧请求与 popup 关闭。以真实失败样本更新测试。

第三轮，隐私与证据：检查 token/正文日志、第三方请求、data URL 下载记录说明、mock 污染、未执行却声称 PASS 的项目。

报告必须包含“发现 → 修正 → 验证”，不是三个“通过”。

## 7. 最终交付

`dist/`、`release/chatcarry-<version>.zip`、锁文件、版本记录、README 安装说明、实际隐私说明、IMPLEMENTATION_REPORT.md。

不得自动提交 Chrome Web Store。报告注明内部接口兼容性、未支持类型、明确体积上限与真实验收状态。

## 8. 多平台边界验收（本期只实现 ChatGPT）

| ID  | 要求                | 判定                                                                                                    |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| P01 | core 无具体平台依赖 | 不 import providers，不出现私有 mapping/current_node/token/端点/引用标记；通用 renderer 不写死助手品牌  |
| P02 | UI 无平台分支       | main 只使用 resolveAdapter、公开契约与 core；不写 if provider === chatgpt 的业务路径                    |
| P03 | 未实现平台不注册    | 生产列表只有 ChatGPT；DeepSeek、Claude、Grok、Gemini URL 返回无 adapter，不注入不请求                   |
| P04 | URL 安全            | 正确识别 ChatGPT，拒绝相似域名、HTTP、非默认端口、凭证 URL；路由再由 adapter 验证                       |
| P05 | 通用渲染            | 人工 Fixture AI 快照输出正确来源标签，不出现 ChatGPT；这不是其他平台已接入                              |
| P06 | 格式独立于角色      | plain 助手消息保留星号与下划线；markdown 才走 lexer；原有 ChatGPT expected 字节不变                     |
| P07 | 覆盖范围            | partial / unknown 在 UI 与 renderer 均拒绝；完整正文加媒体 warning 不误判缺正文                         |
| P08 | 状态复核            | 调用原 PreparedConversation.assertCurrent；不是用新的 adapter 复核旧快照，切换路由/域名拒绝交付         |
| P09 | 来源一致性          | source.provider.id 与选中的 adapter.provider.id 一致，conversationId 非空；不把来源 ID 输出到正文或日志 |
| P10 | 只改接口边界        | 不新增后台/设置/外站权限/动态插件系统，不为路线图平台创建生产占位 adapter                               |

结构脚本只是辅助检查，不证明以上所有语义。测试不能用品牌字符串替换绕过导出正确性；所有已有 fixtures 保留。
