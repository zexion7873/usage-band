// Usage: node tools/make-hero.mts [OUT.svg]   (no argument overwrites docs/band.svg)
// The bars come from the mod's own bar(); the figures are samples, and the text around them is laid out here.
import { writeFileSync } from 'node:fs'

import { BAR, bar, COMPACT_TICK, PACE_TICK } from '../plugin/hooks/bar.ts'

const out = process.argv[2] ?? new URL('../docs/band.svg', import.meta.url).pathname

const FONT = 12
const CHAR = 7
const GAP = 6
const DIM = '#9b9993'
const TEXT_COLOR = { hot: '#d19a3c', over: '#d9605a' } as const

const meters = [
  { label: 'ctx', percent: 42, detail: '84k/200k', marks: [{ percent: 80, color: COMPACT_TICK }] },
  { label: '5h', percent: 67, detail: '1h48m', tone: 'hot', marks: [{ percent: 64, color: PACE_TICK }] },
  { label: 'wk', percent: 89, detail: '2d21h', tone: 'over', marks: [{ percent: 59, color: PACE_TICK }] },
] as const

const PAD = 16
const ROW_Y = 26
const parts: string[] = []
const text = (x: number, s: string, fill = DIM) =>
  `<text x="${x}" y="${ROW_Y + FONT / 2 - 2}" fill="${fill}">${s}</text>`

let x = PAD
for (const m of meters) {
  parts.push(text(x, m.label))
  x += m.label.length * CHAR + GAP
  parts.push(bar(m.percent, [...m.marks]).replace('<svg ', `<svg x="${x}" y="${ROW_Y - BAR.tick / 2}" `))
  x += BAR.width + GAP
  parts.push(text(x, `${m.percent}%`, 'tone' in m ? TEXT_COLOR[m.tone] : DIM))
  x += `${m.percent}%`.length * CHAR + GAP
  parts.push(text(x, m.detail))
  x += m.detail.length * CHAR + 3 * CHAR
}
parts.push(text(x, 'cache 83%'))
const cost = '$1.23'
const width = x + 'cache 83%'.length * CHAR + 6 * CHAR + cost.length * CHAR + PAD
parts.push(`<text x="${width - PAD}" y="${ROW_Y + FONT / 2 - 2}" fill="${DIM}" text-anchor="end">${cost}</text>`)

const height = 52
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="${FONT}">
<rect width="${width}" height="${height}" rx="10" fill="#262624"/>
${parts.join('\n')}
</svg>
`
writeFileSync(out, svg)
console.log(`${out} ${width}x${height}`)
