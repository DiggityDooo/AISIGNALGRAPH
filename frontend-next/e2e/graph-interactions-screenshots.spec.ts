import { test, expect } from "@playwright/test";
import { join } from "node:path";

test("Capture graph interaction screenshots", async ({ page }) => {
  const destDir = "/home/seanb/Documents/December 2023";

  // 1. Navigate to the graph page
  await page.goto("/graph", { waitUntil: "domcontentloaded", timeout: 60_000 });

  // 2. Wait for the graph to finish loading (loading overlay disappears, stats show up)
  await expect(page.locator("#stat-nodes")).not.toHaveText("0", { timeout: 30_000 });
  await page.waitForTimeout(2000); // Wait for the initial animation to settle

  // Capture base graph screenshot
  await page.screenshot({ path: join(destDir, "graph-interaction-base.png") });

  // 3. Interact with the graph: click in the center to select a node
  const container = page.locator("#sigma-container");
  const boundingBox = await container.boundingBox();
  if (boundingBox) {
    // Click exactly in the middle of the canvas
    await page.mouse.click(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
  }

  // 4. Wait for the detail pane to become active
  // Even if no node is right in the center, we can try clicking slightly offset if needed.
  // Actually, let's type into the search bar to filter, since that's guaranteed to work visually
  await page.fill("#graph-search", "AI");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(destDir, "graph-interaction-search.png") });

  // Let's click the "3D" toggle
  await page.click("#toggle-3d-button");
  await page.waitForTimeout(2000); // wait for 3D transition
  await page.screenshot({ path: join(destDir, "graph-interaction-3d.png") });

  // Change Vision Lens
  await page.selectOption("#graph-lens", "local");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(destDir, "graph-interaction-lens.png") });

  // Change timeline filter
  await page.fill("#year-filter", "2024");
  // Trigger input event
  await page.evaluate(() => {
    const el = document.getElementById("year-filter");
    if (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(destDir, "graph-interaction-timeline.png") });

  // Try to open mobile menu if visible, or just skip
});
