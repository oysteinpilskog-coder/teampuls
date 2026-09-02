'use client'

import { useState } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

/**
 * styled-jsx in App Router Client Components needs an explicit style
 * registry — without one the server render stamps the scoped `jsx-<hash>`
 * class onto every element while the client render doesn't, so React logs a
 * hydration mismatch and the scoped rules stop matching after the first
 * client re-render (the AI-input send button's hover/active scale, the
 * heatmap cell hover, the status-segment resize handles and the year-wheel
 * aurora parallax all rode on that).
 *
 * This is the setup Next's own css-in-js guide prescribes: collect the rules
 * during SSR and flush them into the document head before any markup that
 * uses them.
 */
export function StyledJsxRegistry({ children }: { children: React.ReactNode }) {
  // Lazy initial state — the registry must be created exactly once.
  const [registry] = useState(() => createStyleRegistry())

  useServerInsertedHTML(() => {
    const styles = registry.styles()
    registry.flush()
    return <>{styles}</>
  })

  return <StyleRegistry registry={registry}>{children}</StyleRegistry>
}
