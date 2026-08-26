/** Distinct, stable colors for creator chart series. */
const PALETTE = [
  '#E11D48', // rose
  '#2563EB', // blue
  '#059669', // emerald
  '#D97706', // amber
  '#7C3AED', // violet
  '#0891B2', // cyan
  '#DC2626', // red
  '#CA8A04', // yellow
  '#DB2777', // pink
  '#4F46E5', // indigo
  '#0D9488', // teal
  '#EA580C', // orange
  '#65A30D', // lime
  '#9333EA', // purple
  '#0284C7', // sky
  '#BE123C', // crimson
] as const

export function colorForCreator(creatorId: number): string {
  const idx = Math.abs(creatorId) % PALETTE.length
  return PALETTE[idx]
}
