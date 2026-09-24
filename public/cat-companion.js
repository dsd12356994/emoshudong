// One small sprite canvas. Frames run only while moving; no idle render loop.
export function createCatCompanion({ element, garden, door, enter }) {
  const canvas = element.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const atlas = new Image();
  const texture = document.createElement("canvas");
  texture.width = 512;
  texture.height = 256;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const marker = document.getElementById("cat-target");
  let color = "#f4dab0",
    loaded = false,
    frameRequest = 0,
    lastTime = 0;
  let x = innerWidth * (innerWidth <= 560 ? 0.3 : 0.52),
    y = innerHeight * (innerWidth <= 560 ? 0.55 : 0.7),
    targetX = x,
    targetY = y;
  let facing = 1,
    stride = 0,
    velocityX = 0,
    velocityY = 0,
    lift = 0,
    tilt = 0,
    drag = null,
    lastFrame = -1,
    lastFacing = 0;
  let suspended = false;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const limit = () => {
    targetX = clamp(targetX, 42, Math.max(42, innerWidth - 42));
    targetY = clamp(targetY, 90, Math.max(90, innerHeight - 85));
  };
  const overDoor = (px, py) => {
    const r = door.getBoundingClientRect();
    return (
      ((px - r.left - r.width / 2) / (r.width / 2)) ** 2 +
        ((py - r.top - r.height / 2) / (r.height / 2)) ** 2 <=
      1
    );
  };
  function draw(frame) {
    if (!loaded || (lastFrame === frame && lastFacing === facing)) return;
    ctx.clearRect(0, 0, 128, 128);
    ctx.save();
    if (facing < 0) {
      ctx.translate(128, 0);
      ctx.scale(-1, 1);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      texture,
      (frame % 4) * 128,
      Math.floor(frame / 4) * 128,
      128,
      128,
      0,
      0,
      128,
      128,
    );
    ctx.restore();
    lastFrame = frame;
    lastFacing = facing;
    element.dataset.frame = String(frame);
  }
  function paint(time) {
    frameRequest = 0;
    if (suspended || !loaded) return;
    const dt = lastTime ? Math.min(40, time - lastTime) : 16;
    lastTime = time;
    const dx = targetX - x,
      dy = targetY - y,
      distance = Math.hypot(dx, dy);
    let travel = 0;
    const seconds = dt / 1000;
    if (reduced.matches) {
      x = targetX;
      y = targetY;
      velocityX = velocityY = 0;
    } else if (drag) {
      const ease = 1 - Math.exp(-dt / 45);
      x += dx * ease;
      y += dy * ease;
      velocityX = velocityY = 0;
    } else if (distance > 0.5 || Math.hypot(velocityX, velocityY) > 8) {
      // Bounded acceleration, then braking near the destination. Distant
      // mouse jumps no longer turn into an instantaneous slide across the map.
      const speed = Math.min(360, distance * 5);
      const desiredX = distance ? (dx / distance) * speed : 0;
      const desiredY = distance ? (dy / distance) * speed : 0;
      const changeX = desiredX - velocityX,
        changeY = desiredY - velocityY;
      const change = Math.hypot(changeX, changeY);
      const acceleration = Math.min(1, (1800 * seconds) / (change || 1));
      velocityX += changeX * acceleration;
      velocityY += changeY * acceleration;
      const stepX = velocityX * seconds,
        stepY = velocityY * seconds;
      if (distance < 2 || stepX * dx + stepY * dy >= distance * distance) {
        travel = distance;
        x = targetX;
        y = targetY;
        velocityX = velocityY = 0;
      } else {
        x += stepX;
        y += stepY;
        travel = Math.hypot(stepX, stepY);
      }
      if (Math.abs(velocityX) > 2) facing = velocityX < 0 ? -1 : 1;
    } else {
      x = targetX;
      y = targetY;
      velocityX = velocityY = 0;
    }
    const speed = Math.hypot(velocityX, velocityY);
    const running = !drag && !reduced.matches && speed > 12;
    // Paws advance with ground covered rather than with a fixed clock.
    if (running) stride += travel / 21;
    else stride = 0;
    const frame = drag ? 7 : running ? Math.floor(stride) % 6 : 6;
    draw(frame);
    element.dataset.state = drag ? "dragging" : running ? "running" : "idle";
    element.style.transform = `translate3d(${x - 40}px,${y - 70}px,0)`;
    const targetLift = reduced.matches
      ? 0
      : drag
        ? -8
        : running
          ? -Math.abs(Math.sin((stride / 3) * Math.PI)) * 1.5
          : 0;
    const targetTilt = reduced.matches
      ? 0
      : drag
        ? clamp(dx * 0.3, -15, 15)
        : running
          ? clamp(velocityX / 120, -3, 3)
          : 0;
    const settle = reduced.matches ? 1 : 1 - Math.exp(-dt / 65);
    lift += (targetLift - lift) * settle;
    tilt += (targetTilt - tilt) * settle;
    canvas.style.transform = `translateY(${lift}px) rotate(${tilt}deg)`;
    const unsettled =
      Math.abs(targetLift - lift) > 0.05 || Math.abs(targetTilt - tilt) > 0.05;
    if (
      !reduced.matches &&
      (Math.hypot(targetX - x, targetY - y) > 0.5 || speed > 8 || unsettled)
    )
      frameRequest = requestAnimationFrame(paint);
    else lastTime = 0;
  }
  function wake() {
    if (!frameRequest && !suspended && loaded)
      frameRequest = requestAnimationFrame(paint);
  }
  function hideMarker() {
    marker.hidden = true;
    garden.classList.remove("cat-active");
  }
  function setColor(value) {
    color = value;
    if (!loaded) return;
    const t = texture.getContext("2d", { willReadFrequently: true });
    t.clearRect(0, 0, 512, 256);
    t.drawImage(atlas, 0, 0, 512, 256);
    const pixels = t.getImageData(0, 0, 512, 256),
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
        for (let j = 0; j < 3; j++)
          d[i + j] = Math.round((rgb[j] * light) / 255);
    }
    t.putImageData(pixels, 0, 0);
    lastFrame = -1;
    draw(drag ? 7 : 6);
    wake();
  }
  function finishDrag(event, canceled = false) {
    if (!drag || (event.pointerId != null && event.pointerId !== drag.id))
      return;
    const id = drag.id;
    drag = null;
    velocityX = velocityY = 0;
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    element.classList.remove("is-dragging");
    door.classList.remove("drop-ready");
    wake();
    if (!canceled && overDoor(event.clientX, event.clientY)) enter();
  }
  element.addEventListener("pointerdown", (event) => {
    if (suspended || event.button !== 0 || drag) return;
    event.preventDefault();
    event.stopPropagation();
    drag = {
      id: event.pointerId,
      offsetX: event.clientX - x,
      offsetY: event.clientY - y,
    };
    targetX = x;
    targetY = y;
    velocityX = velocityY = 0;
    element.setPointerCapture(event.pointerId);
    element.classList.add("is-dragging");
    hideMarker();
    wake();
  });
  element.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    targetX = event.clientX - drag.offsetX;
    targetY = event.clientY - drag.offsetY;
    limit();
    door.classList.toggle("drop-ready", overDoor(event.clientX, event.clientY));
    wake();
  });
  element.addEventListener("pointerup", (event) => finishDrag(event));
  element.addEventListener("pointercancel", (event) => finishDrag(event, true));
  element.addEventListener("lostpointercapture", (event) =>
    finishDrag(event, true),
  );
  element.addEventListener("click", (event) => event.preventDefault());
  element.addEventListener("keydown", (event) => {
    const delta = {
      ArrowLeft: [-24, 0],
      ArrowRight: [24, 0],
      ArrowUp: [0, -24],
      ArrowDown: [0, 24],
    }[event.key];
    if (delta) {
      event.preventDefault();
      targetX += delta[0];
      targetY += delta[1];
      limit();
      wake();
    }
  });
  garden.addEventListener("pointermove", (event) => {
    if (suspended || drag || !loaded) return;
    const isCat = element.contains(event.target);
    const isControl = event.target.closest("header,footer,.garden-caption");
    if (event.pointerType !== "mouse" || !fine.matches || isControl) {
      hideMarker();
      return;
    }
    // Moving left can put the pointer over the trailing cat. Keep following
    // through that hit area; only pointerdown should grab and stop the cat.
    if (isCat) hideMarker();
    else {
      marker.hidden = false;
      marker.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
      garden.classList.add("cat-active");
    }
    const nextX = event.clientX - 55,
      nextY = event.clientY + 32;
    if (
      Math.hypot(nextX - x, nextY - y) < 14 &&
      Math.hypot(velocityX, velocityY) < 12
    )
      return;
    targetX = nextX;
    targetY = nextY;
    limit();
    wake();
  });
  garden.addEventListener("pointerleave", () => {
    if (!drag) {
      hideMarker();
      targetX = x;
      targetY = y;
      velocityX = velocityY = 0;
      wake();
    }
  });
  function sync() {
    suspended = document.hidden || !!document.querySelector("dialog[open]");
    if (suspended) {
      finishDrag({}, true);
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      lastTime = 0;
      velocityX = velocityY = 0;
      hideMarker();
      draw(6);
      element.dataset.state = "idle";
    } else {
      limit();
      wake();
    }
  }
  const observer = new MutationObserver(sync);
  document
    .querySelectorAll("dialog")
    .forEach((d) =>
      observer.observe(d, { attributes: true, attributeFilter: ["open"] }),
    );
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("blur", () => {
    finishDrag({}, true);
    hideMarker();
    targetX = x;
    targetY = y;
    velocityX = velocityY = 0;
    wake();
  });
  window.addEventListener("resize", () => {
    limit();
    x = targetX;
    y = targetY;
    velocityX = velocityY = 0;
    wake();
  });
  function inputHint() {
    document.querySelector(".cat-guide").textContent = fine.matches
      ? "移动鼠标，小猫会跑上来 · 按住它试试"
      : "按住小猫拖着走 · 点树洞里的字就能写信";
    hideMarker();
  }
  inputHint();
  fine.addEventListener("change", inputHint);
  reduced.addEventListener("change", () => {
    targetX = x;
    targetY = y;
    wake();
  });
  atlas.onload = () => {
    loaded = true;
    element.hidden = false;
    setColor(color);
    limit();
    sync();
  };
  atlas.onerror = () => {
    element.hidden = true;
    hideMarker();
  };
  atlas.src = "/assets/cat-run.webp";
  return { setColor };
}
