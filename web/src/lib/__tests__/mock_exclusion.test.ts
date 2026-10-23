/**
 * Test verifying that production build excludes the mock provider per Requirement 7.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "../../../");
const distDir = path.join(webDir, "dist");

describe("VeriCEMS Production Build Mock Exclusion", () => {
  it("verifies production build succeeds and excludes mock provider", () => {
    // Run vite build for production
    execSync("npx vite build", {
      cwd: webDir,
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production" },
    });

    assert.ok(fs.existsSync(distDir), "dist/ directory should exist after build");

    const assetsDir = path.join(distDir, "assets");
    assert.ok(fs.existsSync(assetsDir), "dist/assets/ directory should exist");

    const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
    assert.ok(jsFiles.length > 0, "At least one JS bundle should be generated");

    // Read all built JS bundle contents
    let combinedJs = "";
    for (const f of jsFiles) {
      combinedJs += fs.readFileSync(path.join(assetsDir, f), "utf-8");
    }

    // Verify mock provider symbols and identifiers are excluded from the bundle
    assert.doesNotMatch(
      combinedJs,
      /\bgetSyntheticBatches\b/,
      "Mock provider function getSyntheticBatches must be excluded from production build"
    );
    assert.doesNotMatch(
      combinedJs,
      /\bDEV-STEEL-001\b/,
      "Mock data identifier DEV-STEEL-001 must be excluded from production build"
    );
  });
});
