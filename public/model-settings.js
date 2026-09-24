export function createModelSettings({ onChange, onStatus }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("model-dialog");
  let providers = [],
    personal = null,
    sharedReady = false,
    testing = null,
    chatBusy = false;
  let sharedReason = "正在查看共享服务状态…";
  const source = () =>
    document.querySelector('input[name="model-source"]:checked').value;
  const provider = () =>
    providers.find((p) => p.id === $("model-provider").value);
  function feedback(message = "", error = false) {
    $("model-feedback").textContent = message;
    $("model-feedback").dataset.error = String(error);
  }
  function labels() {
    $("funding-status").textContent = sharedReason;
    $("model-shared-status").textContent = sharedReason;
    const p = providers.find((p) => p.id === personal?.provider);
    $("letter-model-label").textContent = personal
      ? `${p?.name ?? personal.provider} · 自有`
      : "共享 DeepSeek";
    document.querySelectorAll("[data-model-recipient]").forEach((el) => {
      el.textContent = personal
        ? `${p?.name ?? personal.provider}（自己的 API · ${personal.model}）`
        : "DeepSeek（共享额度）";
    });
  }
  function renderSource() {
    const own = source() === "personal";
    $("model-personal-fields").hidden = !own;
    $("model-personal-fields").disabled = !own || !!testing;
    $("model-save").disabled = !!testing || (own && !providers.length);
    $("model-forget").disabled = !personal || !!testing;
  }
  function renderProvider(reset = true) {
    const p = provider();
    if (!p) return;
    $("model-presets").replaceChildren(
      ...p.models.map((model) => {
        const option = document.createElement("option");
        option.value = model;
        return option;
      }),
    );
    if (reset) $("model-name").value = p.models[0];
    $("model-endpoint").value = p.endpoint;
    $("model-provider-note").textContent = p.note;
    $("model-console-link").href = p.console;
    $("model-docs-link").href = p.docs;
  }
  async function loadProviders() {
    if (providers.length) return true;
    try {
      const response = await fetch("/api/providers");
      if (!response.ok) throw Error();
      ({ providers } = await response.json());
      $("model-provider").replaceChildren(
        ...providers.map((p) => {
          const option = document.createElement("option");
          option.value = p.id;
          option.textContent = p.name;
          return option;
        }),
      );
      renderProvider();
      labels();
      renderSource();
      return true;
    } catch {
      feedback("暂时无法读取接口预设，请关闭后重新打开。", true);
      return false;
    }
  }
  function setShared(config) {
    sharedReady = !!config.ready;
    sharedReason =
      config.sharedReason ||
      (sharedReady
        ? "共享 DeepSeek 已配置，可尝试寄信；实际余额以服务商账户为准。"
        : "共享模型暂不可用，可以使用自己的 API。");
    labels();
    onStatus();
  }
  async function refreshStatus() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) throw Error();
      setShared(await response.json());
    } catch {
      setShared({
        ready: false,
        sharedReason: "暂时无法查询共享服务状态，请稍后重新打开 API 设置。",
      });
    }
  }
  async function open() {
    if (chatBusy || dialog.open) return;
    document.querySelector(
      `input[name="model-source"][value="${personal ? "personal" : "shared"}"]`,
    ).checked = true;
    feedback();
    renderSource();
    dialog.showModal();
    refreshStatus();
    if (!(await loadProviders()) || !dialog.open) return;
    $("model-provider").value = personal?.provider ?? "deepseek";
    renderProvider();
    if (personal) $("model-name").value = personal.model;
    $("model-key").value = personal?.apiKey ?? "";
    $("model-key-consent").checked = !!personal;
  }
  function draft() {
    if (!window.isSecureContext)
      throw Error("个人密钥请在 HTTPS 或本机 localhost 页面中填写。");
    if (!$("model-form").reportValidity()) return null;
    if (!provider()) throw Error("请先选择服务商。");
    const model = $("model-name").value.trim(),
      apiKey = $("model-key").value.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(model))
      throw Error("请填写有效的模型 ID。");
    if (!/^[\x21-\x7e]{8,2048}$/.test(apiKey))
      throw Error("请填写完整密钥，不含空格或换行。");
    return { provider: provider().id, model, apiKey, consent: true };
  }
  function apply(next) {
    const changed = JSON.stringify(personal) !== JSON.stringify(next);
    personal = next;
    labels();
    dialog.close();
    if (changed) onChange();
    else onStatus();
  }
  document
    .querySelectorAll("[data-model-settings]")
    .forEach((button) => button.addEventListener("click", open));
  document.querySelectorAll('input[name="model-source"]').forEach((input) =>
    input.addEventListener("change", () => {
      testing?.abort();
      renderSource();
      feedback();
    }),
  );
  $("model-provider").onchange = () => {
    renderProvider();
    $("model-key").value = "";
    $("model-key-consent").checked = false;
    feedback();
  };
  $("model-reset-preset").onclick = () => {
    renderProvider();
    feedback();
  };
  $("model-form").onsubmit = (event) => {
    event.preventDefault();
    if (chatBusy || testing) return;
    try {
      const next = source() === "shared" ? null : draft();
      if (source() === "shared" || next) apply(next);
    } catch (error) {
      feedback(error.message, true);
    }
  };
  $("model-forget").onclick = () => {
    if (!testing) {
      $("model-key").value = "";
      apply(null);
    }
  };
  $("model-test").onclick = async () => {
    if (testing || chatBusy) return;
    let control;
    try {
      const connection = draft();
      if (!connection) return;
      control = new AbortController();
      testing = control;
      renderSource();
      feedback("正在向所选官方接口发送一条测试消息…");
      const response = await fetch("/api/model/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection }),
        signal: control.signal,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "连接测试未完成。");
      if (dialog.open && !control.signal.aborted) feedback(result.message);
    } catch (error) {
      if (dialog.open && error.name !== "AbortError")
        feedback(error.message, true);
    } finally {
      if (testing === control) {
        testing = null;
        renderSource();
      }
    }
  };
  dialog.addEventListener("close", () => {
    testing?.abort();
    $("model-key").value = "";
    $("model-key-consent").checked = false;
  });
  return {
    refreshStatus,
    setShared,
    connection: () => (personal ? { ...personal } : undefined),
    ready: () => !!personal || sharedReady,
    unavailableReason: () => sharedReason,
    setBusy(value) {
      chatBusy = value;
      document
        .querySelectorAll("[data-model-settings]")
        .forEach((b) => (b.disabled = value));
    },
  };
}
