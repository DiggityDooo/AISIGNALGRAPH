import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROUTES = [
  { path: "/", name: "home", expectHeading: /Intelligence Hub|AI Era/i },
  { path: "/stories", name: "stories", expectHeading: /Intelligence Library|Archive/i },
  { path: "/entities", name: "entities", expectHeading: /Actor Directory|ACTORS/i },
  { path: "/graph", name: "graph", expectHeading: /Neural|Matrix|Signal|Link|Sync/i },
] as const;

type RouteFinding = {
  path: string;
  name: string;
  status: number | null;
  title: string;
  consoleErrors: string[];
  failedRequests: { url: string; status: number }[];
  checks: Record<string, boolean>;
  notes: string[];
};

const findings: RouteFinding[] = [];

test.describe("AISIGNALGRAPH hub analysis", () => {
  test.beforeAll(() => {
    mkdirSync(join(process.cwd(), "e2e", "artifacts"), { recursive: true });
  });

  for (const route of ROUTES) {
    test(`analyze ${route.name} (${route.path})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedRequests: { url: string; status: number }[] = [];
      const notes: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      page.on("response", (res) => {
        const url = res.url();
        const status = res.status();
        if (status >= 400 && !url.includes("favicon")) {
          failedRequests.push({ url, status });
        }
      });

      const waitUntil = route.path === "/graph" ? "domcontentloaded" : "networkidle";
      const response = await page.goto(route.path, { waitUntil, timeout: 60_000 });
      const status = response?.status() ?? null;

      await page.screenshot({
        path: join("e2e", "artifacts", `${route.name}.png`),
        fullPage: true,
      });

      const title = await page.title();
      const checks: Record<string, boolean> = {
        statusOk: status !== null && status < 400,
        hasSiteHeader: (await page.locator(".site-header").count()) > 0,
        hasPrimaryNav: (await page.locator(".nav-pill__link").count()) >= 3,
        hasMainOrAppRoot:
          (await page.locator("main, #app-root, .site-content").count()) > 0,
      };

      if (route.path === "/") {
        checks.hasHero = (await page.locator(".hero-aeru").count()) > 0;
        checks.hasArchives = (await page.locator("#archives").count()) > 0;
        const overviewRes = await page.request.get("/api/overview");
        checks.apiOverviewOk = overviewRes.ok();
        if (!overviewRes.ok()) {
          notes.push(`/api/overview returned ${overviewRes.status()}`);
        } else {
          const body = (await overviewRes.json()) as { stats?: Record<string, number> };
          checks.apiOverviewHasStats = Boolean(body.stats);
          if (!body.stats) {
            notes.push("/api/overview missing stats object");
          }
        }
      }

      if (route.path === "/graph") {
        await page.waitForTimeout(3000);
        checks.hasAppRoot = (await page.locator("#app-root").count()) > 0;
        const graphJs = await page.request.get("/graph.js");
        checks.graphJsOk = graphJs.ok();
      }

      const headingVisible = await page
        .getByRole("heading")
        .filter({ hasText: route.expectHeading })
        .first()
        .isVisible()
        .catch(() => false);
      checks.expectedHeading = headingVisible;

      findings.push({
        path: route.path,
        name: route.name,
        status,
        title,
        consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
        failedRequests: failedRequests.slice(0, 20),
        checks,
        notes,
      });

      expect(status, `${route.path} should load`).toBeLessThan(400);
      expect(checks.hasSiteHeader, "site header present").toBe(true);
    });
  }

  test.afterAll(() => {
    const reportPath = join(process.cwd(), "e2e", "artifacts", "analysis.json");
    writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2));

    const lines = ["# Hub analysis (Playwright)", ""];
    for (const f of findings) {
      lines.push(`## ${f.name} — \`${f.path}\``);
      lines.push(`- HTTP: ${f.status ?? "n/a"}`);
      lines.push(`- Title: ${f.title}`);
      lines.push("- Checks:");
      for (const [k, v] of Object.entries(f.checks)) {
        lines.push(`  - ${k}: ${v ? "pass" : "FAIL"}`);
      }
      if (f.consoleErrors.length) {
        lines.push(`- Console errors (${f.consoleErrors.length}):`);
        f.consoleErrors.forEach((e) => lines.push(`  - \`${e.slice(0, 120)}\``));
      }
      if (f.failedRequests.length) {
        lines.push("- Failed requests:");
        f.failedRequests.forEach((r) => lines.push(`  - ${r.status} ${r.url}`));
      }
      if (f.notes.length) {
        lines.push("- Notes:");
        f.notes.forEach((n) => lines.push(`  - ${n}`));
      }
      lines.push("");
    }
    writeFileSync(join(process.cwd(), "e2e", "artifacts", "analysis.md"), lines.join("\n"));
  });
});
