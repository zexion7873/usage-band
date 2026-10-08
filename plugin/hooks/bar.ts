// No 'claude-code' import here: tools/make-hero.mts runs this file under plain node.
export const tone = (percent: number) => (percent >= 85 ? 'over' : percent >= 60 ? 'hot' : 'calm')

// The bar is drawn as an image: theme keys don't reach it, so colors are literal (sampled from the app's usage panel).
const FILL = { calm: '#4177d0', hot: '#bf882e', over: '#c04742' } as const
export const PACE_TICK = '#9c9c9c'
export const COMPACT_TICK = '#c04742'
export const BAR = { width: 80, height: 8, tick: 12 }

export const clampPct = (p: number) => Math.min(100, Math.max(0, p))
const at = (percent: number) => Math.round((clampPct(percent) / 100) * BAR.width)

const tick = (percent: number, color: string) =>
  `<rect x="${Math.min(BAR.width - 2, Math.max(0, at(percent) - 1))}" width="2" height="${BAR.tick}" fill="${color}"/>`

export const bar = (percent: number, marks: { percent: number; color: string }[]) => {
  const r = BAR.height / 2
  const y = (BAR.tick - BAR.height) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR.width}" height="${BAR.tick}"><rect y="${y}" width="${BAR.width}" height="${BAR.height}" rx="${r}" fill="#888" fill-opacity="0.25"/><rect y="${y}" width="${at(percent)}" height="${BAR.height}" rx="${r}" fill="${FILL[tone(percent)]}"/>${marks.map(m => tick(m.percent, m.color)).join('')}</svg>`
}
