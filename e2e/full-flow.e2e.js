// Full system flow on Expo web: the real app code, the real API, real Postgres, and a stand-in watch.
//
// This proves the app's behaviour against the confirmed /data response shape. It cannot prove: the
// real watch's behaviour, Android Wi-Fi routing, the foreground service, real FCM delivery, or
// Supabase Realtime. Push delivery is recorded by a test sender in the API, not sent to FCM.
//
//   node e2e/mock-watch.js 9100
//   (cd backend && PORT=8787 npx tsx scripts/e2e-server.ts codes.json)
//   EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 EXPO_PUBLIC_FALL_COUNTDOWN_SECONDS=10 npx expo start --web --port 8095
//   CHROMIUM_PATH=<chrome> APP_URL=http://127.0.0.1:8095 CODES_FILE=codes.json node e2e/full-flow.e2e.js
const fs = require('fs');
const { APP_URL, launch, newPage, btn, label, text, shot, step, vis } = require('./lib');

const API = process.env.API_URL || 'http://127.0.0.1:8787';
const WATCH = process.env.MOCK_WATCH_URL || 'http://127.0.0.1:9100';
const WATCH_HOST = WATCH.replace('http://', '');
const codes = JSON.parse(fs.readFileSync(process.env.CODES_FILE, 'utf8'));

