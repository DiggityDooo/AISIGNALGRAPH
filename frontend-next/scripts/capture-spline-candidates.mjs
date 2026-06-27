#!/usr/bin/env node
/**
 * Captures preview screenshots for Spline community background candidates.
 * Usage: node scripts/capture-spline-candidates.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../docs/spline-graph-candidates");
const IMG_DIR = path.join(OUT_DIR, "screenshots");

/** CC0 community scenes suited for dark /graph/flow backgrounds. */
const CANDIDATES = [
  { id: 1, name: "Particle Nebula", slug: "particle-nebula-a", fileId: "cea96ce0-da30-46cc-bd5c-dc73a6497abd", tags: ["particles", "nebula", "space"] },
  { id: 2, name: "Particle Nebula (alt)", slug: "particle-nebula-b", fileId: "2a5acc49-2509-4a0c-975f-844ada1d3988", tags: ["particles", "nebula"] },
  { id: 3, name: "Space Background", slug: "space-background", fileId: "ccde1436-67a5-4d24-a4da-136a416d174b", tags: ["stars", "minimal"] },
  { id: 4, name: "THRESHOLD Dark Ambient UI", slug: "threshold-dark-ambient", fileId: "0e9426ca-434a-493d-a454-8c8e4062df94", tags: ["ambient", "ui", "dark"] },
  { id: 5, name: "star constellation dombra", slug: "star-constellation", fileId: "3fc5fc1b-cd55-4df2-bc43-84e69e7b5849", tags: ["constellation", "graph-metaphor"] },
  { id: 6, name: "Galaxy", slug: "galaxy", fileId: "5ee9620e-2322-4dbd-a48c-9b8feb0f792f", tags: ["galaxy", "space"] },
  { id: 7, name: "3d stars", slug: "3d-stars", fileId: "714d2c73-66f2-44b4-b7cf-4f2215ec7fca", tags: ["stars", "particles"] },
  { id: 8, name: "Star Gates", slug: "star-gates", fileId: "164a72ab-b016-4078-91d9-13b7373b7a32", tags: ["stars", "sci-fi"] },
  { id: 9, name: "a star like our own", slug: "star-like-our-own", fileId: "64dbb202-f0a9-4c72-91a2-7b205ce4c8f3", tags: ["star", "glow"] },
  { id: 10, name: "Black Hole 2.0", slug: "black-hole-2", fileId: "34fef4b4-b0b0-479e-8598-4e7d01e27479", tags: ["black-hole", "dramatic"] },
  { id: 11, name: "Black Hole", slug: "black-hole-a", fileId: "90a60f1d-1f27-41ab-a756-d14704b7233e", tags: ["black-hole"] },
  { id: 12, name: "Black Hole (alt)", slug: "black-hole-b", fileId: "e79c9965-a55d-418f-b2e3-57b9e1a4776e", tags: ["black-hole"] },
  { id: 13, name: "Black Abstract Art", slug: "black-abstract", fileId: "7d6a0410-3ec0-449a-9c87-73bc7dd11880", tags: ["abstract", "dark"] },
  { id: 14, name: "Animated Background Gradient", slug: "animated-gradient", fileId: "3f20b8f2-b198-4d07-ba66-e7ece1a6d207", tags: ["gradient", "ambient"] },
  { id: 15, name: "Rising Sun Space Scene", slug: "rising-sun-space", fileId: "c620be4a-3a73-4979-9608-3c8e4207d6a7", tags: ["space", "sun"] },
  { id: 16, name: "Solar System - Basic", slug: "solar-system", fileId: "bf1c301a-7620-4b6b-8096-9391e209ce10", tags: ["planets", "space"] },
  { id: 17, name: "Wireframe experiment", slug: "wireframe-experiment", fileId: "3e4fe593-0c76-4a10-ba20-45ad108e421f", tags: ["wireframe", "tech"] },
  { id: 18, name: "wireframe", slug: "wireframe", fileId: "111fa757-66f1-48f2-81a1-1150428bd52f", tags: ["wireframe", "grid"] },
  { id: 19, name: "Magnetic Grid", slug: "magnetic-grid", fileId: "8a8ee888-e675-444a-82c0-7ddcc24b21ca", tags: ["grid", "interactive"] },
  { id: 20, name: "Black Hole Wallpaper", slug: "black-hole-wallpaper", fileId: "18e9c081-4b00-427b-ae06-5d8af89977bc", tags: ["black-hole", "wallpaper"] },
];

