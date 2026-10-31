// Role-based route protection, enforced by the root layout for both navigation and deep links.
// Shared screens (Home, History, Settings) render role-appropriate content internally.

import { UserRole } from '../types';

const WEARER_ONLY = new Set(['alert', 'contacts', 'monitor', 'watch', 'insights', 'calibration']);
const CARETAKER_ONLY = new Set(['alerts']);

export function canRoleOpen(role: UserRole, segments: string[]): boolean {
  const blocked = role === 'elderly' ? CARETAKER_ONLY : WEARER_ONLY;
  return !segments.some((s) => blocked.has(s));
}
