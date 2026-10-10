// Firebase Authentication & Firestore data access.
// Authorisation is enforced by firestore.rules; the checks here only improve error messages.
//
// Collections (see docs/FIREBASE_SETUP.md):
//   users/{uid}                      profile
//   users/{uid}/contacts/{id}        emergency contacts
//   users/{uid}/devices/{deviceId}   watch status mirrored for caregivers
//   users/{uid}/private/push         FCM device tokens (owner only)
//   linkCodes/{code}                 short-lived caregiver invite codes
//   relations/{caregiverUid_elderlyUid}  caregiver <-> elderly links
//   alerts/{incidentId}              fall / SOS incidents

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  User,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import * as Crypto from 'expo-crypto';
import { getFirebase } from './firebaseApp';
import { CaregiverRelation, CloudDeviceStatus, EmergencyContact, LinkCode, UserProfile, UserRole } from '../types';
import { Incident, Resolution } from '../emergency/incidentMachine';
import { alertDocToIncident, incidentToAlertDoc, remoteFieldsFromDoc } from '../emergency/alertDoc';
import { linkCodeFromBytes, LINK_CODE_LENGTH } from '../utils/validation';
import type { RemoteIncidentFields } from '../emergency/incidentMachine';

export const LINK_CODE_TTL_MS = 15 * 60 * 1000;

type Unsubscribe = () => void;

const db = () => getFirebase().db;
const auth = () => getFirebase().auth;

function profileFromDoc(uid: string, d: Record<string, unknown>): UserProfile | null {
  if (d.role !== 'elderly' && d.role !== 'caregiver') return null;
  return {
    userId: uid,
    email: String(d.email ?? ''),
    role: d.role,
    fullName: String(d.fullName ?? ''),
    phone: String(d.phone ?? ''),
    medicalNotes: typeof d.medicalNotes === 'string' ? d.medicalNotes : undefined,
    bloodType: typeof d.bloodType === 'string' ? d.bloodType : undefined,
    birthYear: typeof d.birthYear === 'number' ? d.birthYear : null,
    onboardingComplete: d.onboardingComplete === true,
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
  };
}

class FirebaseService {
  // ---------------- Auth ----------------

  onAuthChanged(cb: (user: User | null) => void): Unsubscribe {
    return onAuthStateChanged(auth(), cb);
  }

