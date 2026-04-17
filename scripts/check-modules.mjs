import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'logs']);
const CHECK_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);

const requireToken = `requ${'ire'}`;
const moduleToken = `mod${'ule'}`;
const exportsToken = `exp${'orts'}`;
const RULES = [
  { label: 'cjs-require-call', regex: new RegExp(`\\b${requireToken}\\s*\\(`) },
  { label: 'cjs-module-exports', regex: new RegExp(`\\b${moduleToken}\\.${exportsToken}\\b`) },
  { label: 'cjs-exports-member', regex: new RegExp(`\\b${exportsToken}\\.[A-Za-z_$]`) },
];

async function walk(dir, results = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await walk(fullPath, results);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    if (!CHECK_EXTENSIONS.has(path.extname(entry.name))) continue;
    results.push(fullPath);
  }
  return results;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function stripStringsAndComments(input) {
  let out = '';
  let i = 0;
  let state = 'code';
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'lineComment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'blockComment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = 'singleQuote';
        out += ' ';
        i += 1;
        continue;
      }
      if (ch === '"') {
        state = 'doubleQuote';
        out += ' ';
        i += 1;
        continue;
      }
      if (ch === '`') {
        state = 'template';
        out += ' ';
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (state === 'lineComment') {
      if (ch === '\n') {
        state = 'code';
        out += '\n';
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }

    if (state === 'blockComment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 2;
      } else {
        out += ch === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }

    if (state === 'singleQuote') {
      if (ch === '\\') {
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = 'code';
        out += ' ';
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      i += 1;
      continue;
    }

    if (state === 'doubleQuote') {
      if (ch === '\\') {
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '"') {
        state = 'code';
        out += ' ';
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      i += 1;
      continue;
    }

    if (state === 'template') {
      if (ch === '\\') {
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '`') {
        state = 'code';
        out += ' ';
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      i += 1;
      continue;
    }
  }
  return out;
}

async function main() {
  const files = await walk(ROOT);
  const violations = [];

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const codeOnly = stripStringsAndComments(text);
    for (const rule of RULES) {
      if (rule.regex.test(codeOnly)) {
        violations.push({ file: relative(file), rule: rule.label });
      }
    }
  }

  if (violations.length) {
    console.error('CommonJS patterns detected (ESM-only policy):');
    for (const v of violations) {
      console.error(`- ${v.file}: ${v.rule}`);
    }
    process.exit(1);
  }

  console.log(`ESM check passed: ${files.length} files scanned.`);
}

main().catch((err) => {
  console.error('Module check failed:', err?.message || err);
  process.exit(1);
});
