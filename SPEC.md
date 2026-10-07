# ChatCarry v0.1 · 实施规格

方案修订：2.0 / 2026-10-04；产品版本仍为 0.1.0。下文替代旧方案，不是候选架构列表。

项目工作名：`ChatCarry`，建议 GitHub 仓库名 `chatcarry`。本包未创建仓库，也不代表名称完成商标核验。

## 1. 一句话产品

**打开一段已保存的 ChatGPT 对话，点扩展图标，再点“复制纯文本”或“导出 Markdown”。**

长期目标是多 AI 聊天导出：后续计划接入 DeepSeek、Claude、Grok、Gemini 等；v0.1 **只实现并注册 ChatGPT**。不把路线图写成已支持能力。

不要求用户理解数据源、解析器、平台选择或导出选项。默认行为由产品决定。

### 1.1 固定范围

| 支持                                           | 暂不支持                                        |
| ---------------------------------------------- | ----------------------------------------------- |
| 桌面 Chrome，个人已登录 ChatGPT 网页           | Firefox、移动端、其他 AI 平台                   |
| `https://chatgpt.com/.../c/<id>` 的已保存会话  | 首页、新建未保存会话、共享链接、临时聊天、群聊  |
| 当前已保存分支中的用户文字与助手最终回答       | 所有分支、隐藏推理、工具原始输出、整账户历史    |
| 普通文字、代码、列表、表格、公式源文、普通链接 | PDF、Word、HTML、图片/附件字节、Canvas 文档全文 |
| 两个输出，固定格式，中文界面，跟随系统深浅色   | 设置页、账号、预览编辑器、主题选择、批量选择    |

项目中的会话只在 URL 可提取当前会话 ID、且同一读取流程有效时自然兼容。不是承诺支持所有组织工作区；组织返回拒绝时不探测其他账号、不绕过策略。

“当前分支”定义为本次读取时服务端 `current_node` 的祖先路径，并与页面可见消息 ID 交叉检查。不是账户全部历史，也不是所有再生成版本。

### 1.2 两个不能混淆的承诺

**做：**对于支持的正文，不静默漏消息、不混分支、不输出空文件。失败有原因和重试。

**不做：**保证任何未来 ChatGPT 页面/内部接口都永远可用，或把图片、交互卡片和文件归档成完整离线副本。

## 2. UI 与交互

### 2.1 默认界面

```text
┌──────────────────────────────────┐
│  ChatCarry                        │
│  把这段对话带走                  │
│                                  │
│  如何设计一个可靠的 Chrome 扩展… │
│  ChatGPT · 已读取 12 条消息      │
│                                  │
│  [ 复制纯文本                  ] │
│  [ 导出 Markdown               ] │
│                                  │
│  本地转换 · 不上传至第三方       │
└──────────────────────────────────┘
```

只有顶部扩展图标入口，不向 AI 网站插入按钮、悬浮栏或菜单。
自动识别当前标签页；平台名只是来源提示，不是下拉菜单。只有实际注册的适配器才可读取页面。

宽 336px，内边距 20px，两个按钮纵向排列，至少 44px 高，间隔 10px。
标题 16px/600，正文 13px，辅助文字至少 12px。标题单行省略但保留可访问全名。
使用系统字体；无外部字体或 CDN。圆角、轻边框、单一强调色；不用玻璃特效、渐变或营销卡片。
遵循 `ui/preview.html` 的层级与间距；CSS 可直接复用 `src/popup.css`。

默认 `prefers-color-scheme` 跟随系统；没有主题开关。遵循 `prefers-reduced-motion`。
按钮必须是原生 button，Tab 顺序自然，焦点可见，状态通过 aria-live 报告，错误不只靠颜色。
不要在加载完成时突然抢焦点；复制成功后焦点仍留在被点击按钮。

### 2.2 状态与文案

