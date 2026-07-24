// Small seeded PRNG (mulberry32) so the demo produces a reproducible stream of
// transactions across reloads — useful when presenting to stakeholders.

let state = 0x9e3779b9

export function seed(n: number) {
  state = n >>> 0
}

export function rng(): number {
  state |= 0
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

export function range(min: number, max: number): number {
  return min + rng() * (max - min)
}

export function intRange(min: number, max: number): number {
  return Math.floor(range(min, max + 1))
}

export function id(prefix: string): string {
  return `${prefix}-${Math.floor(rng() * 0xffffff).toString(16).padStart(6, '0')}`
}
