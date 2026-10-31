import { canRoleOpen } from '../utils/routeAccess';
import { fromLocal, HistoryItem, matchesFilter, mergeHistory } from '../emergency/history';
import { initialIncidentsState, reduce } from '../emergency/incidentMachine';

describe('canRoleOpen', () => {
  it.each([
    ['(app)', '(tabs)', 'monitor'],
    ['(app)', 'watch'],
    ['(app)', 'insights'],
    ['(app)', 'insights', 'config'],
    ['(app)', 'calibration'],
    ['(app)', 'contacts'],
    ['alert'],
  ])('keeps a caretaker out of %s/%s/%s', (...segments) => {
    expect(canRoleOpen('caregiver', segments.filter(Boolean))).toBe(false);
    expect(canRoleOpen('elderly', segments.filter(Boolean))).toBe(true);
  });

  it('keeps a wearer out of the caretaker alert list', () => {
    expect(canRoleOpen('elderly', ['(app)', '(tabs)', 'alerts'])).toBe(false);
    expect(canRoleOpen('caregiver', ['(app)', '(tabs)', 'alerts'])).toBe(true);
  });

  it('does not confuse the wearer alert screen with the caretaker list', () => {
    expect(canRoleOpen('elderly', ['alert'])).toBe(true);
    expect(canRoleOpen('caregiver', ['(app)', '(tabs)', 'alerts'])).toBe(true);
  });

  it('leaves shared screens open to both', () => {
    for (const s of [['(app)', '(tabs)'], ['(app)', '(tabs)', 'health'], ['(app)', '(tabs)', 'settings'], ['(app)', 'incident', '[id]']]) {
      expect(canRoleOpen('elderly', s)).toBe(true);
      expect(canRoleOpen('caregiver', s)).toBe(true);
    }
  });
});

const item = (over: Partial<HistoryItem>): HistoryItem => ({
  id: 'a', clientEventId: 'a', isCloud: false, userName: 'Asha', eventAt: 1, eventType: 'fall', status: 'NORMAL',
  score: null, quality: null, movement: null, acknowledgedAt: null, acknowledgedBy: null, finalResponse: null, uploaded: true, ...over,
});

describe('history filters', () => {
  const possible = item({ status: 'FALL_VERIFICATION' });
  const confirmed = item({ status: 'CONFIRMED_FALL' });
  const help = item({ status: 'USER_NEEDS_ASSISTANCE' });
  const acked = item({ status: 'CONFIRMED_FALL', acknowledgedAt: 5 });
  const falseAlarm = item({ status: 'FALSE_ALARM' });
  const all = [possible, confirmed, help, acked, falseAlarm];
  const pick = (f: Parameters<typeof matchesFilter>[1]) => all.filter((i) => matchesFilter(i, f));

  it('applies each filter', () => {
    expect(pick('all')).toHaveLength(5);
    expect(pick('possible')).toEqual([possible]);
    expect(pick('confirmed')).toEqual([confirmed, help, acked]);
    expect(pick('acknowledged')).toEqual([acked]);
    expect(pick('unacknowledged')).toEqual([confirmed, help]);
    expect(pick('false_alarm')).toEqual([falseAlarm]);
  });

  it('does not count a false alarm as awaiting acknowledgment', () => {
    expect(matchesFilter(falseAlarm, 'unacknowledged')).toBe(false);
  });
});

describe('mergeHistory', () => {
  it('prefers the phone copy of an event, keeping the cloud id and acknowledgment', () => {
    const cloud = item({ id: 'uuid', clientEventId: 'e1', isCloud: true, status: 'CONFIRMED_FALL', acknowledgedAt: 9, acknowledgedBy: 'Ravi', eventAt: 2 });
    const local = item({ id: 'e1', clientEventId: 'e1', status: 'CONFIRMED_FALL', uploaded: false, eventAt: 2 });
    const [merged] = mergeHistory([cloud], [local]);
    expect(merged).toMatchObject({ id: 'uuid', uploaded: false, acknowledgedBy: 'Ravi', acknowledgedAt: 9 });
  });

  it('shows events that only exist on the phone, and sorts newest first', () => {
    const merged = mergeHistory([item({ clientEventId: 'c', eventAt: 1 })], [item({ clientEventId: 'l', eventAt: 2 })]);
    expect(merged.map((i) => i.clientEventId)).toEqual(['l', 'c']);
  });
});

describe('fromLocal', () => {
  it('reports an incident as not uploaded until the server confirms it', () => {
    const { state } = reduce(initialIncidentsState, { type: 'MANUAL_SOS', now: 1, owner: { uid: 'u', name: 'A' }, id: 'x' });
    expect(fromLocal(state.active!).uploaded).toBe(false);
    const synced = reduce(state, { type: 'SYNCED', incidentId: 'x', version: state.active!.version }).state;
    expect(fromLocal(synced.active!).uploaded).toBe(true);
  });
});