| 状态           | 表现                                                    | 用户下一步                       |
| -------------- | ------------------------------------------------------- | -------------------------------- |
| 正在读取       | 两按钮保留但 disabled；状态“正在读取当前对话…”          | 等待；关闭不会产生迟到复制或下载 |
| 可操作         | 标题 + “<平台名> · 已读取 N 条消息”；两按钮可用         | 点其中一个                       |
| 复制成功       | 主按钮短暂“已复制”，aria-live“纯文本已复制”             | 不弹额外对话框、不自动关闭       |
| 下载启动       | “已交给浏览器下载”，不是“下载完成”                      | 可关闭 popup                     |
| 确认下载完成   | 收到本次 downloadId 的 complete 后“Markdown 已下载”     | 不自动打开文件                   |
| 含不支持的媒体 | 一行“含图片/附件，仅保留文字和占位说明”                 | 两按钮可用；导出也含同样说明     |
| 普通错误       | 简短原因，下方条件性“重试”文字按钮；主按钮 disabled     | 用户主动重试                     |
| 非会话页面     | “请先打开一段已保存的 ChatGPT 对话”                     | 不擅自开新标签页                 |
| 正在生成       | “回答仍在生成，结束后重试”                              | 不输出半截回答                   |
| 剪贴板失败     | 保留已准备内容；展开只读文本框和“请按 ⌘C / Ctrl+C 复制” | 手动复制；下载仍可用             |
| 下载被取消     | “下载已取消，可重新导出”                                | 不自动反复弹下载                 |

正常状态没有第三个主要动作。错误时的“重试”与手工复制兜底是恢复操作，不是永久功能入口。

原型中顶部的状态、主题等演示控制属于评审页面，绝不能出现在正式扩展。

### 2.3 固定输出

复制：`text/plain`，不是带 Markdown 符号的字符串，也不写 `text/html`。包含会话标题与“你：”“ChatGPT：”角色；助手标签由 `conversation.source.provider.label` 提供，不能在通用 renderer 写死 ChatGPT。正文不带品牌广告、时间、账号信息或私有会话 URL。

下载：`<清洗后的会话标题>.md`，UTF-8，保留中文和 Emoji。文件头为标题，各消息使用 `## 你` / `## <平台名>`（本期为 ChatGPT）。末尾换行；不添加 YAML、目录或水印。

同名文件用 Chrome 的 `conflictAction: "uniquify"`，不覆盖已有文件。尊重浏览器全局下载设置，不承诺一定不会出现用户设置的保存位置对话框。

## 3. 工具链与工程边界

工程初始化记录（2026-10-05）：本仓库已完成首次正式版本解析与锁定，见 `docs/toolchain-resolved.json`。现在的 bootstrap 只按现有锁文件恢复安装，不再承担首次版本选择；下文“初始化时核实”的要求已执行，后续主动升级时再次核实。

| 用途           | 决定                                                           |
| -------------- | -------------------------------------------------------------- |
| Node           | Node.js 24 LTS 最新补丁；执行时记录精确版本                    |
| 包管理         | pnpm 正式版，精确 packageManager 与 pnpm-lock.yaml             |
| 构建           | Vite 最新正式版，初始化时核实并精确锁定                        |
| 语言           | TypeScript 最新正式版；strict；初始化时核实兼容性              |
| Lint           | Oxlint + 匹配的 oxlint-tsgolint，启用类型感知                  |
| Format         | Oxfmt 最新正式版，锁定并测试配置                               |
| UI             | 原生 DOM + CSS；没有框架与组件库                               |
| Markdown token | markdown-it 一个运行时直接依赖，只读取 token，不调用 HTML 渲染 |
| 单测           | Vitest 正式版                                                  |
| 浏览器测试     | Playwright 正式版，Chromium persistent context                 |

执行 bootstrap 时确认 latest 标签不是预发行，解析到精确版本并安装。本轮不升级工具链；docs/versions-observed.json 只保留上一版记录，不代表本轮重新安装或核实。
Oxc 的 lint 主体与 Vite 底层打包器是 Rust；TypeScript 7 和 tsgolint 相关核心是 Go。不要为追求“全 Rust”去替换成熟的 Markdown 解析器或测试工具。

