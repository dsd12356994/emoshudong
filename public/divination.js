import { playSound } from "/garden-audio.js";
import { openLetter } from "/app.js";

const $ = (id) => document.getElementById(id);
const today = new Date().toLocaleDateString("en-CA");

const zodiacSigns = [
  { name: "摩羯座", symbol: "♑", element: "土", mode: "本位", start: [12, 22], end: [1, 19], mood: "把一步一步走稳，也是一种温柔。", prompt: "今天有没有一件事，值得你慢一点完成？" },
  { name: "水瓶座", symbol: "♒", element: "风", mode: "固定", start: [1, 20], end: [2, 18], mood: "保留自己的角落，也保留好奇心。", prompt: "什么想法，是你希望被好好听见的？" },
  { name: "双鱼座", symbol: "♓", element: "水", mode: "变动", start: [2, 19], end: [3, 20], mood: "敏感不是负担，它让你看见细微的光。", prompt: "今天哪一点小小的感觉，值得被记下来？" },
  { name: "白羊座", symbol: "♈", element: "火", mode: "本位", start: [3, 21], end: [4, 19], mood: "先照看心里的火，再决定往哪里走。", prompt: "你现在真正想开始的第一小步是什么？" },
  { name: "金牛座", symbol: "♉", element: "土", mode: "固定", start: [4, 20], end: [5, 20], mood: "舒服和稳定不是停滞，是给自己留根。", prompt: "什么日常的小事能让你重新落地？" },
  { name: "双子座", symbol: "♊", element: "风", mode: "变动", start: [5, 21], end: [6, 20], mood: "好奇可以有很多方向，也不必一次走完。", prompt: "哪句话，你希望有人认真回答？" },
  { name: "巨蟹座", symbol: "♋", element: "水", mode: "本位", start: [6, 21], end: [7, 22], mood: "照顾别人以前，也可以先听听自己的需要。", prompt: "今天什么会让你感觉更像回到家？" },
  { name: "狮子座", symbol: "♌", element: "火", mode: "固定", start: [7, 23], end: [8, 22], mood: "被看见很好，安静地发光也很好。", prompt: "你想为自己承认哪一个小小的做得不错？" },
  { name: "处女座", symbol: "♍", element: "土", mode: "变动", start: [8, 23], end: [9, 22], mood: "不必把一切都整理好，留一点空白也可以。", prompt: "哪件事可以只做到足够，而不是完美？" },
  { name: "天秤座", symbol: "♎", element: "风", mode: "本位", start: [9, 23], end: [10, 22], mood: "关系需要平衡，也需要你自己的位置。", prompt: "一段舒服的关系会让你感到什么？" },
  { name: "天蝎座", symbol: "♏", element: "水", mode: "固定", start: [10, 23], end: [11, 21], mood: "深情可以有边界，沉默也不必替你承担一切。", prompt: "你愿意把哪一点真实留给自己？" },
  { name: "射手座", symbol: "♐", element: "火", mode: "变动", start: [11, 22], end: [12, 21], mood: "远方很大，今天也可以只走到窗边。", prompt: "现在最想给生活打开哪一扇小窗？" },
];

const tarotDeck = [
  ["愚者", "〇", "把未知当作一条还没写完的路。今天不必保证结果，只要确认下一步是你愿意走的。"],
  ["魔术师", "✦", "你手边已经有一些可以使用的东西。把注意力从缺少什么，轻轻移回你能做什么。"],
  ["女祭司", "☾", "答案可能还在沉默里发芽。先让直觉和事实并排坐一会儿，不急着替它们选边。"],
  ["皇后", "❀", "给自己一处能生长的空间。被照料不是软弱，舒服和丰盛也值得被认真对待。"],
  ["皇帝", "◇", "清晰的边界能让温柔留下来。想一想，什么是你愿意承担的，什么应该交还给对方。"],
  ["恋人", "♡", "选择不是寻找命定答案，而是诚实地看见自己在乎什么，并尊重彼此的自由。"],
  ["战车", "→", "方向比速度更重要。把力气收拢到一件小事上，走得慢一点也算在前进。"],
  ["力量", "♧", "真正的力量不一定很响。你可以一边害怕，一边用不伤害自己的方式继续照顾自己。"],
  ["隐者", "☼", "暂时退到安静处并不等于逃避。独处一会儿，或许能让自己的声音重新变清楚。"],
  ["星星", "✧", "希望不需要立刻变成计划。先留住一点微光，等你有力气时再决定它照向哪里。"],
  ["月亮", "☽", "模糊会放大猜测。把已知、未知和担心分开写下，夜就不会替你完成所有解释。"],
  ["太阳", "☀", "允许自己享受简单的好事。快乐不需要先证明自己已经足够辛苦。"],
  ["世界", "◎", "一个阶段正在收尾。告别不抹去经历，它只是把故事交还给更大的生活。"],
];

