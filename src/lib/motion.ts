export const spring = {
  gentle: { type: 'spring', stiffness: 300, damping: 30 },
  snappy: { type: 'spring', stiffness: 400, damping: 25 },
  bouncy: { type: 'spring', stiffness: 500, damping: 20 },
  smooth: { type: 'spring', stiffness: 200, damping: 40 },
  // Near-critical damping — modals land calmly with no visible bounce.
  modal:  { type: 'spring', stiffness: 360, damping: 36, mass: 0.9 },
} as const

export const ease = {
  inOut: [0.4, 0, 0.2, 1] as const,
  out: [0, 0, 0.2, 1] as const,
  in: [0.4, 0, 1, 1] as const,
  // The Offiview house-easing — referenced as the default for everything
  // that isn't a spring. Calm-in, decisive-out. DESIGN_SYSTEM §7.
  horizon: [0.2, 0.8, 0.3, 1] as const,
}
