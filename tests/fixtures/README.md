# 合成样本，不是真实 ChatGPT 响应

这些原始投影样本属于 ChatGPT adapter，不是所有平台的公共数据格式。通用模型测试见 tests/provider-boundary.spec.ts 中的 Fixture AI 样本；它不代表其他平台已接入。

这些输入为本包人工构造，用于独立检查会话树、消息顺序、分支和输出保真。
没有用户账号、Cookie、凭证或真实聊天。fixture-conversation 等是明确的测试标记。

fixture 通过不能证明生产接口字段在未来不变。真实现场不同则局部适配，并补同等结构的脱敏合成样例，不提交真实响应。

expected 文件是人工写出的输出预期，不是由待测 renderer 自动生成。更新预期必须有具体产品行为变更依据。