function zodiacFor(value) {
  const [month, day] = value.split("-").slice(1).map(Number);
  return zodiacSigns.find((sign) => {
    const afterStart = month === sign.start[0]
      ? day >= sign.start[1]
      : month > sign.start[0] || (sign.start[0] === 12 && month < 2);
    const beforeEnd = month === sign.end[0]
      ? day <= sign.end[1]
      : month < sign.end[0] || (sign.end[0] === 1 && month > 11);
    return afterStart && beforeEnd;
  }) ?? zodiacSigns[0];
}

const harmoniousElements = new Set(["火-风", "风-火", "土-水", "水-土"]);
function zodiacCompatibility(first, second) {
  const elementPair = `${first.element}-${second.element}`;
  const sameElement = first.element === second.element;
  const elementScore = sameElement ? 82 : harmoniousElements.has(elementPair) ? 90 : 62;
  const modeScore = first.mode === second.mode ? 76 : 84;
  const score = Math.round(elementScore * 0.6 + modeScore * 0.4);
  const elementReading = sameElement
    ? `两张星座笺同属${first.element}元素，像是共享一种表达节奏。相似可以成为共同语言，也值得给彼此保留不同。`
    : harmoniousElements.has(elementPair)
      ? `${first.element}与${second.element}在这套象征里被视为容易互相点亮的组合，适合把好奇和照顾都说得具体。`
      : `${first.element}与${second.element}在这套象征里节奏较不一样，可以把差异当作练习边界和倾听的入口。`;
  const modeReading = first.mode === second.mode
    ? `两人同为${first.mode}模式，做决定的步速可能相近，也要留意不要把“应该一样”变成压力。`
    : `两人的模式分别是${first.mode}与${second.mode}，一方可能更快发起，另一方更愿意调整；提前说清需要的时间，会比猜测更温柔。`;
  return {
    score,
    label: "星座匹配度 · 娱乐指数",
    disclaimer: "本站自定义的象征匹配分，不是关系成功率，也不是性格或未来的科学预测。",
    summary: `这两张星座笺得到 ${score} / 100 的象征指数。${elementReading}`,
    paragraphs: [modeReading, "分数只为你们提供一个轻松的话题，不替任何人确认心意。现实里的回应、尊重和边界，永远比星座标签更重要。"],
    dimensions: [
      { label: "元素意象", score: elementScore, detail: `${first.element} × ${second.element}` },
      { label: "行动节奏", score: modeScore, detail: `${first.mode} × ${second.mode}` },
    ],
    method: "自定义规则：元素意象占60%，行动节奏占40%。同元素82分，火×风或土×水90分，其余62分；同模式76分，不同模式84分。它是写信和自我观察的小工具，不代表专业占星结论。",
  };
}

function renderZodiac(first, firstDate, second, secondDate) {
  const result = $("zodiac-result");
  result.replaceChildren();
  const match = zodiacCompatibility(first, second);
  const section = document.createElement("section");
  section.className = "compatibility-result";
  const heading = document.createElement("div");
  heading.className = "compatibility-heading";
  const title = document.createElement("h3");
  title.textContent = match.label;
  const score = document.createElement("div");
  score.className = "compatibility-score";
  const number = document.createElement("strong");
  number.textContent = match.score;
  const scale = document.createElement("small");
  scale.textContent = " / 100";
  score.append(number, scale);
  heading.append(title, score);
  const disclaimer = document.createElement("p");
  disclaimer.className = "compatibility-note";
  disclaimer.textContent = match.disclaimer;
  section.append(heading, disclaimer);
  const cards = document.createElement("div");
  cards.className = "zodiac-pair-cards";
  for (const [label, sign, date] of [["我的星座", first, firstDate], ["对方的星座", second, secondDate]]) {
    const card = document.createElement("article");
    card.className = "zodiac-sign-card";
    const mark = document.createElement("span");
    mark.className = "divination-mark";
    mark.textContent = sign.symbol;
    const name = document.createElement("b");
    name.textContent = `${label} · ${sign.name}`;
    const dateText = document.createElement("small");
    dateText.textContent = date;
    const mood = document.createElement("p");
    mood.textContent = sign.mood;
    card.append(mark, name, dateText, mood);
    cards.append(card);
  }
  section.append(cards);
  for (const text of [match.summary, ...match.paragraphs]) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    section.append(paragraph);
  }
  const dimensions = document.createElement("div");
  dimensions.className = "compatibility-details";
  for (const item of match.dimensions) {
    const dimension = document.createElement("div");
    const label = document.createElement("b");
    label.textContent = `${item.label} · ${item.score} / 100`;
    const detail = document.createElement("span");
    detail.textContent = item.detail;
    dimension.append(label, detail);
    dimensions.append(dimension);
  }
  const method = document.createElement("details");
  const caption = document.createElement("summary");
  caption.textContent = "这份匹配指数怎么算？";
  const explanation = document.createElement("p");
  explanation.textContent = match.method;
  method.append(caption, explanation);
  section.append(dimensions, method);
  result.append(section);
  result.hidden = false;
}

