#!/usr/bin/env node
/**
 * check-frontmatter.mjs
 * Validates that every .mdx file under docs/docs/ has required front matter.
 *
 * Rules:
 *   ERROR  – missing `title` field
 *   WARN   – missing `sidebar_label` field
 *
 * Usage:  node scripts/check-frontmatter.mjs
 * Run from the docs/ directory.
 *
 * Exit codes:
 *   0 – no errors (warnings may be present)
 *   1 – one or more missing-title errors
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Walk a directory recursively and return all .mdx file paths. */
function walkDir(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.mdx')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Parse YAML front matter from raw file content.
 * Returns a plain object of key → value strings.
 */
function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null; // no front matter at all
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([^:]+):\s*(.*)/);
    if (kv) {
      fields[kv[1].trim()] = kv[2].trim();
    }
  }
  return fields;
}

/** Display path relative to the repo root (one level above docs/). */
function displayPath(absPath) {
  return relative(resolve(process.cwd(), '..'), absPath);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const DOCS_ROOT = resolve(process.cwd(), 'docs');
const mdxFiles = walkDir(DOCS_ROOT);

const errors = [];
const warnings = [];

for (const filePath of mdxFiles) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    warnings.push(`  [WARN] Could not read ${displayPath(filePath)}`);
    continue;
  }

  const dp = displayPath(filePath);
  const fm = parseFrontMatter(content);

  if (fm === null) {
    errors.push(`  [ERROR] No front matter block found in ${dp}`);
    continue;
  }

  if (!fm.title || fm.title === '') {
    errors.push(`  [ERROR] Missing required 'title' in front matter: ${dp}`);
  }

  if (!fm.sidebar_label || fm.sidebar_label === '') {
    warnings.push(`  [WARN]  Missing optional 'sidebar_label' in front matter: ${dp}`);
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

const hasErrors = errors.length > 0;
const hasWarnings = warnings.length > 0;

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║         AgentCore Docs — Front Matter Validation Report       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`  Files scanned : ${mdxFiles.length} .mdx files\n`);

if (hasErrors) {
  console.log(`── ERRORS (${errors.length}) ─────────────────────────────────────────────────`);
  for (const e of errors) console.log(e);
  console.log('');
}

if (hasWarnings) {
  console.log(`── WARNINGS (${warnings.length}) ─────────────────────────────────────────────`);
  for (const w of warnings) console.log(w);
  console.log('');
}

if (!hasErrors && !hasWarnings) {
  console.log('  ✓ All files have valid front matter.\n');
} else if (!hasErrors) {
  console.log('  ✓ No title errors. Warnings above are advisory.\n');
}

if (hasErrors) {
  console.log(`  ✗ Front matter validation FAILED — ${errors.length} file(s) missing required 'title'.\n`);
  process.exit(1);
} else {
  console.log(`  Front matter validation PASSED${hasWarnings ? ' with warnings' : ''}.\n`);
  process.exit(0);
}
