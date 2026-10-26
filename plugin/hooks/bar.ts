// No 'claude-code' import here: tools/make-hero.mts runs this file under plain node.
export const tone = (percent: number) => (percent >= 85 ? 'over' : percent >= 60 ? 'hot' : 'calm')

// The bar is drawn as an image: theme keys don't reach it, so colors are literal (sampled from the app's usage panel).
const FILL = { calm: '#4177d0', hot: '#bf882e', over: '#c04742' } as const
export const PACE_TICK = '#9c9c9c'
export const COMPACT_TICK = '#c04742'
// Three bars share the 768 px desktop row with the +N% steps: past 60 the widest likely figures wrap it.
export const BAR = { width: 60, height: 8, tick: 12 }

export const clampPct = (p: number) => Math.min(100, Math.max(0, p))
const at = (percent: number) => Math.round((clampPct(percent) / 100) * BAR.width)

// A tick the fill has passed turns white across the fill: grey on amber or red on red disappears just when it matters.
const tick = (percent: number, color: string, fill: number) => {
  const x = Math.min(BAR.width - 2, Math.max(0, at(percent) - 1))
  // Only a tick the fill covers whole: one level with the fill's end, or on an empty bar, has not been passed.
  if (x + 2 > at(fill)) return `<rect x="${x}" width="2" height="${BAR.tick}" fill="${color}"/>`
  const stub = (BAR.tick - BAR.height) / 2
  return `<rect x="${x}" width="2" height="${stub}" fill="${color}"/><rect x="${x}" y="${stub}" width="2" height="${BAR.height}" fill="#fff"/><rect x="${x}" y="${BAR.tick - stub}" width="2" height="${stub}" fill="${color}"/>`
}

export const bar = (percent: number, marks: { percent: number; color: string }[]) => {
  const r = BAR.height / 2
  const y = (BAR.tick - BAR.height) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR.width}" height="${BAR.tick}"><rect y="${y}" width="${BAR.width}" height="${BAR.height}" rx="${r}" fill="#888" fill-opacity="0.25"/><rect y="${y}" width="${at(percent)}" height="${BAR.height}" rx="${r}" fill="${FILL[tone(percent)]}"/>${marks.map(m => tick(m.percent, m.color, percent)).join('')}</svg>`
}
