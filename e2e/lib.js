// Shared helpers for the web end-to-end flow (see e2e/README.md).
const { chromium } = require('playwright-core');
// Screenshots go to e2e/artifacts (git-ignored).
const SP = require('path').join(__dirname, 'artifacts');
require('fs').mkdirSync(SP, { recursive: true });
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8081';
const FIRESTORE = process.env.FIRESTORE_EMULATOR || 'http://127.0.0.1:8080';
async function launch() {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}
async function newPage(browser, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, ...opts });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(`[${name} console.error] ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => page.errors.push(`[${name} pageerror] ${e.message}`));
  page.promptAnswer = '1';
  page.on('dialog', async (d) => {
    console.log(`  [${name} dialog:${d.type()}] ${d.message().replace(/\n+/g, ' | ').slice(0, 160)}`);
    if (d.type() === 'prompt') await d.accept(page.promptAnswer);
    else await d.accept();
  });
  return page;
}
const vis = (l) => l.filter({ visible: true }).first();
const btn = (page, name) => vis(page.getByRole('button', { name, exact: true }));
const label = (page, name) => vis(page.getByLabel(name, { exact: true }));
const text = (page, t, exact = false) => vis(page.getByText(t, { exact }));
async function shot(page, file) { await page.screenshot({ path: `${SP}/${file}` }); }
async function step(label, fn) {
  process.stdout.write(`STEP ${label} ... `);
  try { await fn(); console.log('ok'); }
  catch (e) { console.log('FAILED\n  ' + e.message.split('\n').slice(0, 4).join('\n  ')); throw e; }
}
async function firestore(path) {
  const r = await fetch(`${FIRESTORE}/v1/projects/demo-safefall/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer owner' } });
  return r.json();
}
module.exports = { APP_URL, vis, label, text, launch, newPage, btn, shot, step, firestore, SP };
