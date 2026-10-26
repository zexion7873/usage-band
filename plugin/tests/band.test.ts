import type { On, SessionContextBreakdown, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'

import { bar } from '../hooks/bar'

const NOW = Date.parse('2026-10-06T00:00:00Z')

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const

const BREAKDOWN = {
  categories: [
    { name: 'Messages', tokens: 50000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'System tools', tokens: 20000, color: 'inactive', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 100000, color: 'inactive', isDeferred: false, kind: 'free' },
  ],
  isAutoCompactEnabled: true,
  autoCompactThreshold: 160000,
  apiUsage: { input_tokens: 4000, output_tokens: 900, cache_read_input_tokens: 70000, cache_creation_input_tokens: 10000 },
} as unknown as SessionContextBreakdown

const engine = (on: On) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { tokens: 84000, window: 200000, percent: 42, breakdown: BREAKDOWN },
      rateLimits: [],
    },
  }))
  on('classic.SessionStart', () => ({}))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
}

test('band shows context fill and each rate-limit window with time to reset', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-06T03:20:00Z' },
      { kind: 'seven_day', percentUsed: 89, resetsAt: '2026-10-08T21:00:00Z' },
    ],
    cost: { usd: 1.234 },
    changed: ['context', 'rateLimits'],
  })

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await terminal.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(texts).toContain('42%')
  expect(texts).toContain('(84k/200k)')
  expect(texts).toContain('$1.23')
  expect(texts).toContain('(3h20m)')
  expect(texts).toContain('(2d21h)')
  expect(texts).toContain('cache 83%')
  expect((await terminal.find({ type: 'Text', text: /^89%$/ }))?.props.color).toBe('error')
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const alts = (await desktop.findAll({ type: 'Svg' })).map(s => s.props.alt)
  expect(alts[0]).toBe('ctx: 42% used · auto-compact: at 80% · Messages about 50k · System tools about 20k')
  // The reset clock is the machine's local time, so only its shape is pinned.
  expect(alts[1]).toMatch(/^5h: 12% used · time passed: 33% · at this speed: 36% at reset · reset: \d\d:\d\d$/)
  expect(alts[2]).toMatch(
    /^wk: 89% used · time passed: 59% · at this speed: all used in 12h14m · reset: (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d:\d\d$/,
  )
  expect((await desktop.find({ type: 'Text', text: /^at this speed: all used in 12h14m$/ }))?.props.color).toBe('warning')
  expect((await desktop.find({ type: 'Text', text: /^at this speed: 36% at reset$/ }))?.props.color).toBeUndefined()
  const [ctx, fiveHour, wk] = await desktop.findAll({ type: 'Svg' })
  expect(wk?.props.isInteractive).toBeUndefined()
  expect(ctx?.props.source).toContain('<rect x="47" width="2" height="12" fill="#c04742"/>')
  expect(fiveHour?.props.source).toContain('<rect x="19" width="2" height="12" fill="#9c9c9c"/>')
  expect(await desktop.find({ type: 'Text', text: /^cache 83%$/ })).toBeDefined()
  expect(wk?.props.source).toContain('#c04742')
  // wk's 59% pace tick sits inside its 89% fill: white across the fill, grey stubs above and below.
  expect(wk?.props.source).toContain(
    '<rect x="34" width="2" height="2" fill="#9c9c9c"/><rect x="34" y="2" width="2" height="8" fill="#fff"/><rect x="34" y="10" width="2" height="2" fill="#9c9c9c"/>',
  )
  expect((await desktop.find({ type: 'Text', text: /^89%$/ }))?.props.color).toBe('error')
  expect((await desktop.find({ type: 'Text', text: /^42%$/ }))?.props.dimColor).toBe(true)
  expect(await desktop.find({ type: 'Text', text: /^84k\/200k$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^2d21h$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^3h20m$/ })).toBeDefined()
  // The cost moved into cache's card: it grows without bound and pushed itself off the row.
  expect(await desktop.find({ type: 'Text', text: /^\$1\.23$/ })).toBeUndefined()
  expect(await desktop.find({ type: 'Text', text: /^cost: \$1\.23$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^at API prices$/ })).toBeDefined()
  await desktop.unmount()
})

