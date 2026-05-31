export type UserRole = 'elderly' | 'caregiver' | 'admin';

export interface UserProfile {
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
  phone: string;
  avatarUrl?: string;
  bloodType?: string;
  medicalConditions?: string;
  birthDate?: string;
  fcmToken?: string;
  createdAt: string;
}

export interface EmergencyContact {
  contactId: string;
  userId: string;
  name: string;
  phone: string;
  relationship: string;
  priorityOrder: number;
}

export interface Device {
  deviceId: string;
  userId: string;
  macAddress: string;
  name: string;
  firmwareVersion: string;
  batteryLevel: number; // 0 - 100
  status: 'connected' | 'disconnected';
  lastSync: string;
  rssi?: number; // signal strength
}

export interface HealthLog {
  logId: string; // usually YYYY-MM-DD
  userId: string;
  date: string; // YYYY-MM-DD
  stepsCount: number;
  activeMinutes: number;
  movementScore: number; // calculated score out of 100
}

export interface FallAlert {
  alertId: string;
  userId: string;
  userName: string;
  timestamp: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  status: 'pending' | 'acknowledged' | 'false_alarm' | 'escalated';
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface CaregiverRelation {
  relationId: string;
  caregiverId: string;
  elderlyId: string;
  elderlyName: string;
  linkedAt: string;
  isActive: boolean;
}

export interface DeviceTelemetry {
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  fallScore: number;
}
