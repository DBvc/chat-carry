# 必须由 Codex 实现的浏览器测试

当前只有 `foundation.spec.ts` 验证构建后的静态扩展页面。它只证明扩展壳能加载，不能替代下面的业务集成验收。

`test:foundation:e2e` 选择 foundation 项目；`test:e2e` 选择 business 项目。业务尚无用例时应失败。
按 ACCEPTANCE 的 B01–B15 生成真正的集成测试，不能添加 passWithNoTests。

先用本地同源 fixtures 验证生产压缩包的 scripting、copy、download 行为，
再对明确可用且已授权的真实 Chrome/ChatGPT 做 smoke test。
无 service worker 的项目不要等待 service worker 来获取扩展 ID。

真实账号不可用时写 LIVE_NOT_VERIFIED；不把本地 fixture 测试称为线上验证。
