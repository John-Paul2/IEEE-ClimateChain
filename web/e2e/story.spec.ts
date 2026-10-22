import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";

let backendProcess: ChildProcess | null = null;

async function isBackendHealthy(): Promise<boolean> {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/health");
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  // Check if backend is already running
  if (await isBackendHealthy()) {
    console.log("[*] Backend is already active on http://127.0.0.1:8000");
    return;
  }

  // Find python executable in .venv
  const repoRoot = path.resolve(process.cwd(), "..");
  const pythonExe = path.join(repoRoot, ".venv", "Scripts", "python.exe");

  console.log(`[*] Spawning backend with Anvil: ${pythonExe} -m backend.vericems.server`);
  backendProcess = spawn(
    pythonExe,
    ["-m", "backend.vericems.server", "--port", "8000", "--anvil-port", "8545"],
    {
      cwd: repoRoot,
      stdio: "pipe",
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    }
  );

  backendProcess.stderr?.on("data", (chunk) => {
    const msg = chunk.toString();
    if (!msg.includes("MismatchedABI") && !msg.includes("DeprecationWarning")) {
      process.stderr.write(`[backend stderr] ${msg}`);
    }
  });

  // Poll until healthy (up to 45 seconds)
  const start = Date.now();
  let healthy = false;
  while (Date.now() - start < 45000) {
    if (await isBackendHealthy()) {
      healthy = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!healthy) {
    throw new Error("Backend failed to start within 45 seconds");
  }
  console.log("[*] Backend started successfully and verified healthy");
});

test.afterAll(async () => {
  if (backendProcess) {
    console.log("[*] Terminating backend process");
    backendProcess.kill("SIGTERM");
    backendProcess = null;
  }
});