function drawTarot() {
  const picked = new Set();
  while (picked.size < 3) picked.add(Math.floor(Math.random() * tarotDeck.length));
  document.querySelectorAll(".tarot-card").forEach((button, index) => {
    button.dataset.card = String([...picked][index]);
    button.disabled = false;
    button.classList.remove("is-revealed", "is-muted");
    button.replaceChildren(Object.assign(document.createElement("span"), { textContent: "✿" }));
  });
  $("tarot-result").hidden = true;
  $("tarot-result").replaceChildren();
}

function revealTarot(button) {
  if (button.classList.contains("is-revealed")) return;
  const card = tarotDeck[Number(button.dataset.card)];
  document.querySelectorAll(".tarot-card").forEach((other) => {
    other.disabled = true;
    if (other !== button) other.classList.add("is-muted");
  });
  button.classList.add("is-revealed");
  button.replaceChildren(Object.assign(document.createElement("span"), { textContent: card[1] }));
  const result = $("tarot-result");
  result.replaceChildren();
  const overline = document.createElement("span");
  overline.className = "overline";
  overline.textContent = "你抽到的是";
  const title = document.createElement("h3");
  title.textContent = `${card[1]} ${card[0]}`;
  const copy = document.createElement("p");
  copy.textContent = card[2];
  result.append(overline, title, copy);
  result.hidden = false;
  playSound("success");
}

let returnToLetter = false;
function closeLetterForTool() {
  returnToLetter = $("letter-dialog").open;
  if (returnToLetter) $("letter-dialog").close();
}
function returnToLetterIfNeeded() {
  if (!returnToLetter) return;
  returnToLetter = false;
  openLetter();
}

$("bazi-open").onclick = () => {
  closeLetterForTool();
  setTimeout(() => $("birth-open").click(), 0);
};
$("birth-dialog").addEventListener("close", returnToLetterIfNeeded);
$("zodiac-date").max = today;
$("zodiac-other-date").max = today;
$("zodiac-form").onsubmit = (event) => {
  event.preventDefault();
  const date = $("zodiac-date").value;
  const otherDate = $("zodiac-other-date").value;
  if (!date || !otherDate) return;
  renderZodiac(zodiacFor(date), date, zodiacFor(otherDate), otherDate);
  playSound("paper");
};
$("zodiac-open").onclick = () => {
  if (!$('zodiac-date').value && $("self-date").value) $("zodiac-date").value = $("self-date").value;
  if (!$('zodiac-other-date').value && $("other-date").value) $("zodiac-other-date").value = $("other-date").value;
  closeLetterForTool();
  setTimeout(() => $("zodiac-dialog").showModal(), 0);
};
$("zodiac-dialog").addEventListener("close", returnToLetterIfNeeded);
$("tarot-open").onclick = () => {
  drawTarot();
  closeLetterForTool();
  setTimeout(() => {
    $("tarot-dialog").showModal();
    playSound("paper");
  }, 0);
};
$("tarot-dialog").addEventListener("close", returnToLetterIfNeeded);
document.querySelectorAll(".tarot-card").forEach((button) => {
  button.onclick = () => revealTarot(button);
});
$("tarot-again").onclick = () => {
  drawTarot();
  playSound("tap");
};
drawTarot();
