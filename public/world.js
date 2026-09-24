import { createCatCompanion } from "/cat-companion.js";
import { createIntroFlight } from "/intro-flight.js";
import { createCottage } from "/cottage.js";
import { createCommunityBoard } from "/community.js";
import { createArrival } from "/arrival.js";
const $ = (id) => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const cottage = createCottage();
const community = createCommunityBoard();
let entering = false;
function enterTree() {
  if (entering || $("letter-dialog").open) return;
  entering = true;
  document.body.classList.add("entering-tree");
  setTimeout(
    () => {
      $("letter-dialog").showModal();
      document.body.classList.remove("entering-tree");
      entering = false;
    },
    reduced.matches ? 0 : 220,
  );
}
const companion = createCatCompanion({
  element: $("garden-cat"),
  garden: document.querySelector(".garden"),
  door: $("tree-door"),
  enter: enterTree,
  onTravel: (distance) => cottage.play(distance),
});
let prefs = { color: "#f4dab0", motion: !reduced.matches };
try {
  const saved = JSON.parse(localStorage.getItem("huisheng-garden") || "null");
  if (
    saved &&
    /^#[a-f\d]{6}$/i.test(saved.color) &&
    typeof saved.motion === "boolean"
  )
    prefs = saved;
} catch {}
function save() {
  try {
    localStorage.setItem("huisheng-garden", JSON.stringify(prefs));
  } catch {}
}
function motion() {
  document.body.classList.toggle(
    "still",
    !prefs.motion || reduced.matches || document.hidden,
  );
  $("motion-toggle").setAttribute(
    "aria-pressed",
    String(prefs.motion && !reduced.matches),
  );
  $("motion-toggle").textContent =
    prefs.motion && !reduced.matches ? "花瓣 · 飘落" : "花瓣 · 静止";
}
motion();
document.addEventListener("visibilitychange", motion);
reduced.addEventListener("change", motion);
$("motion-toggle").onclick = () => {
  prefs.motion = !prefs.motion;
  save();
  motion();
};
for (let i = 0; i < 16; i++) {
  const p = document.createElement("i");
  p.style.left = `${(i * 37) % 100}%`;
  p.style.animationDelay = `${-i * 1.7}s`;
  p.style.animationDuration = `${13 + (i % 6) * 2}s`;
  p.style.setProperty("--drift", `${80 + (i % 5) * 30}px`);
  $("petals").append(p);
}
const cat = new Image();
cat.src = "/assets/cat.webp";
function colorCat(color) {
  companion.setColor(color);
  cottage.setColor(color);
  if (!cat.complete || !cat.naturalWidth) return;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(cat, 0, 0, 96, 96);
  const pixels = ctx.getImageData(0, 0, 96, 96),
    d = pixels.data;
  const rgb = color
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16));
  for (let i = 0; i < d.length; i += 4) {
    const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (
      d[i + 3] &&
      brightness > 145 &&
      Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <
        90
    ) {
      const shade = brightness / 255;
      for (let j = 0; j < 3; j++) d[i + j] = Math.round(rgb[j] * shade);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const src = canvas.toDataURL();
  document.querySelectorAll(".cat-image").forEach((img) => (img.src = src));
}
cat.onload = () => colorCat(prefs.color);
if (cat.complete) colorCat(prefs.color);
$("cat-color").value = prefs.color;
$("cat-color").oninput = (e) => colorCat(e.target.value);
document.querySelectorAll("[data-color]").forEach(
  (b) =>
    (b.onclick = () => {
      $("cat-color").value = b.dataset.color;
      colorCat(b.dataset.color);
    }),
);
$("cat-form").onsubmit = (e) => {
  e.preventDefault();
  prefs.color = $("cat-color").value;
  save();
  colorCat(prefs.color);
  $("cat-dialog").close();
};
$("cat-open").onclick = () => {
  $("cat-color").value = prefs.color;
  $("cat-dialog").showModal();
};
$("cat-dialog").addEventListener("close", () => colorCat(prefs.color));
let firstVisit = true;
try {
  firstVisit = !localStorage.getItem("huisheng-garden");
} catch {}
createArrival({ community, firstVisit });
createIntroFlight({
  card: $("intro-card"),
  paper: $("intro-paper"),
  door: $("tree-door"),
  replay: $("intro-replay"),
});
document
  .querySelectorAll("[data-enter]")
  .forEach((button) => (button.onclick = enterTree));
let libraryLoaded = false;
$("library-open").onclick = async () => {
  $("library-dialog").showModal();
  if (libraryLoaded) return;
  try {
    const response = await fetch("/api/library");
    if (!response.ok) throw Error();
    const { cards } = await response.json();
    $("library-list").replaceChildren();
    for (const card of cards) {
      const article = document.createElement("article");
      const tag = document.createElement("small");
      tag.textContent =
        card.domain === "bazi"
          ? "传统文化 · 非科学预测"
          : "情绪支持 · 公共健康指南";
      const h = document.createElement("h3");
      h.textContent = card.title;
      const p = document.createElement("p");
      p.textContent = card.summary;
      const a = document.createElement("a");
      a.href = card.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = `${card.publisher} ↗`;
      article.append(tag, h, p, a);
      $("library-list").append(article);
    }
    libraryLoaded = true;
  } catch {
    $("library-list").textContent = "资料架暂时没有打开，请关闭后重试。";
  }
};