  currentUid(): string | null {
    return auth().currentUser?.uid ?? null;
  }

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(auth(), email, password);
  }

  async signUp(email: string, password: string): Promise<string> {
    const cred = await createUserWithEmailAndPassword(auth(), email, password);
    return cred.user.uid;
  }

  async signOut(): Promise<void> {
    await fbSignOut(auth());
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(auth(), email);
  }

  // ---------------- Profiles ----------------

  async createProfile(p: { uid: string; email: string; role: UserRole; fullName: string; phone: string }): Promise<void> {
    await setDoc(doc(db(), 'users', p.uid), {
      email: p.email,
      role: p.role,
      fullName: p.fullName,
      phone: p.phone,
      onboardingComplete: false,
      createdAt: Date.now(),
    });
  }

  subscribeProfile(uid: string, cb: (p: UserProfile | null) => void, onError: (e: Error) => void): Unsubscribe {
    return onSnapshot(
      doc(db(), 'users', uid),
      (snap) => cb(snap.exists() ? profileFromDoc(uid, snap.data()) : null),
      onError,
    );
  }

  async getProfile(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(db(), 'users', uid));
    return snap.exists() ? profileFromDoc(uid, snap.data()) : null;
  }

  async updateProfile(
    uid: string,
    patch: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'medicalNotes' | 'bloodType' | 'birthYear' | 'onboardingComplete'>>,
  ): Promise<void> {
    await updateDoc(doc(db(), 'users', uid), patch);
  }

  // ---------------- Emergency contacts ----------------

  subscribeContacts(elderlyId: string, cb: (c: EmergencyContact[]) => void, onError: (e: Error) => void): Unsubscribe {
    return onSnapshot(
      query(collection(db(), 'users', elderlyId, 'contacts'), orderBy('priority', 'asc')),
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              contactId: d.id,
              name: String(v.name ?? ''),
              phone: String(v.phone ?? ''),
              relationship: String(v.relationship ?? ''),
              priority: Number(v.priority ?? 99),
            };
          }),
        ),
      onError,
    );
  }

  async addContact(elderlyId: string, c: Omit<EmergencyContact, 'contactId'>): Promise<string> {
    const ref = doc(collection(db(), 'users', elderlyId, 'contacts'));
    await setDoc(ref, { ...c, updatedAt: Date.now() });
    return ref.id;
  }

  async updateContact(elderlyId: string, contactId: string, c: Omit<EmergencyContact, 'contactId'>): Promise<void> {
    await setDoc(doc(db(), 'users', elderlyId, 'contacts', contactId), { ...c, updatedAt: Date.now() });
  }

  async deleteContact(elderlyId: string, contactId: string): Promise<void> {
    await deleteDoc(doc(db(), 'users', elderlyId, 'contacts', contactId));
  }

  /** Rewrites priorities 1..n in the given order in a single atomic batch. */
  async reorderContacts(elderlyId: string, orderedIds: string[]): Promise<void> {
    const batch = writeBatch(db());
    orderedIds.forEach((id, i) => batch.update(doc(db(), 'users', elderlyId, 'contacts', id), { priority: i + 1, updatedAt: Date.now() }));
    await batch.commit();
  }

  // ---------------- Caregiver linking ----------------

  /** Elderly user creates a single-use invite code valid for 15 minutes. */
  async createLinkCode(elderly: UserProfile): Promise<LinkCode> {
    const code = linkCodeFromBytes(await Crypto.getRandomBytesAsync(LINK_CODE_LENGTH));
    const expiresAt = Date.now() + LINK_CODE_TTL_MS;
    await setDoc(doc(db(), 'linkCodes', code), {
      elderlyId: elderly.userId,
      elderlyName: elderly.fullName,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAt),
    });
    return { code, elderlyId: elderly.userId, elderlyName: elderly.fullName, expiresAt };
  }

  /** Reports whether an invite code still exists (it is deleted when a caregiver redeems it). */
  watchLinkCode(code: string, cb: (exists: boolean) => void): Unsubscribe {
    return onSnapshot(doc(db(), 'linkCodes', code), (snap) => cb(snap.exists()), () => undefined);
  }

  async revokeLinkCode(code: string): Promise<void> {
    await deleteDoc(doc(db(), 'linkCodes', code));
  }

  /** Caregiver redeems an invite code. Rules verify the code, expiry and the caregiver role. */
  async redeemLinkCode(caregiver: UserProfile, code: string): Promise<CaregiverRelation> {
    const codeRef = doc(db(), 'linkCodes', code);
    const snap = await getDoc(codeRef);
    if (!snap.exists()) throw new Error('That code was not found. Ask for a new code.');
    const data = snap.data();
    const expiresAt = (data.expiresAt as Timestamp).toMillis();
    if (expiresAt < Date.now()) throw new Error('That code has expired. Ask for a new code.');
    const elderlyId = String(data.elderlyId);
    if (elderlyId === caregiver.userId) throw new Error('You cannot link to your own account.');
    const relationId = `${caregiver.userId}_${elderlyId}`;
    const createdAt = Date.now();
    const batch = writeBatch(db());
    batch.set(doc(db(), 'relations', relationId), {
      caregiverId: caregiver.userId,
      elderlyId,
      caregiverName: caregiver.fullName,
      elderlyName: String(data.elderlyName ?? ''),
      linkCode: code,
      createdAt,
    });
    batch.delete(codeRef); // single use
    await batch.commit();
    return { relationId, caregiverId: caregiver.userId, elderlyId, caregiverName: caregiver.fullName, elderlyName: String(data.elderlyName ?? ''), createdAt };
  }

  subscribeRelations(user: UserProfile, cb: (r: CaregiverRelation[]) => void, onError: (e: Error) => void): Unsubscribe {
    const field = user.role === 'caregiver' ? 'caregiverId' : 'elderlyId';
    return onSnapshot(
      query(collection(db(), 'relations'), where(field, '==', user.userId)),
      // A relation that only exists as a pending local write (right after redeeming a code) is
      // not yet visible to security rules; listening to that elder's data now would be denied.
      { includeMetadataChanges: true },
      (snap) =>
        cb(
          snap.docs.filter((d) => !d.metadata.hasPendingWrites).map((d) => {
            const v = d.data();
            return {
              relationId: d.id,
              caregiverId: String(v.caregiverId),
              elderlyId: String(v.elderlyId),
              caregiverName: String(v.caregiverName ?? ''),
              elderlyName: String(v.elderlyName ?? ''),
              createdAt: Number(v.createdAt ?? 0),
            };
          }),
        ),
      onError,
    );
  }

  async removeRelation(relationId: string): Promise<void> {
    await deleteDoc(doc(db(), 'relations', relationId));
  }

  // ---------------- Device status (for caregivers) ----------------

  async upsertDeviceStatus(elderlyId: string, s: CloudDeviceStatus): Promise<void> {
    await setDoc(doc(db(), 'users', elderlyId, 'devices', s.deviceId.replace(/[^A-Za-z0-9_-]/g, '-')), s);
  }

  subscribeDeviceStatus(elderlyId: string, cb: (s: CloudDeviceStatus[]) => void, onError: (e: Error) => void): Unsubscribe {
    return onSnapshot(
      collection(db(), 'users', elderlyId, 'devices'),
      (snap) => cb(snap.docs.map((d) => d.data() as CloudDeviceStatus).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))),
      onError,
    );
  }

  // ---------------- Alerts ----------------

  /** Idempotent upsert keyed by the stable incident id; safe to retry. */
  async upsertAlert(incident: Incident): Promise<void> {
    await setDoc(doc(db(), 'alerts', incident.id), incidentToAlertDoc(incident), { merge: true });
  }

  async getAlertRemoteFields(alertId: string): Promise<RemoteIncidentFields | null> {
    const snap = await getDoc(doc(db(), 'alerts', alertId));
    return snap.exists() ? remoteFieldsFromDoc(snap.data()) : null;
  }

  subscribeAlert(alertId: string, cb: (r: RemoteIncidentFields | null) => void, onError: (e: Error) => void): Unsubscribe {
    return onSnapshot(doc(db(), 'alerts', alertId), (snap) => cb(snap.exists() ? remoteFieldsFromDoc(snap.data()) : null), onError);
  }

  subscribeAlertsFor(elderlyId: string, cb: (a: Incident[]) => void, onError: (e: Error) => void, max = 50): Unsubscribe {
    return onSnapshot(
      query(collection(db(), 'alerts'), where('elderlyId', '==', elderlyId), orderBy('createdAt', 'desc'), limit(max)),
      (snap) => cb(snap.docs.map((d) => alertDocToIncident(d.id, d.data())).filter((x): x is Incident => x !== null)),
      onError,
    );
  }

  async acknowledgeAlert(alertId: string, by: { uid: string; name: string }): Promise<void> {
    const now = Date.now();
    await updateDoc(doc(db(), 'alerts', alertId), {
      state: 'acknowledged',
      acknowledgedBy: by,
      acknowledgedAt: now,
      updatedAt: now,
      timeline: arrayUnion({ at: now, type: 'acknowledged', by: by.uid }),
    });
  }

  async resolveAlert(alertId: string, by: string, resolution: Resolution): Promise<void> {
    const now = Date.now();
    await updateDoc(doc(db(), 'alerts', alertId), {
      state: 'resolved',
      resolvedBy: by,
      resolvedAt: now,
      resolution,
      updatedAt: now,
      timeline: arrayUnion({ at: now, type: 'resolved', by, detail: resolution }),
    });
  }

  // ---------------- Push tokens ----------------

  async savePushToken(uid: string, token: string): Promise<void> {
    await setDoc(doc(db(), 'users', uid, 'private', 'push'), { tokens: arrayUnion(token), updatedAt: Date.now() }, { merge: true });
  }

  async removePushToken(uid: string, token: string): Promise<void> {
    await setDoc(doc(db(), 'users', uid, 'private', 'push'), { tokens: arrayRemove(token), updatedAt: Date.now() }, { merge: true });
  }
}

export const firebaseService = new FirebaseService();
