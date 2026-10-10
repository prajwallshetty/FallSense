/* Firestore Security Rules tests. Run: npm test (starts the Firestore emulator). */
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, writeBatch, serverTimestamp, Timestamp, arrayUnion } = require('firebase/firestore');

let env;
const ELDER = 'elder1';
const ELDER2 = 'elder2';
const CG = 'cg1';
const STRANGER = 'stranger';
const CODE = 'ABCDEFGH';

const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();

const profile = (uid, role) => ({ email: `${uid}@example.com`, role, fullName: uid, phone: '+919876543210', onboardingComplete: false, createdAt: 1700000000000 });

const alertDoc = (overrides = {}) => ({
  elderlyId: ELDER,
  elderlyName: 'Elder One',
  source: 'wearable',
  deviceId: 'AA:BB',
  deviceEventId: 7,
  state: 'escalated',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
  countdownEndsAt: null,
  escalatedAt: 1700000001000,
  peakAccelG: 3.1,
  location: { status: 'permission_denied', checkedAt: 1700000000500 },
  cancelledBy: null,
  acknowledgedBy: null,
  acknowledgedAt: null,
  resolvedBy: null,
  resolvedAt: null,
  resolution: null,
  timeline: [{ at: 1700000000000, type: 'possible_fall' }],
  clientVersion: 3,
  ...overrides,
});

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-safefall',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
});
afterAll(async () => env && env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (d) => {
    await setDoc(doc(d, 'users', ELDER), profile(ELDER, 'elderly'));
    await setDoc(doc(d, 'users', ELDER2), profile(ELDER2, 'elderly'));
    await setDoc(doc(d, 'users', CG), profile(CG, 'caregiver'));
    await setDoc(doc(d, 'users', STRANGER), profile(STRANGER, 'caregiver'));
  });
});

const link = () => seed((d) => setDoc(doc(d, 'relations', `${CG}_${ELDER}`), { caregiverId: CG, elderlyId: ELDER, caregiverName: 'cg1', elderlyName: ELDER, linkCode: CODE, createdAt: 1 }));
const seedCode = (expiresMs = Date.now() + 10 * 60000, name = ELDER) =>
  seed((d) => setDoc(doc(d, 'linkCodes', CODE), { elderlyId: ELDER, elderlyName: name, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(expiresMs) }));

describe('users', () => {
  test('a user can create their own profile', async () => {
    await assertSucceeds(setDoc(doc(db('new1'), 'users', 'new1'), profile('new1', 'elderly')));
  });
  test('admin role cannot be self-assigned', async () => {
    await assertFails(setDoc(doc(db('new1'), 'users', 'new1'), profile('new1', 'admin')));
  });
  test('cannot create someone else\'s profile', async () => {
    await assertFails(setDoc(doc(db('new1'), 'users', 'new2'), profile('new2', 'elderly')));
  });
  test('invalid phone rejected', async () => {
    await assertFails(setDoc(doc(db('new1'), 'users', 'new1'), { ...profile('new1', 'elderly'), phone: '12345' }));
  });
  test('role cannot be changed after creation', async () => {
    await assertFails(updateDoc(doc(db(ELDER), 'users', ELDER), { role: 'caregiver' }));
    await assertSucceeds(updateDoc(doc(db(ELDER), 'users', ELDER), { fullName: 'New Name', onboardingComplete: true }));
  });
  test('only linked caregivers can read an elderly profile', async () => {
    await assertFails(getDoc(doc(db(CG), 'users', ELDER)));
    await link();
    await assertSucceeds(getDoc(doc(db(CG), 'users', ELDER)));
    await assertFails(getDoc(doc(db(CG), 'users', ELDER2)));
  });
  test('profiles are not listable', async () => {
    await assertFails(getDocs(collection(db(ELDER), 'users')));
  });
});

