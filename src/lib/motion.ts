export const spring = {
  gentle: { type: 'spring', stiffness: 300, damping: 30 },
  snappy: { type: 'spring', stiffness: 400, damping: 25 },
  bouncy: { type: 'spring', stiffness: 500, damping: 20 },
  smooth: { type: 'spring', stiffness: 200, damping: 40 },
} as const

export const ease = {
  inOut: [0.4, 0, 0.2, 1] as const,
  out: [0, 0, 0.2, 1] as const,
  in: [0.4, 0, 1, 1] as const,
}
