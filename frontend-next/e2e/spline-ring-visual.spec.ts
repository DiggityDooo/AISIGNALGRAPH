import { test, expect } from "@playwright/test";

test("liquidring spline canvas becomes visible on home", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });

  const root = page.locator('[data-testid="spline-site-root"]');
  await expect(root).toBeAttached({ timeout: 30_000 });
  await expect(root).not.toHaveAttribute("data-spline-state", "failed", {
    timeout: 30_000,
  });

  await page.waitForFunction(
    () => {
      const viewer = document.querySelector('[data-testid="spline-viewer"]');
      const canvas = viewer?.shadowRoot?.querySelector("canvas");
      if (!canvas) {
        return false;
      }
      const style = getComputedStyle(canvas);
      return (
        canvas.width > 300 &&
        canvas.height > 150 &&
        style.visibility !== "hidden"
      );
    },
    undefined,
    { timeout: 60_000 },
  );

  await page.screenshot({
    path: "e2e/artifacts/liquidring-home.png",
    fullPage: false,
  });
});
