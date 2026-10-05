import "./popup.css";

// Starter only. Resolve the current URL through ./providers, read once,
// assertExportable, then render both formats from the same Conversation.
// Revalidate via PreparedConversation.assertCurrent() before each delivery.
// Do not import ./providers/chatgpt internals into this UI module.
// Keep the interface visibly unavailable until implementation is complete.
const status = document.querySelector<HTMLElement>("#status");
if (status) {
  status.textContent = "工程起点：等待 Codex 完成真实数据接入";
}
