import { useEffect, useState } from 'react';
import { firebaseService } from '../services/firebase';
import { UserProfile } from '../types';

/** Caregivers: profile of the selected linked elderly user (allowed by firestore.rules). */
export function useElderProfile(elderlyId: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    setProfile(null);
    if (!elderlyId) return;
    return firebaseService.subscribeProfile(elderlyId, setProfile, () => setProfile(null));
  }, [elderlyId]);
  return profile;
}