test('a tick level with the fill, or on an empty bar, keeps its own colour', async () => {
  // 66% and 67% both land on pixel 40: the fill has reached the tick, not passed it.
  expect(bar(66, [{ percent: 67, color: '#9c9c9c' }])).toContain('<rect x="39" width="2" height="12" fill="#9c9c9c"/>')
  expect(bar(0, [{ percent: 0, color: '#9c9c9c' }])).toContain('<rect x="0" width="2" height="12" fill="#9c9c9c"/>')
  expect(bar(0, [{ percent: 0, color: '#9c9c9c' }])).not.toContain('#fff')
})

test('band keeps what the plugins beneath it drew', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return Box({ children: Text({ children: 'beneath' }) })
  })
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [],
    changed: ['context'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /^beneath$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('reset countdown keeps moving while the session sits idle', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-06T03:20:00Z' }],
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^3h20m$/ })).toBeDefined()
  await clock.advance(10 * 60_000)
  expect(await ui.find({ type: 'Text', text: /^3h10m$/ })).toBeDefined()
  await ui.unmount()
})

test('a window an idle session sat past the reset of reads reset and a dash, not its old fill or a 0 it never read', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 89, resetsAt: '2026-10-06T03:20:00Z' }],
    changed: ['context', 'rateLimits'],
  })
  await clock.advance(3 * 3_600_000 + 30 * 60_000)

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: /^reset$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^89%$/ })).toBeUndefined()
  // Other sessions on the account may have spent since the reset: 0% would be a reading nobody took.
  expect(await desktop.find({ type: 'Text', text: /^0%$/ })).toBeUndefined()
  expect(await desktop.find({ type: 'Text', text: /^—$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^0m$/ })).toBeUndefined()
  const [, fiveHour] = await desktop.findAll({ type: 'Svg' })
  expect(fiveHour?.props.source).not.toContain('#9c9c9c')
  expect(fiveHour?.props.alt).toMatch(/^5h: reset · reset at \d\d:\d\d · new number after your next message$/)
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const line = (await terminal.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(line).toContain('5h — (reset)')
  expect(line).not.toContain('5h 0%')
  await terminal.unmount()
})

test('rate-limit figures read whole percents, and minutes alone under an hour', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-06T00:45:00Z' }],
    changed: ['context', 'rateLimits'],
  })

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: /^23%$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^45m$/ })).toBeDefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await terminal.findAll({ type: 'Text' })).map(t => t.text).join('|')
  expect(texts).toContain('23%')
  expect(texts).toContain('(45m)')
  await terminal.unmount()
})

const measureFiveHour = ($: Engine, percentUsed: number, resetsAt: string) =>
  $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed, resetsAt },
      { kind: 'seven_day', percentUsed: 89, resetsAt: '2026-10-08T21:00:00Z' },
    ],
    changed: ['context', 'rateLimits'],
  })

const submit = ($: Engine, text: string, kind: 'composer' | 'sdk' | 'task-notification') =>
  $.prompt.submit({ text, wait: false, origin: { kind } })

const terminalLine = async (ui: Mounted<'terminal', 'AbovePrompt'>) =>
  (await ui.findAll({ type: 'Text' })).filter(t => t.props.wrap !== undefined).map(t => t.text)

test('a rate-limit window shows how far it moved since your last message, until a reading replaces it', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  const line = (fiveHour: string) => [`ctx 42% (84k/200k) · 5h ${fiveHour} (3h20m) · wk 89% (2d21h) · cache 83%`]
  await measureFiveHour($, 12, '2026-10-06T03:20:00Z')
  await submit($, 'go', 'composer')
  // A measure fires as the window crosses a whole point mid-turn, and again as the turn ends.
  await measureFiveHour($, 13, '2026-10-06T03:20:00Z')
  await measureFiveHour($, 13, '2026-10-06T03:20:00Z')

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminalLine(terminal)).toEqual(line('13% +1%'))

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const [, fiveHour, wk] = await desktop.findAll({ type: 'Svg' })
  expect(fiveHour?.props.alt).toMatch(/^5h: 13% used · since your last message: \+1% · time passed: 33% · /)
  expect(wk?.props.alt).not.toContain('since your last message')
  expect(await desktop.find({ type: 'Text', text: /^since your last message: \+1%$/ })).toBeDefined()
  expect((await desktop.findAll({ type: 'Text', text: /^\+/ })).map(t => t.text)).toEqual(['+1%'])
  await desktop.unmount()

  // A background agent's report starts a main turn of its own, through a submission that is not yours.
  await submit($, '<agent-message from="a1">', 'task-notification')
  await $.turn.start({ text: '<agent-message from="a1">', turnId: 'w1' })
  // A reading with a decimal keeps it.
  await measureFiveHour($, 13.4, '2026-10-06T03:20:00Z')
  expect(await terminalLine(terminal)).toEqual(line('13% +1.4%'))

  await submit($, 'again', 'sdk')
  expect(await terminalLine(terminal)).toEqual(line('13% +1.4%'))
  await measureFiveHour($, 13.4, '2026-10-06T03:20:00Z')
  expect(await terminalLine(terminal)).toEqual(line('13%'))
  await terminal.unmount()
})

