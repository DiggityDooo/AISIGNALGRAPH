import { test, expect } from "@playwright/test";
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const ARTIFACTS = join(process.cwd(), "artifacts");

test.use({ video: "on", screenshot: "on" });

test("graph demo walkthrough", async ({ page }) => {
  mkdirSync(ARTIFACTS, { recursive: true });

  await page.goto("/graph/prototype", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.locator("#app-root")).toBeVisible();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(ARTIFACTS, "01-graph-loaded.png"), fullPage: true });

  const search = page.locator("#graph-search");
  await search.fill("OpenAI");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(ARTIFACTS, "02-search-openai.png"), fullPage: true });

  const graphRes = await page.request.get("/api/graph");
  const graphBody = (await graphRes.json()) as { nodes?: Array<{ id: string; label?: string }> };
  const openAiNode = graphBody.nodes?.find((node) => /openai/i.test(node.label || ""));
  expect(openAiNode?.id).toBeTruthy();

  await page.evaluate((nodeId) => {
    window.gephiLite?.selectNode?.(nodeId);
  }, openAiNode!.id);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(ARTIFACTS, "03-node-detail.png"), fullPage: true });

  await page.locator("#toggle-3d-button").click();
  await expect(page.locator("#toggle-3d-label")).toHaveText("2D", { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(ARTIFACTS, "04-3d-mode.png"), fullPage: true });

  await page.locator("#toggle-3d-button").click();
  await expect(page.locator("#toggle-3d-label")).toHaveText("3D", { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(ARTIFACTS, "05-back-2d.png"), fullPage: true });

  const videoPath = await page.video()?.path();
  if (videoPath) {
    copyFileSync(videoPath, join(ARTIFACTS, "graph-demo.webm"));
  }
});
