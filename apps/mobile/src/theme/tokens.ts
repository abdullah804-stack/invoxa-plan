/**
 * Design tokens. One palette pair (light and dark) from the plan's "Paper and
 * Sage" scheme, one spacing scale and one type scale, so screens never invent
 * values. The brand colour itself comes from the business profile, not from here.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  skeleton: string;
  overlay: string;
}

export const palettes: Record<ResolvedTheme, Palette> = {
  light: {
    background: '#FAF8F2',
    surface: '#FFFFFF',
    surfaceMuted: '#F1EEE4',
    border: '#E3DFD2',
    text: '#16211C',
    textMuted: '#5C6B63',
    accent: '#1F5F4A',
    accentSoft: '#E4EFE8',
    onAccent: '#FFFFFF',
    danger: '#B3261E',
    dangerSoft: '#F8E3E0',
    warning: '#8A5A00',
    warningSoft: '#F7EDD5',
    success: '#1F5F4A',
    successSoft: '#E4EFE8',
    skeleton: '#E9E5D9',
    overlay: 'rgba(22, 33, 28, 0.45)',
  },
  dark: {
    background: '#101713',
    surface: '#17211C',
    surfaceMuted: '#1E2A24',
    border: '#2C3A33',
    text: '#F3F1E9',
    textMuted: '#A6B3AB',
    accent: '#5FBF9B',
    accentSoft: '#1E3A2F',
    onAccent: '#08221A',
    danger: '#FF8A80',
    dangerSoft: '#3A1E1C',
    warning: '#E5C07B',
    warningSoft: '#33280F',
    success: '#5FBF9B',
    successSoft: '#1E3A2F',
    skeleton: '#243029',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fonts = {
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  heading: 'Manrope_700Bold',
  headingSemibold: 'Manrope_600SemiBold',
  headingMedium: 'Manrope_500Medium',
} as const;

export const typeScale = {
  display: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38 },
  title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30 },
  section: { fontFamily: fonts.headingSemibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: fonts.bodySemibold, fontSize: 11, lineHeight: 14 },
  money: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 },
} as const;

/** Default brand colour from the plan, used until a business picks its own. */
export const DEFAULT_BRAND_COLOR = '#1F5F4A';

export const BRAND_SWATCHES = [
  '#1F5F4A',
  '#2F5D8A',
  '#7A3F8A',
  '#B4502A',
  '#8A6A1F',
  '#2E6B5A',
  '#9C2F4A',
  '#3A3F4A',
] as const;

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a #RRGGBB colour, for readable text on brand colours. */
export function luminance(hex: string): number {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '1F5F4A';
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** White or near-black text on a brand colour, whichever has more contrast. */
export function readableOn(hex: string): string {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onWhite >= onBlack ? '#FFFFFF' : '#0B1512';
}

/** A darker or lighter variant of a brand colour for borders and tints. */
export function mixWith(hex: string, target: string, amount: number): string {
  const parse = (value: string): [number, number, number] => [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(target);
  const mix = (a: number, b: number): string =>
    Math.round(a + (b - a) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(r1, r2)}${mix(g1, g2)}${mix(b1, b2)}`;
}

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const STATUS_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  sent: 'accent',
  partial: 'warning',
  overdue: 'danger',
  paid: 'success',
  void: 'neutral',
  expired: 'warning',
};

export function statusTone(status: string): StatusTone {
  return STATUS_TONES[status] ?? 'neutral';
}
