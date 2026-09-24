import { restorePet, advancePet, petAction, petDay } from "/pet-state.js";
import { createPetMotion } from "/pet-motion.js";
export function createCottage() {
  const $ = (id) => document.getElementById(id);
  const room = $("cottage-dialog"),
    cat = $("room-cat");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let offset = 0,
    lastSaved = 0,
    lastPet = -Infinity,
    reactionUntil = 0,
    reactionTimer,
    entryTimer;
  let color = "#f4dab0",
    loaded = false,
    frame = -1;
  const now = () => Date.now() + offset;
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem("huisheng-pet"));
  } catch {}
  let state = restorePet(saved, now());
  const atlas = new Image(),
    texture = document.createElement("canvas");
  texture.width = texture.height = 512;
  const ctx = $("resting-cat").getContext("2d");
  const detailMotion = createPetMotion($("resting-cat"));
  function persist(force = false) {
    if (!force && Date.now() - lastSaved < 5000) return;
    try {
      localStorage.setItem("huisheng-pet", JSON.stringify(state));
    } catch {}
    lastSaved = Date.now();
  }
  function draw(next) {
    if (!loaded || frame === next) return;
    detailMotion.stop();
    ctx.clearRect(0, 0, 256, 256);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      texture,
      (next % 2) * 256,
      Math.floor(next / 2) * 256,
      256,
      256,
      0,
      0,
      256,
      256,
    );
    frame = next;
    cat.dataset.frame = String(next);
  }
  function render() {
    state = advancePet(state, now());
    const happy = reactionUntil > now(),
      fed = state.fedDay === petDay(now());
    const low = state.mood <= 25,
      sleepy = state.activity <= 25;
    $("mood-meter").value = state.mood;
    $("activity-meter").value = state.activity;
    $("hunger-meter").value = fed ? 100 : 50;
    $("mood-label").textContent = low
      ? "想要抱抱"
      : state.mood >= 80
        ? "幸福满满"
        : "很安心";
    $("activity-label").textContent = sleepy
      ? "想睡觉了"
      : state.activity >= 80
        ? "精神满满"
        : "想去散步";
    $("hunger-label").textContent = fed ? "饱饱的" : "半饿";
    $("feed-cat").disabled = fed;
    $("feed-cat").dataset.fed = String(fed);
    $("feed-label").textContent = fed ? "今天已经吃饱啦" : "今日猫粮 · 1 份";
    $("feed-cat").querySelector("small").textContent = fed
      ? "明天也有，不用着急"
      : "点击，给小猫开饭";
    $("ration-note").textContent = fed
      ? "一份刚刚好的饱足，剩下的时间一起发呆。"
      : "今日的一份猫粮，已经放在碗边。";
    const reset = Date.parse(`${petDay(now())}T00:00:00+08:00`) + 86400000;
    const seconds = Math.max(0, Math.ceil((reset - now()) / 1000));
    $("ration-timer").textContent =
      `下份猫粮 ${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")} · 北京时间`;
    cat.dataset.expression = happy
      ? "happy"
      : sleepy
        ? "sleepy"
        : low
          ? "sad"
          : "calm";
    draw(happy ? 1 : sleepy ? 3 : low ? 2 : 0);
    if (!happy)
      $("cat-thought").textContent =
        low && sleepy
          ? "有点想你，也有点困。陪我坐坐吧。"
          : sleepy
            ? "哈欠～想睡一小会儿，也想陪你去散步。"
            : low
              ? "今天有一点点低落，可以摸摸我吗？"
              : "你来啦，靠近一点也没关系。";
    persist();
  }
  async function syncTime() {
    try {
      const response = await fetch("/api/garden-time");
      if (!response.ok) return;
      const result = await response.json();
      if (Number.isFinite(result.serverTime))
        offset = result.serverTime - Date.now();
    } catch {
      /* Local pet stays usable while reconnecting. */
    }
    if (room.open) render();
  }
  function react(part, message) {
    clearTimeout(reactionTimer);
    detailMotion.stop();
    cat.dataset.reaction = "calm";
    void cat.offsetWidth;
    cat.dataset.reaction = part;
    reactionUntil = now() + 2200;
    render();
    detailMotion.start(part);
    $("cat-thought").textContent = message;
    reactionTimer = setTimeout(() => {
      cat.dataset.reaction = "calm";
      reactionUntil = 0;
      if (room.open) render();
    }, 2200);
  }
  const responses = {
    head: "呼噜噜～耳尖轻轻抖了抖，喜欢你这样摸摸。",
    belly: "软乎乎的肚皮，放心地交给你啦。",
    paw: "伸个小懒腰，再和你碰一下爪爪。",
    tail: "尾巴尖轻轻摇一摇：喜欢你来陪我。",
  };
  function pet(part) {
    if (!room.open || !responses[part] || performance.now() - lastPet < 750)
      return;
    lastPet = performance.now();
    state = petAction(state, "pet", now());
    react(part, responses[part]);
    persist(true);
  }
  let pointer;
  cat.addEventListener("pointermove", (e) => {
    const part = e.target.closest("[data-pet]")?.dataset.pet;
    if (
      pointer &&
      Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 8 &&
      part
    ) {
      pet(part);
      pointer = { x: e.clientX, y: e.clientY };
    } else if (!pointer) pointer = { x: e.clientX, y: e.clientY };
  });
  cat.addEventListener("pointerleave", () => {
    pointer = null;
  });
  cat.querySelectorAll("[data-pet]").forEach((button) => {
    button.addEventListener("pointerdown", (e) => {
      if (e.button === 0) pet(button.dataset.pet);
    });
    button.addEventListener("click", () => pet(button.dataset.pet));
  });
  $("feed-cat").onclick = () => {
    if (state.fedDay === petDay(now())) return;
    state = petAction(state, "feed", now());
    react("feed", "啊呜，今天也吃得刚刚好。谢谢你呀！");
    persist(true);
  };
  function openRoom() {
    if (room.open || entryTimer) return;
    $("cottage-door").classList.add("is-opening");
    entryTimer = setTimeout(
      () => {
        entryTimer = null;
        room.showModal();
        render();
        syncTime();
        $("room-note").hidden = false;
      },
      reduced.matches ? 0 : 350,
    );
  }
  $("cottage-door").onclick = $("cottage-shortcut").onclick = openRoom;
  room.addEventListener("close", () => {
    detailMotion.stop();
    $("cottage-door").classList.remove("is-opening");
    state = advancePet(state, now());
    persist(true);
  });
  $("room-note-close").onclick = () => {
    $("room-note").hidden = true;
  };
  $("room-help").onclick = () => {
    $("room-note").hidden = !$("room-note").hidden;
  };
  $("guide-open").onclick = () => $("guide-dialog").showModal();
  setInterval(() => {
    if (room.open && !document.hidden) render();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      state = advancePet(state, now());
      persist(true);
    } else syncTime();
  });
  window.addEventListener("pagehide", () => {
    state = advancePet(state, now());
    persist(true);
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== "huisheng-pet" || !e.newValue) return;
    try {
      const incoming = restorePet(JSON.parse(e.newValue), now());
      if (incoming.updatedAt >= state.updatedAt) state = incoming;
    } catch {}
    if (room.open) render();
  });
  function setColor(value) {
    color = value;
    if (!loaded) return;
    const t = texture.getContext("2d", { willReadFrequently: true });
    t.clearRect(0, 0, 512, 512);
    t.drawImage(atlas, 0, 0, 512, 512);
    const pixels = t.getImageData(0, 0, 512, 512),
      d = pixels.data;
    const rgb = color
      .slice(1)
      .match(/../g)
      .map((c) => parseInt(c, 16));
    for (let i = 0; i < d.length; i += 4) {
      const light = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (
        d[i + 3] &&
        light > 145 &&
        Math.max(d[i], d[i + 1], d[i + 2]) -
          Math.min(d[i], d[i + 1], d[i + 2]) <
          90
      )
        for (let c = 0; c < 3; c++)
          d[i + c] = Math.round((rgb[c] * light) / 255);
    }
    t.putImageData(pixels, 0, 0);
    frame = -1;
    render();
  }
  atlas.onload = () => {
    loaded = true;
    setColor(color);
  };
  atlas.src = "/assets/cat-rest.webp";
  syncTime();
  return {
    setColor,
    play(distance) {
      state = petAction(state, "play", now(), distance);
      persist();
    },
  };
}
