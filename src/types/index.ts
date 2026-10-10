// Shared domain types. Emergency incident types live in src/emergency/incidentMachine.ts,
// BLE packet types in src/ble/protocol.ts.

export type UserRole = 'elderly' | 'caregiver';

export interface UserProfile {
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
  /** E.164 format, e.g. +919876543210 */
  phone: string;
  medicalNotes?: string;
  bloodType?: string;
  birthYear?: number | null;
  onboardingComplete: boolean;
  createdAt: number;
}

export interface EmergencyContact {
  contactId: string;
  name: string;
  /** E.164 format */
  phone: string;
  relationship: string;
  /** 1 = called/texted first */
  priority: number;
}

export interface CaregiverRelation {
  relationId: string;
  caregiverId: string;
  elderlyId: string;
  caregiverName: string;
  elderlyName: string;
  createdAt: number;
}

export interface LinkCode {
  code: string;
  elderlyId: string;
  elderlyName: string;
  expiresAt: number;
}

/** Device status mirrored to Firestore by the elderly user's phone for caregivers to see. */
export interface CloudDeviceStatus {
  deviceId: string;
  name: string;
  firmwareVersion: string | null;
  batteryPercent: number | null;
  linkStatus: string;
  lastSeenAt: number | null;
  updatedAt: number;
}
