import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

test.describe("VeriCEMS Benchmark and Threat Model Screen", () => {
  const screenshotsDir = path.resolve(process.cwd(), "screenshots");

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test("Renders real benchmark results honestly across all sections and takes screenshots", async ({
    page,
  }, testInfo) => {
    await page.goto("/benchmark");

    // 1. Header & Title with REAL Chip & Popover
    await expect(
      page.getByRole("heading", { name: "What we catch, and what we don't", level: 1 })
    ).toBeVisible();
    await expect(page.getByText("EPA CAMPD", { exact: true })).toBeVisible();

    // Check '?' Popover (4 bullets, max 8 words)
    await page.getByTestId("help-popover-trigger").click();
    await expect(page.getByTestId("help-popover-dialog")).toBeVisible();
    await expect(
      page.getByText("Empirical evaluation across 14 industrial attack scenarios.")
    ).toBeVisible();

    // Close Popover
    await page.keyboard.press("Escape");

    // 2. 4-Column Table (Attack, Caught, Delay, Why)
    const attackSection = page.locator('section[aria-labelledby="section-attack-table"]');
    await expect(attackSection.getByText("Attack")).toBeVisible();
    await expect(attackSection.getByText("Caught")).toBeVisible();
    await expect(attackSection.getByText("Delay")).toBeVisible();
    await expect(attackSection.getByText("Why")).toBeVisible();

    // Check human attack names only (no machine ids)
    await expect(attackSection.getByText("1a. Constant Scaling (-5%)")).toBeVisible();
    await expect(attackSection.getByText("8A. Adaptive White-Box (Single-Source)")).toBeVisible();
    await expect(attackSection.getByText("8B. Adaptive White-Box (Coordinated Insider)")).toBeVisible();

    // Check below 50% chips
    await expect(attackSection.getByText("Below 50%").first()).toBeVisible();

    // Check expandable 'Why' (at most 12 words)
    const whyBtn = attackSection.getByRole("button", { name: /Why 1a\. Constant Scaling \(-5%\)/i });
    await whyBtn.click();
    await expect(
      attackSection.getByText(/Caught by stoichiometric mass-balance residual/i)
    ).toBeVisible();

    // 3. ROC and Adaptive Attacker Curves
    const curvesSection = page.locator('section[aria-labelledby="section-curves"]');
    await expect(curvesSection.getByText("Empirical Curves & Figures")).toBeVisible();

    // Publication PNGs tab toggle
    await curvesSection.getByRole("button", { name: /Publication PNGs/i }).click();
    await expect(curvesSection.getByText("1. roc_curves.png")).toBeVisible();

    // Switch back to Interactive plots
    await curvesSection.getByRole("button", { name: /Interactive Plots/i }).click();

    // 4. "What Still Gets Through" Panel (3 Bullets + Details Expander)
    const disclosureSection = page.locator('section[aria-labelledby="section-what-still-gets-through"]');
    await expect(disclosureSection.getByText("What still gets through")).toBeVisible();
    await expect(disclosureSection.getByText("3 attacks")).toBeVisible();
    await expect(
      disclosureSection.getByText(/Slow drift \(0\.1%\/day\): 8\.1% caught · cumulative drift stays within normal boiler noise/i)
    ).toBeVisible();
    await expect(
      disclosureSection.getByText(/Slow drift \(0\.3%\/day\): 29\.1% caught · evades detection for first 9 operating days/i)
    ).toBeVisible();
    await expect(
      disclosureSection.getByText(/Coordinated insider: 3\.0% caught · falsifies fuel ledger within thermal margins/i)
    ).toBeVisible();

    // Details expander
    await disclosureSection.getByRole("button", { name: /details/i }).click();
    await expect(
      disclosureSection.getByText(/Attacks inside natural boiler variance and validation tolerance evade statistical thresholds/i)
    ).toBeVisible();

    // 5. One-Line Footer of Provenance Chips
    await expect(page.getByText("5 splits")).toBeVisible();
    await expect(page.getByText("seed 42")).toBeVisible();
    await expect(page.getByText(/commit 9cad8a0/i)).toBeVisible();
    await expect(page.getByText("REAL EPA CAMPD")).toBeVisible();

    // Capture primary screenshot
    const projectName = testInfo.project.name;
    const screenshotPath = path.join(screenshotsDir, `benchmark-${projectName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
