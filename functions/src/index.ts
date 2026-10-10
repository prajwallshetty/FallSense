// SafeFall AI Cloud Functions.
//
// dispatchEscalatedAlert: when an alert reaches state "escalated", send a high-priority FCM
// push to every linked caregiver's registered devices, then record the outcome on the alert's
// `dispatch` field (clients cannot write that field; see firestore.rules).
//
// FCM "accepted" means Google's push service accepted the message for delivery. It does NOT
// prove the caregiver's phone received or displayed it. The app words this accordingly.

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

initializeApp();
const db = getFirestore();

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export const dispatchEscalatedAlert = onDocumentWritten(
  { document: 'alerts/{alertId}', region: process.env.FUNCTION_REGION || 'us-central1', retry: false },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const alert = after.data() as Record<string, any>;
    if (alert.state !== 'escalated') return;

    const alertRef = after.ref;
    // Claim the dispatch atomically so concurrent invocations never double-send.
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(alertRef);
      const d = snap.data();
      if (!d || d.state !== 'escalated' || d.dispatch?.pushAttemptedAt) return false;
      tx.update(alertRef, {
        dispatch: { pushAttemptedAt: Date.now(), pushRecipients: 0, pushAccepted: 0, pushFailed: 0, error: null },
      });
      return true;
    });
    if (!claimed) return;

    const elderlyId: string = alert.elderlyId;
    const name: string = alert.elderlyName || 'Your family member';

    try {
      const relations = await db.collection('relations').where('elderlyId', '==', elderlyId).get();
      const tokenOwners = new Map<string, string>();
      for (const rel of relations.docs) {
        const caregiverId = rel.get('caregiverId') as string;
        const push = await db.doc(`users/${caregiverId}/private/push`).get();
        for (const t of (push.get('tokens') as string[] | undefined) ?? []) tokenOwners.set(t, caregiverId);
      }
      const tokens = [...tokenOwners.keys()];

      if (tokens.length === 0) {
        await alertRef.update({
          'dispatch.error': relations.empty
            ? 'No caregivers are linked to this account.'
            : 'No caregiver phone has push notifications enabled.',
        });
        return;
      }

      const isSos = alert.source === 'manual_sos' || alert.source === 'wearable_sos';
      const res = await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: isSos ? `SOS from ${name}` : `${name} may have fallen`,
          body: isSos
            ? `${name} asked for help. Open SafeFall AI to see details and location.`
            : `A fall was detected and not cancelled. Open SafeFall AI to see details and location.`,
        },
        data: { type: 'fall_alert', alertId: alertRef.id, elderlyId },
        android: { priority: 'high', notification: { channelId: 'emergency-alerts', sound: 'default' } },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } },
      });

      // Prune tokens FCM reports as permanently invalid.
      const stale: Record<string, string[]> = {};
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code)) {
          const owner = tokenOwners.get(tokens[i])!;
          (stale[owner] ??= []).push(tokens[i]);
        }
      });
      await Promise.all(
        Object.entries(stale).map(([uid, list]) =>
          db.doc(`users/${uid}/private/push`).update({ tokens: FieldValue.arrayRemove(...list) }),
        ),
      );

      await alertRef.update({
        'dispatch.pushRecipients': tokens.length,
        'dispatch.pushAccepted': res.successCount,
        'dispatch.pushFailed': res.failureCount,
        'dispatch.error': res.failureCount > 0 && res.successCount === 0 ? 'Push service rejected all messages.' : null,
      });
      logger.info('Alert dispatched', { alertId: alertRef.id, accepted: res.successCount, failed: res.failureCount });
    } catch (e) {
      logger.error('Dispatch failed', e);
      await alertRef.update({ 'dispatch.error': `Dispatch failed: ${(e as Error).message}` });
    }
  },
);