test('a window that reset since your last message shows no change from the old one', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  await measureFiveHour($, 0.5, '2026-10-06T03:20:00Z')
  await submit($, 'go', 'composer')
  await clock.advance(3 * 3_600_000 + 30 * 60_000)
  await measureFiveHour($, 2, '2026-10-06T08:20:00Z')

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminalLine(terminal)).toEqual(['ctx 42% (84k/200k) · 5h 2% (4h50m) · wk 89% (2d17h) · cache 83%'])
  await terminal.unmount()
})

test('band shows the context a compaction leaves, not the one it removed', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  const summary: SessionMessage = { role: 'user', text: 'summary', toolUses: [] }
  on('session.compact', () => ({ messages: [summary], tokensAfter: 14000 }))
  await $.session.measure({ context: { tokens: 84000, window: 200000, percent: 42 }, rateLimits: [], changed: ['context'] })

  await $.session.compact({ trigger: 'manual', messages: [summary] })
  // usage() still holds the removed fill here; re-reading it on this source would undo the compaction.
  await $.classic.SessionStart({ source: 'compact' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^7%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^14k\/200k$/ })).toBeDefined()
  await ui.unmount()
})

test('band follows the context through a turn, step by step', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 150000, cache_creation_input_tokens: 9000, model: 'm' }
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage }
  })
  await $.session.measure({ context: { tokens: 84000, window: 200000, percent: 42 }, rateLimits: [], changed: ['context'] })
  const step = async (agentId?: string) => {
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 3, agentId })
    for await (const _ of stream);
    return stream.result
  }

  await step('sub')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()

  await step()
  expect(await ui.find({ type: 'Text', text: /^80%$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^160k\/200k$/ })).toBeDefined()
  await ui.unmount()
})

for (const source of ['clear', 'resume', 'fork'] as const) {
  // The session's state starts empty after these, and no session.start follows.
  test(`band redraws at once after a ${source}, not at the next response`, async ($, on) => {
    mock.clock(on, { now: NOW })
    engine(on)
    await $.classic.SessionStart({ source })

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
    await ui.unmount()
  })
}

test('band stays out of the way until the first measurement', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
  await ui.unmount()
})


test('band keeps small context categories readable', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: {
        window: 1_000_000,
        breakdown: {
          ...BREAKDOWN,
          categories: [
            { name: 'System prompt', tokens: 5000, color: 'inactive', isDeferred: false, kind: 'used' },
            { name: 'Messages', tokens: 412, color: 'promptBorder', isDeferred: false, kind: 'used' },
          ],
        },
      },
      rateLimits: [],
    },
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const [ctx] = await desktop.findAll({ type: 'Svg' })
  expect(ctx?.props.alt).toBe('ctx: 0% used · auto-compact: at 16% · System prompt about 5k · Messages about 412')
  await desktop.unmount()
})

