import { playSound } from "/garden-audio.js";
// The welcome note counts five visible seconds, then folds into its own guide.
export function createIntroFlight({ card, paper, door, replay }) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const animations = new Set();
  const copy = card.querySelector(".caption-copy");
  let remaining = 5000,
    timer = null,
    since = null,
    generation = 0;
  let paused = false,
    arrivedTimer = null;
  const phase = (value) => {
    card.dataset.phase = value;
  };
  function cancelAnimations() {
    for (const animation of animations) animation.cancel();
    animations.clear();
  }
  function stopTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      remaining = Math.max(0, remaining - (performance.now() - since));
      timer = null;
      since = null;
    }
  }
  function complete() {
    stopTimer();
    card.hidden = true;
    paper.hidden = true;
    cancelAnimations();
    phase("complete");
    gardenArrival();
  }
  function gardenArrival() {
    door.classList.add("letter-arrived");
    clearTimeout(arrivedTimer);
    arrivedTimer = setTimeout(
      () => door.classList.remove("letter-arrived"),
      1100,
    );
  }
  function animate(element, frames, options) {
    const animation = element.animate(frames, { fill: "forwards", ...options });
    animations.add(animation);
    if (paused) animation.pause();
    return animation.finished;
  }
  const transform = (x, y, angle, sx, sy) =>
    `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${angle}deg) scale(${sx},${sy})`;
  async function foldAndFly() {
    timer = null;
    since = null;
    remaining = 0;
    const current = generation;
    if (reduced.matches) {
      complete();
      return;
    }
    phase("folding");
    playSound("paper");
    try {
      await animate(
        copy,
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(.96)" },
        ],
        { duration: 160, easing: "ease-in" },
      );
      if (current !== generation) return;
      const r = card.getBoundingClientRect();
      const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const sx = 96 / r.width,
        sy = 62 / r.height;
      paper.style.width = `${r.width}px`;
      paper.style.height = `${r.height}px`;
      paper.hidden = false;
      card.hidden = true;
      const flat = [
        "polygon(0% 0%,50% 0%,50% 50%,0% 50%)",
        "polygon(50% 0%,100% 0%,100% 50%,50% 50%)",
        "polygon(0% 50%,50% 50%,50% 100%,0% 100%)",
        "polygon(50% 50%,100% 50%,100% 100%,50% 100%)",
      ];
      const folded = [
        "polygon(0% 8%,100% 50%,28% 46%,18% 32%)",
        "polygon(28% 46%,100% 50%,30% 66%,30% 66%)",
        "polygon(0% 92%,100% 50%,30% 66%,18% 78%)",
        "polygon(18% 32%,28% 46%,30% 66%,12% 57%)",
      ];
      await Promise.all([
        animate(
          paper,
          [
            { transform: transform(start.x, start.y, 0, 1, 1) },
            {
              transform: transform(start.x, start.y - 16, -5, 0.65, 0.62),
              offset: 0.45,
            },
            { transform: transform(start.x, start.y - 24, -18, sx, sy) },
          ],
          { duration: 780, easing: "cubic-bezier(.45,0,.25,1)" },
        ),
        ...Array.from(paper.children, (wing, i) =>
          animate(wing, [{ clipPath: flat[i] }, { clipPath: folded[i] }], {
            duration: 690,
            delay: i * 25,
            easing: "cubic-bezier(.4,0,.2,1)",
          }),
        ),
      ]);
      if (current !== generation) return;
      phase("flying");
      const hole = door.getBoundingClientRect();
      const a = { x: start.x, y: start.y - 24 };
      const d = {
        x: hole.left + hole.width / 2,
        y: hole.top + hole.height * 0.52,
      };
      const dx = d.x - a.x,
        dy = d.y - a.y;
      const b = {
        x: a.x + Math.max(70, Math.min(180, dx * 0.3)),
        y: a.y - Math.max(110, Math.abs(dy) * 0.65),
      };
      const c = { x: d.x - Math.max(60, Math.abs(dx) * 0.22), y: d.y - 80 };
      const frames = Array.from({ length: 61 }, (_, i) => {
        const t = i / 60,
          u = 1 - t;
        const x =
          u * u * u * a.x +
          3 * u * u * t * b.x +
          3 * u * t * t * c.x +
          t * t * t * d.x;
        const y =
          u * u * u * a.y +
          3 * u * u * t * b.y +
          3 * u * t * t * c.y +
          t * t * t * d.y;
        const vx =
          3 * u * u * (b.x - a.x) +
          6 * u * t * (c.x - b.x) +
          3 * t * t * (d.x - c.x);
        const vy =
          3 * u * u * (b.y - a.y) +
          6 * u * t * (c.y - b.y) +
          3 * t * t * (d.y - c.y);
        const tangent = (Math.atan2(vy, vx) * 180) / Math.PI;
        const angle = -18 + (tangent + 18) * Math.min(1, t * 7);
        const scale =
          t < 0.78 ? 1 - 0.25 * t : 0.805 * (1 - (t - 0.78) / 0.22) + 0.03;
        return {
          offset: t,
          transform: transform(x, y, angle, sx * scale, sy * scale),
          opacity: t < 0.93 ? 1 : (1 - t) / 0.07,
        };
      });
      await animate(paper, frames, { duration: 1900, easing: "linear" });
      if (current === generation) complete();
    } catch {
      /* Replay or a motion preference change canceled this flight. */
    }
  }
  function sync() {
    paused = document.hidden || !!document.querySelector("dialog[open]");
    if (paused) stopTimer();
    else if (card.dataset.phase === "waiting" && timer === null) {
      since = performance.now();
      timer = setTimeout(foldAndFly, remaining);
    }
    for (const animation of animations) {
      if (paused && animation.playState === "running") animation.pause();
      else if (!paused && animation.playState === "paused") animation.play();
    }
  }
  function reset() {
    generation++;
    stopTimer();
    cancelAnimations();
    clearTimeout(arrivedTimer);
    door.classList.remove("letter-arrived");
    card.hidden = false;
    paper.hidden = true;
    remaining = 5000;
    phase("waiting");
    sync();
  }
  const observer = new MutationObserver(sync);
  document
    .querySelectorAll("dialog")
    .forEach((dialog) =>
      observer.observe(dialog, { attributes: true, attributeFilter: ["open"] }),
    );
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", () => {
    if (reduced.matches && ["folding", "flying"].includes(card.dataset.phase)) {
      generation++;
      complete();
    }
  });
  // Resizing changes the destination. Re-read the note before starting a new path.
  window.addEventListener("resize", () => {
    if (["folding", "flying"].includes(card.dataset.phase)) reset();
  });
  replay.addEventListener("click", reset);
  reset();
}
