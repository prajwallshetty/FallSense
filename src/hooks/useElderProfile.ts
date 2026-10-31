import { useEffect, useState } from 'react';
import { firebaseService } from '../services/firebase';
import { useAuthStore } from '../store/authStore';
import { UserProfile } from '../types';

/** Caregivers: profile of the selected linked elderly user (allowed by firestore.rules). */
export function useElderProfile(elderlyId: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    setProfile(null);
    if (!elderlyId || useAuthStore.getState().authSource !== 'firebase') return;
    return firebaseService.subscribeProfile(elderlyId, setProfile, () => setProfile(null));
  }, [elderlyId]);
  return profile;
}
