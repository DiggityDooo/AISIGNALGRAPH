import { expect, test } from "@playwright/test";

test("flow node opens the focused 3D lattice", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/graph/flow", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const portalLink = page.getByRole("link", { name: "View in Lattice" }).first();
  await expect(portalLink).toBeVisible({ timeout: 30_000 });

  await portalLink.click();
  await expect(page).toHaveURL(/\/graph\?focus=.+&mode=3d/, { timeout: 30_000 });

  const focusId = new URL(page.url()).searchParams.get("focus");
  expect(focusId).toBeTruthy();

  await expect(page.locator("#toggle-3d-label")).toHaveText("2D", {
    timeout: 30_000,
  });
  await expect(page.locator("#sigma-container canvas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("#detail-title")).not.toHaveText("Select a node");
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("focused-3d-lattice.png"),
    fullPage: true,
  });
});
