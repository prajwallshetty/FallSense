// Refuses a production build with an unsafe or incomplete configuration. Prints names and verdicts,
// never values.
//
//   npm run check:prod                      strict: exits 1 on any problem
//   runs automatically on EAS (profile "production") through the eas-build-post-install hook
//
// Values come from the environment first, then .env. On EAS, set them as EAS environment
// variables or secrets, since .env is git-ignored and not uploaded.
const fs = require('fs');
const path = require('path');

const strict = process.argv.includes('--strict') || process.env.EAS_BUILD_PROFILE === 'production';

function loadDotenv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const root = path.join(__dirname, '..');
const env = { ...loadDotenv(path.join(root, '.env')), ...process.env };
const get = (k) => (env[k] ?? '').trim();

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// --- Cloud API -----------------------------------------------------------------------------
const api = get('EXPO_PUBLIC_API_URL');
if (!api) err('EXPO_PUBLIC_API_URL is empty: access-code sign-in, sync and caretaker alerts cannot work.');
else if (!/^https:\/\/[^/\s]+/.test(api)) err('EXPO_PUBLIC_API_URL must be https:// (the app refuses plain HTTP for the cloud).');
else if (/localhost|127\.0\.0\.1|10\.0\.2\.2/.test(api)) err('EXPO_PUBLIC_API_URL points at this machine, not a deployed server.');

// --- Things that must be off in production ------------------------------------------------------
if (get('EXPO_PUBLIC_ENABLE_DEV_TOOLS') === 'true') err('EXPO_PUBLIC_ENABLE_DEV_TOOLS=true ships the watch simulator. Set it to false.');
if (get('EXPO_PUBLIC_ENABLE_DEMO_MODE') === 'true') err('EXPO_PUBLIC_ENABLE_DEMO_MODE=true ships hardcoded demo logins. Set it to false or leave it empty.');
if (get('EXPO_PUBLIC_FIREBASE_USE_EMULATOR') === 'true') err('EXPO_PUBLIC_FIREBASE_USE_EMULATOR=true points the app at an emulator.');
if (get('EXPO_PUBLIC_ENABLE_FIREBASE_AUTH') === 'true') warn('EXPO_PUBLIC_ENABLE_FIREBASE_AUTH=true re-enables the older Firebase email sign-in.');

// --- Supabase (optional, for Realtime). Both or neither; the key must be the public one. -------------------
const sbUrl = get('EXPO_PUBLIC_SUPABASE_URL');
const sbKey = get('EXPO_PUBLIC_SUPABASE_ANON_KEY');
if (!!sbUrl !== !!sbKey) err('Set both EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, or neither.');
if (sbUrl && !/^https:\/\//.test(sbUrl)) err('EXPO_PUBLIC_SUPABASE_URL must be https://.');
if (sbKey) {
  // Anything in EXPO_PUBLIC_* is readable by whoever has the APK, so a service-role key there would
  // hand over the whole database.
  if (/^sb_secret_/.test(sbKey)) err('EXPO_PUBLIC_SUPABASE_ANON_KEY is a SECRET key. Use the public anon/publishable key.');
  else if (sbKey.split('.').length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(sbKey.split('.')[1], 'base64url').toString());
      if (claims.role === 'service_role') err('EXPO_PUBLIC_SUPABASE_ANON_KEY is a service_role key. It bypasses all security. Use the anon key.');
      else if (claims.role !== 'anon') warn(`EXPO_PUBLIC_SUPABASE_ANON_KEY has role "${claims.role}", expected "anon".`);
      if (claims.exp && claims.exp * 1000 < Date.now()) err('EXPO_PUBLIC_SUPABASE_ANON_KEY has expired.');
    } catch {
      warn('EXPO_PUBLIC_SUPABASE_ANON_KEY looks like a JWT but could not be read.');
    }
  }
}

// --- Safety behaviour ---------------------------------------------------------------------------
const countdown = Number(get('EXPO_PUBLIC_FALL_COUNTDOWN_SECONDS') || 30);
if (!Number.isFinite(countdown) || countdown < 10 || countdown > 120) warn('EXPO_PUBLIC_FALL_COUNTDOWN_SECONDS should be 10 to 120 (the app clamps it).');
if (!get('EXPO_PUBLIC_EMERGENCY_SERVICES_NUMBER')) warn('EXPO_PUBLIC_EMERGENCY_SERVICES_NUMBER is empty, so the alert screen has no "call emergency services" button.');

// --- Push: without the Firebase file the app cannot get an FCM token ------------------------------------
const hasGoogleServices = fs.existsSync(path.join(root, 'google-services.json')) || !!get('GOOGLE_SERVICES_JSON');
if (!hasGoogleServices) err('No google-services.json (or GOOGLE_SERVICES_JSON on EAS): caretaker phones cannot receive push alerts.');

console.log(`SafeFall production check (${strict ? 'strict' : 'informational'})`);
for (const m of errors) console.log(`  ERROR    ${m}`);
for (const m of warnings) console.log(`  warning  ${m}`);
if (!errors.length && !warnings.length) console.log('  all checks passed');

if (errors.length && strict) {
  console.log(`\n${errors.length} problem(s) must be fixed before a production build.`);
  process.exit(1);
}
if (errors.length) console.log('\nNot enforced for this build. Run `npm run check:prod` before a production build.');
