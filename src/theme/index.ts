// SafeFall AI design tokens. Dark, calm, high-contrast palette with teal identity.
// Text colours on `bg`/`surface` meet WCAG AA (>= 4.5:1) for body text.

export const colors = {
  bg: '#0B1220',
  surface: '#131C2E',
  surfaceRaised: '#1A2539',
  border: '#26334A',
  borderStrong: '#3A4A66',

  text: '#F8FAFC',
  textMuted: '#CBD5E1',
  textSubtle: '#94A3B8',

  primary: '#14B8A6',
  primaryStrong: '#0D9488',
  primaryText: '#04201D',
  primarySoft: 'rgba(20,184,166,0.14)',

  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.14)',
  danger: '#F87171',
  dangerStrong: '#DC2626',
  dangerSoft: 'rgba(248,113,113,0.14)',
  info: '#60A5FA',
  infoSoft: 'rgba(96,165,250,0.14)',

  simulated: '#C084FC',
  simulatedSoft: 'rgba(192,132,252,0.16)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, fontWeight: '800' as const, color: colors.text },
  title: { fontSize: 26, fontWeight: '800' as const, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 17, fontWeight: '400' as const, color: colors.textMuted, lineHeight: 24 },
  bodyStrong: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  label: { fontSize: 15, fontWeight: '600' as const, color: colors.textSubtle },
  caption: { fontSize: 14, fontWeight: '500' as const, color: colors.textSubtle },
} as const;

/** Minimum touch target (dp). Elderly users get generous targets. */
export const TOUCH_MIN = 52;
