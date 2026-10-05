export const colors = {
  // Base
  background: '#0A0A10',
  navRail: 'rgba(8, 8, 12, 0.92)',
  surface: 'rgba(20, 20, 30, 0.72)', // translucent panel (login card)
  surfaceSolid: '#12121C', // inputs, and a solid fallback where blur/alpha isn't available
  avatarBg: '#1C1C28',

  // Borders
  border: 'rgba(255, 255, 255, 0.08)',
  borderInput: 'rgba(255, 255, 255, 0.14)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',

  // Text
  textPrimary: '#F5F4FA',
  textSecondary: 'rgba(245, 244, 250, 0.70)',
  textMuted: 'rgba(245, 244, 250, 0.55)',
  textFaint: 'rgba(245, 244, 250, 0.38)', // placeholders

  // Accent (brand / focus / primary action)
  accent: '#7C5CFF',
  accentSoft: 'rgba(124, 92, 255, 0.18)', // active nav chip background
  accentGlow: 'rgba(124, 92, 255, 0.35)', // outer focus-ring glow
  accentLight: '#A78BFA', // primary button and links on the sign-in screens
  accentLightGlow: 'rgba(167, 139, 250, 0.22)',

  // Highlight (wordmark, pairing code)
  highlight: '#FFD866',

  // Overlays
  scrim: 'rgba(6, 6, 10, 0.92)', // bottom-of-tile gradient start, for title legibility
  badgeBg: 'rgba(0, 0, 0, 0.55)', // platform badge pill

  // Status
  danger: '#FF6B6B',

  // Ambient background glow (Login screen)
  glowAccent: 'rgba(124, 92, 255, 0.16)',
  glowAccentSoft: 'rgba(124, 92, 255, 0.10)',
  glowWhite: 'rgba(255, 255, 255, 0.05)',
} as const;

/**
 * Focus ring — every focusable control (inputs, buttons, nav icons, game
 * tiles) uses this same treatment so remote/D-pad focus always reads clearly.
 * Compose as a border + outer glow shadow, not a single box-shadow.
 */
export const focusRing = {
  borderColor: colors.accent,
  glowColor: colors.accentGlow,
  borderWidth: 1.5,
  glowWidth: 3,
};

/**
 * Placeholder cover-art gradients, cycled by index across a shelf until real
 * box art from the RomM server is wired in. `from` = top-left, `to` = bottom-right.
 */
export const platformGradients = [
  { name: 'teal', from: '#0E6E6E', to: '#0B2E2E' },
  { name: 'amber', from: '#8A5A18', to: '#2E1D08' },
  { name: 'magenta', from: '#7A1F5C', to: '#2A0A1E' },
  { name: 'indigo', from: '#3A2E8C', to: '#141033' },
  { name: 'green', from: '#1F5C3A', to: '#0B2418' },
  { name: 'rust', from: '#7A2A1F', to: '#2A0D08' },
] as const;

export type ColorToken = keyof typeof colors;
