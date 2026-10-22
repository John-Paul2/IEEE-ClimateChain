import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

test.describe("Operator Telemetry View & Verifier Committee Console E2E", () => {
  const screenshotsDir = path.resolve(process.cwd(), "screenshots");

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test("1. Normal Flow: Operator and Verifier views in honest baseline state", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;

    // --- OPERATOR VIEW ---
    await page.goto("/operator");

    // Header & gateway active status
    await expect(page.getByRole("heading", { name: "Operator Telemetry View", level: 1 })).toBeVisible();
    await expect(page.getByText("DEV-STEEL-001")).toBeVisible();

    // Bond Status strip from chain / API
    await expect(page.getByText("On-Chain BondVault Status:")).toBeVisible();
    await expect(page.getByText("Available Stake:")).toBeVisible();

    // Attack Panel: default honest mode
    await expect(page.getByTestId("honest-mode-badge")).toBeVisible();
    await expect(page.getByTestId("attack-btn-none")).toBeVisible();

    // Live Telemetry Charts (Recharts) with REAL and SYNTHETIC channels
    await expect(page.getByRole("region", { name: /live telemetry channels/i })).toBeVisible();
    await expect(page.getByText("REAL (EPA CAMPD)")).toBeVisible();
    await expect(page.getByText("SYNTHETIC (Simulated)")).toBeVisible();
    await expect(page.getByRole("button", { name: /CO₂ Mass Flow REAL/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Flue Gas O₂ SYNTHETIC/i })).toBeVisible();

    // HashChainStrip: sequence numbering and previous-hash link
    await expect(page.getByRole("region", { name: /tamper-evident hash chain/i })).toBeVisible();
    await expect(page.getByTestId("latest-sequence-badge")).toBeVisible();
    await expect(page.getByText("prev == H").first()).toBeVisible();

    // Merkle Tree Visualization with explorer link
    await expect(page.getByRole("region", { name: /batch merkle tree visualization/i })).toBeVisible();
    await expect(page.getByTestId("merkle-root-explorer-link")).toBeVisible();

    // Capture Operator Normal State Screenshot
    const opNormalPath = path.join(screenshotsDir, `operator-normal-${projectName}.png`);
    await page.screenshot({ path: opNormalPath, fullPage: true });

    // --- VERIFIER VIEW ---
    await page.goto("/verifier");

    // Header
    await expect(page.getByRole("heading", { name: "Verifier Committee Console", level: 1 })).toBeVisible();

    // Five VoteCards updating live
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByText(`VERIFIER-0${i}`)).toBeVisible();
    }

    // Batch status timeline
    await expect(page.getByRole("region", { name: /batch consensus status timeline/i })).toBeVisible();
    await expect(page.getByText("1. Merkle Root Anchored")).toBeVisible();
    await expect(page.getByText("2. Committee Commit-Reveal")).toBeVisible();
    await expect(page.getByText(/3. Finalised/)).toBeVisible();

    // TrustGauge consensus score
    await expect(page.getByRole("region", { name: /batch quorum consensus score/i })).toBeVisible();

    // Capture Verifier Normal State Screenshot
    const verNormalPath = path.join(screenshotsDir, `verifier-normal-${projectName}.png`);
    await page.screenshot({ path: verNormalPath, fullPage: true });
  });

  test("2. Attack Injected and Flagged: Constant Scaling attack triggers fraud quorum", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;

    await page.goto("/operator");

    // Select the Constant Scaling attack
    const attackBtn = page.getByTestId("attack-btn-constant_scaling");
    await expect(attackBtn).toBeVisible();
    await attackBtn.click();

    // Verify Attack Active badge is visible
    await expect(page.getByTestId("active-attack-badge")).toBeVisible();
    await expect(page.getByText(/ATTACK ACTIVE: Constant Scaling/i)).toBeVisible();

    // Seal and anchor next batch under this attack
    const sealBtn = page.getByTestId("seal-batch-btn");
    await expect(sealBtn).toBeVisible();
    await sealBtn.click();

    // Wait for the new batch to be processed and quarantined
    await expect(page.getByText(/FRAUD \(Flagged by Quorum\)/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/PHYSICS_RESIDUAL/i).first()).toBeVisible();
    await expect(page.getByText(/AE_RESIDUAL/i).first()).toBeVisible();

    // Capture Operator Attack State Screenshot
    const opAttackPath = path.join(screenshotsDir, `operator-attack-${projectName}.png`);
    await page.screenshot({ path: opAttackPath, fullPage: true });

    // Check Verifier Page has updated with fraud quorum
    await page.goto("/verifier");
    await expect(page.getByText(/FRAUD DETECTED · QUORUM ACTION/i)).toBeVisible();
    await expect(page.getByRole("region", { name: /quarantine forensic evidence viewer/i })).toBeVisible();
  });

  test("3. Challenge Upheld and Slashed: Dispute, 2-of-3 Arbiter Approvals, and Bond Slashed", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;

    await page.goto("/verifier");

    // Check Quarantine evidence viewer
    const quarantineViewer = page.getByRole("region", { name: /quarantine forensic evidence viewer/i });
    await expect(quarantineViewer).toBeVisible();

    // Test Merkle Inclusion Proof verification
    const verifyProofBtn = page.getByTestId("verify-merkle-proof-btn");
    if (await verifyProofBtn.isVisible()) {
      await verifyProofBtn.click();
      await expect(page.getByTestId("merkle-proof-verified-badge")).toBeVisible();
    }

    // Check Challenge Panel countdown and evidence
    const challengePanel = page.getByRole("region", { name: /optimistic quarantine challenge panel/i });
    await expect(challengePanel).toBeVisible();
    await expect(page.getByTestId("challenge-countdown")).toBeVisible();

    // Operator dispute step
    const disputeBtn = page.getByTestId("submit-dispute-btn");
    if (await disputeBtn.isVisible()) {
      await disputeBtn.click();
      await expect(page.getByText("DISPUTED").first()).toBeVisible();
    }

    // Multisig Arbiter voting (2 of 3 required)
    const upholdSlashBtn = page.getByTestId("uphold-slash-btn");
    if (await upholdSlashBtn.isVisible()) {
      await upholdSlashBtn.click();
    }

    // Verify Arbiter approvals threshold reached
    await expect(page.getByTestId("arbiter-approvals-count")).toContainText("2 / 2");

    // Verify Challenge Outcome banner
    const outcomeBanner = page.getByTestId("challenge-outcome-banner");
    await expect(outcomeBanner).toContainText("OUTCOME: FRAUD UPHELD & OPERATOR BOND SLASHED");

    // Capture Verifier Attack State Screenshot
    const verAttackPath = path.join(screenshotsDir, `verifier-attack-${projectName}.png`);
    await page.screenshot({ path: verAttackPath, fullPage: true });

    // Check that BondVault slashed state updates on Operator page
    await page.goto("/operator");
    await expect(page.getByTestId("operator-slashed-bond")).toContainText("1.00 ETH");
  });
});
