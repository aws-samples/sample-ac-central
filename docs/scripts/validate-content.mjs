#!/usr/bin/env node
/**
 * validate-content.mjs
 * P0 content quality gate for the AgentCore Central Docusaurus site.
 *
 * Usage:
 *   node scripts/validate-content.mjs [--strict-freshness]
 *
 * Exit codes:
 *   0 – no errors (warnings may be present)
 *   1 – one or more P0 violations found
 *
 * Run from the docs/ directory.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// ── Config ──────────────────────────────────────────────────────────────────

const STRICT_FRESHNESS = process.argv.includes('--strict-freshness');

// Resolve paths relative to docs/ (the cwd when running this script)
const DOCS_ROOT = resolve(process.cwd(), 'docs');
const CONFIG_FILE = resolve(process.cwd(), 'docusaurus.config.ts');
const CUSTOMER_EXTERNAL_DIR = resolve(DOCS_ROOT, 'customer', 'external');

// P0: Internal / unapproved URLs
const INTERNAL_URL_RE = /\b(a2z\.com|amazon\.dev|\.corp\.amazon|harmony\.a2z)\b|internal-only/g;

// P0: Secret-like strings
const SECRET_PATTERNS = [
  // Require a token boundary before "sk-" so URL slugs like "ai-risk-management"
  // or "callback-task-sample-sqs" (where "sk-" sits mid-word) are not flagged.
  // Real OpenAI keys appear as a standalone token, e.g. sk-proj-XXXX or sk-XXXX.
  { re: /(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9]{20,}/, label: 'OpenAI-style secret key (sk-...)' },
  { re: /AKIA[0-9A-Z]{16}/, label: 'AWS access key ID (AKIA...)' },
  { re: /-----BEGIN (RSA )?PRIVATE KEY-----/, label: 'Private key block' },
];

// api-key= followed by a non-placeholder value
const API_KEY_RE = /api[-_]key\s*=\s*["']?([^"'\s>]+)/gi;
const PLACEHOLDER_RE = /^(<[^>]+>|YOUR_|xxxx|example|PLACEHOLDER|my-|replace|changeme|todo)/i;

// TODO / FIXME in non-draft pages
const TODO_RE = /\b(TODO|FIXME)\b/g;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Walk a directory recursively and return all file paths with the given extension. */
function walkDir(dir, ext) {
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
      results.push(...walkDir(fullPath, ext));
    } else if (entry.isFile() && fullPath.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Extract YAML front matter block from raw file content. Returns {} if none. */
function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { raw: '', fields: {} };
  const raw = match[1];
  const fields = {};
  for (const line of raw.split(/\r?\n/)) {
    const kv = line.match(/^([^:]+):\s*(.*)/);
    if (kv) {
      fields[kv[1].trim()] = kv[2].trim();
    }
  }
  return { raw, fields };
}

/** Return line number (1-based) of the first occurrence of a regex match in content. */
function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

/** Display path relative to the docs/ parent (i.e., relative to repo root). */
function displayPath(absPath) {
  return relative(resolve(process.cwd(), '..'), absPath);
}

/** Parse a date string (YYYY-MM-DD or ISO) into a Date, returns null on failure. */
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const errors = [];   // P0 violations → exit 1
const warnings = []; // Advisory → exit 0 (unless --strict-freshness)

const now = new Date();
const STALENESS_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

// Collect all .mdx files
const mdxFiles = walkDir(DOCS_ROOT, '.mdx');

// Also scan docusaurus.config.ts
const allFiles = [...mdxFiles, CONFIG_FILE];