不同时引入 ESLint/Prettier/Biome；不使用 --all 开启全部 lint 规则。必须处理未捕获 Promise；独立 `tsc --noEmit` 类型检查，不再叠加 `oxlint --type-check` 重复报告。

### 3.1 文件边界：薄适配层，不做插件框架

```text
index.html
public/manifest.json
src/
  main.ts                  当前 tab → 选择 adapter → 准备/交付与 UI 状态
  popup.css
  core/
    model.ts               小型 Conversation、来源、format、coverage、导出门禁
    render.ts              两种无平台依赖的 renderer
    delivery.ts            剪贴板与下载；通用文件名
  providers/
    types.ts               ChatAdapter / PreparedConversation 契约
    index.ts               显式静态列表，v0.1 只有 chatgptAdapter
    chatgpt/
      index.ts             组合读取、归一化、交付前复核
      metadata.ts          本适配器的 id / label 单一来源
      capture.ts           自包含页面函数、鉴权、分支探针、私有投影类型
      normalize.ts         私有投影 → 通用 Conversation
```

一个项目、一个 HTML 入口。允许这个实际用得上的适配边界，但不建基类继承树、运行时插件加载、自动发现、注册中心服务、配置 DSL、DI 容器或 monorepo。不创建尚未实现平台的空文件、空 adapter 或支持开关。

UI 只 import `providers/index.ts` 及契约，不 import `providers/chatgpt/*`；`core/` 不 import 任何 adapter，不知道 `current_node`、`mapping`、平台端点、token、私有 citation 标记或 DOM 选择器。

`providers/index.ts` 只保留 `[chatgptAdapter]` 和 `find`。新增真实平台时增加一个明确 import 和列表元素，不引入动态加载。

### 3.2 最小契约

以 `src/providers/types.ts` 为准：

```ts
interface ChatAdapter {
  readonly provider: { readonly id: string; readonly label: string };
  matches(url: URL): boolean;
  read(context: { readonly tabId: number; readonly url: URL }): Promise<PreparedConversation>;
}

interface PreparedConversation {
  readonly conversation: Conversation;
  assertCurrent(): Promise<void>;
}
```

`matches` 是无副作用的精确 origin 判断，不读取页面、不发请求。可以识别受支持网站的首页，但 `read` 必须拒绝未支持路由；识别网站不等于能导出当前页面。识别失败不注入、不扫描其他 tab。

`read` 内部封装采集、当前路径解析、隐藏内容筛选和格式归一化。返回 `Conversation`，不把原始 payload、PageProbe、访问令牌或某个平台的树结构暴露给 UI。

`assertCurrent` 是 popup 中持有的局部闭包，保存对应 tab 和私有探针，仅在复制/下载前复核来源、路由、选中分支和生成状态；不能把这个闭包注入页面。所有实际 `executeScript({func})` 的函数仍须自包含。复核失败明确抛错，不重新抓别的会话、不悄悄替换快照。

通用模型由既有小快照增加以下真实需要的信息：

- `source.provider.id / label` 与 `source.conversationId`：区分来源，按平台标签渲染。内部身份为 `(provider.id, conversationId)`，不能只用 message ID 跨平台去重；本期不建缓存。
- 每条消息 `role`、`body`、`format: plain | markdown`：文本处理由格式决定，不通过角色猜格式。ChatGPT 用户文字为 plain，助手 Markdown 为 markdown；未来 DOM-only 平台返回 plain 也不能伪装成保留了 Markdown 结构。
- `coverage: complete | partial | unknown` 与 `warnings`：完整性与媒体支持是两件事。complete 只指已验证的当前分支受支持正文，不代表图片文件与隐藏内容全归档。

UI 在启用按钮前验证 `conversation.source.provider.id === adapter.provider.id`、调用 `assertExportable`；两个 renderer 自身也必须调用相同门禁。v0.1 仅交付 `complete`。partial / unknown 报 `INCOMPLETE_CAPTURE` 并禁用操作，不新增“仍然导出”设置或第三个按钮。已知媒体占位可保持 complete 并给 warning；缺失正文不能仅写 warning 后视为 complete。

