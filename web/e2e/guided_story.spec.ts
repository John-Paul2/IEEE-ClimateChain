import { test, expect } from "@playwright/test";

test.describe("VeriCEMS Guided Story & Navigation E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/operator");
    await page.waitForLoadState("domcontentloaded");
    const resetBtn = page.getByTestId("demo-reset-btn");
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
      await page.waitForTimeout(200);
    }
  });

  test("1. Play shows the first caption and a highlighted target", async ({ page }) => {
    // Ensure on Factory tab
    await expect(page).toHaveURL(/.*\/operator/);

    // Click Play
    const playBtn = page.getByTestId("demo-play-btn");
    await expect(playBtn).toBeVisible();
    await playBtn.click();

    // Verify caption card appears with first step details
    const captionCard = page.getByTestId("story-caption-card");
    await expect(captionCard).toBeVisible({ timeout: 5000 });
    await expect(captionCard).toContainText("Step 1 of 8");
    await expect(captionCard).toContainText("Sealing each reading");
    await expect(captionCard).toContainText("Each reading is signed and linked to the one before it.");

    // Verify target element is highlighted with the brand ring class
    const target = page.locator('[data-story="hash-chain-strip"]');
    await expect(target).toBeVisible();
    await expect(target).toHaveClass(/story-target-highlight/);
  });

  test("2. Pause then each of the four tabs is clickable and the URL changes", async ({ page }) => {
    // Click Play then Pause
    const playBtn = page.getByTestId("demo-play-btn");
    await playBtn.click();
    const pauseBtn = page.getByTestId("demo-pause-btn");
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();
    await expect(playBtn).toBeVisible();

    // Test each tab: Verifiers, Buyer, Test results, Factory
    const verifiersTab = page.getByRole("link", { name: "Verifiers", exact: true });
    await verifiersTab.click();
    await expect(page).toHaveURL(/.*\/verifier/);

    const buyerTab = page.getByRole("link", { name: "Buyer", exact: true });
    await buyerTab.click();
    await expect(page).toHaveURL(/.*\/importer/);

    const testResultsTab = page.getByRole("link", { name: "Test results", exact: true });
    await testResultsTab.click();
    await expect(page).toHaveURL(/.*\/benchmark/);

    const factoryTab = page.getByRole("link", { name: "Factory", exact: true });
    await factoryTab.click();
    await expect(page).toHaveURL(/.*\/operator/);
  });

  test("3. A manual tab click during playback pauses the story", async ({ page }) => {
    // Start playback
    const playBtn = page.getByTestId("demo-play-btn");
    await playBtn.click();
    await expect(page.getByTestId("demo-pause-btn")).toBeVisible();

    // Manually click a different tab during playback (e.g. Verifiers)
    const verifiersTab = page.getByRole("link", { name: "Verifiers", exact: true });
    await verifiersTab.click();

    // URL changes to /verifier
    await expect(page).toHaveURL(/.*\/verifier/);

    // Playback must now be paused (play button visible again, pause button hidden)
    await expect(page.getByTestId("demo-play-btn")).toBeVisible();

    // Verify it stays on the selected tab and does not auto-navigate back
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/.*\/verifier/);
  });

  test("4. Step order matches the event order", async ({ page }) => {
    const expectedSteps = [
      { num: 1, title: "Sealing each reading" },
      { num: 2, title: "Fingerprinting the batch" },
      { num: 3, title: "Verifiers check it" },
      { num: 4, title: "Majority says clean" },
      { num: 5, title: "Flagged as suspicious" },
      { num: 6, title: "Time to appeal" },
      { num: 7, title: "Deposit slashed" },
      { num: 8, title: "Proof for the buyer" },
    ];

    const playBtn = page.getByTestId("demo-play-btn");
    await playBtn.click();

    const pauseBtn = page.getByTestId("demo-pause-btn");
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();

    const captionCard = page.getByTestId("story-caption-card");
    const nextBtn = page.getByTestId("demo-step-btn");

    for (const step of expectedSteps) {
      await expect(captionCard).toContainText(`Step ${step.num} of 8`);
      await expect(captionCard).toContainText(step.title);

      if (step.num < expectedSteps.length) {
        await nextBtn.click();
      }
    }
  });

  test("5. A mobile viewport (390 px) shows the caption without covering the target", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/operator");

    const playBtn = page.getByTestId("demo-play-btn");
    await playBtn.click();

    const captionCard = page.getByTestId("story-caption-card");
    await expect(captionCard).toBeVisible({ timeout: 5000 });

    const target = page.locator('[data-story="hash-chain-strip"]');
    await expect(target).toBeVisible();

    // Allow smooth scroll to settle
    await page.waitForTimeout(400);

    const captionBox = await captionCard.boundingBox();
    const targetBox = await target.boundingBox();

    expect(captionBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (captionBox && targetBox) {
      // Caption must be visible on screen
      expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(844);

      // Verify caption does not overlap/cover the top portion of the target element
      // Either target ends above caption, or caption ends above target, or there is no vertical collision
      const hasVerticalOverlap =
        targetBox.y < captionBox.y + captionBox.height &&
        targetBox.y + targetBox.height > captionBox.y;

      const hasHorizontalOverlap =
        targetBox.x < captionBox.x + captionBox.width &&
        targetBox.x + targetBox.width > captionBox.x;

      const isCovering = hasVerticalOverlap && hasHorizontalOverlap;
      expect(isCovering).toBe(false);
    }
  });
});