describe('link codes and relations', () => {
  test('elderly user can create a short-lived code; caregiver cannot', async () => {
    const data = { elderlyId: ELDER, elderlyName: ELDER, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60000) };
    await assertSucceeds(setDoc(doc(db(ELDER), 'linkCodes', CODE), data));
    await assertFails(setDoc(doc(db(CG), 'linkCodes', 'BCDEFGHJ'), { ...data, elderlyId: CG }));
  });
  test('codes valid for more than 30 minutes are rejected', async () => {
    await assertFails(setDoc(doc(db(ELDER), 'linkCodes', CODE), { elderlyId: ELDER, elderlyName: ELDER, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 2 * 3600000) }));
  });
  test('codes cannot be listed', async () => {
    await seedCode();
    await assertFails(getDocs(collection(db(CG), 'linkCodes')));
  });
  test('caregiver redeems a valid code atomically (relation + delete code)', async () => {
    await seedCode();
    const d = db(CG);
    const b = writeBatch(d);
    b.set(doc(d, 'relations', `${CG}_${ELDER}`), { caregiverId: CG, elderlyId: ELDER, caregiverName: 'Care Giver', elderlyName: ELDER, linkCode: CODE, createdAt: Date.now() });
    b.delete(doc(d, 'linkCodes', CODE));
    await assertSucceeds(b.commit());
  });
  test('code cannot be reused after redemption', async () => {
    await seedCode();
    const d = db(CG);
    const b = writeBatch(d);
    b.set(doc(d, 'relations', `${CG}_${ELDER}`), { caregiverId: CG, elderlyId: ELDER, caregiverName: 'Care Giver', elderlyName: ELDER, linkCode: CODE, createdAt: Date.now() });
    b.delete(doc(d, 'linkCodes', CODE));
    await b.commit();
    await assertFails(setDoc(doc(db(STRANGER), 'relations', `${STRANGER}_${ELDER}`), { caregiverId: STRANGER, elderlyId: ELDER, caregiverName: 'S', elderlyName: ELDER, linkCode: CODE, createdAt: Date.now() }));
  });
  test('linking without a valid code is rejected', async () => {
    const rel = { caregiverId: CG, elderlyId: ELDER, caregiverName: 'Care Giver', elderlyName: ELDER, linkCode: CODE, createdAt: Date.now() };
    await assertFails(setDoc(doc(db(CG), 'relations', `${CG}_${ELDER}`), rel)); // no code exists
    await seedCode(Date.now() - 1000);
    await assertFails(setDoc(doc(db(CG), 'relations', `${CG}_${ELDER}`), rel)); // expired
  });
  test('code for one elder cannot link another; spoofed names rejected', async () => {
    await seedCode();
    await assertFails(setDoc(doc(db(CG), 'relations', `${CG}_${ELDER2}`), { caregiverId: CG, elderlyId: ELDER2, caregiverName: 'C', elderlyName: ELDER, linkCode: CODE, createdAt: Date.now() }));
    await assertFails(setDoc(doc(db(CG), 'relations', `${CG}_${ELDER}`), { caregiverId: CG, elderlyId: ELDER, caregiverName: 'C', elderlyName: 'Someone Else', linkCode: CODE, createdAt: Date.now() }));
  });
  test('elderly users cannot create relations and caregivers cannot link on behalf of others', async () => {
    await seedCode();
    await assertFails(setDoc(doc(db(ELDER2), 'relations', `${ELDER2}_${ELDER}`), { caregiverId: ELDER2, elderlyId: ELDER, caregiverName: 'E', elderlyName: ELDER, linkCode: CODE, createdAt: Date.now() }));
    await assertFails(setDoc(doc(db(CG), 'relations', `${STRANGER}_${ELDER}`), { caregiverId: STRANGER, elderlyId: ELDER, caregiverName: 'S', elderlyName: ELDER, linkCode: CODE, createdAt: Date.now() }));
  });
  test('either party can revoke; strangers cannot read', async () => {
    await link();
    await assertFails(getDoc(doc(db(STRANGER), 'relations', `${CG}_${ELDER}`)));
    await assertSucceeds(getDocs(query(collection(db(ELDER), 'relations'), where('elderlyId', '==', ELDER))));
    await assertSucceeds(deleteDoc(doc(db(ELDER), 'relations', `${CG}_${ELDER}`)));
    await assertFails(getDoc(doc(db(CG), 'users', ELDER)));
  });
});

describe('contacts', () => {
  const contact = { name: 'Ravi', phone: '+919811122233', relationship: 'Son', priority: 1, updatedAt: Date.now() };
  test('owner and linked caregiver can manage contacts', async () => {
    await assertSucceeds(setDoc(doc(db(ELDER), 'users', ELDER, 'contacts', 'c1'), contact));
    await assertFails(getDoc(doc(db(CG), 'users', ELDER, 'contacts', 'c1')));
    await link();
    await assertSucceeds(setDoc(doc(db(CG), 'users', ELDER, 'contacts', 'c2'), { ...contact, priority: 2 }));
  });
  test('invalid contact data is rejected', async () => {
    await assertFails(setDoc(doc(db(ELDER), 'users', ELDER, 'contacts', 'c1'), { ...contact, phone: 'call me' }));
    await assertFails(setDoc(doc(db(ELDER), 'users', ELDER, 'contacts', 'c1'), { ...contact, priority: 0 }));
    await assertFails(setDoc(doc(db(ELDER), 'users', ELDER, 'contacts', 'c1'), { ...contact, extra: true }));
  });
});

describe('push tokens', () => {
  test('only the owner can read or write their tokens', async () => {
    await assertSucceeds(setDoc(doc(db(CG), 'users', CG, 'private', 'push'), { tokens: ['t1'], updatedAt: 1 }));
    await assertFails(getDoc(doc(db(ELDER), 'users', CG, 'private', 'push')));
    await assertFails(setDoc(doc(db(ELDER), 'users', CG, 'private', 'push'), { tokens: ['evil'], updatedAt: 1 }));
  });
});

