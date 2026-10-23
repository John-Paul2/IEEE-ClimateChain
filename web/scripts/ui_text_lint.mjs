#!/usr/bin/env node

/**
 * ui_text_lint.mjs
 *
 * VeriCEMS UI Text Linter per AGENTS.md, DESIGN.md & Task instructions:
 * Fails on:
 *   1. "AGENTS.md"
 *   2. "Honesty Rule"
 *   3. File paths (e.g. docs/..., results/..., *.json, *.py, *.md)
 *   4. Backticks (`)
 *   5. Markdown asterisks (**, *bold*)
 *   6. Chain names (Arbitrum, Sepolia, Base, Polygon, Amoy)
 *   7. The word "confirmed"
 *   8. Hardcoded euro amounts (e.g. €25,930 or 100 EUR)
 *   9. Any 0x literals in web/src outside test fixtures
 *  10. Any Card paragraph over 25 words
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve web/src directory
let srcDir = path.resolve(__dirname, "../src");
if (!fs.existsSync(srcDir)) {
  srcDir = path.resolve(process.cwd(), "web/src");
}
if (!fs.existsSync(srcDir)) {
  srcDir = path.resolve(process.cwd(), "src");
}

if (!fs.existsSync(srcDir)) {
  console.error(`[ui_text_lint] Error: src directory not found at ${srcDir}`);
  process.exit(1);
}

const UI_DIRS = ["components", "pages", "shell"];

// Regex for banned patterns in visible UI strings
const BANNED_PATTERNS = [
  {
    name: 'Internal reference "AGENTS.md"',
    regex: /\bAGENTS\.md\b/i,
  },
  {
    name: 'Internal reference "Honesty Rule"',
    regex: /\bHonesty\s+Rule(?:s)?\b/i,
  },
  {
    name: "File path in UI string",
    regex: /\b(?:docs|src|backend|results|scripts|contracts|ml|config|schemas)\/[a-zA-Z0-9_\-\.\/]+(?:\.[a-zA-Z0-9]+)?\b/i,
  },
  {
    name: "Raw file extension in UI string",
    regex: /\b[a-zA-Z0-9_\-]+\.(?:json|parquet|onnx|py|md|yaml|csv)\b/i,
  },
  {
    name: "Backtick markdown artifact in UI string",
    regex: /`/,
  },
  {
    name: "Markdown asterisk artifact in UI string",
    regex: /\*\*[^*]+\*\*|\*[a-zA-Z0-9]+/,
  },
  {
    name: 'Banned chain name (Arbitrum, Sepolia, Polygon, Amoy, Base)',
    regex: /\b(?:Arbitrum|Sepolia|Polygon|Amoy)\b|(?<!text-)(?<!font-)\bBase\b(?!\s*(?:seed|component|SEE|url|URL|line))/i,
  },
  {
    name: 'Banned term "confirmed"',
    regex: /\bconfirmed\b/i,
  },
  {
    name: "Hardcoded euro amount in UI string",
    regex: /(?:€|EUR)\s*[0-9]+|[0-9]+\s*(?:€|EUR)/i,
  },
];

// Skip technical files that explicitly handle external raw code/markdown
const SKIP_FILES = new Set([
  "ReproduceBox.tsx",
  "MarkdownViewer.tsx",
]);

function getAllFiles(dir, filterFn) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      if (dirent.name === "node_modules") continue;
      files.push(...getAllFiles(res, filterFn));
    } else if (filterFn(res)) {
      files.push(res);
    }
  }
  return files;
}

function getUIFiles(dir) {
  return getAllFiles(dir, (filePath) => {
    const base = path.basename(filePath);
    return (
      (base.endsWith(".tsx") || base.endsWith(".jsx")) &&
      !base.includes(".test.") &&
      !base.includes(".spec.") &&
      !filePath.includes(`${path.sep}__tests__${path.sep}`)
    );
  });
}

function getSourceFilesOutsideFixtures(dir) {
  return getAllFiles(dir, (filePath) => {
    const base = path.basename(filePath);
    const isCode = base.endsWith(".ts") || base.endsWith(".tsx") || base.endsWith(".js") || base.endsWith(".mjs");
    const isTestFixture =
      base.includes(".test.") ||
      base.includes(".spec.") ||
      filePath.includes(`${path.sep}__tests__${path.sep}`) ||
      filePath.includes(`${path.sep}fixtures${path.sep}`) ||
      filePath.includes(`${path.sep}e2e${path.sep}`);
    return isCode && !isTestFixture;
  });
}

let totalViolations = 0;
const violations = [];

// 1. Scan UI files for visible strings and text constraints
const targetUIFiles = [];
for (const sub of UI_DIRS) {
  const p = path.join(srcDir, sub);
  if (fs.existsSync(p)) {
    targetUIFiles.push(...getUIFiles(p));
  }
}

const UI_ATTR_REGEX = /\b(title|subtitle|label|description|placeholder|emptyMessage|message|alt)=["']([^"']+)["']/g;

for (const filePath of targetUIFiles) {
  const basename = path.basename(filePath);
  if (SKIP_FILES.has(basename)) continue;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
    if (trimmed.startsWith("import ") || trimmed.startsWith("export type ") || trimmed.startsWith("interface ")) continue;

    // Check UI string attributes
    let attrMatch;
    while ((attrMatch = UI_ATTR_REGEX.exec(line)) !== null) {
      const val = attrMatch[2];
      if (val.startsWith("http://") || val.startsWith("https://")) continue;

      for (const rule of BANNED_PATTERNS) {
        if (rule.regex.test(val)) {
          violations.push({
            file: path.relative(process.cwd(), filePath),
            line: lineNum,
            rule: rule.name,
            text: `${attrMatch[1]}="${val}"`,
          });
          totalViolations++;
        }
      }
    }

    // Check JSX visible text between tags: > text <
    const jsxTextRegex = />([^<>{}\r\n]+)</g;
    let textMatch;
    while ((textMatch = jsxTextRegex.exec(line)) !== null) {
      const textVal = textMatch[1].trim();
      if (!textVal || textVal.startsWith("http://") || textVal.startsWith("https://")) continue;

      for (const rule of BANNED_PATTERNS) {
        if (rule.regex.test(textVal)) {
          violations.push({
            file: path.relative(process.cwd(), filePath),
            line: lineNum,
            rule: rule.name,
            text: textVal,
          });
          totalViolations++;
        }
      }
    }
  }

  // Check Card paragraphs over 25 words
  const cardRegex = /<Card[\s\S]*?<\/Card>/g;
  let cardMatch;
  while ((cardMatch = cardRegex.exec(content)) !== null) {
    const cardBlock = cardMatch[0];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let pMatch;
    while ((pMatch = pRegex.exec(cardBlock)) !== null) {
      const rawText = pMatch[1].replace(/<[^>]+>/g, " ").replace(/\{[^}]+\}/g, " ").trim();
      const words = rawText.split(/\s+/).filter((w) => w.length > 0);
      if (words.length > 25) {
        const offset = cardMatch.index + pMatch.index;
        const lineNum = content.slice(0, offset).split("\n").length;
        violations.push({
          file: path.relative(process.cwd(), filePath),
          line: lineNum,
          rule: `Card paragraph exceeds 25 words (${words.length} words)`,
          text: rawText.length > 80 ? `${rawText.slice(0, 80)}...` : rawText,
        });
        totalViolations++;
      }
    }
  }
}

// 2. Scan web/src outside test fixtures for 0x literals
const sourceFilesOutsideFixtures = getSourceFilesOutsideFixtures(srcDir);
const HEX_LITERAL_REGEX = /\b0x[0-9a-fA-F]{4,}\b/g;

for (const filePath of sourceFilesOutsideFixtures) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;

    let hexMatch;
    while ((hexMatch = HEX_LITERAL_REGEX.exec(line)) !== null) {
      violations.push({
        file: path.relative(process.cwd(), filePath),
        line: lineNum,
        rule: `0x literal found in web/src outside test fixtures (${hexMatch[0]})`,
        text: trimmed,
      });
      totalViolations++;
    }
  }
}

console.log(`\n========================================`);
console.log(`VeriCEMS UI Text & Text Diet Linter`);
console.log(`========================================`);
console.log(`Scanned ${targetUIFiles.length} UI files and ${sourceFilesOutsideFixtures.length} source files.`);

if (totalViolations > 0) {
  console.error(`\n❌ FAILED: Found ${totalViolations} UI text violation(s):\n`);
  for (const v of violations) {
    console.error(`  - [${v.file}:${v.line}] ${v.rule}`);
    console.error(`    Snippet: "${v.text}"\n`);
  }
  process.exit(1);
} else {
  console.log(`\n✅ PASSED: All UI strings conform to text diet & banned word constraints.\n`);
  process.exit(0);
}
