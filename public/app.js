import { createModelSettings } from "/model-settings.js";
import { playSound } from "/garden-audio.js";
const $ = (id) => document.getElementById(id);
let history = [],
  birth = null,
  ready = false,
  busy = false,
  chatConsent = false,
  controller = null;
const dialogs = [
  "birth-dialog",
  "privacy-dialog",
  "clear-dialog",
  "letter-dialog",
  "chat-consent-dialog",
  "cat-dialog",
  "library-dialog",
  "cottage-dialog",
  "board-dialog",
  "account-dialog",
  "guide-dialog",
  "announcement-dialog",
  "funding-dialog",
  "model-dialog",
  "audio-dialog",
];
const models = createModelSettings({
  onStatus() {
    ready = models.ready();
    if (!busy)
      status(
        ready
          ? "对话只暂存在当前页面，刷新或关闭会清除。"
          : models.unavailableReason(),
        !ready,
      );
    controls();
  },
  onChange() {
    chatConsent = false;
    ready = models.ready();
    const wasWriting = $("letter-dialog").open;
    if (wasWriting) $("letter-dialog").close();
    status(
      ready
        ? "模型设置已更新。草稿保留，请确认收信方后再寄出。"
        : models.unavailableReason(),
      !ready,
    );
    controls();
    if (wasWriting) openLetter();
  },
});
const today = new Date().toLocaleDateString("en-CA");
for (const id of ["self-date", "other-date"]) $(id).max = today;
function mode() {
  return document.querySelector('input[name="mode"]:checked').value;
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("ready", !error);
}
function controls() {
  $("message").readOnly = busy || !chatConsent;
  $("counter").textContent = `${$("message").value.length} / 2000`;
  $("send").disabled =
    !ready || (!$("message").value.trim() && !busy) || (!chatConsent && !busy);
  $("send").textContent = busy ? "停止等待" : "寄出这封信 ↗";
  $("birth-open").disabled = busy;
  $("new-chat").disabled = busy;
  models.setBusy(busy);
}
// All entry paths share the same explicit, page-local acknowledgement. Merely
// closing this notice (or the arrival announcement) never grants permission.
export function openLetter() {
  if (!chatConsent) {
    if (!$("chat-consent-dialog").open) $("chat-consent-dialog").showModal();
    return;
  }
  if (!$("letter-dialog").open) {
    $("letter-dialog").showModal();
    playSound("paper");
  }
  $("message").focus();
}
$("chat-consent-accept").onclick = () => {
  chatConsent = true;
  $("chat-consent-dialog").close();
  controls();
  openLetter();
};
$("chat-consent-dialog").addEventListener("close", () => {
  if (!chatConsent) $("tree-door").focus({ preventScroll: true });
});
function scrollToEnd() {
  const c = $("conversation");
  c.scrollTop = c.scrollHeight;
}
function addMessage(role, text, pending = false) {
  $("welcome").hidden = true;
  const wrap = document.createElement("article");
  wrap.className = `message ${role}`;
  const label = document.createElement("div");
  label.className = "message-label";
  if (role === "assistant") {
    const img = document.createElement("img");
    img.src = "/favicon.svg";
    img.alt = "";
    label.append(img);
  }
  label.append(
    document.createTextNode(role === "user" ? "你的来信" : "树洞的回信 · AI"),
  );
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;
  if (pending) body.classList.add("pending");
  wrap.append(label, body);
  $("messages").append(wrap);
  scrollToEnd();
  return { wrap, body };
}
async function sendMessage() {
  if (busy) {
    controller.abort();
    return;
  }
  const text = $("message").value.trim();
  if (!chatConsent) {
    openLetter();
    return;
  }
  if (!text || !ready) return;
  const messages = [...history.slice(-20), { role: "user", content: text }];
  if (messages.reduce((n, m) => n + m.content.length, 0) > 20000) {
    status("这段对话已经很长了，请开启新对话再聊。", true);
    return;
  }
  busy = true;
  playSound("send");
  controller = new AbortController();
  const user = addMessage("user", text);
  const answer = addMessage(
    "assistant",
    "桃树正在读信，也为你整理思绪……",
    true,
  );
  $("message").value = "";
  controls();
  status("回应生成中，你可以随时停止。");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        mode: mode(),
        birth,
        consent: true,
        connection: models.connection(),
      }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.code?.startsWith("shared_"))
        models.setShared({ ready: false, sharedReason: result.error });
      throw new Error(result.error || "暂时没有接通，请重试。");
    }
    answer.body.classList.remove("pending");
    answer.body.textContent = result.content;
    history = [...messages, { role: "assistant", content: result.content }];
    playSound("success");
    if (result.sources?.length) {
      const details = document.createElement("details");
      details.className = "sources";
      const summary = document.createElement("summary");
      summary.textContent = `这封回信查阅了 ${result.sources.length} 份资料`;
      details.append(summary);
      for (const source of result.sources) {
        const a = document.createElement("a");
        a.textContent = `${source.title} · ${source.publisher} ↗`;
        a.href = source.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        details.append(a);
      }
      const note = document.createElement("p");
      note.textContent =
        "这些是本次实际检索到的资料，不代表对回信每句话的验证。";
      details.append(note);
      answer.wrap.append(details);
    }
    if (result.truncated) {
      const note = document.createElement("p");
      note.className = "message-note";
      note.textContent = "本次回应到达长度上限，你可以请回声继续。";
      answer.wrap.append(note);
    }
    status("对话只暂存在当前页面，刷新或关闭会清除。");
    scrollToEnd();
  } catch (error) {
    user.wrap.remove();
    answer.wrap.remove();
    if (!$("message").value) $("message").value = text;
    $("welcome").hidden = history.length > 0;
    status(
      error.name === "AbortError"
        ? "已停止等待。已提交的请求仍可能产生模型费用。"
        : error.message,
      true,
    );
  } finally {
    busy = false;
    controller = null;
    controls();
    $("message").focus();
  }
}
$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});
$("message").addEventListener("input", controls);
$("message").addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.isComposing &&
    !matchMedia("(max-width:800px)").matches
  ) {
    e.preventDefault();
    if (!$("send").disabled) sendMessage();
  }
});
document.querySelectorAll("[data-prompt]").forEach((button) =>
  button.addEventListener("click", () => {
    $("message").value = button.dataset.prompt;
    controls();
    $("message").focus();
  }),
);
for (const id of ["privacy-open", "consent-detail", "chat-consent-detail"])
  $(id).onclick = () => $("privacy-dialog").showModal();