平台引用标记清理在 adapter 内完成，通用 renderer 不识别私有 token。不要把原始 API JSON 放到 `extra` / `raw` / `Record<string, unknown>` 偷渡进通用模型；也不预建全内容 AST。

### 3.3 构建与开发

Vite manifest 与 Chrome manifest 不是一个东西；不要开启 `build.manifest` 来代替 `public/manifest.json`。
开发用 `vite build --watch`，加载 dist，更新后刷新扩展。不引入专用扩展 HMR 插件。界面效果单独打开 ui/preview.html 检查。

## 4. 数据通路：通用调度与 ChatGPT 读取分开

```text
打开 popup
  → chrome.tabs.query 获取当前标签页
  → resolveAdapter(url)，未注册就停止
  → adapter.read({tabId, url})
  → ChatGPT adapter 校验精确 origin 与 /c/<id>
  → executeScript(MAIN, 自包含异步函数)
      → 页面探针 A
      → 读取当前同源登录会话
      → 读取这一条会话的结构化记录
      → 页面探针 B
      → 返回最小投影数据，不返回 token
  → ChatGPT adapter 校验分支并归一化
  → 返回 PreparedConversation，原始数据不越过适配器边界
  → 通用完整性门禁
  → 同时准备纯文本与 Markdown
  → 两个按钮可操作
```

**ChatGPT v0.1 没有自动滚动，也没有 DOM 正文采集兜底。** DOM 仅提供会话状态与分支提示，不承担全文来源。

这不是对未来所有平台强制 API-only。以后每个平台可以选择适合的会话记录或 DOM 读取方式，但必须各自证明覆盖范围，遵守同一归一化输出与完整性门禁。现在不实现通用 DOM 扫描器。

选择这条路是为了第一版足够小，并避免把虚拟列表当前挂载的一小段误当全文。代价是内部接口失效时会明确停止；不要把这称为永远可靠。

### 4.1 权限

`activeTab`、`scripting`、`clipboardWrite`、`downloads`。

不申请 `<all_urls>`、tabs、cookies、history、webRequest、clipboardRead、storage 或长期 host_permissions。
当前页读取由用户主动打开 action 获得的 activeTab 权限触发。[S5][S6]

v0.1 只有顶层 `https://chatgpt.com`，不向其他 frame 注入。未来新增平台也必须显式匹配精确 HTTPS origin；未实现域名不预授权。URL 用 URL 对象解析，pathname 的尾部匹配 `/c/<合法ID>`；不能用 includes('chatgpt.com') 判断域名。

### 4.2 页面读取契约

候选入口：同源 `/api/auth/session` 获取本次用户已登录会话的 accessToken，再读 `/backend-api/conversation/<id>`。这是开源实践参考，不是 OpenAI 公开 API。[S12]

Codex 要把全部内部接口假设集中到 `providers/chatgpt/`。若当前实际响应不符，局部适配并补脱敏合成 fixture，不在其他模块散落私有字段。

要求：

- 只 GET 当前这一个会话，不读列表，不并发扫描历史。
- 固定 origin 和路径，令牌只能发回同源 ChatGPT；URL 不接受正文或任意调用者输入。
- `credentials: "include"`，不保留网络缓存；fetch 使用 AbortController 总时限 12 秒，popup 调度另有 15 秒有限等待。二者是产品超时配置，不是性能承诺。
- 不解析 HTML 登录页为 JSON；校验 status、响应类型与结构。
- 401/403/404 都是“当前会话无法读取”的可能结果，不擅自断定一定 token 过期，也不自动寻找其他令牌。
- 429 不自动重试；提示稍后重试。保护措施和组织拒绝不绕过。
- token 只在注入函数局部变量中短暂使用；不返回给 popup、不落盘、不挂 window、不写日志。
- 返回前从响应构造白名单投影：title、conversation_id、current_node、mapping 中必要的 parent/children/message 字段；不把整个原始响应传递或序列化到日志。
- 单次投影数据上限 16 MiB；输出 UTF-8 上限 4 MiB。明确超限错误，不静默截断。数字是 v0.1 内存预算，不是 Chrome 官方极限。

