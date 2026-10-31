// IncidentService: connects detection to the incident workflow. Feeds accepted samples into the
// engine, turns its decisions into incidents, and reports the wearer's answer back to the engine.
//
// Nothing here removes an incident. "I'm OK" closes it as a false alarm and records the response;
// the original event stays in history and in the cloud.

import { detectionStatusOf } from '../emergency/cloudMapping';
import { DetectionSummary, Incident, isOpen, Owner } from '../emergency/incidentMachine';
import { DetectionEngine, EngineEvent, Evidence } from '../detection/detectionEngine';
import { useDetectionStore } from '../store/detectionStore';
import { useIncidentStore } from '../store/incidentStore';
import { Sample } from './sensorService';

export function summarize(e: Evidence): DetectionSummary {
  return {
    score: e.score,
    quality: e.quality,
    movement: e.movement,
    trigger: e.trigger,
    highRisk: e.highRisk,
    watchEpoch: e.epoch,
    peakDeviation: e.peakDeviation,
    orientationChangeDeg: e.orientationChangeDeg,
    stillFraction: e.stillFraction,
  };
}

export class IncidentService {
  readonly engine = new DetectionEngine(useDetectionStore.getState().config);
  private owner: Owner | null = null;
  private createId: () => string = () => String(Date.now());
  private tracked: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeConfig: (() => void) | null = null;

  start(owner: Owner, createId: () => string): void {
    this.owner = owner;
    this.createId = createId;
    this.engine.setConfig(useDetectionStore.getState().config);
    this.unsubscribe?.();
    this.unsubscribe = useIncidentStore.subscribe((s) => this.syncWithIncident(s.active));
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = useDetectionStore.subscribe((s, prev) => {
      if (s.config !== prev.config) this.engine.setConfig(s.config);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = null;
    this.owner = null;
    this.tracked = null;
    this.engine.reset();
    useDetectionStore.getState().patch({ state: 'SENSOR_UNAVAILABLE', movement: 'unknown', restMagnitude: null, evidence: null });
  }

  handleSample(sample: Sample, missed: number): void {
    this.apply(this.engine.process(sample, missed));
    this.publish();
  }

  handleSensorLost(at: number): void {
    this.apply(this.engine.onSensorLost(at));
    this.publish();
  }

  /** Runs on every poll result, so the countdown keeps running with JS timers paused. */
  handleTick(at: number): void {
    const active = useIncidentStore.getState().active;
    if (active && (active.state === 'possible_fall' || active.state === 'countdown')) {
      useIncidentStore.getState().dispatch({ type: 'TICK', now: at });
    }
  }

  private publish(): void {
    useDetectionStore.getState().patch({
      state: this.engine.state,
      movement: this.engine.movement,
      restMagnitude: this.engine.restMagnitude,
      evidence: this.engine.evidence,
    });
  }

  private apply(events: EngineEvent[]): void {
    const { addEvent } = useDetectionStore.getState();
    for (const event of events) {
      switch (event.type) {
        case 'state':
          addEvent({ at: event.at, kind: 'state', state: event.to, evidence: null });
          break;
        case 'dismissed':
          addEvent({ at: event.at, kind: 'dismissed', state: this.engine.state, evidence: event.evidence });
          break;
        case 'verification_required':
        case 'escalate_immediately': {
          const immediate = event.type === 'escalate_immediately';
          addEvent({ at: event.at, kind: immediate ? 'escalated' : 'verification', state: this.engine.state, evidence: event.evidence });
          if (!this.owner) break;
          useIncidentStore.getState().dispatch({
            type: 'DETECTION_FALL',
            now: event.at,
            owner: this.owner,
            id: `${this.owner.uid}_watch_${this.createId()}`,
            detection: summarize(event.evidence),
            immediate,
          });
          break;
        }
      }
    }
  }

  /** Mirrors the incident's outcome into the engine, so the displayed state stays truthful. */
  private syncWithIncident(active: Incident | null): void {
    const open = active && isOpen(active.state) ? active : null;

    if (open?.detection) {
      this.tracked = open.id;
      const response = open.finalUserResponse;
      if (open.state === 'escalated' && response && this.engine.isVerifying) {
        this.apply(this.engine.resolveVerification(response, open.updatedAt));
        this.publish();
      }
      return;
    }

    if (!this.tracked) return;
    const closed = useIncidentStore.getState().history.find((h) => h.id === this.tracked);
    this.tracked = null;
    if (closed) {
      const at = closed.updatedAt;
      if (detectionStatusOf(closed) === 'FALSE_ALARM' && this.engine.isVerifying) this.apply(this.engine.resolveVerification('im_ok', at));
      this.apply(this.engine.finishIncident(at));
      this.publish();
    }
  }
}

export const incidentService = new IncidentService();
