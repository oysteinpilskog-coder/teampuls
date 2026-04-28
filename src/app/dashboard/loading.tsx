export default function Loading() {
  // Stays on the deep-space backdrop the dashboard itself owns, so the
  // transition into the rotating views never flashes light → dark.
  return (
    <div
      className="relative h-screen w-screen overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: '#050507', color: 'white' }}
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