注入函数必须完全自包含。类型导入可以在编译时消失，运行时 import/外部常量不可以。必须针对 **Vite 生产压缩产物** 测试，避免 helper 或变量重命名导致闭包依赖。

### 4.3 页面变化与分支

探针只收集 pathname、当前可见消息 ID 的有序集合、已知的生成中信号、少量长度/状态信息。不读侧栏历史，不保存正文。
`data-message-id` 等只是候选属性，不是官方稳定保证。只匹配真正可见、属于主对话区的节点，不收集隐藏分支。

读取前后的 pathname 与分支探针不同，丢弃结果并提示重试；不混用两次读取。每次准备使用递增 requestId，旧任务结果不得覆盖新任务。

ChatGPT normalize 从 current_node 追溯 parent，检查每个父节点存在、无环、直到明确 root，再反转。绝不按时间排序，绝不遍历所有分支输出。
将可见 message.id 与所选祖先链交叉核对：有明确冲突就拒绝。无可验证 ID 且图存在真正分支时不能声称确定当前页面分支，提示回到最新消息/刷新重试。图是单一路径时可仅依赖结构化记录。

消息节点 key 与 message.id 不假定相同。图中 null message 的 root 合法；不要因一个 root 无正文而判失败。

最后一条助手回复若仍为 in_progress，或页面明确正在生成，禁止交付半截内容。对 finished_partial/未知结束状态保守报错；不自动点击“停止生成”。

每次用户点击复制/下载前，UI 调用 `PreparedConversation.assertCurrent()`，由 ChatGPT adapter 做一次轻量页面探针；发现页面或消息身份改变则提示重新读取，不把旧快照用于新对话。探针无法证明所有服务端实时变化，产品输出承诺仍是“本次读取的已保存快照”，不是原子实时备份。

### 4.4 明确的消息筛选

输出 user，以及对话可见的 assistant 最终回答（channel 为 final 或缺省且 recipient 为 all/缺省）。
排除 system、developer、tool、assistant analysis/commentary、工具调用收件人消息以及 `is_visually_hidden_from_conversation`。不要导出隐藏推理或内部指令。

这个筛选决定了提示应写“已读取 N 条消息”，不能写“已完整备份所有内容”。对于复杂会话，可在说明中表述仅含用户文字与最终回答。

### 4.5 内容归一化

- text：parts 中的原始文本按规定顺序保留，不能 trim 每一行或折叠代码空格。
- multimodal_text：保留文字，已知图片/文件/音频元素用 `[图片未包含在导出中]` 等固定占位，并增加 warning。
- 已知文件名只能来自明确字段；不要从 opaque ID 猜文件名或路径。
- 未知顶层 content_type、未知正文对象或无法识别的非空正文结构：`CONTENT_UNSUPPORTED`，不是返回空字符串。
- 普通 Markdown 链接原样保留；不请求链接、不下载图片、不抓附件。
- 特殊 ChatGPT 引用标记 v0.1 不做完整元数据还原：非代码区的 cite/filecite 等变成 `[引用见原对话]` / `[文件引用见原对话]`，并提示“部分引用请查看原对话”。不能编造来源 URL。
- 交互卡片标记使用明确占位。不要让内部 token 泄露成乱码，也不要正则扫过代码块修改代码样例。
- 代码内的任何特殊标记只是代码，不替换。

如果所有消息筛选后没有有效正文或可读占位，报 EMPTY_CONVERSATION。不要导出只有标题的文件。

## 5. 渲染规则

### 5.1 Markdown

保留助手的 Markdown 源文，包括 fenced code、缩进、语言标记、GFM 表格与 LaTeX 源文。不要再把它转换为 HTML 再转回来。
用户消息保留其原始文字；在 MD 文件中按原样放在用户段落下。这里不承诺把用户手写的 Markdown 全部显示为字面字符；TXT 则必须保留用户字面原文。

