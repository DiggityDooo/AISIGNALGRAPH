#!/usr/bin/env node
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../docs/spline-graph-candidates/screenshots",
);
const items = [
  ["01-particle-nebula-a", "cea96ce0-da30-46cc-bd5c-dc73a6497abd"],
  ["02-particle-nebula-b", "2a5acc49-2509-4a0c-975f-844ada1d3988"],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const [slug, id] of items) {
  const url = `https://community.spline.design/file/${id}`;
  console.log("try", slug);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(12_000);
  const canvas = page.locator("canvas").first();
  const out = path.join(OUT, `${slug}.png`);
  try {
    if (await canvas.count()) {
      await canvas.screenshot({ path: out, timeout: 60_000 });
    } else {
      await page.screenshot({ path: out, timeout: 60_000, animations: "disabled" });
    }
    console.log("saved", out);
  } catch (error) {
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    if (og) {
      const resp = await page.request.get(og);
      const fs = await import("node:fs/promises");
      await fs.writeFile(out, await resp.body());
      console.log("saved og:image", out);
    } else {
      throw error;
    }
  }
}
await browser.close();
