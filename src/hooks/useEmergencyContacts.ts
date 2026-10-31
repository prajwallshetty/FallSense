import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { contactsRepo } from '../services/contactsRepo';
import { describeFirebaseError } from '../services/firebaseApp';
import { EmergencyContact } from '../types';

const cacheKey = (uid: string) => `safefall.contactsCache.${uid}`;

/**
 * Live emergency contacts with an on-device cache, so the alert screen can still offer
 * call/SMS buttons when the phone is offline during an emergency.
 */
export function useEmergencyContacts(elderlyId: string | null | undefined) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    if (!elderlyId) return;
    let live = false;
    AsyncStorage.getItem(cacheKey(elderlyId))
      .then((raw) => {
        if (!live && raw) {
          setContacts(JSON.parse(raw));
          setFromCache(true);
          setLoading(false);
        }
      })
      .catch(() => undefined);
    const unsub = contactsRepo.subscribe(
      elderlyId,
      (c) => {
        live = true;
        setContacts(c);
        setFromCache(false);
        setLoading(false);
        setError(null);
        AsyncStorage.setItem(cacheKey(elderlyId), JSON.stringify(c)).catch(() => undefined);
      },
      (e) => {
        setError(describeFirebaseError(e));
        setLoading(false);
      },
    );
    return unsub;
  }, [elderlyId]);

  return { contacts, loading, error, fromCache };
}
