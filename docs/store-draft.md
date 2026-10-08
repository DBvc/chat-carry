# 商店文案草稿（未发布）

名称：ChatCarry · 对话导出

简述：复制当前 ChatGPT 对话的纯文本，或保存为 Markdown 文件。

打开一段已保存的 ChatGPT 对话，再点击工具栏中的 ChatCarry。扩展读取当前已保存分支，提供“复制纯文本”和“导出 Markdown”两个操作。正文在设备本地转换，不上传至开发者服务器。

仅支持桌面 Chrome 中已登录的 ChatGPT 会话；不支持其他 AI 网站、共享或临时聊天、批量历史、图片及附件离线归档。仅导出用户文字和助手最终回答；图片和文件使用明确占位。每次输出不超过 4 MiB，超限时明确提示。

读取依赖 ChatGPT 的当前内部接口，不能保证所有账号、组织工作区或未来页面版本均兼容。ChatCarry 是独立项目，不是 OpenAI 官方产品。

打开弹窗时，会使用当前页面已有的登录状态向 chatgpt.com 请求当前会话；临时登录令牌仅在页面内使用。剪贴板、下载文件及浏览器下载记录可能保留内容，详见 [隐私说明](../privacy.md)。

## 商店填写资料

- 主要用途：按用户操作读取当前已保存的 ChatGPT 会话，将当前分支的文字复制为纯文本，或下载为 Markdown 文件。
- 语言：简体中文。分类：工具 / 工作流程与规划，以商店后台可选项为准。
- 官网：https://github.com/DBvc/chat-carry
- 支持：https://github.com/DBvc/chat-carry/issues
- 隐私政策：https://github.com/DBvc/chat-carry/blob/main/privacy.md
- 对外联系邮箱：dbvcbetter@gmail.com（拥有者已确认公开；商店要求另行完成邮箱验证）。
- 远程代码：无。执行的 JavaScript 与 Markdown 解析器均随扩展打包；ChatGPT 响应只作为数据处理。

## 权限说明

- activeTab：仅在用户主动打开扩展时取得当前标签页的临时访问权，用于识别并读取当前已保存会话。
- scripting：在当前 ChatGPT 顶层页面执行随扩展打包的读取与分支复核函数，不持续注入内容脚本。
- clipboardWrite：用户点击“复制纯文本”后写入准备好的文字；不读取剪贴板。
- downloads：用户点击“导出 Markdown”后创建下载，并仅查看本次 downloadId 的状态；不修改其他下载。

## 图片与提交包

- 扩展图标：[SVG 源文件](store/icon.svg)，PNG 为 `public/icons/icon-{16,32,48,128}.png`，通过本地 Chromium 渲染。图形为独立箭头，不使用 OpenAI 标志。
- 商店图标：[128 px PNG](../public/icons/icon-128.png)。
- 小宣传图：[440 × 280 PNG](store/promo-440x280.png)。
- 界面截图：[1280 × 800 PNG](store/screenshot-1280x800.png)，正式构建界面使用合成示例内容，不含真实聊天。网络响应及活动标签页选择来自临时测试环境，不作为真实账号验收证据。
- 商店上传包：运行完整 `check` 后执行 `package`，得到 `release/chatcarry-0.1.0.zip`；不上传 GitHub Artifact 的外层 ZIP。

2026-10-08 已在发布者后台创建草稿 `kldblmlnjjfepljgknlfheoblmmidboc`，上传版本 0.1.0，并保存商品资料、图片、权限说明和审核测试步骤。最新构建在此前授权的单条真实会话中读取 8 条消息，复制显示成功、Markdown 下载完成；真实文件字节未另行核对，长会话、再生成分支及其他账号/工作区仍未实机验收。

尚未提审或上架：拥有者已确认公开邮箱及三项数据使用承诺，承诺已保存，验证邮件已发送；需完成邮箱验证后再提审。首次条目必须在后台创建，后续更新可另接官方 API v2；当前 GitHub 工作流仅生成并保留安装包，不自动上传或提审。
