// Deform only the existing sprite's ears or tail. No new asset or idle loop.
export function createPetMotion(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0,
    original = null,
    elapsed = 0,
    lastTime = 0,
    part = null;
  const smooth = (a, b, n) => {
    const t = Math.max(0, Math.min(1, (n - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // Trace the happy sprite's haunch and curled tail join, including its dark
  // outline. A rectangular selection also contains the belly and pulls it out
  // of shape. Keep this boundary and the low tail root completely stationary.
  const tailJoin = [
    [122, 211],
    [139, 212],
    [146, 215],
    [156, 218],
    [167, 225],
    [174, 223],
    [181, 219],
    [190, 212],
    [220, 212],
  ];
  const tailEdge = new Float32Array(canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    tailEdge[y] = canvas.width;
    for (let i = 1; i < tailJoin.length; i++) {
      const [y0, x0] = tailJoin[i - 1],
        [y1, x1] = tailJoin[i];
      if (y >= y0 && y <= y1) {
        tailEdge[y] = x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
        break;
      }
    }
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (original) ctx.putImageData(original, 0, 0);
    original = null;
    part = null;
    lastTime = 0;
  }
  function region(output, box, pivot, angle, weight, allowSource = () => true) {
    const source = original.data,
      dest = output.data,
      size = canvas.width;
    for (let y = box[1]; y < box[3]; y++) {
      for (let x = box[0]; x < box[2]; x++) {
        const amount = weight(x, y);
        if (amount === 0) continue;
        const theta = -angle * amount;
        const dx = x - pivot[0],
          dy = y - pivot[1];
        const sx = Math.round(
          pivot[0] + dx * Math.cos(theta) - dy * Math.sin(theta),
        );
        const sy = Math.round(
          pivot[1] + dx * Math.sin(theta) + dy * Math.cos(theta),
        );
        const to = (y * size + x) * 4;
        if (sx < 0 || sy < 0 || sx >= size || sy >= size)
          dest.fill(0, to, to + 4);
        else {
          // A moving tail pixel must never borrow a pixel from the belly.
          if (!allowSource(sx, sy)) continue;
          const from = (sy * size + sx) * 4;
          for (let c = 0; c < 4; c++) dest[to + c] = source[from + c];
        }
      }
    }
  }
  function paint(time) {
    frame = 0;
    if (!original || document.hidden) {
      lastTime = 0;
      return;
    }
    if (lastTime) elapsed += Math.min(40, time - lastTime);
    lastTime = time;
    const t = Math.min(1, elapsed / 1450);
    if (t >= 1) {
      stop();
      return;
    }
    const output = new ImageData(
      new Uint8ClampedArray(original.data),
      canvas.width,
      canvas.height,
    );
    if (part === "head") {
      // One ear tips first, the other follows; both settle without moving the head.
      const flutter = (phase) =>
        phase <= 0
          ? 0
          : Math.sin(phase * Math.PI * 3.3) *
            Math.sin(Math.min(1, phase) * Math.PI) *
            Math.exp(-phase * 1.25);
      region(
        output,
        [8, 58, 79, 130],
        [48, 125],
        -0.3 * flutter(t),
        (x, y) =>
          smooth(8, 20, x) * (1 - smooth(66, 79, x)) * (1 - smooth(95, 129, y)),
      );
      region(
        output,
        [88, 58, 165, 132],
        [124, 127],
        0.28 * flutter(Math.max(0, (t - 0.09) / 0.91)),
        (x, y) =>
          smooth(88, 101, x) *
          (1 - smooth(153, 165, x)) *
          (1 - smooth(97, 131, y)),
      );
    } else {
      // A small, damped tip swish. Blend into the fixed anatomical boundary and
      // stop flexing before the root instead of rotating the entire right side.
      region(
        output,
        [212, 122, 256, 201],
        [219, 200],
        0.13 * Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI),
        (x, y) =>
          smooth(tailEdge[y], tailEdge[y] + 13, x) * (1 - smooth(161, 201, y)),
        (x, y) => x > tailEdge[y],
      );
    }
    ctx.putImageData(output, 0, 0);
    frame = requestAnimationFrame(paint);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    } else if (original && !frame) frame = requestAnimationFrame(paint);
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) stop();
  });
  return {
    stop,
    start(value) {
      stop();
      if (reduced.matches || !["head", "tail"].includes(value)) return;
      part = value;
      elapsed = 0;
      original = ctx.getImageData(0, 0, canvas.width, canvas.height);
      frame = requestAnimationFrame(paint);
    },
  };
}