describe('alerts', () => {
  const ID = `${ELDER}_AA-BB_7`;
  test('elderly user can create their own alert', async () => {
    await assertSucceeds(setDoc(doc(db(ELDER), 'alerts', ID), alertDoc()));
  });
  test('cannot create alerts for someone else or with server-only fields', async () => {
    await assertFails(setDoc(doc(db(ELDER2), 'alerts', ID), alertDoc()));
    await assertFails(setDoc(doc(db(ELDER), 'alerts', ID), alertDoc({ dispatch: { pushAccepted: 99 } })));
    await assertFails(setDoc(doc(db(ELDER), 'alerts', 'other_7'), alertDoc()));
    await assertFails(setDoc(doc(db(CG), 'alerts', ID), alertDoc()));
  });
  test('invalid states and unknown fields are rejected', async () => {
    await assertFails(setDoc(doc(db(ELDER), 'alerts', ID), alertDoc({ state: 'delivered' })));
    await assertFails(setDoc(doc(db(ELDER), 'alerts', ID), alertDoc({ smsDelivered: true })));
  });

  describe('existing alert', () => {
    beforeEach(() => seed((d) => setDoc(doc(d, 'alerts', ID), alertDoc())));

    test('only the elder and linked caregivers can read', async () => {
      await assertFails(getDoc(doc(db(CG), 'alerts', ID)));
      await assertFails(getDocs(query(collection(db(STRANGER), 'alerts'), where('elderlyId', '==', ELDER))));
      await link();
      await assertSucceeds(getDoc(doc(db(CG), 'alerts', ID)));
      await assertSucceeds(getDocs(query(collection(db(CG), 'alerts'), where('elderlyId', '==', ELDER))));
    });

    test('linked caregiver can acknowledge as themselves, then resolve', async () => {
      await link();
      await assertFails(updateDoc(doc(db(CG), 'alerts', ID), { state: 'acknowledged', acknowledgedBy: { uid: 'someoneelse', name: 'X' }, acknowledgedAt: 2, updatedAt: 2 }));
      await assertSucceeds(updateDoc(doc(db(CG), 'alerts', ID), { state: 'acknowledged', acknowledgedBy: { uid: CG, name: 'C' }, acknowledgedAt: 2, updatedAt: 2, timeline: arrayUnion({ at: 2, type: 'acknowledged', by: CG }) }));
      await assertSucceeds(updateDoc(doc(db(CG), 'alerts', ID), { state: 'resolved', resolvedBy: CG, resolvedAt: 3, resolution: 'assisted', updatedAt: 3 }));
    });

    test('caregiver cannot change location or other elder-owned fields', async () => {
      await link();
      await assertFails(updateDoc(doc(db(CG), 'alerts', ID), { location: { status: 'ok', latitude: 1, longitude: 2 } }));
    });

    test('unlinked caregiver cannot acknowledge', async () => {
      await assertFails(updateDoc(doc(db(STRANGER), 'alerts', ID), { state: 'acknowledged', acknowledgedBy: { uid: STRANGER, name: 'S' }, acknowledgedAt: 2, updatedAt: 2 }));
    });

    test('state cannot move backwards or skip the machine', async () => {
      await assertFails(updateDoc(doc(db(ELDER), 'alerts', ID), { state: 'countdown' }));
      await assertFails(updateDoc(doc(db(ELDER), 'alerts', ID), { state: 'cancelled' }));
      await assertSucceeds(updateDoc(doc(db(ELDER), 'alerts', ID), { state: 'resolved', resolvedBy: ELDER, resolvedAt: 5, resolution: 'false_alarm', updatedAt: 5 }));
      await assertFails(updateDoc(doc(db(ELDER), 'alerts', ID), { state: 'escalated' }));
    });

    test('nobody can forge dispatch results or delete alerts', async () => {
      await assertFails(updateDoc(doc(db(ELDER), 'alerts', ID), { dispatch: { pushAccepted: 3 } }));
      await assertFails(deleteDoc(doc(db(ELDER), 'alerts', ID)));
    });

    test('elder merge-upsert keeps working after the server wrote dispatch', async () => {
      await seed((d) => updateDoc(doc(d, 'alerts', ID), { dispatch: { pushAttemptedAt: 1, pushRecipients: 1, pushAccepted: 1, pushFailed: 0, error: null } }));
      await assertSucceeds(setDoc(doc(db(ELDER), 'alerts', ID), alertDoc({ location: { status: 'ok', latitude: 12.9, longitude: 77.5, accuracyM: 20, capturedAt: 2, stale: false, address: null }, clientVersion: 4 }), { merge: true }));
    });

    test('immutable identity fields', async () => {
      await assertFails(updateDoc(doc(db(ELDER), 'alerts', ID), { elderlyId: ELDER2 }));
      await assertFails(updateDoc(doc(db(ELDER), 'alerts', ID), { createdAt: 5 }));
    });
  });
});

describe('default deny', () => {
  test('unknown collections are closed', async () => {
    await assertFails(setDoc(doc(db(ELDER), 'anything', 'x'), { a: 1 }));
  });
});
