// Firebase Authentication & Firestore Service Wrapper
// Includes a local mock storage layer to allow testing without credentials.
import { UserProfile, EmergencyContact, FallAlert, HealthLog, CaregiverRelation } from '../types';

// Mock DB Initial State
const MOCK_PROFILES: Record<string, UserProfile> = {
  'elderly_1': {
    userId: 'elderly_1',
    email: 'elderly@safefall.ai',
    role: 'elderly',
    fullName: 'Margaret Thompson',
    phone: '+1 (555) 123-4567',
    avatarUrl: 'https://images.unsplash.com/photo-1544129491-3b3b62935042?auto=format&fit=crop&q=80&w=200',
    bloodType: 'O-positive',
    medicalConditions: 'Osteoporosis, Mild Hypertension',
    birthDate: '1945-08-14',
    createdAt: new Date().toISOString()
  },
  'caregiver_1': {
    userId: 'caregiver_1',
    email: 'caregiver@safefall.ai',
    role: 'caregiver',
    fullName: 'Sarah Thompson',
    phone: '+1 (555) 987-6543',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
    createdAt: new Date().toISOString()
  }
};

const MOCK_CONTACTS: Record<string, EmergencyContact[]> = {
  'elderly_1': [
    {
      contactId: 'contact_1',
      userId: 'elderly_1',
      name: 'Sarah Thompson (Daughter)',
      phone: '+1 (555) 987-6543',
      relationship: 'Daughter / Primary Caregiver',
      priorityOrder: 1
    },
    {
      contactId: 'contact_2',
      userId: 'elderly_1',
      name: 'Dr. Robert Chen',
      phone: '+1 (555) 234-5678',
      relationship: 'Primary Physician',
      priorityOrder: 2
    }
  ]
};

const MOCK_HEALTH: Record<string, HealthLog[]> = {
  'elderly_1': [
    { logId: '2026-05-25', userId: 'elderly_1', date: '2026-05-25', stepsCount: 4200, activeMinutes: 32, movementScore: 68 },
    { logId: '2026-05-26', userId: 'elderly_1', date: '2026-05-26', stepsCount: 5100, activeMinutes: 40, movementScore: 75 },
    { logId: '2026-05-27', userId: 'elderly_1', date: '2026-05-27', stepsCount: 3800, activeMinutes: 28, movementScore: 60 },
    { logId: '2026-05-28', userId: 'elderly_1', date: '2026-05-28', stepsCount: 6300, activeMinutes: 52, movementScore: 88 },
    { logId: '2026-05-29', userId: 'elderly_1', date: '2026-05-29', stepsCount: 4700, activeMinutes: 38, movementScore: 70 },
    { logId: '2026-05-30', userId: 'elderly_1', date: '2026-05-30', stepsCount: 3100, activeMinutes: 24, movementScore: 52 },
    { logId: '2026-05-31', userId: 'elderly_1', date: '2026-05-31', stepsCount: 2200, activeMinutes: 18, movementScore: 40 }
  ]
};

const MOCK_ALERTS: FallAlert[] = [
  {
    alertId: 'hist_alert_1',
    userId: 'elderly_1',
    userName: 'Margaret Thompson',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    location: { latitude: 37.7749, longitude: -122.4194, address: '123 Pine St, San Francisco, CA' },
    status: 'acknowledged',
    resolvedBy: 'caregiver_1',
    resolvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 45000).toISOString()
  },
  {
    alertId: 'hist_alert_2',
    userId: 'elderly_1',
    userName: 'Margaret Thompson',
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    location: { latitude: 37.7752, longitude: -122.4201, address: 'Market St & Van Ness Ave, San Francisco, CA' },
    status: 'false_alarm',
    resolvedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 12000).toISOString()
  }
];

const MOCK_RELATIONS: CaregiverRelation[] = [
  {
    relationId: 'rel_1',
    caregiverId: 'caregiver_1',
    elderlyId: 'elderly_1',
    elderlyName: 'Margaret Thompson',
    linkedAt: new Date().toISOString(),
    isActive: true
  }
];

class FirebaseService {
  private isConfigured: boolean = false;

  constructor() {
    // If real credentials existed, we would initialize standard firebase sdk:
    // const app = initializeApp(firebaseConfig);
    // this.auth = getAuth(app);
    // this.db = getFirestore(app);
    this.isConfigured = false;
  }

  // --- Auth API ---

  async login(email: string, password: string): Promise<UserProfile> {
    await this.delay(1000); // Simulate API latency
    
    // Auto match credentials for demo purposes
    if (email.includes('caregiver')) {
      return MOCK_PROFILES['caregiver_1'];
    }
    
    // Default to elderly user
    return MOCK_PROFILES['elderly_1'];
  }

