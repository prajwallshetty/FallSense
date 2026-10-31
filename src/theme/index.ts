// SafeFall AI design tokens: clean white surfaces, a forest-green accent, subtle borders, no gradients.
// Built for older eyes first. Text colours on white meet WCAG AA (>= 4.5:1), including the subtle tone.

export const colors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceRaised: '#F5F7F4',
  border: '#E3E7E1',
  borderStrong: '#C6CDC3',

  text: '#14201A',
  textMuted: '#3C4A42',
  textSubtle: '#5A6860',

  primary: '#1F5A3D',
  primaryStrong: '#174A31',
  primaryText: '#FFFFFF',
  primarySoft: '#E7F1EB',

  success: '#1B6E45',
  successSoft: '#E5F3EB',
  warning: '#8A5A00',
  warningSoft: '#FDF3DC',
  danger: '#B3261E',
  dangerStrong: '#B3261E',
  dangerSoft: '#FBE9E7',
  info: '#1D5A9E',
  infoSoft: '#E6EFF9',

  simulated: '#6B3FA0',
  simulatedSoft: '#F1EAF9',

  /** Line chart series. */
  axisX: '#1F5A3D',
  axisY: '#1D5A9E',
  axisZ: '#8A5A00',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.6 },
  title: { fontSize: 27, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.4 },
  heading: { fontSize: 20, fontWeight: '600' as const, color: colors.text, letterSpacing: -0.2 },
  body: { fontSize: 17, fontWeight: '400' as const, color: colors.textMuted, lineHeight: 24 },
  bodyStrong: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  label: { fontSize: 15, fontWeight: '600' as const, color: colors.textSubtle },
  caption: { fontSize: 14, fontWeight: '500' as const, color: colors.textSubtle },
  /** Large live sensor values. Tabular digits stop the number jumping as it updates. */
  metric: { fontSize: 34, fontWeight: '600' as const, color: colors.text, fontVariant: ['tabular-nums'] as ['tabular-nums'], letterSpacing: -0.5 },
} as const;

/** Minimum touch target (dp). Elderly users get generous targets. */
export const TOUCH_MIN = 52;
