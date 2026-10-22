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

    // 1. Header & Title
    await expect(
      page.getByRole("heading", { name: "Benchmark & Threat Model", level: 1 })
    ).toBeVisible();

    // 2. Real KPI Tiles (Macro Metrics from benchmark_summary.json)
    await expect(page.getByText("Macro Recall (Proposed)")).toBeVisible();
    await expect(page.getByText("Macro Precision")).toBeVisible();
    await expect(page.getByText("Empirical FPR")).toBeVisible();
    await expect(page.getByText("Overall AUROC")).toBeVisible();

    // 3. Attack x Detector Summary Table
    const attackSection = page.locator('section[aria-labelledby="section-attack-table"]');
    await expect(attackSection.getByText("1. Attack × Detector Empirical Benchmark")).toBeVisible();
    await expect(attackSection.getByText("1a. Constant Scaling (-5%)")).toBeVisible();
    await expect(attackSection.getByText("8A. Adaptive White-Box (Single-Source)")).toBeVisible();
    await expect(attackSection.getByText("8B. Adaptive White-Box (Coordinated Insider)")).toBeVisible();

    // Test detector toggle to B2 Physics
    await attackSection.getByRole("button", { name: /B2 Physics/i }).click();
    await expect(attackSection.getByText("Active detector: Baseline 2: Mass-Balance & Load Physics")).toBeVisible();

    // Test 4-Detector Compare toggle
    await attackSection.getByRole("button", { name: /4-Detector Compare/i }).click();
    await expect(attackSection.getByText("Proposed Recall")).toBeVisible();
    await expect(attackSection.getByText("B2 Physics Recall")).toBeVisible();

    // Switch back to Proposed
    await attackSection.getByRole("button", { name: /Proposed \(Union\)/i }).click();

    // 4. ROC and Adaptive Attacker Curves
    const curvesSection = page.locator('section[aria-labelledby="section-curves"]');
    await expect(
      curvesSection.getByText("2. Receiver Operating Characteristic & Adaptive Attacker Sweep")
    ).toBeVisible();
    await expect(curvesSection.getByText("Receiver Operating Characteristic (ROC)")).toBeVisible();
    await expect(curvesSection.getByText("Adaptive Attacker Response Curves")).toBeVisible();

    // Test publication PNG figures tab
    await curvesSection.getByRole("button", { name: /Publication PNGs/i }).click();
    await expect(curvesSection.getByText("1. roc_curves.png")).toBeVisible();
    await expect(curvesSection.getByRole("button", { name: /2. adaptive_attacker_curve.png/i })).toBeVisible();
    await expect(curvesSection.getByRole("button", { name: /3. recall_per_attack_detector.png/i })).toBeVisible();

    // Switch back to interactive plots
    await curvesSection.getByRole("button", { name: /Interactive Plots/i }).click();

    // 5. "What Still Gets Through" Panel (from results/WHAT_STILL_GETS_THROUGH.md)
    const disclosureSection = page.locator('section[aria-labelledby="section-what-still-gets-through"]');
    await expect(disclosureSection.getByText("3. Prominent Disclosure: What Still Gets Through")).toBeVisible();
    await expect(disclosureSection.getByText("6a. Slow Calibration Drift (0.1%/day)").first()).toBeVisible();
    await expect(disclosureSection.getByText("8B. Adaptive White-Box (Coordinated Insider)").first()).toBeVisible();
    await expect(
      disclosureSection.getByText(/At 0.1%\/day, cumulative drift over 12 days is at most 1.2%/i).first()
    ).toBeVisible();

    // 6. Threat Model Table (EmptyState when docs/threat_model.json does not exist)
    const threatSection = page.locator('section[aria-labelledby="section-threat-model"]');
    await expect(threatSection.getByText("4. Threat Model & Residual Weakness Matrix")).toBeVisible();
    await expect(threatSection.getByText("Threat Model Document Not Found")).toBeVisible();
    await expect(
      threatSection.getByText(/docs\/threat_model\.json is not present in the workspace/i)
    ).toBeVisible();

    // 7. Data Provenance Panel (from results/run_manifest.json and docs/DATA_CARD.md)
    const provenanceSection = page.locator('section[aria-labelledby="section-provenance"]');
    await expect(provenanceSection.getByText("5. Data Provenance & Run Manifest")).toBeVisible();
    await expect(provenanceSection.getByText("29", { exact: true })).toBeVisible(); // 29 facilities
    await expect(provenanceSection.getByText("uncommitted")).toBeVisible(); // git commit
    await expect(provenanceSection.getByText("synthetic_stack_o2_pct")).toBeVisible();
    await expect(provenanceSection.getByText("synthetic_fuel_flow_mmbtu_indep")).toBeVisible();

    // 8. "Reproduce This" Box
    const reproduceSection = page.locator('section[aria-labelledby="section-reproduce"]');
    await expect(reproduceSection.getByText("6. Reproduce Results")).toBeVisible();
    await expect(reproduceSection.getByText("$ make benchmark")).toBeVisible();
    await expect(reproduceSection.getByText("$ python -m ml.benchmark.run_benchmark", { exact: true })).toBeVisible();

    // Capture primary screenshot (desktop or mobile)
    const projectName = testInfo.project.name;
    const screenshotPath = path.join(screenshotsDir, `benchmark-${projectName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // 9. Verify Missing File State Handling
    const missingSelect = page.getByLabel("Simulate Missing Files State");
    await missingSelect.selectOption("missing_summary");

    // Summary table should show EmptyState
    await expect(page.getByText("Benchmark Summary Data Missing")).toBeVisible();
    await expect(
      page.getByText(/results\/benchmark_summary\.json is missing or corrupted/i)
    ).toBeVisible();

    // Capture missing state screenshot
    const missingScreenshotPath = path.join(
      screenshotsDir,
      `benchmark-missing-state-${projectName}.png`
    );
    await page.screenshot({ path: missingScreenshotPath, fullPage: true });

    // Restore real files
    await missingSelect.selectOption("all_present");
    await expect(attackSection.getByText("1a. Constant Scaling (-5%)")).toBeVisible();
  });
});
