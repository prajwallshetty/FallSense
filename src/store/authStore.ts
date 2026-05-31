import { create } from 'zustand';
import { UserProfile, CaregiverRelation } from '../types';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  caregiverRelations: CaregiverRelation[];
  activeElderlyProfile: UserProfile | null; // Selected profile for caregiver
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCaregiverRelations: (relations: CaregiverRelation[]) => void;
  setActiveElderlyProfile: (profile: UserProfile | null) => void;
  initializeSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  caregiverRelations: [],
  activeElderlyProfile: null,

  setUser: (user) => set({ 
    user, 
    isAuthenticated: !!user,
    // Clear active elderly profile if logging out
    activeElderlyProfile: user?.role === 'caregiver' ? get().activeElderlyProfile : null 
  }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setCaregiverRelations: (caregiverRelations) => set({ caregiverRelations }),

  setActiveElderlyProfile: (activeElderlyProfile) => set({ activeElderlyProfile }),

  initializeSession: async () => {
    set({ isLoading: true });
    try {
      const storedUser = await SecureStore.getItemAsync('user_session');
      if (storedUser) {
        const userObj = JSON.parse(storedUser) as UserProfile;
        set({ user: userObj, isAuthenticated: true });
      }
    } catch (err) {
      console.error('Failed to restore session', err);
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await SecureStore.deleteItemAsync('user_session');
      set({ 
        user: null, 
        isAuthenticated: false, 
        caregiverRelations: [], 
        activeElderlyProfile: null, 
        error: null 
      });
    } catch (err) {
      set({ error: 'Logout failed: ' + (err as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },
}));
