// End-to-end flow on Expo web against the Firebase emulators. Uses the developer simulator,
// so it validates app logic, UI and backend rules -- NOT real Bluetooth hardware.
const { APP_URL, launch, newPage, btn, label, text, shot, step, firestore } = require('./lib');

async function signup(page, { name, email, role }) {
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 120000 });
  await btn(page, 'Create an account').click();
  if (role === 'caregiver') await page.getByRole('radio', { name: /I care for someone/ }).filter({ visible: true }).first().click();
  await label(page, 'Full name').fill(name);
  await label(page, 'Email').fill(email);
  await label(page, 'Mobile number').fill(role === 'caregiver' ? '98111 22233' : '98765 43210');
  await label(page, 'Password').fill('safefall123');
  await btn(page, 'Create account').click();
  await text(page, `Welcome, ${name.split(' ')[0]}`).waitFor({ timeout: 20000 });
  await btn(page, 'Continue').click();
  await btn(page, 'Continue').click();
}

const tab = (page, name) => page.getByRole('tab', { name: new RegExp(name) }).filter({ visible: true }).first();

(async () => {
  const browser = await launch();
  const elder = await newPage(browser, 'elder');
  const cg = await newPage(browser, 'caregiver');
  const ts = Date.now();
  let uid;
  try {
    await step('elder signup + onboarding (skip contacts dialog accepted)', async () => {
      await signup(elder, { name: 'Asha Rao', email: `asha${ts}@example.com`, role: 'elderly' });
      await label(elder, 'Name').fill('Ravi Rao');
      await label(elder, 'Mobile number').fill('+919811122233');
      await btn(elder, 'Save contact').click();
      await text(elder, '1. Ravi Rao').waitFor();
      await btn(elder, 'Finish setup').click();
      await text(elder, 'Hello, Asha').waitFor({ timeout: 15000 });
      const users = await firestore('users?pageSize=500');
      uid = users.documents.find((d) => d.fields.email.stringValue === `asha${ts}@example.com`).name.split('/').pop();
    });

    await step('pair simulator; dashboard labels it simulated and connected', async () => {
      await tab(elder, 'Watch').click();
      await text(elder, 'Only the developer simulator can be found in this build').waitFor();
      await btn(elder, 'Search for watch').click();
      await btn(elder, 'Connect').click();
      await text(elder, 'Your watch').waitFor({ timeout: 15000 });
      await text(elder, 'Connected').waitFor({ timeout: 10000 });
      await shot(elder, 'f1-watch-connected.png');
      await tab(elder, 'Home').click();
      await text(elder, 'Developer simulator').waitFor();
      await text(elder, 'Fall detection active on watch').waitFor();
      await shot(elder, 'f2-dashboard-connected.png');
    });

    await step('link loss -> Reconnecting / badge -> reconnects automatically', async () => {
      await btn(elder, 'Simulate link loss').click();
      await text(elder, /Reconnecting|Disconnected/).waitFor({ timeout: 5000 });
      await shot(elder, 'f2b-link-lost.png');
      const badge = await elder.getByRole('tab', { name: /Watch, not connected/ }).count();
      if (!badge) throw new Error('watch tab badge missing while disconnected');
      await text(elder, 'Fall detection active on watch').waitFor({ timeout: 15000 });
    });

    await step('simulated fall -> possible fall -> countdown', async () => {
      await btn(elder, 'Simulate fall (possible, then confirmed)').click();
      await text(elder, 'Possible fall detected').waitFor({ timeout: 8000 });
      await shot(elder, 'f3-possible-fall.png');
      await text(elder, 'Are you OK?').waitFor({ timeout: 8000 });
      await text(elder, 'seconds until your caregivers are alerted').waitFor();
      await shot(elder, 'f4-countdown.png');
    });

    await step('cancel from app closes alert; history shows cancelled (simulated)', async () => {
      await btn(elder, "I'm OK, cancel").click();
      await text(elder, 'Hello, Asha').waitFor({ timeout: 8000 });
      await tab(elder, 'History').click();
      await text(elder, 'Cancelled').waitFor();
      await shot(elder, 'f5-history-cancelled.png');
      await tab(elder, 'Home').click();
    });

    await step('second simulated fall escalates after countdown; nothing uploaded', async () => {
      await btn(elder, 'Simulate fall (possible, then confirmed)').click();
      await text(elder, 'Are you OK?').waitFor({ timeout: 10000 });
      await text(elder, 'Simulator test: nobody was notified.').waitFor({ timeout: 20000 });
      await shot(elder, 'f6-sim-escalated.png');
      const alerts = await firestore('alerts?pageSize=100');
      const mine = (alerts.documents || []).filter((d) => d.fields.elderlyId.stringValue === uid);
      if (mine.length) throw new Error('simulated incident was uploaded!');
      await btn(elder, "I'm OK now, close alert").click(); // confirm dialog auto-accepted
      await text(elder, 'Hello, Asha').waitFor({ timeout: 8000 });
    });

    await step('elder creates caregiver link code', async () => {
      await tab(elder, 'Settings').click();
      await elder.getByRole('button', { name: /^Caregivers/ }).filter({ visible: true }).first().click();
      await btn(elder, 'Create code').click();
      await text(elder, 'single use').waitFor({ timeout: 10000 });
      await shot(elder, 'f7-link-code.png');
    });
    const codes = await firestore('linkCodes?pageSize=10');
    const code = codes.documents.map((d) => d.name.split('/').pop()).find(Boolean);

    await step('caregiver signs up and links with the code', async () => {
      await signup(cg, { name: 'Ravi Rao', email: `ravi${ts}@example.com`, role: 'caregiver' });
      await label(cg, 'Caregiver code').fill(code);
      await btn(cg, 'Link account').click();
      await text(cg, 'Linked to: Asha Rao').waitFor({ timeout: 15000 });
      await btn(cg, 'Finish setup').click();
      await text(cg, 'No open alerts').waitFor({ timeout: 15000 });
      await shot(cg, 'f8-caregiver-dashboard.png');
      const c = await firestore(`linkCodes/${code}`);
      if (!c.error) throw new Error('link code was not consumed');
    });

    await step('caregiver dashboard has no permission error after linking (no reload)', async () => {
      await cg.waitForTimeout(3000);
      if (await cg.getByText('You do not have permission').count()) throw new Error('permission error still shown');
    });

    await step('elder screen no longer shows the consumed code', async () => {
      await text(elder, 'Your code was used').waitFor({ timeout: 10000 });
    });
    await step('elder presses SOS -> escalated and uploaded', async () => {
      await btn(elder, 'Go back').click();
      await tab(elder, 'Home').click();
      await elder.getByRole('button', { name: /^SOS/ }).filter({ visible: true }).first().click();
      await text(elder, 'SOS sent').waitFor({ timeout: 8000 });
      await text(elder, /Alert saved on the server|Not sent yet/).waitFor({ timeout: 30000 });
      await shot(elder, 'f9-sos.png');
      const alerts = await firestore('alerts?pageSize=100');
      const mine = (alerts.documents || []).filter((d) => d.fields.elderlyId.stringValue === uid);
      if (mine.length !== 1 || mine[0].fields.state.stringValue !== 'escalated') throw new Error('alerts: ' + JSON.stringify(mine.map((m) => m.fields.state)));
    });

    await step('caregiver sees the open alert and acknowledges', async () => {
      await btn(cg, "I'm on it (acknowledge)").waitFor({ timeout: 15000 });
      await shot(cg, 'f10-caregiver-alert.png');
      await btn(cg, "I'm on it (acknowledge)").click();
      await text(cg, 'Caregiver responding').waitFor({ timeout: 10000 });
    });

    await step('elder phone shows the acknowledgement', async () => {
      await text(elder, 'Ravi Rao is responding').waitFor({ timeout: 15000 });
      await shot(elder, 'f11-elder-acknowledged.png');
    });

    await step('elder resolves ("Help has arrived"); both sides close', async () => {
      await btn(elder, 'Help has arrived').click();
      await text(elder, 'Hello, Asha').waitFor({ timeout: 10000 });
      await text(cg, 'No open alerts').waitFor({ timeout: 15000 });
      const alerts = await firestore('alerts?pageSize=100');
      const mine = (alerts.documents || []).filter((d) => d.fields.elderlyId.stringValue === uid);
      if (mine[0].fields.state.stringValue !== 'resolved') throw new Error('state ' + mine[0].fields.state.stringValue);
    });

    await step('reload elder page: session persists, no stale alert', async () => {
      await elder.reload({ waitUntil: 'domcontentloaded' });
      await text(elder, 'Hello, Asha').waitFor({ timeout: 20000 });
    });
  } catch (e) {
    await shot(elder, 'f-fail-elder.png');
    await shot(cg, 'f-fail-cg.png');
    console.log('ELDER BODY:', (await elder.innerText('body')).slice(0, 700));
    process.exitCode = 1;
  } finally {
    console.log('ERRORS:\n' + ([...elder.errors, ...cg.errors].join('\n') || '(none)'));
    await browser.close();
  }
})();
