// Central, typed access to build-time configuration.
// Expo only inlines EXPO_PUBLIC_* variables when they are read as `process.env.EXPO_PUBLIC_NAME`
// literally, so every variable is accessed explicitly below.

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const firebaseConfig: FirebaseWebConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

const PLACEHOLDER_PATTERN = /^(your-|000000|1:000000)/;

/** Names of required Firebase variables that are missing or still hold template placeholders. */
export function missingFirebaseKeys(config: FirebaseWebConfig = firebaseConfig): string[] {
  const required: (keyof FirebaseWebConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];
  return required.filter((k) => !config[k] || PLACEHOLDER_PATTERN.test(config[k]));
}

export function parseCountdownSeconds(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(120, Math.max(10, n));
}

export const env = {
  firebase: firebaseConfig,
  isFirebaseConfigured: missingFirebaseKeys(firebaseConfig).length === 0,
  useFirebaseEmulator: process.env.EXPO_PUBLIC_FIREBASE_USE_EMULATOR === 'true',
  firebaseEmulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '10.0.2.2',
  /** Developer tools (BLE simulator etc.) are opt-in only. */
  devToolsEnabled: process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === 'true',
  emergencyServicesNumber: (process.env.EXPO_PUBLIC_EMERGENCY_SERVICES_NUMBER ?? '').replace(/[^\d+]/g, ''),
  fallCountdownSeconds: parseCountdownSeconds(process.env.EXPO_PUBLIC_FALL_COUNTDOWN_SECONDS),
  /** Digits only, e.g. "91". Used for phone numbers typed without a country code. */
  defaultCountryCode: (process.env.EXPO_PUBLIC_DEFAULT_COUNTRY_CODE ?? '').replace(/\D/g, ''),
} as const;
