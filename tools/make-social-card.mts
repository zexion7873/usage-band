// Usage: node tools/make-social-card.mts | rsvg-convert -o docs/social-card.png
// The bars come from the mod's own bar(); the text is plugin.json's description, so editing it stales the card.
// GitHub has no API for the social preview: the PNG is uploaded by hand at Settings → General → Social preview.
import { readFileSync } from 'node:fs'

import { BAR, bar, COMPACT_TICK, PACE_TICK } from '../hooks/bar.ts'

const plugin = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'))
const [tagline, accent] = (plugin.description as string).split(': ')
if (accent === undefined) throw new Error('plugin.json description no longer reads "<tagline>: <accent>"')

const W = 1280
const H = 640
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const BG = '#1c2230'
const ACCENT = '#5b8fe0'
const SCALE = 4
const TEXT_COLOR = { hot: '#d19a3c', over: '#d9605a' } as const

const meters = [
  { label: 'ctx', percent: 42, marks: [{ percent: 80, color: COMPACT_TICK }] },
  { label: '5h', percent: 67, tone: 'hot', marks: [{ percent: 64, color: PACE_TICK }] },
  { label: 'wk', percent: 89, tone: 'over', marks: [{ percent: 59, color: PACE_TICK }] },
] as const

const LABEL_X = 712
const BAR_X = 792
const PCT_X = BAR_X + BAR.width * SCALE + 20
const rows = meters.map((m, i) => {
  const y = 210 + i * 96
  const fill = 'tone' in m ? TEXT_COLOR[m.tone] : '#9ba3b0'
  return [
    `<text x="${LABEL_X}" y="${y + 11}" font-size="32" fill="#9ba3b0">${m.label}</text>`,
    `<g transform="translate(${BAR_X} ${y - (BAR.tick * SCALE) / 2}) scale(${SCALE})">${bar(m.percent, [...m.marks])}</g>`,
    `<text x="${PCT_X}" y="${y + 11}" font-size="32" font-weight="700" fill="${fill}">${m.percent}%</text>`,
  ].join('\n')
})

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="${BG}"/>
<text x="96" y="262" font-size="92" font-weight="700" fill="#f0f2f5">usage-band</text>
<text x="96" y="340" font-size="30" fill="#b8bec9">${tagline}</text>
<text x="96" y="392" font-size="30" font-weight="700" fill="${ACCENT}">${accent}</text>
<text x="96" y="446" font-size="23" fill="#7d8592">Desktop and terminal. No network, no model calls.</text>
${rows.join('\n')}
<rect x="${LABEL_X - 8}" y="472" width="${PCT_X + 92 - LABEL_X}" height="6" fill="${ACCENT}"/>
</svg>
`)
