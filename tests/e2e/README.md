# 浏览器测试范围

`foundation.spec.ts` 验证明暗主题下的非会话错误状态；`capture.spec.ts` 验证生产压缩产物的读取、纯文本复制、Markdown 下载和恢复界面。先执行 `build`，再执行 `test:foundation:e2e` / `test:e2e`，或直接运行完整 `check`。

测试使用 Playwright 自带 Chromium、独立临时 profile 和显式 profile 下载目录。仅测试副本增加公开 manifest key 与精确 ChatGPT host 权限；正式 manifest 和 JavaScript 不变。全部 HTTP(S) 请求由合成响应处理或阻止，不访问用户真实账号。

仅“当前活动标签页选择”由测试脚本替换。scripting 包装保留真实注入函数、参数、返回值与顶层 MAIN 执行。复制和下载只在交付用例显式开放；读取用例断言没有任何交付。剪贴板读回授权仅在隔离测试 context 内存在，生产没有 clipboardRead 或读回 API。

真实 downloads API 的 UTF-8 文件字节、同名保护、4 MiB 边界和提交后关闭扩展页面都有实际测试；下载事件竞态、取消、监听清理与过期操作另有单测。测试结束删除临时 profile 和目录，不修改个人浏览器下载历史。

普通扩展 tab 不是工具栏 popup，不能据此证明真实工具栏 activeTab、聚焦或所有关闭时机。真实账号验证由用户授权的具体会话另行执行，记录范围，不把合成测试冒充实机。