document
  .querySelectorAll("[data-close]")
  .forEach(
    (button) => (button.onclick = () => $(button.dataset.close).close()),
  );
dialogs.forEach((id) =>
  $(id).addEventListener("click", (e) => {
    if ($(id).dataset.busy === "true") return;
    if (e.target === $(id)) {
      const r = $(id).getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        $(id).close();
    }
  }),
);
$("birth-open").onclick = () => {
  $("birth-enabled").checked = !!birth;
  $("birth-fields").disabled = !birth;
  for (const who of ["self", "other"])
    for (const key of ["date", "time"])
      $(`${who}-${key}`).value = birth?.[who]?.[key] || "";
  $("birth-error").textContent = "";
  $("birth-result").textContent = "";
  $("birth-dialog").showModal();
};
$("birth-enabled").onchange = () => {
  $("birth-fields").disabled = !$("birth-enabled").checked;
};
$("birth-form").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.submitter;
  if (!$("birth-enabled").checked) {
    birth = null;
    $("birth-summary").hidden = true;
    $("birth-dialog").close();
    return;
  }
  const draft = {
    self: { date: $("self-date").value, time: $("self-time").value },
    other: { date: $("other-date").value, time: $("other-time").value },
  };
  if (!draft.self.date) {
    $("birth-error").textContent = "请填写自己的公历生日，或关闭生辰参考。";
    return;
  }
  button.disabled = true;
  try {
    const response = await fetch("/api/birth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    birth = draft;
    $("birth-summary").textContent =
      `生辰参考已开启 · 我：${result.birth.self.pillars.join(" ")}${result.birth.other ? " · 对方：" + result.birth.other.pillars.join(" ") : ""} · 北京时间，未校正真太阳时`;
    $("birth-summary").hidden = false;
    $("birth-dialog").close();
  } catch (error) {
    $("birth-error").textContent =
      error.message || "暂时无法计算，请稍后再试。";
  } finally {
    button.disabled = false;
  }
};
$("new-chat").onclick = () => $("clear-dialog").showModal();
$("letter-home").onclick = (e) => {
  e.preventDefault();
  $("letter-dialog").close();
};
$("confirm-clear").onclick = () => {
  history = [];
  birth = null;
  $("messages").replaceChildren();
  $("welcome").hidden = false;
  $("message").value = "";
  $("birth-summary").hidden = true;
  $("birth-summary").textContent = "";
  $("birth-form").reset();
  $("birth-result").textContent = "";
  $("birth-error").textContent = "";
  $("clear-dialog").close();
  status(
    ready ? "已开启新对话。你可以从任何地方说起。" : models.unavailableReason(),
    !ready,
  );
  controls();
};
models.refreshStatus();
// Optional WebMCP: draft only; never submit private text automatically.
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: "stage_treehole_message",
        description: "填写树洞草稿但不发送，用户可检查并决定是否提交。",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", maxLength: 2000 } },
          required: ["text"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute(input) {
          if (
            !input ||
            typeof input.text !== "string" ||
            input.text.length > 2000 ||
            busy
          )
            throw new Error("无效草稿或正在回复。");
          $("message").value = input.text;
          controls();
          openLetter();
          return { staged: true, sent: false };
        },
      }),
    ).catch(() => {});
  } catch {}
}