test.describe("VeriCEMS Deterministic Story & Reset Repeatability", () => {
  const screenshotsDir = path.resolve(process.cwd(), "screenshots");

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test("Play the complete 7-step story twice in a row with identical on-chain outcomes and zero console errors", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const projectName = testInfo.project.name;

    // Track console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      console.log(`[browser console ${msg.type()}] ${msg.text()}`);
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      console.log(`[browser pageerror] ${err.message}`);
      consoleErrors.push(err.message);
    });

    // 1. Initial Navigation
    await page.goto("/operator");

    // Ensure we are in LIVE mode connected to the backend
    const toggleProviderBtn = page.getByRole("button", { name: /toggle mock\/live provider/i });
    if (await toggleProviderBtn.isVisible()) {
      const text = await toggleProviderBtn.innerText();
      if (text.includes("SYNTHETIC")) {
        await toggleProviderBtn.click();
        await page.waitForTimeout(500);
      }
    }
    await expect(toggleProviderBtn).toContainText("LIVE");

    // Reset before starting
    const resetBtn = page.getByTestId("demo-reset-btn");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await page.waitForTimeout(500);

    // Reusable runner for the 7 story steps
    const runStoryCycle = async (cycleNum: number) => {
      console.log(`[Cycle ${cycleNum}] Starting 7-step story...`);

      // -------------------------------------------------------------
      // Step 1: Normal batches flow and coverage rises
      // -------------------------------------------------------------
      const stepBtn = page.getByTestId("demo-step-btn");
      await expect(stepBtn).toBeEnabled();
      await stepBtn.click();

      // Assert Step 1 UI state
      const captionArea = page.getByTestId("demo-caption-area");
      await expect(captionArea).toContainText("STEP 1/7", { timeout: 15000 });
      await expect(captionArea).toContainText("Normal telemetry batches flow");

      // Verify batch 1 on Operator page
      await expect(page.getByText("#1").first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("VERIFIED").first()).toBeVisible();

      // Capture Step 1 Screenshot
      if (cycleNum === 1) {
        const p = path.join(screenshotsDir, `story-step-1-normal-${projectName}.png`);
        await page.screenshot({ path: p, fullPage: true });
      }

      // -------------------------------------------------------------
      // Step 2: An insider injects a constant-scaling attack before signing
      // -------------------------------------------------------------
      await stepBtn.click();
      await expect(captionArea).toContainText("STEP 2/7", { timeout: 10000 });
      await expect(captionArea).toContainText("constant-scaling attack");

      // Verify attack panel shows active attack
      await expect(page.getByTestId("active-attack-badge")).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/ATTACK ACTIVE: Constant Scaling/i)).toBeVisible();

      if (cycleNum === 1) {
        const p = path.join(screenshotsDir, `story-step-2-attack-injected-${projectName}.png`);
        await page.screenshot({ path: p, fullPage: true });
      }

      // -------------------------------------------------------------
      // Step 3: Verifiers detect it and vote; quarantined; reasons explained
      // -------------------------------------------------------------
      await stepBtn.click();
      await expect(captionArea).toContainText("STEP 3/7", { timeout: 15000 });
      await expect(captionArea).toContainText("batch quarantined");

      // Verifier console visible
      await page.waitForURL("**/verifier", { timeout: 10000 });
      await expect(page.getByText(/FRAUD DETECTED · QUORUM ACTION/i)).toBeVisible();

      // Forensic evidence viewer explaining reason codes
      const qViewer = page.getByRole("region", { name: /quarantine forensic evidence viewer/i });
      await expect(qViewer).toBeVisible();
      await expect(page.getByText(/PHYSICS_RESIDUAL/i).first()).toBeVisible();
      await expect(page.getByText(/SPECTRAL_REPEAT|CROSS_SOURCE_MISMATCH|AE_RESIDUAL/i).first()).toBeVisible();

      if (cycleNum === 1) {
        const p = path.join(screenshotsDir, `story-step-3-quarantined-${projectName}.png`);
        await page.screenshot({ path: p, fullPage: true });
      }

      // -------------------------------------------------------------
      // Step 4: The operator disputes; arbiters uphold; bond is slashed
      // -------------------------------------------------------------
      await stepBtn.click();
      await expect(captionArea).toContainText("STEP 4/7", { timeout: 15000 });
      await expect(captionArea).toContainText("bond slashed on-chain");

      // Outcome banner on Verifier page
      const outcomeBanner = page.getByTestId("challenge-outcome-banner");
      await expect(outcomeBanner).toBeVisible({ timeout: 10000 });
      await expect(outcomeBanner).toContainText("OUTCOME: FRAUD UPHELD & OPERATOR BOND SLASHED");
      await expect(outcomeBanner).toContainText("1.00 ETH operator bond permanently slashed");
      await expect(page.getByText("Settlement Tx:")).toBeVisible();

      if (cycleNum === 1) {
        const p = path.join(screenshotsDir, `story-step-4-slashed-${projectName}.png`);
        await page.screenshot({ path: p, fullPage: true });
      }

      // -------------------------------------------------------------
      // Step 5: The period report is generated and attestation recorded
      // -------------------------------------------------------------
      await stepBtn.click();
      await expect(captionArea).toContainText("STEP 5/7", { timeout: 15000 });
      await expect(captionArea).toContainText("CBAM attestation recorded");

      await page.waitForURL("**/importer", { timeout: 10000 });
      await expect(page.getByRole("heading", { name: /period-end attestation certificate/i })).toBeVisible();

      if (cycleNum === 1) {
        const p = path.join(screenshotsDir, `story-step-5-attested-${projectName}.png`);
        await page.screenshot({ path: p, fullPage: true });
      }

      // -------------------------------------------------------------
      // Step 6: Importer view: genuine report succeeds, tampered copy fails, savings shown
      // -------------------------------------------------------------
      await stepBtn.click();
      await expect(captionArea).toContainText("STEP 6/7", { timeout: 15000 });
      await expect(captionArea).toContainText("Importer portal verifies genuine report");

      // 1. Genuine report verification succeeds
      const statusBanner = page.getByTestId("verification-status-banner");
      await expect(statusBanner).toBeVisible({ timeout: 10000 });
      await expect(statusBanner).toContainText("CRYPTOGRAPHIC VERIFICATION SUCCESSFUL");

      // 2. Tampered report verification fails
      await page.getByTestId("load-tampered-report-btn").click();
      await expect(statusBanner).toContainText("VERIFICATION FAILED: TAMPERED OR NON-COMPLIANT REPORT");
      await expect(page.getByText("INTEGRITY VIOLATION")).toBeVisible();

      // 3. Restore valid report & load illustrative preset to show cost savings
      await page.getByTestId("load-valid-report-btn").click();
      await expect(statusBanner).toContainText("CRYPTOGRAPHIC VERIFICATION SUCCESSFUL");
      await page.getByTestId("load-illustrative-preset-btn").click();

      // Check savings and split view
      await expect(page.getByTestId("animated-savings-value")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Default Value Route" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Verified Actual Route" })).toBeVisible();

      if (cycleNum === 1) {
        const p = path.join(screenshotsDir, `story-step-6-importer-verified-${projectName}.png`);
        await page.screenshot({ path: p, fullPage: true });
      }

      // -------------------------------------------------------------
      // Step 7: Show Benchmark page with 'What still gets through'
      // -------------------------------------------------------------
      await stepBtn.click();
      await expect(captionArea).toContainText("STEP 7/7", { timeout: 15000 });
      await expect(captionArea).toContainText("What still gets through");

      await page.waitForURL("**/benchmark", { timeout: 10000 });
      await expect(page.getByRole("heading", { name: /benchmark & threat model/i, level: 1 })).toBeVisible();

      // Disclosure section visible
      await expect(page.getByRole("heading", { name: /3\. Prominent Disclosure: What Still Gets Through/i })).toBeVisible();
      await expect(page.getByText(/Honesty Disclosure: Attacks with Proposed Detector Recall/i)).toBeVisible();

      if (cycleNum === 1) {
        const p = path.join(screenshotsDir, `story-step-7-benchmark-disclosure-${projectName}.png`);
        await page.screenshot({ path: p, fullPage: true });
      }

      console.log(`[Cycle ${cycleNum}] Completed successfully!`);
    };

    // =========================================================================
    // CYCLE 1: Full Story Execution
    // =========================================================================
    await runStoryCycle(1);

    // =========================================================================
    // RESET: Verify instantaneous and complete restoration of Step 0 state
    // =========================================================================
    console.log("[Reset] Resetting story back to Step 0...");
    await resetBtn.click();
    await page.waitForTimeout(1000);

    // Confirm UI and engine state restored to Step 0
    await page.goto("/operator");
    await expect(page.getByTestId("demo-caption-area")).toContainText("Demo Ready");
    await expect(page.getByTestId("operator-slashed-bond")).toContainText("0.00 ETH");
    await expect(page.getByTestId("honest-mode-badge")).toBeVisible();

    // =========================================================================
    // CYCLE 2: Repeat Story Execution (Must produce identical outcomes)
    // =========================================================================
    await runStoryCycle(2);

    // =========================================================================
    // ZERO CONSOLE ERRORS ASSERTION
    // =========================================================================
    expect(consoleErrors).toEqual([]);
  });
});
