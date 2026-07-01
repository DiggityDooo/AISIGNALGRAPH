import { test, expect, devices } from "@playwright/test";

/**
 * Mobile regression guard for the /graph page.
 *
 * Historical failure: weak mobile GPUs lost the WebGL context (tab crash /
 * frozen black canvas) because the page ran multiple WebGL contexts at full
 * devicePixelRatio plus decorative canvas layers. These tests emulate a phone
 * and assert the mobile quality profile is applied and no context is lost
 * across load, interaction and mode switching.
 */

test.use({ ...devices["Pixel 5"] });

function collectContextLoss(page: import("@playwright/test").Page): void {
  void page.addInitScript(() => {
    const w = window as Window & { __contextLossCount?: number };
    w.__contextLossCount = 0;
    window.addEventListener(
      "webglcontextlost",
      () => {
        w.__contextLossCount = (w.__contextLossCount ?? 0) + 1;
      },
      { capture: true },
    );
  });
}

async function contextLossCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(
    () => (window as Window & { __contextLossCount?: number }).__contextLossCount ?? 0,
  );
}

/**
 * Wait for the page to be interactive in either configuration:
 * - flow flag off: Sigma graph mode, #stat-nodes populates
 * - flow flag on: low-tier devices auto-default to Tree, header shows "Indexed:"
 */
async function waitForGraphReady(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const stat = await page
          .locator("#stat-nodes")
          .textContent()
          .catch(() => null);
        if (stat !== null && stat.trim() !== "" && stat.trim() !== "0") {
          return true;
        }
        return (await page.getByText("Indexed:").count()) > 0;
      },
      { timeout: 45_000 },
    )
    .toBe(true);
}

test("mobile /graph loads without WebGL context loss", async ({ page }) => {
  collectContextLoss(page);
  await page.goto("/graph", { waitUntil: "domcontentloaded", timeout: 60_000 });

  await waitForGraphReady(page);

  // Site-wide constellation canvas must not mount on graph routes.
  await expect(page.locator(".constellation-layer")).toHaveCount(0);

  // 3D toggle is gated off on low-tier devices.
  await expect(page.locator("#toggle-3d-button")).toBeHidden();

  // Pan gesture on the canvas must not throw or kill the context.
  const container = page.locator("#sigma-container");
  const box = await container.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.touchscreen.tap(cx, cy);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 60, { steps: 12 });
    await page.mouse.up();
  }

  await page.waitForTimeout(3_000);
  expect(await contextLossCount(page)).toBe(0);
});

test("mobile mode switching survives without context loss", async ({ page }) => {
  collectContextLoss(page);
  await page.goto("/graph", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForGraphReady(page);

  const modeButtons = [
    "#toggle-view-force",
    "#toggle-view-tree",
    "#toggle-view-flow",
  ];

  // Mode buttons only render when the flow feature flag is on; skip cleanly otherwise.
  const flagged = (await page.locator(modeButtons[0]).count()) > 0;
  test.skip(!flagged, "graph flow modes disabled by feature flag");

  for (const selector of modeButtons) {
    await page.click(selector);
    await page.waitForTimeout(2_500);
    expect(await contextLossCount(page), `after ${selector}`).toBe(0);
  }
});
