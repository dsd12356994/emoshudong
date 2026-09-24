const $ = (id) => document.getElementById(id);
const tracks = {
  forget: { file: "forget-me-not.mp3", title: "Forget Me Not · Kistol" },
  trifle: { file: "a-simple-trifle.mp3", title: "A Simple Trifle · jestar" },
};
const gaps = {
  tap: 100,
  paper: 650,
  open: 450,
  close: 450,
  send: 1000,
  success: 1100,
  meow: 10000,
  feed: 1400,
};
let preferences = {
  track: "forget",
  musicVolume: 45,
  effectsVolume: 55,
  effects: true,
};
try {
  const saved = JSON.parse(localStorage.getItem("huisheng-audio"));
  if (saved && tracks[saved.track]) preferences.track = saved.track;
  for (const key of ["musicVolume", "effectsVolume"])
    if (Number.isFinite(saved?.[key]) && saved[key] >= 0 && saved[key] <= 100)
      preferences[key] = saved[key];
  if (typeof saved?.effects === "boolean") preferences.effects = saved.effects;
} catch {}
// Music is always opt-in on each page load. Only the selected track, volume,
// and effects preference persist. No audio file is fetched before interaction.
let context,
  musicGain,
  effectsGain,
  musicSource = null;
let musicOn = false,
  musicLoading = false,
  musicGeneration = 0,
  effectsGeneration = 0,
  unlocked = false;
let failure = "";
const buffers = new Map(),
  lastPlayed = new Map(),
  pendingEffects = new Set(),
  voices = new Set();
function save() {
  try {
    localStorage.setItem("huisheng-audio", JSON.stringify(preferences));
  } catch {}
}
function ensureContext() {
  if (context) return context;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw Error("浏览器暂不支持声音，仍可安静地逛小院。");
  context = new AudioContext();
  musicGain = context.createGain();
  effectsGain = context.createGain();
  musicGain.gain.value = 0;
  effectsGain.gain.value = preferences.effectsVolume / 100;
  musicGain.connect(context.destination);
  effectsGain.connect(context.destination);
  context.addEventListener("statechange", render);
  return context;
}
function ramp(node, value, seconds = 0.35) {
  if (!node || !context) return;
  node.gain.cancelScheduledValues(context.currentTime);
  node.gain.setValueAtTime(node.gain.value, context.currentTime);
  node.gain.linearRampToValueAtTime(value, context.currentTime + seconds);
}
function render() {
  $("music-toggle").setAttribute("aria-pressed", String(musicOn));
  $("music-toggle").setAttribute(
    "aria-label",
    musicOn ? "关闭背景钢琴音乐" : "开启背景钢琴音乐",
  );
  $("music-toggle").dataset.loading = String(musicLoading);
  $("music-toggle").setAttribute("aria-busy", String(musicLoading));
  $("music-toggle").title =
    failure ||
    (musicLoading
      ? "钢琴正在准备，点击可取消"
      : musicOn
        ? "关闭背景音乐"
        : "听一点钢琴");
  $("music-switch").checked = musicOn;
  $("effects-switch").checked = preferences.effects;
  $("audio-track").value = preferences.track;
  for (const kind of ["music", "effects"]) {
    $(kind + "-volume").value = preferences[kind + "Volume"];
    $(kind + "-volume-label").textContent = preferences[kind + "Volume"] + "%";
  }
  const text =
    failure ||
    (musicLoading
      ? "正在准备钢琴，稍等一小会儿…"
      : musicOn
        ? document.hidden || context?.state !== "running"
          ? "音乐已暂停，回来后继续；若没有声音，再点一次音符。"
          : `正在轻轻播放：${tracks[preferences.track].title}`
        : "音乐已关闭。想听的时候，再点亮那枚音符。 ");
  $("audio-status").textContent = text;
  $("audio-live-status").textContent =
    failure ||
    (musicLoading
      ? "正在加载钢琴音乐"
      : musicOn
        ? "背景音乐已开启"
        : "背景音乐已关闭");
  $("audio-live-status").classList.toggle("sr-only", !failure);
}
async function load(file) {
  if (!buffers.has(file)) {
    const pending = (async () => {
      const response = await fetch("/assets/audio/" + file);
      if (!response.ok) throw Error("声音暂时没加载好，点一下音符可以重试。");
      const buffer = await ensureContext().decodeAudioData(
        await response.arrayBuffer(),
      );
      if (file.endsWith(".mp3")) {
        // A tiny boundary fade avoids clicks at loop edges without changing timing.
        const edge = Math.min(
          Math.round(buffer.sampleRate * 0.015),
          buffer.length / 2,
        );
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const data = buffer.getChannelData(c);
          for (let i = 0; i < edge; i++) {
            data[i] *= i / edge;
            data[data.length - 1 - i] *= i / edge;
          }
        }
      }
      return buffer;
    })();
    buffers.set(file, pending);
    pending.catch(() => buffers.delete(file));
  }
  return buffers.get(file);
}
function stopMusic() {
  if (!musicSource) return;
  const old = musicSource;
  musicSource = null;
  ramp(old.level, 0, 0.3);
  old.source.stop(context.currentTime + 0.32);
}
async function setMusic(enabled) {
  const generation = ++musicGeneration;
  musicOn = enabled;
  musicLoading = enabled;
  failure = "";
  if (!enabled) {
    stopMusic();
    render();
    return;
  }
  render();
  try {
    const audioContext = ensureContext();
    await audioContext.resume();
    const buffer = await load(tracks[preferences.track].file);
    if (generation !== musicGeneration || !musicOn) return;
    stopMusic();
    const source = audioContext.createBufferSource(),
      level = audioContext.createGain();
    source.buffer = buffer;
    source.loop = true;
    level.gain.value = 0;
    source.connect(level).connect(musicGain);
    source.onended = () => {
      source.disconnect();
      level.disconnect();
    };
    musicSource = { source, level };
    musicGain.gain.value = preferences.musicVolume / 100;
    source.start();
    ramp(level, 1, 0.8);
    musicLoading = false;
  } catch (error) {
    if (generation !== musicGeneration) return;
    musicOn = false;
    musicLoading = false;
    stopMusic();
    failure =
      error.message?.startsWith("声音") || error.message?.startsWith("浏览器")
        ? error.message
        : "音乐暂时没有响起来，可以再点一下音符重试。";
  }
  render();
}
function stopEffects() {
  effectsGeneration++;
  for (const voice of voices) {
    try {
      voice.stop();
    } catch {}
  }
  voices.clear();
}
export async function playSound(name, rate = 1) {
  if (
    !preferences.effects ||
    preferences.effectsVolume === 0 ||
    !unlocked ||
    document.hidden ||
    !(name in gaps)
  )
    return;
  const requested = performance.now();
  const generation = effectsGeneration;
  if (
    pendingEffects.has(name) ||
    requested - (lastPlayed.get(name) ?? -Infinity) < gaps[name]
  )
    return;
  pendingEffects.add(name);
  try {
    const audioContext = ensureContext();
    if (audioContext.state !== "running") return;
    const buffer = await load(name === "meow" ? "cat-meow.wav" : name + ".wav");
    // Never queue a burst of delayed effects after a slow download or tab switch.
    if (
      generation !== effectsGeneration ||
      !preferences.effects ||
      preferences.effectsVolume === 0 ||
      document.hidden ||
      context.state !== "running" ||
      performance.now() - requested > 900 ||
      voices.size >= 3
    )
      return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.85, Math.min(1.15, rate));
    source.connect(effectsGain);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
    };
    source.start();
    // Cooldown starts only when a sound plays. Muted, failed or skipped requests
    // don't consume it, and repeated petting never postpones the next meow.
    lastPlayed.set(name, performance.now());
  } catch {
    /* An unavailable effect must never block an interaction. */
  } finally {
    pendingEffects.delete(name);
  }
}
function unlock(event) {
  if (!event.isTrusted || document.hidden) return;
  unlocked = true;
  if (preferences.effects || musicOn) {
    try {
      ensureContext()
        .resume()
        .catch(() => {});
    } catch {}
  }
}
document.addEventListener("pointerdown", unlock, {
  capture: true,
  passive: true,
});
document.addEventListener("keydown", unlock, { capture: true });
$("music-toggle").addEventListener("click", () => setMusic(!musicOn));
$("music-switch").addEventListener("change", (e) => setMusic(e.target.checked));
$("effects-switch").addEventListener("change", (e) => {
  preferences.effects = e.target.checked;
  if (!preferences.effects) stopEffects();
  save();
  render();
  if (preferences.effects) {
    try {
      ensureContext()
        .resume()
        .then(() => playSound("tap"))
        .catch(() => {});
    } catch {}
  }
});
for (const kind of ["music", "effects"])
  $(kind + "-volume").addEventListener("input", (e) => {
    preferences[kind + "Volume"] = Number(e.target.value);
    ramp(
      kind === "music" ? musicGain : effectsGain,
      Number(e.target.value) / 100,
    );
    save();
    render();
  });
