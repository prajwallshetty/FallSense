import { missingFirebaseKeys, parseCountdownSeconds } from '../config/env';

describe('env', () => {
  it('treats template placeholders as missing configuration', () => {
    expect(
      missingFirebaseKeys({ apiKey: 'your-firebase-web-api-key', authDomain: 'x.firebaseapp.com', projectId: 'p', storageBucket: '', messagingSenderId: '', appId: '1:000000000000:web:00' }),
    ).toEqual(['apiKey', 'appId']);
    expect(missingFirebaseKeys({ apiKey: 'AIzaReal', authDomain: 'a', projectId: 'b', storageBucket: '', messagingSenderId: '', appId: '1:123:web:abc' })).toEqual([]);
  });

  it('clamps the countdown to a safe range', () => {
    expect(parseCountdownSeconds(undefined)).toBe(30);
    expect(parseCountdownSeconds('3')).toBe(10);
    expect(parseCountdownSeconds('600')).toBe(120);
    expect(parseCountdownSeconds('45')).toBe(45);
  });
});
