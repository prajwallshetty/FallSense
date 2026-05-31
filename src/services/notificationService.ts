import { Platform, Vibration } from 'react-native';

class NotificationService {
  private fcmToken: string | null = null;
  private soundInterval: any = null;

  async requestPermissions(): Promise<boolean> {
    // In a real device, registers ExpoNotifications permissions
    console.log('NOTIFICATIONS: Registering permissions and fetching device token.');
    this.fcmToken = `fcm_token_${Math.random().toString(36).substring(7)}`;
    return true;
  }

  async getDevicePushToken(): Promise<string | null> {
    if (!this.fcmToken) {
      await this.requestPermissions();
    }
    return this.fcmToken;
  }

  // --- Sound Coordinator during Fall Alerts ---

  startEmergencySiren() {
    this.stopEmergencySiren();
    console.log('SIREN: !!! PLAYING EMERGENCY WARN SIREN AUDIO CHIP !!!');
    
    // Pulse device vibrator in sync with siren
    this.soundInterval = setInterval(() => {
      Vibration.vibrate([0, 400, 200, 400]);
      console.log('SIREN: (Beep-Beep! Siren sounding!)');
    }, 1500);
  }

  stopEmergencySiren() {
    if (this.soundInterval) {
      clearInterval(this.soundInterval);
      this.soundInterval = null;
      Vibration.cancel();
      console.log('SIREN: Emergency warn sound silenced.');
    }
  }

  async sendLocalAlert(title: string, body: string, priority: 'default' | 'high' = 'default') {
    console.log(`LOCAL ALERT [${priority.toUpperCase()}]: ${title} - ${body}`);
    // In production: schedules local notification via expo-notifications
  }
}

export const notificationService = new NotificationService();
