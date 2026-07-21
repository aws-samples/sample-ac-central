#!/usr/bin/env node

/**
 * Validates external navigational links in documentation sources.
 *
 * Run from the docs/ directory:
 *   node scripts/validate-external-links.mjs
 *
 * Exit codes:
 *   0 – every external link resolved to a 2xx or 3xx response
 *   1 – one or more links failed, timed out, or resolved outside 200–399
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;
const MAX_CONCURRENT_REQUESTS = 8;
const DOCS_ROOT = resolve(process.cwd(), 'docs');
const CONFIG_FILE = resolve(process.cwd(), 'docusaurus.config.ts');
const MARKDOWN_LINK_RE = /!?\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const HREF_RE = /\bhref\s*(?::|=)\s*["'](https?:\/\/[^"'\s]+)["']/g;
const AUTOLINK_RE = /<\s*(https?:\/\/[^>\s]+)\s*>/g;

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

function displayPath(absPath) {
  return relative(resolve(process.cwd(), '..'), absPath);
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function maskCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (inlineCode) => inlineCode.replace(/[^\n]/g, ' '));
}

function addMatches(content, filePath, pattern, links) {
  const regex = new RegExp(pattern.source, pattern.flags);
  let match;

  while ((match = regex.exec(content)) !== null) {
    const url = match[1];
    if (!links.has(url)) {
      links.set(url, []);
    }
    links.get(url).push({
      file: displayPath(filePath),
      line: lineOf(content, match.index),
    });
  }
}

function collectLinks(files) {
  const links = new Map();

  for (const filePath of files) {
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Could not read ${displayPath(filePath)}: ${error.message}`);
    }

    const source = filePath.endsWith('.mdx') ? maskCode(content) : content;
    addMatches(source, filePath, MARKDOWN_LINK_RE, links);
    addMatches(source, filePath, HREF_RE, links);
    addMatches(source, filePath, AUTOLINK_RE, links);
  }

  return links;
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function request(url, method) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'AgentCoreCentralLinkValidator/1.0',
      },
    });
    await response.body?.cancel();
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}

async function checkLink(url) {
  let lastFailure;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      let response = await request(url, 'HEAD');
      let method = 'HEAD';

      if (response.status >= 400) {
        response = await request(url, 'GET');
        method = 'GET';
      }

      if (response.status >= 200 && response.status <= 399) {
        return { ok: true, status: response.status, finalUrl: response.url, method };
      }

      lastFailure = {
        ok: false,
        status: response.status,
        finalUrl: response.url,
        method,
      };

      if (!shouldRetryStatus(response.status)) {
        return lastFailure;
      }
    } catch (error) {
      lastFailure = {
        ok: false,
        error: error.name === 'AbortError'
          ? `Timed out after ${REQUEST_TIMEOUT_MS}ms`
          : error.message,
      };
    }

    if (attempt < MAX_ATTEMPTS) {
      await wait(RETRY_DELAY_MS * attempt);
    }
  }

  return lastFailure;
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      results.push(await worker(item));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

function formatSources(sources) {
  const preview = sources.slice(0, 3).map((source) => `${source.file}:${source.line}`);
  const remaining = sources.length - preview.length;
  return `${preview.join(', ')}${remaining > 0 ? ` (+${remaining} more)` : ''}`;
}

const mdxFiles = walkDir(DOCS_ROOT);
const files = [...mdxFiles, CONFIG_FILE];
const links = collectLinks(files);
const checks = await runWithConcurrency(
  [...links.keys()],
  MAX_CONCURRENT_REQUESTS,
  async (url) => ({ url, result: await checkLink(url) }),
);
const failures = checks.filter(({ result }) => !result.ok);

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║       AgentCore Docs — External Link Validation Report        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`  Files scanned : ${files.length} (${mdxFiles.length} .mdx + 1 config)`);
console.log(`  Links checked : ${checks.length}`);
console.log(`  Timeout       : ${REQUEST_TIMEOUT_MS}ms; attempts per link: ${MAX_ATTEMPTS}`);
console.log('');

if (failures.length > 0) {
  console.log(`── ERRORS (${failures.length}) ──────────────────────────────────────────────`);
  for (const { url, result } of failures) {
    const detail = result.error
      ? result.error
      : `HTTP ${result.status}${result.finalUrl && result.finalUrl !== url ? ` after redirect to ${result.finalUrl}` : ''}`;
    console.log(`  [ERROR] ${detail} — ${url}`);
    console.log(`          Referenced by: ${formatSources(links.get(url))}`);
  }
  console.log('');
  console.log(`  ✗ External link validation FAILED — ${failures.length} link(s) must be resolved before build.\n`);
  process.exit(1);
}

console.log('  ✓ All external links resolved to a 2xx or 3xx response.\n');
process.exit(0);
