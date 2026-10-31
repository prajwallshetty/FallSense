// Cloud sync status, shown in the UI. Written only from real request outcomes, so the app cannot
// display a successful sync that did not happen.

import { create } from 'zustand';

export type CloudStatus =
  /** No backend in this session, for example demo mode. */
  | 'disabled'
  | 'connecting'
  | 'online'
  /** The last attempt could not reach the server. Usually the phone is on the watch hotspot alone. */
  | 'offline'
  /** The server was reached but refused or failed. */
  | 'error';

interface CloudStore {
  status: CloudStatus;
  message: string | null;
  /** Last time the server confirmed an upload. */
  lastSuccessAt: number | null;
  pendingIncidents: number;
  pendingReadings: number;
  patch: (p: Partial<Omit<CloudStore, 'patch' | 'reset'>>) => void;
  reset: () => void;
}

const INITIAL = { status: 'disabled' as CloudStatus, message: null, lastSuccessAt: null, pendingIncidents: 0, pendingReadings: 0 };

export const useCloudStore = create<CloudStore>((set) => ({
  ...INITIAL,
  patch: (p) => set(p),
  reset: () => set({ ...INITIAL }),
}));
