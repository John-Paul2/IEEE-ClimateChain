const { chromium } = require('../web/node_modules/@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const svgPath = path.resolve(__dirname, '../docs/architecture.svg');
  const pngPath = path.resolve(__dirname, '../docs/architecture.png');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0B1220;overflow:hidden;">${svgContent}</body></html>`);
  await page.screenshot({ path: pngPath, omitBackground: false });
  await browser.close();
  console.log('Successfully generated ' + pngPath);
})();