标题只保留一行并正确转义 Markdown 标题内容。消息边界用二级角色标题和空行；不改写助手自身标题层级。warning 在标题下以短 blockquote 出现。

### 5.2 纯文本

`format: plain` 的消息原样输出，避免把原本输入的 `a_b`、`#`、`*` 或代码改掉；这也适用于未来 adapter 的纯文本助手回答。
`format: markdown` 的消息使用 markdown-it 的结构化 token visitor 输出纯文本，不是正则全局删符号。为避免公式里的星号、反引号和反斜杠被当成 Markdown 排版，本轮修复将原 marked 解析器局部替换；归一化中的代码区识别复用同一解析器。ChatGPT 本期将用户文字标为 plain、助手 Markdown 标为 markdown：

| 结构                      | 文本结果                                    |
| ------------------------- | ------------------------------------------- |
| 标题、粗体、斜体          | 保留文字，不保留排版标记                    |
| fenced code / inline code | 保留代码本体与空白，不保留围栏              |
| 段落                      | 段落之间一个空行                            |
| 链接                      | `文字 (URL)`；文字本来就是同一 URL 时不重复 |
| 列表                      | 无序用 `• `，有序保留序号；嵌套用缩进       |
| 任务列表                  | `[x]` 或 `[ ]`，保留状态                    |
| 表格                      | 每行以 tab 分列，保留表头和全部单元格       |
| 公式                      | 保留可获取的 LaTeX 字面源文，不调用模型改写 |
| raw HTML                  | 作为字面文本处理，不插入 DOM 执行           |
| 图片                      | 可读占位；不生成“已归档”错觉                |

需要避免末尾多余空行，但不能清理代码段内部空白。精确样例见 tests/fixtures/expected-*。

公式支持 `\(...\)`、`\[...\]`、`$...$`、`$$...$$`，整体保留分隔符与正文，不解析或排版 LaTeX。单 `$` 公式不跨行，排除相邻空白和金额式结尾。链接先确定标签与 URL 的范围；标签中的公式不能跨入 URL 或后续正文。代码内不解释公式。未配对的分隔符按普通 Markdown 文字处理。

未知解析 token 是适配错误，应测试发现并处理，不能默认吞掉其正文。

## 6. 复制、下载与生命周期

### 6.1 复制

只有用户点击才调用 navigator.clipboard.writeText。准备内容与写入分离；popup 打开不触碰剪贴板。
writeText Promise 成功后才显示“已复制”。失败则展开同一纯文本内容的只读 textarea 并选中，告知用户手工复制。无需 clipboardRead；生产代码不能回读剪贴板验证。

### 6.2 下载

v0.1 选择**有大小上限的 data URL + chrome.downloads.download**。使用 UTF-8 编码，不用 btoa(unicodeString)，也不用展开巨大字节数组为函数参数。
例如对已校验为 well-formed 字符串的正文做 encodeURIComponent，或以小块处理 UTF-8 字节生成 Base64；必须测试中文、Emoji、反斜杠和上限样本。

原因：不把 Blob URL 的存活期绑到 popup，避免为两个按钮引入 service worker 与 offscreen 两个额外上下文。Chromium 有 Downloads API 的 data URL 测试，但本项目 4 MiB 上限仍要实测，不是从该测试推导出的保证。[S8][S9]

- filename 仅一个安全文件名；删除控制符、路径分隔符、Windows 保留符号和结尾空格/点，限制长度，处理保留设备名，兜底 conversation.md。
- 只构造 `.md`，不能由对话内容决定扩展名或目录。
- downloads.download resolve 得到 ID 只说明开始。可在 popup 存活期间监听本次 ID 的 onChanged，并立即 search({id}) 补查竞态。
- onChanged 要及时清理，只查询/处理自己的 ID；不能监听并记录所有下载。
- 交给浏览器后关闭 popup 不会依赖 popup Blob；下载完成/取消由浏览器继续负责。不要承诺 popup 已关闭后仍会显示应用内状态。
- 请求开始前关闭 popup，不能之后突然补发下载；主线程上下文被销毁后结果丢弃。

