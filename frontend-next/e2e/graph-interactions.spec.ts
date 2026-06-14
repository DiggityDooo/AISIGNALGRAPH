import { test, expect } from "@playwright/test";

test.describe("Graph interactions", () => {
  test("search, select node, and toggle 3D", async ({ page }) => {
    await page.goto("/graph/prototype", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await expect(page.locator("#app-root")).toBeVisible();
    await expect(page.getByText("Graph Prototype")).toBeVisible({ timeout: 60_000 });

    const search = page.locator("#graph-search");
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill("OpenAI");
    await page.waitForTimeout(1000);

    const graphRes = await page.request.get("/api/graph");
    expect(graphRes.ok()).toBeTruthy();
    const graphBody = (await graphRes.json()) as { nodes?: Array<{ id: string; label?: string }> };
    const openAiNode = graphBody.nodes?.find((node) => /openai/i.test(node.label || ""));
    expect(openAiNode?.id).toBeTruthy();

    await page.evaluate((nodeId) => {
      window.gephiLite?.selectNode?.(nodeId);
    }, openAiNode!.id);

    const detailPane = page.locator("#detail-pane");
    await expect(detailPane).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#detail-title")).toContainText(/openai/i);

    const toggle3d = page.locator("#toggle-3d-button");
    await toggle3d.click();
    await expect(page.locator("#toggle-3d-label")).toHaveText("2D", { timeout: 15_000 });
    await toggle3d.click();
    await expect(page.locator("#toggle-3d-label")).toHaveText("3D", { timeout: 15_000 });
  });
});
