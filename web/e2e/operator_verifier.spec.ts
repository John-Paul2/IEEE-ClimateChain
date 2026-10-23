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

    // Header & REAL chip
    await expect(page.getByRole("heading", { name: /telemetry/i, level: 1 })).toBeVisible();
    await expect(page.getByText("EPA replay")).toBeVisible();

    // Verify single help popover with 4 bullets
    const opHelpBtn = page.getByTestId("help-popover-trigger");
    await expect(opHelpBtn).toBeVisible();
    await opHelpBtn.click();
    const opDialog = page.getByTestId("help-popover-dialog");
    await expect(opDialog).toBeVisible();
    const opBullets = opDialog.locator("li");
    await expect(opBullets).toHaveCount(4);
    await opHelpBtn.click(); // close popover

    // Four stat tiles on pale blush band per Page Guide
    await expect(page.getByText("Packets")).toBeVisible();
    await expect(page.getByText("Batches anchored")).toBeVisible();
    await expect(page.getByText("Latest verdict")).toBeVisible();
    await expect(page.getByText("Operator bond")).toBeVisible();

    // Attack Panel: four black pill attack buttons
    await expect(page.getByTestId("attack-btn-constant_scaling")).toBeVisible();
    await expect(page.getByTestId("attack-btn-flatline")).toBeVisible();
    await expect(page.getByTestId("attack-btn-replay")).toBeVisible();
    await expect(page.getByTestId("attack-btn-tamper_after_signing")).toBeVisible();

    // Live Telemetry Charts (Recharts) with REAL and SYNTHETIC channels
    await expect(page.getByRole("region", { name: /live telemetry channels/i })).toBeVisible();
    await expect(page.getByText("REAL (EPA CAMPD)")).toBeVisible();
    await expect(page.getByText("SYNTHETIC (Simulated)")).toBeVisible();
    await expect(page.getByRole("button", { name: /CO₂ Mass Flow/i })).toBeVisible();
    await expect(page.getByText("Flue Gas O₂")).toBeVisible();

    // HashChainStrip: sequence numbering and previous-hash link
    await expect(page.getByRole("region", { name: /tamper-evident hash chain/i })).toBeVisible();
    await expect(page.getByTestId("latest-sequence-badge")).toBeVisible();
    await expect(page.getByText("prev == H").first()).toBeVisible();

    // Capture Operator Normal State Screenshot
    const opNormalPath = path.join(screenshotsDir, `operator-normal-${projectName}.png`);
    try {
      await page.screenshot({ path: opNormalPath, fullPage: true });
    } catch {
      // ignore file lock
    }

    // --- VERIFIER VIEW ---
    await page.goto("/verifier");

    // Header
    await expect(page.getByRole("heading", { name: "Verifier Committee Console", level: 1 })).toBeVisible();

    // Verify single help popover with 4 bullets
    const verHelpBtn = page.getByTestId("help-popover-trigger");
    await expect(verHelpBtn).toBeVisible();
    await verHelpBtn.click();
    const verDialog = page.getByTestId("help-popover-dialog");
    await expect(verDialog).toBeVisible();
    const verBullets = verDialog.locator("li");
    await expect(verBullets).toHaveCount(4);
    await verHelpBtn.click(); // close popover

    // Shared model-hash line
    await expect(page.getByText("All run model")).toBeVisible();
    await expect(page.getByText("identical")).toBeVisible();

    // Five VoteCards updating live, no HONEST chip
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByText(`VERIFIER-0${i}`)).toBeVisible();
      await expect(page.getByTestId(`verifier-avatar-V${i}`)).toBeVisible();
    }
    await expect(page.getByText("HONEST")).not.toBeVisible();

    // Quorum bar
    await expect(page.getByTestId("quorum-status-bar")).toBeVisible();

    // Batch status timeline
    await expect(page.getByRole("region", { name: /batch consensus status timeline/i })).toBeVisible();
    await expect(page.getByText("1. Merkle Root Anchored")).toBeVisible();
    await expect(page.getByText("2. Committee Commit-Reveal")).toBeVisible();
    await expect(page.getByText(/3. Finalised/)).toBeVisible();

    // Factory page contains the batch Merkle Tree Visualization per Page Guide
    await page.goto("/operator");
    await expect(page.getByRole("region", { name: /batch merkle tree visualization/i })).toBeVisible();
    await expect(page.getByTestId("merkle-root-explorer-link")).toBeVisible();
    await expect(page.getByTestId("merkle-root-copy-btn")).toBeVisible();

    // Capture Verifier Normal State Screenshot
    const verNormalPath = path.join(screenshotsDir, `verifier-normal-${projectName}.png`);
    try {
      await page.screenshot({ path: verNormalPath, fullPage: true });
    } catch {
      // ignore file lock
    }
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
    await expect(page.getByTestId("latest-batch-status")).toContainText(/QUARANTINED|FRAUD/i, { timeout: 10000 });

    // Capture Operator Attack State Screenshot
    const opAttackPath = path.join(screenshotsDir, `operator-attack-${projectName}.png`);
    try {
      await page.screenshot({ path: opAttackPath, fullPage: true });
    } catch {
      // ignore file lock
    }

    // Check Verifier Page has updated with fraud quorum
    await page.goto("/verifier");
    await expect(page.getByText(/FRAUD DETECTED · QUORUM ACTION/i)).toBeVisible();
    await expect(page.getByRole("region", { name: /quarantine forensic evidence viewer/i })).toBeVisible();
    await expect(page.getByText(/PHYSICS_RESIDUAL/i).first()).toBeVisible();
    await expect(page.getByText(/AE_RESIDUAL/i).first()).toBeVisible();
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
    try {
      await page.screenshot({ path: verAttackPath, fullPage: true });
    } catch {
      // ignore file lock
    }

    // Check that BondVault slashed state updates on Operator page
    await page.goto("/operator");
    await expect(page.getByTestId("operator-slashed-bond")).toContainText("1.00 ETH");
  });
});
