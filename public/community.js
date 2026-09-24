export function createCommunityBoard() {
  const $ = (id) => document.getElementById(id);
  const account = $("account-dialog");
  let entryResolve = null;
  let currentUser = null,
    mode = "register",
    busy = false,
    loading = false,
    requestId = 0;
  let resetAt = 0,
    serverTime = Date.now(),
    clockAt = performance.now(),
    lastLoad = 0;
  const clock = () => serverTime + performance.now() - clockAt;
  function status(text) {
    $("board-status").textContent = text;
  }
  function entryView() {
    const entry = account.dataset.entry === "true";
    const returning = entry && !!currentUser;
    $("account-returning").hidden = !returning;
    $("account-form").hidden = returning;
    account.querySelector(".account-tabs").hidden = returning;
    $("account-guest-choice").hidden = !entry;
    $("account-title").textContent = entry
      ? "欢迎来桃花小院"
      : "认识一下，好吗？";
    $("account-intro").textContent = entry
      ? "登录留下一个昵称，或先做游客，轻轻松松地逛逛。"
      : "登记后就可以留言。只需昵称，不需要真实姓名。";
    $("account-welcome").textContent = returning
      ? `已经为你记住登录状态，${currentUser.nickname}。`
      : "";
  }
  function showAccount(entry = false) {
    account.dataset.entry = String(entry);
    setMode(entry ? "login" : "register");
    entryView();
    account.showModal();
  }
  function accountBusy(value) {
    account.dataset.busy = String(value);
    account
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = value));
  }
  function render(data) {
    currentUser = data.user;
    serverTime = data.serverTime;
    resetAt = data.resetAt;
    clockAt = performance.now();
    $("account-label").textContent = currentUser
      ? `你好，${currentUser.nickname}`
      : "路过也可以先看看。";
    $("account-open").hidden = !!currentUser;
    $("account-logout").hidden = !currentUser;
    if (account.open) entryView();
    $("board-count").textContent = `今天的 ${data.posts.length} 张纸条`;
    const list = $("board-posts"),
      scroll = list.scrollTop;
    list.replaceChildren();
    if (!data.posts.length) {
      const empty = document.createElement("p");
      empty.className = "board-empty";
      const flower = document.createElement("span");
      flower.textContent = "✿";
      empty.append(
        flower,
        document.createTextNode("白板刚刚擦干净，留一句温柔的话吧。"),
      );
      list.append(empty);
    }
    for (const post of data.posts) {
      const article = document.createElement("article");
      article.className = "board-post";
      const p = document.createElement("p");
      p.textContent = post.text;
      const footer = document.createElement("footer"),
        name = document.createElement("span"),
        time = document.createElement("time");
      name.textContent = post.name;
      time.dateTime = new Date(post.createdAt).toISOString();
      time.textContent = new Date(post.createdAt).toLocaleTimeString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
      });
      footer.append(name, time);
      if (post.own) {
        const remove = document.createElement("button");
        remove.textContent = "收回";
        remove.type = "button";
        remove.onclick = async () => {
          if (await mutate("/api/board/delete", { id: post.id }))
            status("纸条已经收回。");
        };
        footer.append(remove);
      }
      article.append(p, footer);
      list.append(article);
    }
    list.scrollTop = scroll;
  }
  async function json(path, body) {
    const response = await fetch(
      path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) currentUser = null;
      throw new Error(result.error || "小院暂时没连上，请稍后重试。");
    }
    return result;
  }
  async function load() {
    if (busy || loading) return;
    loading = true;
    lastLoad = performance.now();
    const id = ++requestId;
    try {
      const data = await json("/api/community");
      if (id === requestId) {
        render(data);
        status("");
      }
    } catch {
      if (id === requestId) status("暂时没连上留言板，点“刷新”再试一次。");
    } finally {
      loading = false;
    }
  }
  async function mutate(path, body) {
    if (busy) return false;
    busy = true;
    requestId++;
    $("board-send").disabled = true;
    try {
      render(await json(path, body));
      return true;
    } catch (e) {
      status(e.message);
      return false;
    } finally {
      busy = false;
      $("board-send").disabled = false;
    }
  }
  function open() {
    $("board-dialog").showModal();
    load();
  }
  $("board-open").onclick = $("board-shortcut").onclick = open;
  $("board-refresh").onclick = load;
  $("board-message").oninput = () => {
    $("board-counter").textContent = `${$("board-message").value.length} / 280`;
  };
  $("board-form").onsubmit = async (event) => {
    event.preventDefault();
    if (!currentUser) {
      status("先登记或登录一个昵称，就能贴上纸条。");
      showAccount();
      return;
    }
    if (
      await mutate("/api/board/post", {
        text: $("board-message").value,
        anonymous: $("board-anonymous").checked,
      })
    ) {
      $("board-message").value = "";
      $("board-counter").textContent = "0 / 280";
      $("board-posts").scrollTop = $("board-posts").scrollHeight;
      status("纸条贴好啦，温柔会在这里停留到今晚。 ");
    }
  };
  $("account-open").onclick = () => showAccount();
  $("account-logout").onclick = async () => {
    if (await mutate("/api/account/logout", {}))
      status("已经退出，仍然可以看看大家的纸条。");
  };
  function setMode(value) {
    mode = value;
    $("register-tab").setAttribute("aria-pressed", String(mode === "register"));
    $("login-tab").setAttribute("aria-pressed", String(mode === "login"));
    $("account-password").autocomplete =
      mode === "register" ? "new-password" : "current-password";
    $("account-submit").textContent =
      mode === "register" ? "登记，成为小院邻居" : "登录，回来坐坐";
    $("account-status").textContent = "";
  }
  $("register-tab").onclick = () => setMode("register");
  $("login-tab").onclick = () => setMode("login");
  $("account-form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    requestId++;
    accountBusy(true);
    $("account-status").textContent = "正在打开小院的门…";
    try {
      render(
        await json(`/api/account/${mode}`, {
          nickname: $("account-nickname").value,
          password: $("account-password").value,
        }),
      );
      $("account-password").value = "";
      $("account-dialog").close();
      status("欢迎回来，纸条可以署名，也可以匿名。");
      if ($("board-dialog").open) $("board-message").focus();
    } catch (e) {
      $("account-status").textContent = e.message;
    } finally {
      busy = false;
      accountBusy(false);
    }
  };
  $("account-dialog").addEventListener("close", () => {
    $("account-password").value = "";
    $("account-status").textContent = "";
    const complete = entryResolve;
    entryResolve = null;
    account.dataset.entry = "false";
    complete?.();
  });
  account.addEventListener("cancel", (event) => {
    if (account.dataset.busy === "true") event.preventDefault();
  });
  $("account-continue").onclick = () => account.close();
  $("account-guest").onclick = async () => {
    if (busy) return;
    busy = true;
    requestId++;
    accountBusy(true);
    try {
      render(await json("/api/account/logout", {}));
      account.close();
    } catch {
      const message = "暂时无法切换游客。可以关闭窗口继续浏览，联网后再试。";
      $("account-status").textContent = message;
      if (!$("account-returning").hidden)
        $("account-welcome").textContent = message;
    } finally {
      busy = false;
      accountBusy(false);
    }
  };
  // No background polling when the board is closed or the tab is hidden.
  setInterval(() => {
    if (!$("board-dialog").open || document.hidden) return;
    if (resetAt) {
      const minutes = Math.max(0, Math.ceil((resetAt - clock()) / 60000));
      $("board-timer").textContent =
        `距清空 ${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`;
      if (clock() >= resetAt) {
        $("board-posts").replaceChildren();
        $("board-count").textContent = "新的一天，白板已清空";
        if (performance.now() - lastLoad > 5000) load();
      }
    }
    if (performance.now() - lastLoad > 30000) load();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && $("board-dialog").open) load();
  });
  return {
    promptEntry() {
      return new Promise((resolve) => {
        entryResolve = resolve;
        showAccount(true);
        load();
      });
    },
  };
}
