#!/usr/bin/env node
// Finds color literals (#hex / rgb(a) / hsl(a)) in a CSS file that are reused
// often enough to be worth exposing as theme tokens, and can rewrite the
// file in place to reference them.
//
// Skips any rule whose selector matches .phone-, .pt-, or .social-profile- --
// the simulated phone apps and registration screens are excluded from
// theming (see src/app/themeExclusions.test.ts). Skips values already
// inside a var(...) call. Every rewritten occurrence keeps its original
// literal as the CSS var's fallback, so nothing changes visually until a
// theme actually overrides that token.
//
// Usage:
//   node scripts/extract-raw-theme-tokens.mjs analyze <file> [threshold]
//     Prints how many distinct/total color literals would be tokenized at
//     that occurrence-count threshold (default 5), without writing anything.
//
//   node scripts/extract-raw-theme-tokens.mjs apply <file> [threshold] <mapping-out.json>
//     Rewrites <file> in place, wrapping every in-scope occurrence of a
//     literal at/above the threshold as var(--theme-raw-<token>, <literal>),
//     and writes the literal->token mapping (with occurrence counts) to
//     <mapping-out.json> for pasting into themeTokens.ts's CORE_TOKEN_KEYS.
//
// This is a one-shot batch tool, not part of the build -- rerun it manually
// against a freshly-edited file if you want another pass at a lower
// threshold, then hand-review the diff before committing.

import { readFileSync, writeFileSync } from 'node:fs';

const EXCLUDE_RE = /\.phone-|\.pt-|\.social-profile-/;
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

function slugify(literal) {
  return 'v' + literal.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

/** Walks the file tracking brace depth and whether the selector that opened
 * the current block matched an exclusion pattern, calling `onLiteral` for
 * every in-scope, not-already-var()-wrapped color literal found. */
function walkColorLiterals(lines, onLiteral) {
  let pendingSelectorText = '';
  let excludedStack = [false];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    if (opens > 0) {
      pendingSelectorText += ' ' + line;
      const isExcluded = EXCLUDE_RE.test(pendingSelectorText) || excludedStack[excludedStack.length - 1];
      for (let k = 0; k < opens; k++) excludedStack.push(isExcluded);
      pendingSelectorText = '';
    } else if (closes === 0) {
      pendingSelectorText += ' ' + line;
    }

    const insideExcluded = excludedStack[excludedStack.length - 1];
    if (excludedStack.length > 1 && !insideExcluded) {
      onLiteral(i, line);
    }

    for (let k = 0; k < closes; k++) excludedStack.pop();
    if (excludedStack.length === 0) excludedStack.push(false);
  }
}

function countLiterals(lines) {
  const counts = new Map();
  walkColorLiterals(lines, (_i, line) => {
    for (const m of line.match(COLOR_RE) || []) {
      const idx = line.indexOf(m);
      if (/var\([^)]*$/.test(line.slice(0, idx))) continue;
      counts.set(m, (counts.get(m) || 0) + 1);
    }
  });
  return counts;
}

function analyze(file, threshold) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const counts = countLiterals(lines);
  const selected = [...counts.entries()].filter(([, c]) => c >= threshold);
  const totalOccurrences = [...counts.values()].reduce((s, c) => s + c, 0);
  console.log(`Distinct in-scope literals: ${counts.size} (${totalOccurrences} occurrences)`);
  console.log(`At threshold >= ${threshold}: ${selected.length} literals, ${selected.reduce((s, [, c]) => s + c, 0)} occurrences`);
}

function apply(file, threshold, mappingOutPath) {
  const original = readFileSync(file, 'utf8');
  const lines = original.split('\n');
  const counts = countLiterals(lines);

  const selected = [...counts.entries()].filter(([, c]) => c >= threshold).sort((a, b) => b[1] - a[1]);
  const literalToToken = new Map();
  const usedNames = new Set();
  for (const [literal] of selected) {
    let name = slugify(literal);
    let suffix = 2;
    while (usedNames.has(name)) name = `${slugify(literal)}_${suffix++}`;
    usedNames.add(name);
    literalToToken.set(literal, name);
  }

  let replaced = 0;
  const outLines = [];
  let pendingSelectorText = '';
  let excludedStack = [false];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    if (opens > 0) {
      pendingSelectorText += ' ' + line;
      const isExcluded = EXCLUDE_RE.test(pendingSelectorText) || excludedStack[excludedStack.length - 1];
      for (let k = 0; k < opens; k++) excludedStack.push(isExcluded);
      pendingSelectorText = '';
    } else if (closes === 0) {
      pendingSelectorText += ' ' + line;
    }

    const insideExcluded = excludedStack[excludedStack.length - 1];
    if (excludedStack.length > 1 && !insideExcluded) {
      line = line.replace(COLOR_RE, (m, offset) => {
        if (/var\([^)]*$/.test(line.slice(0, offset))) return m;
        const token = literalToToken.get(m);
        if (!token) return m;
        replaced++;
        return `var(--theme-raw-${token}, ${m})`;
      });
    }

    for (let k = 0; k < closes; k++) excludedStack.pop();
    if (excludedStack.length === 0) excludedStack.push(false);
    outLines.push(line);
  }

  writeFileSync(file, outLines.join('\n'));
  const mapping = { count: selected.length, entries: selected.map(([literal, count]) => ({ literal, count, token: literalToToken.get(literal) })) };
  writeFileSync(mappingOutPath, JSON.stringify(mapping, null, 2));
  console.log(`Replaced ${replaced} occurrences across ${selected.length} tokens. Mapping written to ${mappingOutPath}`);
  console.log('Remember: review the diff for any literal that was also the *definition* of a CSS variable already handled by a dedicated semantic token elsewhere (e.g. a :root custom property) -- those specific lines should stay as plain literals to avoid double-indirection.');
}

const [, , mode, file, ...rest] = process.argv;
if (mode === 'analyze') {
  analyze(file, Number(rest[0] || 5));
} else if (mode === 'apply') {
  const threshold = Number(rest[0] || 5);
  const mappingOutPath = rest[1];
  if (!mappingOutPath) {
    console.error('Usage: node scripts/extract-raw-theme-tokens.mjs apply <file> [threshold] <mapping-out.json>');
    process.exit(1);
  }
  apply(file, threshold, mappingOutPath);
} else {
  console.error('Usage: node scripts/extract-raw-theme-tokens.mjs <analyze|apply> <file> [threshold] [mapping-out.json]');
  process.exit(1);
}
