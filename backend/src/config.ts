// Runtime configuration, read once from the environment. Missing secrets stop the process rather
// than falling back to a default that would silently weaken authentication.

export interface Config {
  databaseUrl: string;
  jwtSecret: string;
  accessCodePepper: string;
  firebaseServiceAccountJson: string | null;
  port: number;
  requireHttps: boolean;
  trustProxyHops: number;
  corsOrigins: string[];
  loginRateLimit: { windowMs: number; max: number };
}

function required(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) throw new Error(`${name} must be set (at least ${minLength} characters)`);
  return value;
}

export function loadConfig(): Config {
  return {
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET', 32),
    accessCodePepper: required('ACCESS_CODE_PEPPER', 32),
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null,
    port: Number(process.env.PORT ?? 8787),
    requireHttps: process.env.REQUIRE_HTTPS !== 'false',
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
    corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    loginRateLimit: { windowMs: 15 * 60 * 1000, max: 20 },
  };
}
