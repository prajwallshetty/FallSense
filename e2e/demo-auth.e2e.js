// End-to-end check of local Demo Mode on Expo web. Needs NO Firebase emulator and no
// network: demo sign-in is resolved on-device. Covers both accounts, the role each lands on,
// session restore across a reload, logout, and the role route guard.
//
// Run:  npx expo start --web --port 8081     (in one shell)
//       CHROMIUM_PATH=<chrome|msedge> node e2e/demo-auth.e2e.js
const { APP_URL, launch, newPage, btn, text, shot, step, vis } = require('./lib');

const CARETAKER = { label: 'Care Taker', email: 'caretaker@demo.com', password: 'Care1234' };
const WEARER = { label: 'Watch Wearer', email: 'wearer@demo.com', password: 'Wear1234' };

const open = (page) => page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 180000 });

async function signOut(page) {
  await vis(page.getByRole('tab', { name: /Settings/ })).click();
  // The web Alert polyfill becomes window.confirm, which the harness auto-accepts -- so this
  // single press both opens and confirms the sign-out.
  await btn(page, 'Sign out').click();
}

(async () => {
  const browser = await launch();
  const page = await newPage(browser, 'demo');
  let failed = false;
  try {
    await step('login screen shows the DEMO MODE label and both accounts', async () => {
      await open(page);
      await text(page, 'DEMO MODE').waitFor({ timeout: 60000 });
      await text(page, CARETAKER.email).waitFor();
      await text(page, WEARER.email).waitFor();
      await shot(page, 'demo-1-login.png');
    });

    await step('Care Taker signs in and lands on the caregiver dashboard', async () => {
      await btn(page, `Sign in as ${CARETAKER.label}`).click();
      // Caregiver dashboard subtitle, not the wearer's greeting.
      await text(page, "You receive this person's SafeFall alerts.").waitFor({ timeout: 30000 });
      await shot(page, 'demo-2-caretaker-dashboard.png');
    });

    await step('demo session survives a full page reload', async () => {
      await open(page);
      await text(page, "You receive this person's SafeFall alerts.").waitFor({ timeout: 60000 });
      // Must not have fallen back to the login screen.
      if (await page.getByText('DEMO MODE').isVisible().catch(() => false)) {
        throw new Error('reload returned to the login screen; session was not restored');
      }
    });

    await step('route guard blocks the wearer-only contacts screen for a Care Taker', async () => {
      await page.goto(`${APP_URL}/contacts`, { waitUntil: 'networkidle', timeout: 120000 });
      await text(page, "You receive this person's SafeFall alerts.").waitFor({ timeout: 30000 });
      if (await page.getByText('Emergency contacts', { exact: true }).isVisible().catch(() => false)) {
        throw new Error('caregiver reached the wearer-only contacts screen');
      }
      await shot(page, 'demo-3-guard-redirect.png');
    });

    await step('logout clears the session and returns to the login screen', async () => {
      await signOut(page);
      await text(page, 'DEMO MODE').waitFor({ timeout: 30000 });
    });

    await step('logout is persistent: a reload stays signed out', async () => {
      await open(page);
      await text(page, 'DEMO MODE').waitFor({ timeout: 60000 });
    });

    await step('Watch Wearer signs in and lands on the wearer dashboard', async () => {
      await btn(page, `Sign in as ${WEARER.label}`).click();
      await text(page, 'Hello, Demo').waitFor({ timeout: 30000 });
      await shot(page, 'demo-4-wearer-dashboard.png');
    });

    await step('a restored demo session makes no Firebase auth/Firestore calls', async () => {
      page.errors.length = 0;
      await open(page);
      await text(page, 'Hello, Demo').waitFor({ timeout: 60000 });
      await page.waitForTimeout(5000);
      const fb = page.errors.filter((e) => /firebase|firestore|auth\//i.test(e));
      if (fb.length) throw new Error('Firebase activity in demo mode:\n  ' + fb.join('\n  '));
    });

    await step('wearer may open the contacts screen the Care Taker could not', async () => {
      await page.goto(`${APP_URL}/contacts`, { waitUntil: 'networkidle', timeout: 120000 });
      await text(page, 'Emergency contacts').waitFor({ timeout: 30000 });
    });

    await step('a wrong demo password is reported without a Firebase error', async () => {
      await open(page);
      await signOut(page).catch(() => undefined);
      await open(page);
      await vis(page.getByLabel('Email', { exact: true })).fill(CARETAKER.email);
      await vis(page.getByLabel('Password', { exact: true })).fill('WrongPass1');
      await btn(page, 'Sign in').click();
      await text(page, 'That demo password is incorrect. Check the demo accounts below.').waitFor({ timeout: 20000 });
      await shot(page, 'demo-5-wrong-password.png');
    });
  } catch (e) {
    failed = true;
    console.log('\nFAILURE: ' + e.message);
  } finally {
    const noise = page.errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
    if (noise.length) console.log('\nConsole errors:\n' + noise.slice(0, 20).join('\n'));
    await browser.close();
    console.log(failed ? '\nDEMO E2E FAILED' : '\nDEMO E2E PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
