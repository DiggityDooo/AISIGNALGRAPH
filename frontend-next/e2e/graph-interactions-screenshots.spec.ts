import { test, expect } from "@playwright/test";

test("capture graph workspace states", async ({ page }, testInfo) => {
  await page.goto("/graph?view=force", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#sigma-container canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("graph-base.png") });

  const search = page.getByRole("searchbox", { name: "Search graph nodes" });
  await search.fill("AI");
  const matching = page.getByRole("list", { name: "Matching nodes" });
  await expect(matching).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("graph-search.png") });
  await matching.getByRole("button").first().click();
  await expect(page.locator("#detail-title")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("graph-selection.png") });

  if (await page.getByRole("button", { name: "Switch to 3D" }).isVisible()) {
    await page.getByRole("button", { name: "Switch to 3D" }).click();
    await expect(page.locator("#toggle-3d-label")).toHaveText("2D");
    await expect(page.locator("#sigma-container canvas")).toHaveCount(1, { timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("graph-3d.png") });
  }

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const year = page.getByLabel("Published through");
  await expect(year.locator("option").nth(1)).toHaveText(/\d{4}/);
  await year.selectOption({ index: 1 });
  await page.screenshot({ path: testInfo.outputPath("graph-filters.png") });
});
