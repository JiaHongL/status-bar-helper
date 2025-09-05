#!/usr/bin/env node
/*
  NLS Consistency Checker
  - Scans HTML for data-nls keys
  - Scans JS/TS for getNlsText('key') usage
  - Compares keys against media/nls.en.json as source of truth
  - Warns when other locale files miss keys
  Exit codes:
    0: OK
    1: Missing keys (errors)
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const MEDIA_DIR = join(ROOT, 'media');
const EN_FILE = join(MEDIA_DIR, 'nls.en.json');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, acc);
    } else {
      acc.push(p);
    }
  }
  return acc;
}

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function collectHtmlKeys(file) {
  const s = readFileSync(file, 'utf8');
  const keys = new Set();
  // data-nls="key" 捕捉
  const re = /data-nls\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(s))) {
    const k = m[1];
    // 忽略看起來像完整英文句子的第一參數（含空白）
    if (/\s/.test(k)) {
      continue;
    }
    keys.add(k);
  }
  return keys;
}

function collectJsKeys(file) {
  const s = readFileSync(file, 'utf8');
  const keys = new Set();
  // getNlsText('key', ...) 或 \"key\" 也支援
  const re = /getNlsText\(\s*['"]([^'"\)]+)['"]/g;
  let m;
  while ((m = re.exec(s))) {
    keys.add(m[1]);
  }
  return keys;
}

function main() {
  const en = loadJson(EN_FILE);
  const enKeys = new Set(Object.keys(en));

  const files = walk(MEDIA_DIR);
  const htmlFiles = files.filter(f => extname(f) === '.html');
  const jsFiles = files.filter(f => ['.js', '.ts'].includes(extname(f)));

  const keysUsed = new Set();
  for (const f of htmlFiles) {
    for (const k of collectHtmlKeys(f)) {
      keysUsed.add(k);
    }
  }
  for (const f of jsFiles) {
    for (const k of collectJsKeys(f)) {
      keysUsed.add(k);
    }
  }

  const missingInEn = [...keysUsed].filter(k => !enKeys.has(k));

  // 檢查其它語系
  const localeFiles = files.filter(f => /nls\.[a-z\-]+\.json$/i.test(f) && f !== EN_FILE);
  const locales = localeFiles.map(f => ({ file: f, map: loadJson(f), keys: new Set(Object.keys(loadJson(f))) }));
  const missingByLocale = {};
  for (const k of keysUsed) {
    for (const loc of locales) {
      if (!loc.keys.has(k)) {
        (missingByLocale[k] ||= []).push(loc.file.replace(ROOT + '/', ''));
      }
    }
  }

  let hasError = false;
  if (missingInEn.length) {
    hasError = true;
    console.error('\u274C Missing keys in media/nls.en.json:');
    for (const k of missingInEn) {
      console.error('  -', k);
    }
  }

  const warnOnly = Object.entries(missingByLocale).filter(([k]) => enKeys.has(k));
  if (warnOnly.length) {
    console.warn('\u26A0\uFE0F Keys not present in some locales:');
    for (const [k, files] of warnOnly) {
      console.warn(`  - ${k} -> ${files.join(', ')}`);
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

main();