const scenario = (name) => fetch(`${WATCH}/scenario/${name}`, { method: 'POST' });
const serverState = async () => (await fetch(`${API}/__e2e/state`)).json();
const open = (page, path = '') => page.goto(`${APP_URL}${path}`, { waitUntil: 'load', timeout: 180000 });
const tab = (page, name) => vis(page.getByRole('tab', { name: new RegExp(name) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const axis = (page, a) => page.getByTestId(`axis-${a}`).filter({ visible: true }).first();

async function until(fn, what, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function login(page, code, role) {
  await open(page);
  await text(page, 'SafeFall AI').waitFor({ timeout: 120000 });
  if (role === 'caretaker') await page.getByRole('radio', { name: 'I am a caretaker' }).click();
  await label(page, role === 'user' ? 'User access code' : 'Caretaker access code').fill(code);
  await btn(page, 'Sign in').click();
}

(async () => {
  const browser = await launch();
  const wearer = await newPage(browser, 'wearer');
  const carer = await newPage(browser, 'caretaker');
  let failed = false;

  try {
    await scenario('calm');

    await step('demo accounts are not offered when demo mode is off, and a wrong code is rejected', async () => {
      await login(wearer, 'AAAA-BBBB-CCCC', 'user');
      await text(wearer, 'That access code was not recognised.').waitFor({ timeout: 20000 });
      if (await wearer.getByText('DEMO MODE').count()) throw new Error('demo panel is visible with demo mode off');
    });

    await step('a user code opens the user dashboard, not the caretaker one', async () => {
      await label(wearer, 'User access code').fill(codes.asha);
      await btn(wearer, 'Sign in').click();
      await text(wearer, 'Hello, Asha').waitFor({ timeout: 30000 });
      await text(wearer, 'Sensor unavailable').waitFor();
      await tab(wearer, 'Monitor').waitFor();
      if (await wearer.getByRole('tab', { name: /Alerts/ }).count()) throw new Error('user can see the caretaker Alerts tab');
      await shot(wearer, 'full-1-user-home.png');
    });

    await step('Test Connection reaches the watch and parses the confirmed field layout', async () => {
      await tab(wearer, 'Settings').click();
      await btn(wearer, 'Your watch. Connection, diagnostics and settings').click();
      await label(wearer, 'Watch IP address').fill(WATCH_HOST);
      await btn(wearer, 'Test Connection').click();
      await text(wearer, 'Test passed').waitFor({ timeout: 15000 });
      await text(wearer, 'Watch responded: X').waitFor();
    });

    await step('an internet address is refused as a watch address', async () => {
      await label(wearer, 'Watch IP address').fill('8.8.8.8');
      await btn(wearer, 'Test Connection').click();
      await text(wearer, 'private address').waitFor();
      await label(wearer, 'Watch IP address').fill(WATCH_HOST);
    });

    await step('monitoring connects and the X Y Z readings update by themselves', async () => {
      await btn(wearer, 'Start monitoring').click();
      await text(wearer, 'Watch Connected').waitFor({ timeout: 15000 });
      await shot(wearer, 'full-2-watch-connection.png');
      await wearer.goBack();
      await tab(wearer, 'Monitor').click();
      const x = axis(wearer, 'x');
      await x.waitFor();
      const first = await x.textContent();
      if (!/^-0\.3\d\d$/.test(first)) throw new Error(`X axis shows "${first}"`);
      const seen = new Set([first]);
      await until(async () => (seen.add(await x.textContent()), seen.size >= 3), 'the X axis to change', 20000);
      if (!/^-0\.2\d\d$/.test(await axis(wearer, 'y').textContent())) throw new Error('Y axis not parsed');
      if (!/^-0\.7\d\d$/.test(await axis(wearer, 'z').textContent())) throw new Error('Z axis not parsed');
      await text(wearer, 'Epoch').waitFor();
      await shot(wearer, 'full-3-monitor.png');
    });

    await step('detection learns the rest level and reports Normal', async () => {
      await text(wearer, 'Normal', true).waitFor({ timeout: 40000 });
    });

    await step('the cloud stores downsampled readings and the caretaker needs no watch connection', async () => {
      await until(async () => (await serverState()).readings > 0, 'a reading in the database');
      if ((await serverState()).readings > 20) throw new Error('readings were not downsampled');
      await login(carer, codes.ravi, 'caretaker');
      await text(carer, 'Hello, Ravi').waitFor({ timeout: 30000 });
      await text(carer, 'Asha Rao').waitFor({ timeout: 30000 });
      await text(carer, 'Watch Connected').waitFor({ timeout: 40000 });
      await tab(carer, 'Alerts').waitFor();
      await shot(carer, 'full-4-caretaker-home.png');
    });

    await step('role guards hold for both roles, including deep links', async () => {
      await open(carer, '/monitor');
      await text(carer, 'Hello, Ravi').waitFor({ timeout: 40000 });
      await open(carer, '/insights');
      await text(carer, 'Hello, Ravi').waitFor({ timeout: 40000 });
      await open(wearer, '/alerts');
      await text(wearer, 'Hello, Asha').waitFor({ timeout: 40000 });
    });

    await step('the session and monitoring come back after a reload', async () => {
      await text(wearer, 'Watch Connected').waitFor({ timeout: 40000 });
    });

    await step('a silent watch is marked not live, the last reading stays, detection says so', async () => {
      await tab(wearer, 'Monitor').click();
      await scenario('silent');
      await text(wearer, 'It is not live').waitFor({ timeout: 25000 });
      if (!/^-0\.3/.test(await axis(wearer, 'x').textContent())) throw new Error('the last reading was lost');
      await text(wearer, 'Sensor unavailable').waitFor({ timeout: 15000 });
      await shot(wearer, 'full-5-stale.png');
    });

    await step('invalid watch responses are reported as an error and never displayed', async () => {
      await scenario('garbage');
      await tab(wearer, 'Settings').click();
      await btn(wearer, 'Your watch. Connection, diagnostics and settings').click();
      await text(wearer, 'Connection Error').waitFor({ timeout: 25000 });
      await wearer.goBack();
    });

    await step('the watch reconnects by itself when it comes back', async () => {
      await scenario('calm');
      await tab(wearer, 'Home').click();
      await text(wearer, 'Watch Connected').waitFor({ timeout: 25000 });
      await text(wearer, 'Normal', true).waitFor({ timeout: 30000 });
    });

    await step('a fall pattern asks the user to verify, and the caretaker is not told yet', async () => {
      await sleep(10000);
      const before = (await serverState()).pushes.length;
      await scenario('fall');
      await text(wearer, 'Are you OK?').waitFor({ timeout: 60000 });
      await btn(wearer, "I'M OK").waitFor();
      await btn(wearer, 'EMERGENCY HELP').waitFor();
      await shot(wearer, 'full-6-verification.png');
      if ((await serverState()).pushes.length !== before) throw new Error('the caretaker was notified during verification');
    });

    await step("I'M OK keeps the event as a false alarm with the response recorded, and notifies nobody", async () => {
      const before = (await serverState()).pushes.length;
      await btn(wearer, "I'M OK").click();
      await scenario('calm');
      await until(async () => (await serverState()).events.some((e) => e.detection_status === 'FALSE_ALARM' && e.final_user_response === 'im_ok'), 'the false alarm in the database', 60000);
      if ((await serverState()).pushes.length !== before) throw new Error('a false alarm notified the caretaker');
      await tab(wearer, 'History').click();
      await wearer.getByRole('radio', { name: 'False Alarms' }).click();
      await text(wearer, 'Said they are OK').waitFor({ timeout: 15000 });
      await shot(wearer, 'full-7-history.png');
    });

    await step('with no answer the countdown escalates and the registered caretaker device is sent exactly one alert', async () => {
      // Stand in for the caretaker phone's FCM token: web cannot obtain a real one.
      const session = await (await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessCode: codes.ravi, role: 'caretaker' }) })).json();
      await fetch(`${API}/v1/push/register`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ token: 'e2e-stand-in-fcm-token-0001', platform: 'android' }) });
      await tab(wearer, 'Home').click();
      await text(wearer, 'Normal', true).waitFor({ timeout: 60000 });
      await sleep(32000);
      await scenario('fall');
      await text(wearer, 'Are you OK?').waitFor({ timeout: 60000 });
      await scenario('calm');
      await until(async () => (await serverState()).events.some((e) => e.detection_status === 'CONFIRMED_FALL'), 'the confirmed fall in the database', 90000);
      await until(async () => (await serverState()).pushes.length === 1, 'one push to be recorded', 30000);
      const s = await serverState();
      const confirmed = s.events.find((e) => e.detection_status === 'CONFIRMED_FALL');
      if (confirmed.final_user_response !== 'no_response') throw new Error('the missing response was not recorded');
      if (!/Asha Rao/.test(s.pushes[0].title) || !s.pushes[0].data.incidentId || !s.pushes[0].data.eventTimestamp) throw new Error('push is missing required details');
      await sleep(20000);
      if ((await serverState()).pushes.length !== 1) throw new Error('duplicate notification');
      await shot(wearer, 'full-8-escalated.png');
    });

    await step('the caretaker sees the alert remotely and acknowledges it', async () => {
      await carer.reload();
      await tab(carer, 'Alerts').click();
      await text(carer, 'Confirmed fall').waitFor({ timeout: 40000 });
      await shot(carer, 'full-9-caretaker-alert.png');
      await btn(carer, 'Acknowledge').click();
      await text(carer, 'No open alerts').waitFor({ timeout: 25000 });
    });

    await step('the acknowledgment reaches the wearer, and no delivery receipt is invented', async () => {
      await text(wearer, 'is responding').waitFor({ timeout: 60000 });
      await shot(wearer, 'full-10-acknowledged.png');
      if ((await serverState()).logs.some((l) => l.delivery_status === 'device_received')) throw new Error('a receipt was recorded that no phone sent');
    });

    await step('offline: an SOS is saved and shown as waiting, then uploads when the internet returns', async () => {
      await btn(wearer, 'Help has arrived').click();
      await text(wearer, 'Hello, Asha').waitFor({ timeout: 20000 });
      await wearer.context().route(`${API}/**`, (r) => r.abort());
      await btn(wearer, 'SOS. Ask your caretaker for help').click();
      await text(wearer, 'saved and will be sent').waitFor({ timeout: 40000 });
      await shot(wearer, 'full-11-offline.png');
      if ((await serverState()).events.some((e) => e.client_event_id.includes('_sos_'))) throw new Error('the SOS reached the server while offline');
      await wearer.context().unroute(`${API}/**`);
      await until(async () => (await serverState()).events.some((e) => e.client_event_id.includes('_sos_')), 'the queued SOS to upload', 120000);
    });

    await step('sign-out clears the session, and the next user sees none of it', async () => {
      await btn(wearer, 'Help has arrived').click();
      await text(wearer, 'Hello, Asha').waitFor({ timeout: 20000 });
      await tab(wearer, 'Settings').click();
      await btn(wearer, 'Sign out').click();
      await text(wearer, 'User access code').waitFor({ timeout: 25000 });
      await login(wearer, codes.ben, 'user');
      await text(wearer, 'Hello, Ben').waitFor({ timeout: 40000 });
      await tab(wearer, 'History').click();
      await text(wearer, 'Nothing to show').waitFor({ timeout: 20000 });
    });
  } catch (e) {
    failed = true;
    console.log('\nFAILURE: ' + e.message);
    await shot(wearer, 'full-failure-wearer.png').catch(() => undefined);
    await shot(carer, 'full-failure-carer.png').catch(() => undefined);
  } finally {
    const noise = [...wearer.errors, ...carer.errors].filter((e) => !/favicon|DevTools|shadow|pointerEvents|Failed to load resource|ERR_FAILED|net::/i.test(e));
    if (noise.length) console.log('\nConsole errors:\n' + [...new Set(noise)].slice(0, 15).join('\n'));
    await browser.close();
    console.log(failed ? '\nFULL FLOW FAILED' : '\nFULL FLOW PASSED');
    process.exit(failed ? 1 : 0);
  }
})();
