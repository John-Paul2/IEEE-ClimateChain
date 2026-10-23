import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "390px (Mobile)", width: 390, height: 844 },
  { name: "768px (Tablet)", width: 768, height: 1024 },
  { name: "1440px (Desktop)", width: 1440, height: 900 },
];

const ROUTES = ["/operator", "/verifier", "/importer", "/benchmark", "/gallery"];

test.describe("No Horizontal Scroll at 390, 768, and 1440 px", () => {
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`Verify zero horizontal scroll on ${route} at ${vp.width}px`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route);
        await page.waitForLoadState("domcontentloaded");

        // Measure document and body horizontal overflow
        const overflow = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientWidth = docEl.clientWidth;
          return {
            scrollWidth,
            clientWidth,
            hasHorizontalScroll: scrollWidth > clientWidth,
            difference: scrollWidth - clientWidth,
          };
        });

        expect(
          overflow.hasHorizontalScroll,
          `Horizontal scroll detected on ${route} at ${vp.width}px: scrollWidth (${overflow.scrollWidth}) > clientWidth (${overflow.clientWidth})`
        ).toBe(false);
      });
    }
  }
});
