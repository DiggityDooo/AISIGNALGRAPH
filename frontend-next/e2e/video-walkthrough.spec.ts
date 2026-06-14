import { test } from "@playwright/test";

test.use({
  video: { mode: "on", size: { width: 1920, height: 1080 } },
  viewport: { width: 1920, height: 1080 },
  launchOptions: { args: ["--disable-gpu-sandbox"] },
});

test("Full video walkthrough of today's changes", async ({ page, context }) => {
  test.setTimeout(300_000); // 5 minutes — plenty for a cinematic walkthrough

  // ─── Scene 1: Home Page ───────────────────────────────────────────
  await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3000);

  // Smooth scroll down and back
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "smooth" }));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "smooth" }));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(1500);

  // ─── Scene 2: Stories Page ────────────────────────────────────────
  await page.goto("/stories", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: "smooth" }));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(1500);

  // ─── Scene 3: Entities Page ───────────────────────────────────────
  await page.goto("/entities", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: "smooth" }));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(1500);

  // ─── Scene 4: Neural Lattice Graph (Gephi/Sigma) ──────────────────
  await page.goto("/graph", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(6000);

  // Search interaction
  try {
    const graphSearch = page.locator("#graph-search");
    if (await graphSearch.isVisible({ timeout: 3000 })) {
      await graphSearch.fill("AI");
      await page.waitForTimeout(2000);
      await graphSearch.fill("");
      await page.waitForTimeout(1000);
    }
  } catch { /* search may not be visible yet */ }

  // Toggle 3D mode
  try {
    const toggle3d = page.locator("#toggle-3d-button");
    if (await toggle3d.isVisible({ timeout: 2000 })) {
      await toggle3d.click();
      await page.waitForTimeout(2500);
      await toggle3d.click();
      await page.waitForTimeout(2000);
    }
  } catch { /* 3D toggle may not be present */ }

  // Timeline slider
  await page.evaluate(() => {
    const slider = document.getElementById("year-filter") as HTMLInputElement;
    if (slider) {
      slider.value = "2023";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const slider = document.getElementById("year-filter") as HTMLInputElement;
    if (slider) {
      slider.value = "2026";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.waitForTimeout(2000);

  // ─── Scene 5: Signal Tree (graph/flow) — Progressive Disclosure ───
  await page.goto("/graph/flow", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(6000); // Let force sim settle

  // Try interacting with the ForceTree SVG
  try {
    // Wait for the SVG to actually appear in the DOM
    const svgLocator = page.locator("svg").first();
    await svgLocator.waitFor({ state: "attached", timeout: 15_000 });
    const svgBox = await svgLocator.boundingBox();

    if (svgBox && svgBox.width > 100 && svgBox.height > 100) {
      const cx = svgBox.x + svgBox.width / 2;
      const cy = svgBox.y + svgBox.height / 2;

      // Click nodes to show expand/collapse + sibling focus
      await page.mouse.click(cx + 80, cy - 40);
      await page.waitForTimeout(2500);

      await page.mouse.click(cx - 100, cy + 60);
      await page.waitForTimeout(2500);

      await page.mouse.click(cx + 150, cy + 20);
      await page.waitForTimeout(2500);

      // Pan the canvas
      await page.mouse.move(cx + 300, cy + 200);
      await page.mouse.down();
      await page.mouse.move(cx + 100, cy + 100, { steps: 20 });
      await page.mouse.up();
      await page.waitForTimeout(2000);

      // Zoom in
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(2000);

      // Zoom out
      for (let i = 0; i < 8; i++) {
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(2000);
    }
  } catch {
    // Signal tree may not have data — still capture whatever is on screen
    await page.waitForTimeout(3000);
  }

  // Final lingering shot
  await page.waitForTimeout(2000);

  // Close context to flush the video file
  await context.close();
});
