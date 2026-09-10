/** Fixed campaign FX used on outflow dashboards (USD → SAR). */
export const SAR_PER_USD = 3.75

export function usdToSar(usd: number): number {
  return Math.round(usd * SAR_PER_USD * 100) / 100
}

export function formatUsdSar(usd: number): { usd: number; sar: number } {
  const n = Number(usd) || 0
  return { usd: n, sar: usdToSar(n) }
}
