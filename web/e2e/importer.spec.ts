import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

test.describe("EU Importer CBAM Portal E2E Tests", () => {
  const screenshotsDir = path.resolve(process.cwd(), "screenshots");

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test("1. Valid Report Verification & Illustrative Calculation Flow", async ({
    page,
  }, testInfo) => {
    await page.goto("/importer");

    // Check page header
    await expect(
      page.getByRole("heading", { name: "EU Importer CBAM Portal", level: 1 })
    ).toBeVisible();

    // Check OFFLINE SNAPSHOT mode is active and labelled prominently
    await expect(page.getByText(/OFFLINE SNAPSHOT MODE ACTIVE/i)).toBeVisible();
    await expect(page.getByTestId("toggle-offline-snapshot-btn")).toContainText("OFFLINE SNAPSHOT");

    // Check verification status banner for valid report (fix: honest status with quarantined batch)
    const banner = page.getByTestId("verification-status-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("ATTESTED REPORT · 1 BATCH QUARANTINED");
    await expect(banner).toContainText("50% verified · 1 flagged (deposit slashed)");
    await expect(page.getByText("ATTESTED ON-CHAIN")).toBeVisible();

    // Check collapsible 7 checks passed per Page Guide
    const checksBtn = page.getByRole("button", { name: /7 checks passed/i });
    await expect(checksBtn).toBeVisible();
    await checksBtn.click();
    await expect(page.getByText("Data structure & integrity")).toBeVisible();
    await expect(page.getByText("Period Merkle root recomputation")).toBeVisible();
    await expect(page.getByText("On-chain attestation registry match")).toBeVisible();

    // Check Evidence Summary Panel
    const evidencePanel = page.getByTestId("evidence-summary-panel");
    await expect(evidencePanel).toBeVisible();
    await expect(evidencePanel).toContainText("INST-CAMPD-1073");
    await expect(evidencePanel).toContainText("#1"); // Attestation #1
    await expect(evidencePanel).toContainText("2025-01-01");

    // Check Quarantined / Flagged Batches with human-readable labels
    const qList = page.getByTestId("quarantined-batches-list");
    await expect(qList).toBeVisible();
    await expect(qList).toContainText("Batch #2");
    await expect(qList).toContainText("deposit slashed");
    await expect(qList).toContainText("Fuel vs. stack mismatch");
    await expect(qList).toContainText("Mass-balance physics residual");
    await expect(qList).toContainText("Repeated pattern anomaly");

    // Check Data Provenance disclosures (Rule 3)
    await expect(page.getByText("REAL (CAMPD 1073-3)")).toBeVisible();
    await expect(page.getByText("SYNTHETIC (Software SE)")).toBeVisible();
    await expect(page.getByText("SYNTHETIC (Reported)")).toBeVisible();

    // Load illustrative preset so the calculator is populated and all formula steps show
    await page.getByTestId("load-illustrative-preset-btn").click();
    await expect(page.getByText(/FICTIONAL \/ ILLUSTRATIVE PRESET LOADED/i)).toBeVisible();

    // Check animated savings count-up & value
    const savingsWidget = page.getByTestId("animated-savings-value");
    await expect(savingsWidget).toBeVisible();
    await expect(page.getByText("Net CBAM Importer Savings")).toBeVisible();

    // Check split view: Default Value Route vs Verified Actual Route
    await expect(page.getByRole("heading", { name: "Default Value Route" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verified Actual Route" })).toBeVisible();

    // Check step-by-step formula substitutions panel via 'Show the math' expander
    await page.getByRole("button", { name: /show the math/i }).click();
    const formulaPanel = page.getByTestId("formula-steps-panel");
    await expect(formulaPanel).toBeVisible();
    await expect(formulaPanel).toContainText("Step 1: Specific Embedded Free Allocation (SEFA)");
    await expect(formulaPanel).toContainText("Step 2: Default SEE with annual markup");
    await expect(formulaPanel).toContainText("Step 3: Payable emissions per tonne (with verified data)");
    await expect(formulaPanel).toContainText("Step 4: Payable emissions per tonne (with default value)");
    await expect(formulaPanel).toContainText("Step 5: CBAM certificate cost (with verified data)");
    await expect(formulaPanel).toContainText("Step 6: CBAM certificate cost (with default value)");
    await expect(formulaPanel).toContainText("Step 7: Savings from verified installation data");

    // Check '?' popover with 4 short bullets (Task 3)
    await page.getByTestId("help-popover-trigger").click();
    await expect(page.getByTestId("help-popover-dialog")).toBeVisible();
    await expect(page.getByText("Upload JSON period report to verify cryptographically.")).toBeVisible();

    // Take screenshot of Success State
    const projectName = testInfo.project.name;
    const screenshotPath = path.join(screenshotsDir, `importer-success-${projectName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("2. Tampered Report Detection & Verification Failure", async ({
    page,
  }, testInfo) => {
    await page.goto("/importer");

    // Click "Load Tampered Report"
    await page.getByTestId("load-tampered-report-btn").click();

    // Banner must visibly turn red with failure message
    const banner = page.getByTestId("verification-status-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("VERIFICATION FAILED: TAMPERED REPORT");
    await expect(page.getByText("INTEGRITY VIOLATION")).toBeVisible();

    // Check that root mismatch error is reported
    await expect(page.getByText(/Period Merkle root on-chain check failed/i)).toBeVisible();

    // Take screenshot of Tampered State
    const projectName = testInfo.project.name;
    const screenshotPath = path.join(screenshotsDir, `importer-tampered-${projectName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("3. Missing-Parameter State & Needs-Source Badges", async ({
    page,
  }, testInfo) => {
    await page.goto("/importer");

    // Open editable inputs and reset to raw config where regulatory parameters are null
    await page.getByRole("button", { name: /editable inputs/i }).click();
    await page.getByTestId("reset-raw-config-btn").click();

    // Needs-source inline alert state must be visible
    const alert = page.getByTestId("needs-source-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("3 inputs need a source");

    // Check that needs source badges are visible in form inputs
    await expect(page.getByText("needs source: benchmark").first()).toBeVisible();
    await expect(page.getByText("needs source: default_value_base").first()).toBeVisible();
    await expect(page.getByText("needs source: cscf").first()).toBeVisible();
    await expect(page.getByTestId("load-illustrative-preset-btn")).toBeVisible();

    // Take screenshot of Needs-Source State
    const projectName = testInfo.project.name;
    const screenshotPath = path.join(screenshotsDir, `importer-needs-source-${projectName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });

  test("4. Sources Drawer & Evidence Pack Export", async ({ page }) => {
    await page.goto("/importer");

    // Open Sources Drawer
    await page.getByTestId("open-sources-btn").click();
    await expect(
      page.getByRole("heading", { name: "CBAM Legal Sources & Methodology" })
    ).toBeVisible();
    await expect(page.getByText("Regulation (EU) 2023/956").first()).toBeVisible();
    await expect(page.getByText("Commission Implementing Regulation (EU) 2025/2620").first()).toBeVisible();
    await expect(page.getByText("Commission Implementing Regulation (EU) 2025/2621").first()).toBeVisible();

    // Close Sources Drawer via header close button
    await page.getByRole("button", { name: /close sources drawer/i }).click();
    await expect(
      page.getByRole("heading", { name: "CBAM Legal Sources & Methodology" })
    ).not.toBeVisible();

    // Verify Evidence Pack download button exists and is enabled
    const exportBtn = page.getByTestId("export-evidence-pack-btn");
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();
  });
});
