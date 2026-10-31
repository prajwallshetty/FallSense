// Local notifications, alert vibration and FCM device-token registration.
// Push delivery to caretakers is performed by the backend (backend/src/notifications.ts).

import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { apiClient } from './apiClient';
import { firebaseService } from './firebase';

export const EMERGENCY_CHANNEL_ID = 'emergency-alerts';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  private vibrating = false;
  private registeredToken: { uid: string; token: string } | null = null;
  private cloudToken: string | null = null;

  async ensureChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(EMERGENCY_CHANNEL_ID, {
      name: 'Emergency alerts',
      description: 'Fall detection and SOS alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      sound: 'default',
    });
  }

  async getPermission(): Promise<NotificationPermission> {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.status === 'undetermined' ? 'undetermined' : 'denied';
  }

  async requestPermission(): Promise<NotificationPermission> {
    await this.ensureChannel();
    const p = await Notifications.requestPermissionsAsync();
    return p.granted ? 'granted' : 'denied';
  }

  /**
   * Registers this phone's native FCM/APNs token so the backend can push alerts to it.
   * Returns a reason string when registration is impossible (never a fake token).
   */
  async registerPushToken(uid: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!Device.isDevice) return { ok: false, reason: 'Push notifications need a physical phone.' };
    if ((await this.getPermission()) !== 'granted') return { ok: false, reason: 'Notification permission not granted.' };
    try {
      await this.ensureChannel();
      const { data } = await Notifications.getDevicePushTokenAsync();
      const token = typeof data === 'string' ? data : JSON.stringify(data);
      await firebaseService.savePushToken(uid, token);
      this.registeredToken = { uid, token };
      return { ok: true };
    } catch (e) {
      // Typically: google-services.json missing from the build, or offline.
      return { ok: false, reason: `Push registration failed: ${(e as Error).message}` };
    }
  }

  /**
   * Registers this caretaker's phone with the SafeFall backend. Returns a reason when that is
   * impossible, which the UI shows, because a caretaker must know if alerts cannot reach them.
   */
  async registerCaretakerPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (Platform.OS === 'web') return { ok: false, reason: 'Push notifications need the phone app.' };
    if (!Device.isDevice) return { ok: false, reason: 'Push notifications need a physical phone.' };
    try {
      await this.ensureChannel();
      if ((await this.getPermission()) !== 'granted' && (await this.requestPermission()) !== 'granted') {
        return { ok: false, reason: 'Notification permission is off, so alerts cannot reach this phone.' };
      }
      const { data } = await Notifications.getDevicePushTokenAsync();
      const token = typeof data === 'string' ? data : JSON.stringify(data);
      await apiClient.request('/v1/push/register', { body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
      this.cloudToken = token;
      return { ok: true };
    } catch (e) {
      // Typically: google-services.json missing from the build, or offline.
      return { ok: false, reason: `Push registration failed: ${(e as Error).message}` };
    }
  }

  async unregisterCaretakerPush(): Promise<void> {
    const token = this.cloudToken;
    this.cloudToken = null;
    if (token) await apiClient.request('/v1/push/unregister', { body: { token } }).catch(() => undefined);
  }

  /**
   * Confirms alerts to the backend, which only then records them as received on this device, and
   * opens the incident when one is tapped.
   */
  listenForCaretakerAlerts(onOpen: (incidentId: string) => void): () => void {
    // Web has no notification listeners; alerts reach a web caretaker through the Alerts tab.
    if (Platform.OS === 'web') return () => undefined;
    const confirm = (data: Record<string, unknown>) => {
      if (typeof data.notificationId === 'string') {
        apiClient.request(`/v1/notifications/${data.notificationId}/received`, { method: 'POST', body: {} }).catch(() => undefined);
      }
    };
    const received = Notifications.addNotificationReceivedListener((n) => confirm(n.request.content.data as Record<string, unknown>));
    const opened = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as Record<string, unknown>;
      confirm(data);
      if (typeof data.incidentId === 'string') onOpen(data.incidentId);
    });
    return () => {
      received.remove();
      opened.remove();
    };
  }

  /** Removes this phone's token on sign-out so the previous account stops receiving alerts. */
  async unregisterPushToken(): Promise<void> {
    if (!this.registeredToken) return;
    const { uid, token } = this.registeredToken;
    this.registeredToken = null;
    await firebaseService.removePushToken(uid, token).catch(() => undefined);
  }

  async showLocal(title: string, body: string, data: Record<string, string> = {}): Promise<void> {
    try {
      await this.ensureChannel();
      await Notifications.scheduleNotificationAsync({
        content: { title, body, data, sound: 'default', priority: Notifications.AndroidNotificationPriority.MAX },
        trigger: Platform.OS === 'android' ? { channelId: EMERGENCY_CHANNEL_ID } : null,
      });
    } catch {
      // Notifications are a secondary channel; the in-app alert screen is primary.
    }
  }

  startAlertVibration(): void {
    if (this.vibrating) return;
    this.vibrating = true;
    Vibration.vibrate([0, 600, 400], true);
  }

  stopAlertVibration(): void {
    if (!this.vibrating) return;
    this.vibrating = false;
    Vibration.cancel();
  }
}

export const notificationService = new NotificationService();
