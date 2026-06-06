import { test, expect } from "@playwright/test";

const KNOWN_GOOD_VIEWER_URL =
  "https://prod.spline.design/9951u9cumiw2Ehj8/scene.splinecode";

const ETERNAL_ARC_VIEWER_URL =
  "https://prod.spline.design/tlFzTC78qR503Crv9MgluFWq-Ii3/scene.splinecode";

test.describe("Spline site background", () => {
  test("scene config exposes viewer URL (not iframe public URL)", async ({ request }) => {
    const response = await request.get("/static/spline-scene.json");
    expect(response.ok()).toBeTruthy();

    const config = (await response.json()) as {
      viewerUrl?: string;
      sceneUrl?: string;
    };

    const viewerUrl = config.viewerUrl?.trim() ?? "";
    expect(viewerUrl).toContain("prod.spline.design");
    expect(viewerUrl).toContain("scene.splinecode");
    expect(viewerUrl).not.toContain("/embed");

    if (config.sceneUrl) {
      expect(config.sceneUrl).not.toContain("/embed");
    }
  });

  test("home page never leaks S3 AccessDenied text", async ({ page }) => {
    const failedEmbedRequests: string[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("my.spline.design") && url.includes("/embed") && response.status() >= 400) {
        failedEmbedRequests.push(`${response.status()} ${url}`);
      }
    });

    await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });

    await expect(page.locator('[data-testid="spline-site-root"]')).toBeAttached({
      timeout: 30_000,
    });
    await expect(page.getByText(/AccessDenied/i)).toHaveCount(0);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/AccessDenied/i);

    expect(failedEmbedRequests).toEqual([]);
  });

  test("void fallback when configured viewer URL is unavailable", async ({ page }) => {
    await page.route("**/static/spline-scene.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ viewerUrl: ETERNAL_ARC_VIEWER_URL }),
      });
    });

    await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });

    const root = page.locator('[data-testid="spline-site-root"]');
    await expect(root).toBeAttached({ timeout: 30_000 });
    await expect(root).toHaveAttribute("data-spline-state", "failed", {
      timeout: 30_000,
    });
    await expect(page.locator('[data-testid="spline-site-void"]')).toBeAttached();
    await expect(page.locator('[data-testid="spline-viewer"]')).toHaveCount(0);
    await expect(page.getByText(/AccessDenied/i)).toHaveCount(0);
  });

  test("spline-viewer loads a known-good scene", async ({ page }) => {
    await page.route("**/static/spline-scene.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ viewerUrl: KNOWN_GOOD_VIEWER_URL }),
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const root = page.locator('[data-testid="spline-site-root"]');
    await expect(root).toBeAttached({ timeout: 30_000 });
    const viewer = page.locator('[data-testid="spline-viewer"]');
    await expect(viewer).toBeAttached({ timeout: 30_000 });
    await page.waitForFunction(
      () => {
        const node = document.querySelector('[data-testid="spline-viewer"]');
        return Boolean(node?.shadowRoot?.querySelector("canvas"));
      },
      undefined,
      { timeout: 45_000 },
    );
    await expect(page.getByText(/AccessDenied/i)).toHaveCount(0);
  });

  test("spline root stays viewport-fixed while scrolling", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const root = page.locator('[data-testid="spline-site-root"]');
    await expect(root).toBeAttached({ timeout: 30_000 });

    const topBefore = await root.evaluate((node) => node.getBoundingClientRect().top);
    await page.evaluate(() => window.scrollTo(0, 720));
    await page.waitForTimeout(150);
    const topAfter = await root.evaluate((node) => node.getBoundingClientRect().top);

    expect(topBefore).toBeLessThanOrEqual(1);
    expect(topAfter).toBeLessThanOrEqual(1);
    expect(Math.abs(topAfter - topBefore)).toBeLessThan(2);
  });
});
