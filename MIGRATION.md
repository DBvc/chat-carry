# 从旧 ChatGPT 实施包调整到 ChatCarry

修订 2.0，2026-10-04。产品仍为 v0.1，支持范围仍只有 ChatGPT。

## 为什么调整

旧版把“第一期只做 ChatGPT”同时解释成“暂时不需要任何平台边界”。用户现在已明确未来要接入多个 AI 网站。
因此需要保留一个很薄的 adapter 契约；不需要为未来创建框架、空模块或多平台 UI。

## 变了什么

| 原来                               | 现在                                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| 仓库 chatgpt-export-minimal        | 建议 chatcarry，显示名 ChatCarry                           |
| src/chatgpt.ts / normalize.ts      | 放进 providers/chatgpt/，私有字段不进入 core               |
| UI 直接调用 ChatGPT 读取函数       | UI 用 resolveAdapter → adapter.read → PreparedConversation |
| 通用模型中携带 PageProbe / Capture | 只在 ChatGPT 目录保留；公共输出为 Conversation             |
| renderer 默认助手就是 ChatGPT      | 从 source.provider.label 取标签                            |
| 以角色决定去不去 Markdown          | 用 message.format 描述真实内容格式                         |
| 无显式覆盖范围字段                 | complete / partial / unknown；v0.1 不交付后两种            |
| 永久禁止 provider registry         | 允许一张显式静态 adapter 列表，不是注册框架                |

## 没变的事情

两按钮、无设置、仅当前已保存会话、ChatGPT 结构化数据主路径、不做 DOM 全文兜底、
原生 popup、Vite/TypeScript/Oxlint/Oxfmt、四项权限、无后台/数据库/常驻脚本、
有限大小 data URL 下载策略及本地留痕说明、严格分支/内容检查、全部既有 fixtures。

本轮没有重构工具链，没有新增依赖，没有把任何路线图平台实现或注册到生产代码。

## 还没开始实现

直接使用这个新包，让 Codex 读取新版 CODEX_TASK.md；不要混用旧版 SPEC。

## 已经开始实现旧版

**不要把本包的 stub 覆盖已完成的业务代码。** 在原仓库中逐步迁移：

1. 保留现有成果和测试，提交一个可回退的版本；统一项目名、manifest 名称和发布 ZIP 前缀。
2. 移动真实 ChatGPT 采集与 normalize 到 providers/chatgpt/，修复 import；私有图与 probe 类型跟着移动。
3. 增加 providers/types.ts 和显式 resolver，包装真实读取流程。assertCurrent 捕获原 tab 与 probe，不改变原有复核规则。
4. 小模型增加 source、format、coverage。把 ChatGPT metadata 放一个文件，normalizer 负责输出通用数据。
5. 将 renderer 和 delivery 放进 core；取消品牌硬编码与 role→格式推断；原有 ChatGPT 输出样本应保持一致。
6. UI 改为通用调度，界面不增加按钮；添加 provider-boundary 契约测试与静态结构检查。
7. 完整执行原有测试、新增测试和真实会话 smoke test。不能用“架构只是移动文件”跳过验收。

存在已完成代码时，以新版 SPEC 的行为为准，骨架文件仅用于接口参考。
