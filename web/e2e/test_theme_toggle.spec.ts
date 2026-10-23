import { test, expect } from "@playwright/test";

test("Theme toggle cleanly alternates between light mode (#FFFFFF) and dark mode (#0E0E0E)", async ({
  page,
}) => {
  await page.goto("/benchmark");

  // Ensure starting in light mode
  const toggleBtn = page.getByTestId("theme-toggle-btn");
  await expect(toggleBtn).toBeVisible();

  // If dark mode was active from previous run, switch to light
  const isDarkInitial = await page.evaluate(() =>
    document.documentElement.classList.contains("dark")
  );
  if (isDarkInitial) {
    await toggleBtn.click();
  }

  // 1. Verify Light Mode
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const lightColors = await page.evaluate(() => {
    const cs = window.getComputedStyle(document.documentElement);
    return {
      canvas: cs.getPropertyValue("--canvas").trim(),
      surface: cs.getPropertyValue("--surface-card").trim(),
      ink: cs.getPropertyValue("--ink").trim(),
    };
  });
  expect(lightColors.canvas.toUpperCase()).toBe("#FFFFFF");
  expect(lightColors.surface.toUpperCase()).toBe("#FFFFFF");
  expect(lightColors.ink.toUpperCase()).toBe("#0A0A0A");
  await page.screenshot({ path: "screenshots/verified_light_mode.png", fullPage: true });

  // 2. Click Toggle -> Dark Mode
  await toggleBtn.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const darkColors = await page.evaluate(() => {
    const cs = window.getComputedStyle(document.documentElement);
    return {
      canvas: cs.getPropertyValue("--canvas").trim(),
      surface: cs.getPropertyValue("--surface-card").trim(),
      ink: cs.getPropertyValue("--ink").trim(),
    };
  });
  expect(darkColors.canvas.toUpperCase()).toBe("#0E0E0E");
  expect(darkColors.surface.toUpperCase()).toBe("#161616");
  expect(darkColors.ink.toUpperCase()).toBe("#F5F5F7");
  await page.screenshot({ path: "screenshots/verified_dark_mode.png", fullPage: true });

  // 3. Click Toggle again -> Back to Light Mode
  await toggleBtn.click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const backLightCanvas = await page.evaluate(() =>
    window.getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim()
  );
  expect(backLightCanvas.toUpperCase()).toBe("#FFFFFF");
});
