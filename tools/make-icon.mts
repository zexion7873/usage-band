// Usage: node tools/make-icon.mts | rsvg-convert -o plugin/.claude-plugin/icon.png
// The marketplace takes the listing icon only from the first save or submission; a later change does not reach it.
import { BAR, bar, COMPACT_TICK, PACE_TICK } from '../plugin/hooks/bar.ts'

const SIZE = 1024
const SCALE = 9
const BG = '#1c2230'

const meters = [
  { percent: 42, marks: [{ percent: 80, color: COMPACT_TICK }] },
  { percent: 67, marks: [{ percent: 64, color: PACE_TICK }] },
  { percent: 89, marks: [{ percent: 59, color: PACE_TICK }] },
]

const x = (SIZE - BAR.width * SCALE) / 2
const rows = meters.map((m, i) => {
  const cy = SIZE / 2 + (i - 1) * 180
  return `<g transform="translate(${x} ${cy - (BAR.tick * SCALE) / 2}) scale(${SCALE})">${bar(m.percent, m.marks)}</g>`
})

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
${rows.join('\n')}
</svg>
`)