for (const filePath of allFiles) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    warnings.push(`  [WARN] Could not read ${displayPath(filePath)}`);
    continue;
  }

  const dp = displayPath(filePath);
  const isMdx = filePath.endsWith('.mdx');

  // ── Front matter (mdx only) ───────────────────────────────────────────────
  const { fields: fm } = isMdx ? parseFrontMatter(content) : { fields: {} };
  const isDraft = fm.draft === 'true' || fm.draft === true;

  // ── P0-1: Internal / unapproved URLs ─────────────────────────────────────
  let m;
  const urlRe = new RegExp(INTERNAL_URL_RE.source, 'g');
  while ((m = urlRe.exec(content)) !== null) {
    const line = lineOf(content, m.index);
    errors.push(`  [ERROR] Internal/unapproved URL at ${dp}:${line} — matched: "${m[0]}"`);
  }

  // ── P0-2: Secret-like strings ─────────────────────────────────────────────
  for (const { re, label } of SECRET_PATTERNS) {
    const gRe = new RegExp(re.source, 'g');
    while ((m = gRe.exec(content)) !== null) {
      const line = lineOf(content, m.index);
      errors.push(`  [ERROR] Possible secret (${label}) at ${dp}:${line}`);
    }
  }

  // api-key= check
  const apiKeyRe = new RegExp(API_KEY_RE.source, 'gi');
  while ((m = apiKeyRe.exec(content)) !== null) {
    const value = m[1];
    if (!PLACEHOLDER_RE.test(value)) {
      const line = lineOf(content, m.index);
      errors.push(`  [ERROR] Possible secret (api-key with non-placeholder value) at ${dp}:${line} — value: "${value}"`);
    }
  }

  // ── P0-3: TODO / FIXME ────────────────────────────────────────────────────
  if (isMdx) {
    const todoRe = new RegExp(TODO_RE.source, 'g');
    while ((m = todoRe.exec(content)) !== null) {
      const line = lineOf(content, m.index);
      if (isDraft) {
        warnings.push(`  [WARN] ${m[0]} in draft page ${dp}:${line}`);
      } else {
        errors.push(`  [ERROR] Unresolved ${m[0]} in non-draft page ${dp}:${line}`);
      }
    }
  }

  // ── WARN-1: Missing last_verified ─────────────────────────────────────────
  if (isMdx && !isDraft && !fm.last_verified) {
    const msg = `  [WARN] Missing 'last_verified' front matter in ${dp}`;
    if (STRICT_FRESHNESS) {
      errors.push(msg.replace('[WARN]', '[ERROR]'));
    } else {
      warnings.push(msg);
    }
  }

  // ── WARN-2: Stale last_verified (> 180 days) ──────────────────────────────
  if (isMdx && fm.last_verified) {
    const verifiedDate = parseDate(fm.last_verified);
    if (verifiedDate && (now - verifiedDate) > STALENESS_MS) {
      const daysAgo = Math.floor((now - verifiedDate) / (24 * 60 * 60 * 1000));
      const msg = `  [WARN] Stale last_verified (${fm.last_verified}, ${daysAgo} days ago) in ${dp}`;
      if (STRICT_FRESHNESS) {
        errors.push(msg.replace('[WARN]', '[ERROR]'));
      } else {
        warnings.push(msg);
      }
    }
  }

  // ── WARN-3: Customer external pages missing aws.amazon.com source link ────
  if (
    isMdx &&
    !isDraft &&
    filePath.startsWith(CUSTOMER_EXTERNAL_DIR)
  ) {
    const hasAwsSource = /https?:\/\/aws\.amazon\.com\b/.test(content);
    if (!hasAwsSource) {
      const msg = `  [WARN] Customer story page missing aws.amazon.com source link: ${dp}`;
      if (STRICT_FRESHNESS) {
        errors.push(msg.replace('[WARN]', '[ERROR]'));
      } else {
        warnings.push(msg);
      }
    }
  }
}

// ── Output ───────────────────────────────────────────────────────────────────

const hasErrors = errors.length > 0;
const hasWarnings = warnings.length > 0;

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║           AgentCore Docs — Content Validation Report          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`  Files scanned : ${allFiles.length} (${mdxFiles.length} .mdx + 1 config)`);
console.log(`  Strict mode   : ${STRICT_FRESHNESS ? 'ON (--strict-freshness)' : 'OFF'}`);
console.log('');

if (hasErrors) {
  console.log(`── P0 ERRORS (${errors.length}) ────────────────────────────────────────────`);
  for (const e of errors) console.log(e);
  console.log('');
}

if (hasWarnings) {
  console.log(`── WARNINGS (${warnings.length}) ─────────────────────────────────────────────`);
  for (const w of warnings) console.log(w);
  console.log('');
}

if (!hasErrors && !hasWarnings) {
  console.log('  ✓ No issues found.\n');
} else if (!hasErrors) {
  console.log('  ✓ No P0 errors. Warnings above are advisory.\n');
}

if (hasErrors) {
  console.log(`  ✗ Validation FAILED — ${errors.length} error(s) must be resolved before publish.\n`);
  process.exit(1);
} else {
  console.log(`  Validation PASSED${hasWarnings ? ' with warnings' : ''}.\n`);
  process.exit(0);
}
