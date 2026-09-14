// Captures portfolio screenshots of the running dashboard.
//
//   node capture-screenshots.mjs [--base http://localhost:5173] [--api http://localhost:4000] [--out ../docs/screenshots]
//
// Uses a locally installed Edge or Chrome through playwright-core, so no browser download is needed.

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:5173' },
    api: { type: 'string', default: 'http://localhost:4000' },
    out: { type: 'string', default: resolve(import.meta.dirname, '../docs/screenshots') },
    device: { type: 'string', default: 'compressor-02' },
    email: { type: 'string', default: 'demo@machinewatch.io' },
    password: { type: 'string', default: 'demo1234' },
  },
});

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = BROWSERS.find((path) => existsSync(path));
if (!executablePath) throw new Error('No local Edge or Chrome found');

const login = await fetch(`${values.api}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: values.email, password: values.password }),
});
if (!login.ok) throw new Error(`Login failed: HTTP ${login.status}`);
const { token } = await login.json();

mkdirSync(values.out, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

async function capture(name, path, { width = 1440, height = 900, authenticated = true, settleMs = 3500, fullPage = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' });
  if (authenticated) {
    await context.addInitScript((value) => localStorage.setItem('machinewatch.token', value), token);
  }
  const page = await context.newPage();
  await page.goto(`${values.base}${path}`, { waitUntil: 'networkidle' });
  // Live alert toasts are transient and would cover the charts.
  await page.addStyleTag({ content: '[aria-live="polite"] { display: none !important; }' });
  await page.waitForTimeout(settleMs); // let live telemetry fill the charts
  const file = resolve(values.out, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  await context.close();
  console.log(`saved ${file}`);
}

try {
  await capture('01-login', '/login', { authenticated: false, settleMs: 800 });
  await capture('02-overview', '/');
  // A tall viewport rather than fullPage keeps the sticky sidebar full height.
  await capture('03-device-detail', `/devices/${values.device}`, { height: 1480 });
  await capture('04-alerts', '/alerts');
  await capture('05-rules', '/rules', { settleMs: 1000 });
  await capture('06-overview-mobile-web', '/', { width: 390, height: 844, fullPage: true });
} finally {
  await browser.close();
}
