// Executes the side effects requested by the incident state machine and drives its clock.

import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Effect, Incident, IncidentsState, Resolution } from '../emergency/incidentMachine';
import { setEffectHandler, useIncidentStore } from '../store/incidentStore';
import { useActivityStore } from '../store/activityStore';
import { bleService } from './bleService';
import { locationService } from './locationService';
import { notificationService } from './notificationService';
import { syncService } from './syncService';

function find(state: IncidentsState, id: string): Incident | undefined {
  return state.active?.id === id ? state.active : state.history.find((h) => h.id === id);
}

function handleEffects(effects: Effect[], state: IncidentsState) {
  for (const effect of effects) {
    switch (effect.type) {
      case 'capture_location':
        locationService
          .captureIncidentLocation((location) =>
            useIncidentStore.getState().dispatch({ type: 'LOCATION', incidentId: effect.incidentId, location }),
          )
          .catch(() => undefined);
        break;

      case 'device_command':
        bleService.sendIncidentCommand(effect.command, effect.deviceId, effect.eventId).catch(() => undefined);
        break;

      case 'sync':
        syncService.kick();
        break;

      case 'escalate': {
        const inc = find(state, effect.incidentId);
        useActivityStore.getState().log('incident', inc?.simulated ? 'Simulated incident escalated (not sent)' : 'Incident escalated to caregivers', inc?.simulated);
        break;
      }

      case 'notify': {
        const inc = find(state, effect.incidentId);
        if (!inc) break;
        // In the foreground the full-screen alert is shown; notifications matter in background.
        if (AppState.currentState === 'active' && effect.kind !== 'escalated') break;
        const prefix = inc.simulated ? 'TEST (simulated): ' : '';
        const text: Record<typeof effect.kind, [string, string]> = {
          possible_fall: ['Possible fall detected', 'Open SafeFall AI if you need help or to cancel.'],
          countdown: ['Fall detected', 'Caregivers will be alerted soon unless you cancel. Open SafeFall AI.'],
          escalated: [
            inc.simulated ? 'Simulated alert escalated' : 'Alerting your caregivers',
            inc.simulated ? 'Nobody was notified: this was a simulator test.' : 'Open SafeFall AI to see the alert status.',
          ],
          closed: ['Alert closed', 'The incident was cancelled or resolved.'],
        };
        const [title, body] = text[effect.kind];
        notificationService.showLocal(prefix + title, body, { incidentId: inc.id });
        break;
      }
    }
  }
}

class EmergencyService {
  private clock: ReturnType<typeof setInterval> | null = null;
  private appStateSub: { remove(): void } | null = null;

  start(): void {
    setEffectHandler(handleEffects);
    if (!this.clock) {
      this.clock = setInterval(() => this.tick(), 1000);
    }
    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener('change', (s) => {
        if (s === 'active') this.tick();
      });
    }
    this.tick();
  }

  stop(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.appStateSub?.remove();
    this.appStateSub = null;
    setEffectHandler(null);
  }

  private tick() {
    const active = useIncidentStore.getState().active;
    if (active && (active.state === 'possible_fall' || active.state === 'countdown')) {
      useIncidentStore.getState().dispatch({ type: 'TICK', now: Date.now() });
    }
  }

  async triggerManualSos(owner: { uid: string; name: string }): Promise<void> {
    const id = `${owner.uid}_sos_${Crypto.randomUUID().replace(/-/g, '')}`;
    useIncidentStore.getState().dispatch({ type: 'MANUAL_SOS', now: Date.now(), owner, id });
  }

  cancel(byUid: string): void {
    useIncidentStore.getState().dispatch({ type: 'CANCEL', now: Date.now(), by: byUid });
  }

  escalateNow(byUid: string): void {
    useIncidentStore.getState().dispatch({ type: 'ESCALATE_NOW', now: Date.now(), by: byUid });
  }

  acknowledge(uid: string, name: string): void {
    useIncidentStore.getState().dispatch({ type: 'ACKNOWLEDGE', now: Date.now(), uid, name });
  }

  resolve(byUid: string, resolution: Resolution): void {
    useIncidentStore.getState().dispatch({ type: 'RESOLVE', now: Date.now(), by: byUid, resolution });
  }
}

export const emergencyService = new EmergencyService();
