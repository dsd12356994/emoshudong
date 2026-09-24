export function createArrival({ community, firstVisit }) {
  const $ = (id) => document.getElementById(id);
  const notice = $("announcement-dialog");
  let remaining = 5000,
    since = null,
    tick = null,
    hold = false,
    complete = null;
  function pause() {
    if (since !== null)
      remaining = Math.max(0, remaining - (performance.now() - since));
    since = null;
    clearTimeout(tick);
    tick = null;
  }
  function update() {
    const left = Math.max(
      0,
      remaining - (since === null ? 0 : performance.now() - since),
    );
    $("announcement-countdown").textContent = hold
      ? "已暂停，慢慢读"
      : `${Math.ceil(left / 1000)} 秒后收起`;
    if (left <= 0 && notice.open) {
      notice.close();
      return;
    }
    if (since !== null) tick = setTimeout(update, Math.min(100, left));
  }
  function sync() {
    const obscured = [...document.querySelectorAll("dialog[open]")].some(
      (dialog) => dialog !== notice,
    );
    if (!notice.open || document.hidden || hold || obscured) pause();
    else if (since === null) {
      since = performance.now();
      update();
    }
  }
  function show() {
    if (notice.open) return Promise.resolve();
    pause();
    remaining = 5000;
    hold = false;
    $("announcement-hold").setAttribute("aria-pressed", "false");
    $("announcement-hold").textContent = "停留阅读";
    $("announcement-countdown").textContent = "5 秒后收起";
    notice.querySelector(".announcement-scroll").scrollTop = 0;
    const closed = new Promise((resolve) => {
      complete = resolve;
    });
    notice.showModal();
    sync();
    return closed;
  }
  notice.addEventListener("close", () => {
    pause();
    const done = complete;
    complete = null;
    done?.();
  });
  $("announcement-hold").onclick = () => {
    pause();
    hold = !hold;
    $("announcement-hold").setAttribute("aria-pressed", String(hold));
    $("announcement-hold").textContent = hold ? "继续倒计时" : "停留阅读";
    update();
    sync();
  };
  $("announcement-privacy").onclick = () => $("privacy-dialog").showModal();
  $("announcement-guide").onclick = () => $("guide-dialog").showModal();
  $("announcement-replay").onclick = () => {
    $("guide-dialog").close();
    if (notice.open) {
      pause();
      remaining = 5000;
      update();
      sync();
    } else show();
  };
  const observer = new MutationObserver(sync);
  document
    .querySelectorAll("dialog")
    .forEach((dialog) =>
      observer.observe(dialog, { attributes: true, attributeFilter: ["open"] }),
    );
  document.addEventListener("visibilitychange", sync);
  // Each page entry presents the account choice, then the notice, then (only
  // on the first visit) the existing coat-color picker. Never stack those steps.
  async function start() {
    await community.promptEntry();
    await show();
    if (firstVisit) $("cat-dialog").showModal();
  }
  start();
}
