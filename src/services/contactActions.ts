// Platform call/SMS hand-off. SafeFall never claims a call or SMS was delivered: the phone's
// dialer/SMS app performs the action and reports only what the platform can confirm.

import { Linking } from 'react-native';
import * as SMS from 'expo-sms';
import type { Incident } from '../emergency/incidentMachine';
import { mapsUrl } from './locationService';

export async function callNumber(e164: string): Promise<{ ok: boolean; message: string }> {
  const url = `tel:${e164.replace(/[^\d+]/g, '')}`;
  try {
    await Linking.openURL(url);
    return { ok: true, message: 'Phone dialer opened.' };
  } catch {
    return { ok: false, message: 'This phone cannot place calls.' };
  }
}

export function incidentMessage(i: Incident): string {
  const what = i.source === 'wearable' ? 'may have fallen' : 'pressed SOS';
  const when = new Date(i.createdAt).toLocaleTimeString();
  let where = 'Location unavailable.';
  if (i.location.status === 'ok') {
    where = `Location${i.location.stale ? ' (may be out of date)' : ''}: ${mapsUrl(i.location.latitude, i.location.longitude)}`;
  }
  return `SafeFall alert: ${i.elderlyName} ${what} at ${when}. ${where} Please check on them now.`;
}

export async function textContacts(numbers: string[], message: string): Promise<{ ok: boolean; message: string }> {
  if (numbers.length === 0) return { ok: false, message: 'No emergency contacts to text.' };
  if (!(await SMS.isAvailableAsync())) return { ok: false, message: 'SMS is not available on this phone.' };
  try {
    const { result } = await SMS.sendSMSAsync(numbers, message);
    if (result === 'sent') return { ok: true, message: 'Your phone reports the message was sent. Delivery is not confirmed.' };
    if (result === 'cancelled') return { ok: false, message: 'The text message was not sent.' };
    return { ok: true, message: 'The SMS app was opened. SafeFall cannot confirm whether the message was sent.' };
  } catch (e) {
    return { ok: false, message: `Could not open SMS: ${(e as Error).message}` };
  }
}
