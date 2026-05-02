/**
 * Ambient declarations for third-party packages that don't ship
 * TypeScript definitions of their own.
 *
 * Add the bare minimum we use, not the package's full surface — keeps
 * autocomplete focused on what's actually safe to call.
 */

declare module 'topojson-client' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function feature(topology: any, object: any): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function mesh(topology: any, object: any): any
}