test('desktop meter with detail reveals it in a hover card; one without draws none', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: {
        window: 1_000_000,
        breakdown: {
          ...BREAKDOWN,
          categories: [
            { name: 'Skills', tokens: 1000, color: 'warning', isDeferred: false, kind: 'used' },
            { name: 'Messages', tokens: 6000, color: 'purple_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
            { name: 'MCP tools', tokens: 5000, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
            { name: 'System tools', tokens: 4000, color: 'inactive', isDeferred: false, kind: 'used' },
            { name: 'Memory files', tokens: 3000, color: 'claude', isDeferred: false, kind: 'used' },
            { name: 'Custom agents', tokens: 2000, color: 'permission', isDeferred: false, kind: 'used' },
          ],
        },
      },
      rateLimits: [],
    },
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  await $.session.measure({
    context: { window: 1_000_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 12 }],
    changed: ['context', 'rateLimits'],
  })

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const cards = (await desktop.findAll({ type: 'Box' })).filter(b => b.props.display === 'none')
  // FoundElement carries no `hover`, so the reveal itself is checked by eye on the desktop.
  expect(cards.map(b => b.props.position)).toEqual(['absolute'])
  expect(await desktop.find({ type: 'Text', text: /^ctx: 0% used$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^auto-compact: at 16%$/ })).toBeDefined()
  const [ctx] = await desktop.findAll({ type: 'Svg' })
  expect(ctx?.props.alt).toBe(
    'ctx: 0% used · auto-compact: at 16% · Messages about 6k · MCP tools about 5k · System tools about 4k · Memory files about 3k · Custom agents about 2k',
  )
  expect(await desktop.find({ type: 'Text', text: /^Messages ~6k$/ })).toBeDefined()
  // Hex values as sampled from the desktop /context panel, which colours the four largest and greys the rest.
  const swatches = await desktop.findAll({ type: 'Text', text: /^■ $/ })
  expect(swatches.map(s => s.props.color)).toEqual(['#3987e5', '#d95926', '#189e71', '#c98502', '#97958d'])
  await desktop.unmount()
})

test('rate-limit forecast waits until a tenth of the window has passed', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-06T04:40:00Z' }],
    changed: ['context', 'rateLimits'],
  })

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const [, fiveHour] = await desktop.findAll({ type: 'Svg' })
  expect(fiveHour?.props.alt).toMatch(/^5h: 12% used · time passed: 7% · reset: \d\d:\d\d$/)
  await desktop.unmount()
})

test('desktop band wraps its meters in a narrow pane instead of overlapping them', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-06T03:20:00Z' }],
    cost: { usd: 1.234 },
    changed: ['context', 'rateLimits'],
  })

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // One wrap row for meters and cache: a nested wrap row took a whole line once it overflowed.
  const rows = (await desktop.findAll({ type: 'Box' })).filter(b => b.props.flexWrap !== undefined)
  expect(rows.map(b => [b.props.flexWrap, b.props.rowGap])).toEqual([['wrap', 1]])
  // Each block holds a share of the row sized to its widest likely content; the shares sum to the whole row, so no gap.
  expect(rows.map(b => b.props.columnGap)).toEqual([0])
  const meters = (await desktop.findAll({ type: 'Box' })).filter(b => b.props.gap !== undefined)
  expect(meters.map(b => b.props.gap)).toEqual([0.5, 0.5])
  const shares = (await desktop.findAll({ type: 'Box' })).filter(b => b.props.minWidth !== undefined)
  expect(shares.map(b => b.props.minWidth)).toEqual(['28%', '30%', '12%'])
  expect((await desktop.findAll({ type: 'Box' })).filter(b => b.props.flexGrow !== undefined)).toEqual([])
  await desktop.unmount()
})

test('desktop band keeps the cost on the row while there is no cache figure to hang its card on', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { tokens: 84000, window: 200000, percent: 42 }, rateLimits: [] } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [],
    cost: { usd: 1.234 },
    changed: ['context'],
  })

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: /^\$1\.23$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^cost: / })).toBeUndefined()
  await desktop.unmount()
})

test('terminal band stays one line, cut at the edge rather than wrapped meter by meter', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-06T03:20:00Z' }],
    cost: { usd: 1.234 },
    changed: ['context', 'rateLimits'],
  })

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const lines = (await terminal.findAll({ type: 'Text' })).filter(t => t.props.wrap !== undefined)
  expect(lines.map(t => [t.props.wrap, t.text])).toEqual([
    ['truncate-end', 'ctx 42% (84k/200k) · 5h 12% (3h20m) · cache 83% · $1.23'],
  ])
  await terminal.unmount()
})
