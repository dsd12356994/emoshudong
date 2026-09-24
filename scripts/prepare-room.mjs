// Delivery encoding only. Images were created with the built-in imagegen tool.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  for (const [i, name] of ["room", "cat-rest"].entries()) {
    const source =
      "data:image/png;base64," +
      readFileSync(process.argv[i + 2]).toString("base64");
    const result = await page.evaluate(
      async ({ source, name }) => {
        const img = new Image();
        img.src = source;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = name === "room" ? img.width : 512;
        canvas.height = name === "room" ? img.height : 512;
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas
          .toDataURL("image/webp", name === "room" ? 0.87 : 1)
          .split(",")[1];
      },
      { source, name },
    );
    const bytes = Buffer.from(result, "base64");
    writeFileSync(
      new URL(`../public/assets/${name}.webp`, import.meta.url),
      bytes,
    );
    console.log(name, bytes.length);
  }
} finally {
  await browser.close();
}
