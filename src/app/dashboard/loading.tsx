export default function Loading() {
  // Stays on the same warm-Espresso backdrop the dashboard itself owns
  // (DESIGN_SYSTEM §4: "varm espresso, ikke kald SaaS-bakgrunn"), so the
  // transition into the rotating views never flashes a colder hue.
  return (
    <div
      className="relative h-screen w-screen overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: '#15110E', color: '#F5EFE4' }}
    >
      <div
        className="rounded-full"
        style={{
          width: 420,
          height: 420,
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--accent-color) 28%, transparent) 0%, color-mix(in oklab, var(--accent-color) 6%, transparent) 45%, transparent 70%)',
          filter: 'blur(40px)',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  )
}
