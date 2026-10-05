# 必须由 Codex 实现的浏览器测试

`foundation.spec.ts` 验证构建后的扩展页面与禁用交付按钮；`capture.spec.ts` 覆盖本阶段的读取链路。两者都加载正式 Vite 产物的临时副本。

`test:foundation:e2e` 选择 foundation 项目；`test:e2e` 选择 business 项目。业务尚无用例时应失败。
`capture.spec.ts` 使用真实 `chrome.scripting.executeScript`，覆盖旧/新消息 ID、仅顶层注入、白名单投影、仅探针复核、429/HTML 响应、生成状态、分支冲突及读取期间导航。用例只在测试副本中增加公开 manifest key 和精确 `https://chatgpt.com/*` 权限；所有 HTTP(S) 请求由 Playwright 合成响应或阻止，不访问真实账号。

当前活动标签页选择由测试脚本窄替换。对 scripting 的包装只观察真实调用和返回值，不改变注入函数；对复制和下载设置断言保护，读取期间触发任何交付都会失败。正式 `dist/` 不含测试脚本、权限或 URL 开关。

这些测试不能证明工具栏 activeTab 授权、真实 popup 关闭行为、剪贴板聚焦或下载；本阶段不实现交付，后续仍需完成 ACCEPTANCE 的 B01–B15 全部验收，不能添加 passWithNoTests。

先用本地同源 fixtures 验证生产压缩包的 scripting、copy、download 行为，
再对明确可用且已授权的真实 Chrome/ChatGPT 做 smoke test。
无 service worker 的项目不要等待 service worker 来获取扩展 ID。

真实账号不可用时写 LIVE_NOT_VERIFIED；不把本地 fixture 测试称为线上验证。
