// Push provider boundary. "accepted" means FCM took the message; it does not prove the phone got
// it. Only the recipient's phone can confirm that (POST /v1/notifications/:id/received).

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export type PushResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; invalidToken: boolean };

export interface PushSender {
  sendAll(messages: PushMessage[]): Promise<PushResult[]>;
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Used when no service account is configured: every send fails honestly and is logged. */
export const unconfiguredSender: PushSender = {
  async sendAll(messages) {
    return messages.map(() => ({ ok: false as const, error: 'provider_unconfigured', invalidToken: false }));
  },
};

export function createFcmSender(serviceAccountJson: string): PushSender {
  // Loaded lazily so the API starts quickly and tests never import firebase-admin.
  const { cert, initializeApp, getApps } = require('firebase-admin/app') as typeof import('firebase-admin/app');
  const { getMessaging } = require('firebase-admin/messaging') as typeof import('firebase-admin/messaging');
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });

  return {
    async sendAll(messages) {
      if (messages.length === 0) return [];
      const res = await getMessaging(app).sendEach(
        messages.map((m) => ({
          token: m.token,
          notification: { title: m.title, body: m.body },
          data: m.data,
          android: { priority: 'high' as const, notification: { channelId: 'emergency-alerts', sound: 'default' } },
          apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' as const } } },
        })),
      );
      return res.responses.map((r) =>
        r.success
          ? { ok: true as const, providerMessageId: r.messageId ?? '' }
          : { ok: false as const, error: r.error?.code ?? 'unknown', invalidToken: INVALID_TOKEN_CODES.has(r.error?.code ?? '') },
      );
    },
  };
}