$("audio-track").addEventListener("change", (e) => {
  preferences.track = e.target.value;
  save();
  if (musicOn) setMusic(true);
  else render();
});
document.querySelectorAll("[data-audio-settings]").forEach((button) =>
  button.addEventListener("click", () => {
    render();
    if (!$("audio-dialog").open) $("audio-dialog").showModal();
  }),
);
document.addEventListener("click", (event) => {
  if (!event.isTrusted) return;
  const button = event.target.closest("button");
  if (
    !button ||
    button.disabled ||
    button.matches(
      "[data-pet],[data-audio-settings],#music-toggle,#send,#board-send,#feed-cat,#tree-door,#cottage-door,#cottage-shortcut,#board-open,#board-shortcut,#intro-replay",
    ) ||
    button.closest(
      "#account-dialog,#announcement-dialog,#funding-dialog,#chat-consent-dialog,#privacy-dialog,#model-dialog,#audio-dialog",
    )
  )
    return;
  if (button.dataset.close === "cottage-dialog") return;
  playSound(button.hasAttribute("data-close") ? "close" : "tap");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopEffects();
    context?.suspend().catch(() => {});
  } else if (context && unlocked && (musicOn || preferences.effects))
    context.resume().catch(() => {});
  render();
});
window.addEventListener("pagehide", () => {
  stopEffects();
  context?.suspend().catch(() => {});
});
window.addEventListener("pageshow", () => {
  if (
    context &&
    !document.hidden &&
    unlocked &&
    (musicOn || preferences.effects)
  )
    context.resume().catch(() => {});
});
render();