function communityUrl(fileId) {
  return `https://community.spline.design/file/${fileId}`;
}

async function captureOne(page, candidate) {
  const url = communityUrl(candidate.fileId);
  const screenshotPath = path.join(IMG_DIR, `${String(candidate.id).padStart(2, "0")}-${candidate.slug}.png`);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    // Community pages lazy-load the WebGL preview.
    await page.waitForTimeout(6_000);
    const canvas = page.locator("canvas").first();
    if ((await canvas.count()) > 0) {
      await canvas.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(2_000);
      try {
        await canvas.screenshot({ path: screenshotPath, timeout: 30_000 });
      } catch {
        await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 15_000, animations: "disabled" });
      }
    } else {
      const og = await page.locator('meta[property="og:image"]').getAttribute("content");
      if (og) {
        const resp = await page.request.get(og);
        const { writeFile } = await import("node:fs/promises");
        await writeFile(screenshotPath, await resp.body());
      } else {
        await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 15_000, animations: "disabled" });
      }
    }
    return { ok: true, screenshot: `screenshots/${path.basename(screenshotPath)}` };
  } catch (error) {
    return {
      ok: false,
      screenshot: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildMarkdown(results) {
  const lines = [
    "# Spline Graph Background Candidates",
    "",
    "> Curated CC0 community scenes for `/graph/flow` — distinct from landing `liquidring`.",
    "> Preview screenshots captured from [Spline Community](https://community.spline.design/) file pages.",
    "",
    "**How to use:** open a preview link → **Remix** → Export as **Viewer** → paste `prod.spline.design/…/scene.splinecode` into `spline-graph-scene.json` (when wired).",
    "",
    "| # | Preview | Name | Tags | Community link |",
    "|---|---------|------|------|----------------|",
  ];

  for (const row of results) {
    const img = row.screenshot
      ? `![${row.name}](${row.screenshot})`
      : "_capture failed_";
    const link = `[Open](${row.communityUrl})`;
    lines.push(`| ${row.id} | ${img} | **${row.name}** | ${row.tags.join(", ")} | ${link} |`);
  }

  lines.push(
    "",
    "## Notes",
    "",
    "- All listed scenes are **CC0** on the community page (verify before commercial use).",
    "- Screenshots are from community preview pages, not final embed with `#050202` background override.",
    "- Landing page scene (`liquidring`) is intentionally excluded.",
    "- Regenerate screenshots: `cd frontend-next && node scripts/capture-spline-candidates.mjs`",
    "",
  );

  return lines.join("\n");
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  const results = [];
  for (const candidate of CANDIDATES) {
    process.stdout.write(`Capturing #${candidate.id} ${candidate.name}… `);
    const capture = await captureOne(page, candidate);
    console.log(capture.ok ? "ok" : `fail: ${capture.error}`);
    results.push({
      ...candidate,
      communityUrl: communityUrl(candidate.fileId),
      ...capture,
    });
  }

  await browser.close();

  const markdown = buildMarkdown(results);
  await writeFile(path.join(OUT_DIR, "README.md"), markdown, "utf8");
  await writeFile(
    path.join(OUT_DIR, "candidates.json"),
    JSON.stringify(results, null, 2),
    "utf8",
  );

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\nDone: ${okCount}/${results.length} screenshots → ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
