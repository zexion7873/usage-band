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
const tooltip = 'ctx 42% · 84k/200k · compacts at 80% · Messages 50k · System tools 20k'

const PAD = 16
const ROW_Y = 78
const parts: string[] = []
const text = (x: number, s: string, fill = DIM) =>
  `<text x="${x}" y="${ROW_Y + FONT / 2 - 2}" fill="${fill}">${s}</text>`

let x = PAD
let ctxBarX = 0
for (const m of meters) {
  parts.push(text(x, m.label))
  x += m.label.length * CHAR + GAP
  if (m.label === 'ctx') ctxBarX = x
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

const tipWidth = Math.round(tooltip.length * 6 + 20)
const tipX = ctxBarX + BAR.width / 2 - 24
const tip = [
  `<rect x="${tipX}" y="14" width="${tipWidth}" height="28" rx="6" fill="#3a3936" stroke="#55534e"/>`,
  `<path d="M${tipX + 18} 42 l6 6 l6 -6 z" fill="#3a3936"/>`,
  `<text x="${tipX + 10}" y="32" fill="#e8e6e1">${tooltip}</text>`,
]

const height = 104
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="${FONT}">
<rect width="${width}" height="${height}" rx="10" fill="#262624"/>
${tip.join('\n')}
${parts.join('\n')}
</svg>
`
writeFileSync(out, svg)
console.log(`${out} ${width}x${height}`)