**隐私代价必须写入隐私说明：**导出文件会落盘，剪贴板由系统管理，浏览器下载记录可能保留包含正文的 data URL。本扩展不建立额外聊天数据库，也不上传至第三方，但不能宣传“设备上不留痕”。不擅自清理用户下载历史。

若目标浏览器实际测试发现 4 MiB 不可用，降低明确上限并记录证据；不能静默截断，不能私自加后台系统。超出上限属于后续扩展需求。

### 6.3 popup 生命周期

本产品没有承诺关闭 popup 后继续准备内容。准备中关闭，结果丢弃，下次打开重新读取。这是有意选择，不是需要后台队列修复的缺陷。[S7]

浏览器中已经启动的下载与准备任务不是同一件事。不要把“关闭后不继续准备”错误扩展成“已提交下载也必须取消”。

没有长期缓存、轮询、定时重试或 MutationObserver 驻留。超时都要有限，旧结果不得污染下一次尝试。

## 7. 安全与发布

所有 UI 字段用 textContent/value 填充。禁止把聊天内容送进 innerHTML、eval、new Function、脚本 src 或图片 src。
扩展只打包本地代码，CSP 不允许远程脚本；不使用远程配置执行修复。UI 原型不进入 dist。

不设置开发者账号、不注册商店、不支付或自动上传。最后产物是 dist 与 zip。图标可由 Codex 使用简单的本地 SVG 源生成 PNG，16/32/48/128px；不使用 OpenAI 官方标志，不暗示官方授权。

实现后根据实际行为完成 privacy.md 和商店文案草稿；不得声称从未传输到任何服务器，因为读取本来需要与 ChatGPT 通信。

OpenAI 使用条款含程序化提取限制；是否适用、是否有例外需按地区与账户协议确认。此工具不因此获得官方授权。遇到明确访问限制不规避。[S13]

## 8. 后续功能怎么增加而不扰乱首页

现在留下两个已经明确需要的变化边界：`平台 adapter → Conversation` 和 `Conversation → renderer`。不预建配置系统。
以后先新增输出 renderer，再用菜单渐进披露；默认两个按钮、默认行为保持不变。只有真正新增功能时才出现 `更多` 入口。
漂亮 HTML、PDF、选择消息、完整导出引用、媒体打包，以及其他真实平台的实现都不在这次开发任务里。多平台边界现在建立，其他平台代码以后再写。不要现在先做个空设置页“方便以后”。

以后新增平台的标准流程见 docs/ADDING_A_PLATFORM.md：独立 adapter 与 fixtures、契约测试、精确域名、权限审查和真实会话验证；注册后自动识别当前网站，默认两个按钮保持不变。平台接入不天然要求扩大权限，但某些未来实现若需跨 origin 访问或其他能力，必须逐项说明并在实际接入时评估，不能为了图省事现在加 `<all_urls>`。

路线图先做 ChatGPT 并稳定验收，再逐个接入 DeepSeek、Claude、Grok、Gemini；除 ChatGPT 外不承诺顺序、日期或“只改几行就可用”。不把导出升级成自动导入、跨 AI 续聊、知识库、MCP 或后台抓取服务。

## 9. 开发阶段

A. 工具链与边界：精确依赖、严格配置、可加载空壳；显式 resolver 与假域名拒绝测试；业务按钮不能假成功。

B. 纯函数：ChatGPT 私有图路径与内容校验，通用模型/format/coverage、两个 renderer、文件名、合成 fixtures；测试中用 Fixture AI 验证无品牌硬编码，不实现第二个生产 adapter。

C. 页面桥接：最小权限、真实只读 API、注入闭包校验、有限超时、错误状态。

D. 交付：复制、下载、popup 状态和恢复；接入已完成 renderer。

E. 测试与 review：按 ACCEPTANCE，不为了赶完成删测试或加更多功能。

F. 打包与报告：工程检查结果、安装包、剩余边界、真实账号验收状态。所有证据来自实际运行。
