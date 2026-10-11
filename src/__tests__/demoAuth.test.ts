import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  canonicalRole,
  clearDemoSession,
  DEMO_ACCOUNTS,
  DEMO_RELATION,
  demoAccountByUid,
  findDemoAccount,
  isDemoEmail,
  loadDemoSession,
  saveDemoSession,
} from '../services/demoAuth';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('demo accounts', () => {
  it('exposes exactly the two documented accounts', () => {
    expect(DEMO_ACCOUNTS.map((a) => a.email)).toEqual(['caretaker@demo.com', 'wearer@demo.com']);
  });

  it('maps the demo role names onto the app canonical roles', () => {
    expect(canonicalRole('caretaker')).toBe('caregiver');
    expect(canonicalRole('watch_wearer')).toBe('elderly');
  });

  it('gives the care taker the caregiver role and the wearer the elderly role', () => {
    const caretaker = findDemoAccount('caretaker@demo.com', 'Care1234');
    const wearer = findDemoAccount('wearer@demo.com', 'Wear1234');
    expect(caretaker?.profile.role).toBe('caregiver');
    expect(wearer?.profile.role).toBe('elderly');
  });

  it('skips onboarding so sign-in lands on the dashboard', () => {
    for (const account of DEMO_ACCOUNTS) expect(account.profile.onboardingComplete).toBe(true);
  });

  it('links the two demo accounts to each other', () => {
    expect(DEMO_RELATION.caregiverId).toBe(findDemoAccount('caretaker@demo.com', 'Care1234')?.profile.userId);
    expect(DEMO_RELATION.elderlyId).toBe(findDemoAccount('wearer@demo.com', 'Wear1234')?.profile.userId);
  });
});

describe('credential checking', () => {
  it('accepts the documented credentials', () => {
    expect(findDemoAccount('caretaker@demo.com', 'Care1234')).not.toBeNull();
    expect(findDemoAccount('wearer@demo.com', 'Wear1234')).not.toBeNull();
  });

  it('ignores email case and surrounding whitespace', () => {
    expect(findDemoAccount('  CareTaker@Demo.com ', 'Care1234')).not.toBeNull();
  });

  it('rejects a wrong password', () => {
    expect(findDemoAccount('caretaker@demo.com', 'Care1235')).toBeNull();
  });

  it('is case sensitive on the password', () => {
    expect(findDemoAccount('caretaker@demo.com', 'care1234')).toBeNull();
  });

  it('does not let one demo password unlock the other account', () => {
    expect(findDemoAccount('caretaker@demo.com', 'Wear1234')).toBeNull();
    expect(findDemoAccount('wearer@demo.com', 'Care1234')).toBeNull();
  });

  it('rejects an unknown email', () => {
    expect(findDemoAccount('someone@example.com', 'Care1234')).toBeNull();
  });

  it('recognises demo emails regardless of password', () => {
    expect(isDemoEmail('WEARER@DEMO.COM')).toBe(true);
    expect(isDemoEmail('someone@example.com')).toBe(false);
  });
});

describe('session persistence', () => {
  it('returns null when nothing is stored', async () => {
    await expect(loadDemoSession()).resolves.toBeNull();
  });

  it('restores the account saved by a previous run', async () => {
    const wearer = findDemoAccount('wearer@demo.com', 'Wear1234');
    await saveDemoSession(wearer!.profile.userId);
    const restored = await loadDemoSession();
    expect(restored?.email).toBe('wearer@demo.com');
    expect(restored?.profile.role).toBe('elderly');
  });

  it('never writes a password to storage', async () => {
    await saveDemoSession(DEMO_ACCOUNTS[0].profile.userId);
    const keys = await AsyncStorage.getAllKeys();
    const dump = JSON.stringify(await AsyncStorage.multiGet(keys));
    for (const account of DEMO_ACCOUNTS) expect(dump).not.toContain(account.password);
  });

  it('clears the session on logout', async () => {
    await saveDemoSession(DEMO_ACCOUNTS[0].profile.userId);
    await clearDemoSession();
    await expect(loadDemoSession()).resolves.toBeNull();
  });

  it('ignores a stored id that is no longer a demo account', async () => {
    await saveDemoSession('demo-removed-account');
    await expect(loadDemoSession()).resolves.toBeNull();
  });

  it('looks accounts up by user id', () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(demoAccountByUid(account.profile.userId)?.email).toBe(account.email);
    }
    expect(demoAccountByUid('nope')).toBeNull();
  });
});
