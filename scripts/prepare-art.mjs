// Delivery compression only; art is generated separately with imagegen.
// Usage: node scripts/prepare-art.mjs <garden.png> <transparent-cat.png> [cat-atlas.png]
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  mkdirSync(new URL("../public/assets/", import.meta.url), { recursive: true });
  for (const [index, name] of (process.argv[4]
    ? ["garden", "cat", "cat-run"]
    : ["garden", "cat"]
  ).entries()) {
    const source =
      "data:image/png;base64," +
      readFileSync(process.argv[index + 2]).toString("base64");
    const output = await page.evaluate(
      async ({ source, name }) => {
        const img = new Image();
        img.src = source;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = name === "cat-run" ? 512 : name === "cat" ? 192 : img.width;
        c.height = name === "cat-run" ? 256 : name === "cat" ? 192 : img.height;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return c
          .toDataURL("image/webp", name.startsWith("cat") ? 1 : 0.88)
          .split(",")[1];
      },
      { source, name },
    );
    const bytes = Buffer.from(output, "base64");
    writeFileSync(
      new URL(`../public/assets/${name}.webp`, import.meta.url),
      bytes,
    );
    console.log(`${name}.webp: ${Math.round(bytes.length / 1024)} KiB`);
  }
} finally {
  await browser.close();
}
