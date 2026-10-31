// Emergency contacts: Firestore for Firebase sessions, this phone for everything else. Screens use
// this so that access-code and demo sessions never touch Firestore.

import * as Crypto from 'expo-crypto';
import { useAuthStore } from '../store/authStore';
import { useLocalContactsStore } from '../store/localContactsStore';
import { EmergencyContact } from '../types';
import { firebaseService } from './firebase';

const usesFirestore = () => useAuthStore.getState().authSource === 'firebase';
const local = (uid: string) => useLocalContactsStore.getState().byUser[uid] ?? [];
const save = (uid: string, contacts: EmergencyContact[]) => useLocalContactsStore.getState().set(uid, contacts);

export const contactsRepo = {
  subscribe(uid: string, cb: (c: EmergencyContact[]) => void, onError: (e: Error) => void): () => void {
    if (usesFirestore()) return firebaseService.subscribeContacts(uid, cb, onError);
    cb(local(uid));
    return useLocalContactsStore.subscribe((s) => cb(s.byUser[uid] ?? []));
  },

  async add(uid: string, c: Omit<EmergencyContact, 'contactId'>): Promise<void> {
    if (usesFirestore()) {
      await firebaseService.addContact(uid, c);
      return;
    }
    save(uid, [...local(uid), { ...c, contactId: Crypto.randomUUID() }]);
  },

  async update(uid: string, contactId: string, c: Omit<EmergencyContact, 'contactId'>): Promise<void> {
    if (usesFirestore()) return firebaseService.updateContact(uid, contactId, c);
    save(uid, local(uid).map((x) => (x.contactId === contactId ? { ...c, contactId } : x)));
  },

  async remove(uid: string, contactId: string): Promise<void> {
    if (usesFirestore()) return firebaseService.deleteContact(uid, contactId);
    save(uid, local(uid).filter((x) => x.contactId !== contactId));
  },

  async reorder(uid: string, orderedIds: string[]): Promise<void> {
    if (usesFirestore()) return firebaseService.reorderContacts(uid, orderedIds);
    const byId = new Map(local(uid).map((c) => [c.contactId, c]));
    save(uid, orderedIds.flatMap((id, i) => {
      const c = byId.get(id);
      return c ? [{ ...c, priority: i + 1 }] : [];
    }));
  },
};