  async signup(email: string, role: 'elderly' | 'caregiver', fullName: string, phone: string, password?: string): Promise<UserProfile> {
    await this.delay(1200);
    const userId = `user_${Date.now()}`;
    const newProfile: UserProfile = {
      userId,
      email,
      role,
      fullName,
      phone,
      createdAt: new Date().toISOString()
    };
    MOCK_PROFILES[userId] = newProfile;
    
    if (role === 'elderly') {
      MOCK_CONTACTS[userId] = [];
      MOCK_HEALTH[userId] = [];
    }
    return newProfile;
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    await this.delay(800);
  }

  // --- Profile Operations ---

  async getProfile(userId: string): Promise<UserProfile | null> {
    await this.delay(500);
    return MOCK_PROFILES[userId] || null;
  }

  async updateProfile(userId: string, data: Partial<UserProfile>): Promise<UserProfile> {
    await this.delay(500);
    if (!MOCK_PROFILES[userId]) throw new Error('User not found');
    MOCK_PROFILES[userId] = { ...MOCK_PROFILES[userId], ...data };
    return MOCK_PROFILES[userId];
  }

  // --- Caregiver Relations ---

  async getCaregiverRelations(caregiverId: string): Promise<CaregiverRelation[]> {
    await this.delay(500);
    return MOCK_RELATIONS.filter(r => r.caregiverId === caregiverId);
  }

  async linkCaregiver(caregiverId: string, elderlyEmail: string): Promise<CaregiverRelation> {
    await this.delay(1000);
    const elderly = Object.values(MOCK_PROFILES).find(p => p.email === elderlyEmail && p.role === 'elderly');
    if (!elderly) throw new Error('No elderly account found with that email.');

    const relationId = `rel_${Date.now()}`;
    const newRelation: CaregiverRelation = {
      relationId,
      caregiverId,
      elderlyId: elderly.userId,
      elderlyName: elderly.fullName,
      linkedAt: new Date().toISOString(),
      isActive: true
    };
    MOCK_RELATIONS.push(newRelation);
    return newRelation;
  }

  // --- Emergency Contacts ---

  async getEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
    await this.delay(400);
    return MOCK_CONTACTS[userId] || [];
  }

  async saveEmergencyContact(userId: string, contact: Omit<EmergencyContact, 'contactId'>): Promise<EmergencyContact> {
    await this.delay(600);
    const contactId = `contact_${Date.now()}`;
    const newContact: EmergencyContact = { ...contact, contactId, userId };
    
    if (!MOCK_CONTACTS[userId]) {
      MOCK_CONTACTS[userId] = [];
    }
    MOCK_CONTACTS[userId].push(newContact);
    return newContact;
  }

  async deleteEmergencyContact(userId: string, contactId: string): Promise<void> {
    await this.delay(400);
    if (MOCK_CONTACTS[userId]) {
      MOCK_CONTACTS[userId] = MOCK_CONTACTS[userId].filter(c => c.contactId !== contactId);
    }
  }

  // --- Health Telemetry Logs ---

  async getHealthLogs(userId: string): Promise<HealthLog[]> {
    await this.delay(600);
    return MOCK_HEALTH[userId] || [];
  }

  async logHealthActivity(userId: string, steps: number, minutes: number): Promise<HealthLog> {
    const today = new Date().toISOString().split('T')[0];
    const score = Math.min(100, Math.round((steps / 8000) * 100)); // out of 8000 daily steps
    
    if (!MOCK_HEALTH[userId]) MOCK_HEALTH[userId] = [];
    
    const index = MOCK_HEALTH[userId].findIndex(l => l.date === today);
    const updatedLog: HealthLog = {
      logId: today,
      userId,
      date: today,
      stepsCount: steps,
      activeMinutes: minutes,
      movementScore: score
    };

    if (index > -1) {
      MOCK_HEALTH[userId][index] = updatedLog;
    } else {
      MOCK_HEALTH[userId].push(updatedLog);
    }
    return updatedLog;
  }

  // --- Fall Alerts ---

  async getAlertHistory(userId: string): Promise<FallAlert[]> {
    await this.delay(600);
    return MOCK_ALERTS.filter(a => a.userId === userId);
  }

  async createFallAlert(alert: Omit<FallAlert, 'alertId'>): Promise<FallAlert> {
    const newAlert: FallAlert = {
      ...alert,
      alertId: `alert_${Date.now()}`
    };
    MOCK_ALERTS.unshift(newAlert);
    return newAlert;
  }

  async updateAlertStatus(alertId: string, status: FallAlert['status'], resolvedBy?: string): Promise<void> {
    await this.delay(400);
    const alert = MOCK_ALERTS.find(a => a.alertId === alertId);
    if (alert) {
      alert.status = status;
      alert.resolvedAt = new Date().toISOString();
      if (resolvedBy) alert.resolvedBy = resolvedBy;
    }
  }

  // Helper utility
  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const firebaseService = new FirebaseService();
