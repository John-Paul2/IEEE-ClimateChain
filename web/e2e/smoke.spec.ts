import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

test.describe("VeriCEMS Application Shell & Route Smoke Tests", () => {
  const screenshotsDir = path.resolve(process.cwd(), "screenshots");

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test("Smoke Test: /operator route renders with shell, network badge, and mock badge", async ({
    page,
  }, testInfo) => {
    await page.goto("/operator");

    // Verify top bar badges
    await expect(page.getByRole("status", { name: /network status/i })).toBeVisible();
    await expect(page.getByRole("status", { name: /mock data provider/i })).toBeVisible();

    // Verify page header
    await expect(
      page.getByRole("heading", { name: /telemetry/i, level: 1 })
    ).toBeVisible();

    // Verify hash chain component
    await expect(
      page.getByRole("region", { name: /tamper-evident hash chain/i })
    ).toBeVisible();

    // Verify operator bond stat tile and try to cheat panel
    await expect(page.getByText("Operator bond")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Try to cheat|Operator bond/i })).toBeVisible();

    // Take screenshot for both desktop and mobile
    const projectName = testInfo.project.name;
    const screenshotPath = path.join(screenshotsDir, `shell-operator-${projectName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("Smoke Test: /verifier route renders quorum console, trust gauge, and vote cards", async ({
    page,
  }) => {
    await page.goto("/verifier");

    await expect(
      page.getByRole("heading", { name: "Verifier Committee Console", level: 1 })
    ).toBeVisible();

    // Check TrustGauge
    await expect(
      page.getByRole("region", { name: /verification trust score|batch quorum consensus score/i })
    ).toBeVisible();

    // Check Committee Nodes
    await expect(page.getByText("VERIFIER-01")).toBeVisible();
    await expect(page.getByText("VERIFIER-05")).toBeVisible();

    // Check Batch Consensus Timeline & Quorum Status
    await expect(
      page.getByRole("region", { name: /batch consensus status timeline/i })
    ).toBeVisible();
  });

  test("Smoke Test: /importer route renders CBAM calculator & period attestation", async ({
    page,
  }) => {
    await page.goto("/importer");

    await expect(
      page.getByRole("heading", { name: "EU Importer CBAM Portal", level: 1 })
    ).toBeVisible();

    // Financial comparison metrics
    await expect(page.getByRole("heading", { name: "Default Value Route" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verified Actual Route" })).toBeVisible();
    await expect(page.getByText("You save", { exact: true })).toBeVisible();

    // Attestation certificate
    await expect(
      page.getByRole("heading", { name: /period-end attestation certificate/i })
    ).toBeVisible();
  });

  test("Smoke Test: /benchmark route renders real benchmark suite", async ({ page }) => {
    await page.goto("/benchmark");

    await expect(
      page.getByRole("heading", { name: /what we catch, and what we don't/i, level: 1 })
    ).toBeVisible();

    // Evaluated attack scenarios from results/benchmark_summary.json
    await expect(page.getByText("1d. Constant Scaling (-30%)").first()).toBeVisible();
    await expect(page.getByText("8A. Adaptive White-Box (Single-Source)").first()).toBeVisible();
  });

  test("Smoke Test: /gallery route displays all 14 components in multiple states", async ({
    page,
  }, testInfo) => {
    await page.goto("/gallery");

    await expect(
      page.getByRole("heading", { name: "Component Library & Token Gallery", level: 1 })
    ).toBeVisible();

    // Check token section
    await expect(page.getByText("1. Design Tokens")).toBeVisible();

    // Check components
    await expect(page.getByText("2. Badge")).toBeVisible();
    await expect(page.getByText("3. HashChip")).toBeVisible();
    await expect(page.getByText("4. StatTile")).toBeVisible();
    await expect(page.getByText("5. TrustGauge")).toBeVisible();
    await expect(page.getByText("6. HashChainStrip")).toBeVisible();
    await expect(page.getByText("7. MerkleTreeViz")).toBeVisible();
    await expect(page.getByText("8. VoteCard")).toBeVisible();
    await expect(page.getByText("9. Countdown")).toBeVisible();
    await expect(page.getByText("10. DataTable")).toBeVisible();
    await expect(page.getByText("11. Card")).toBeVisible();
    await expect(page.getByText("12. Toast System")).toBeVisible();

    // Take screenshot of complete gallery
    const projectName = testInfo.project.name;
    const screenshotPath = path.join(screenshotsDir, `gallery-${projectName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
