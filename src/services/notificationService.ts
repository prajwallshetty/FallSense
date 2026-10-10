// Local notifications, alert vibration and FCM device-token registration.
// Push delivery to caregivers is performed by the Cloud Function (functions/src/index.ts).

import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
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
