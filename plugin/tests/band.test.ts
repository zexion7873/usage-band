import type { On, SessionContextBreakdown, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

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
  expect(alts[0]).toBe('ctx 42% · 84k/200k · compacts at 80% · Messages about 50k · System tools about 20k')
  // The reset clock is the machine's local time, so only its shape is pinned.
  expect(alts[1]).toMatch(/^5h 12% · 3h20m · 33% of window elapsed · at the rate so far: 36% by reset · resets \d\d:\d\d$/)
  expect(alts[2]).toMatch(
    /^wk 89% · 2d21h · 59% of window elapsed · at the rate so far: full in 12h14m · resets (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d:\d\d$/,
  )
  expect((await desktop.find({ type: 'Text', text: /^at the rate so far: full in 12h14m$/ }))?.props.color).toBe('warning')
  expect((await desktop.find({ type: 'Text', text: /^at the rate so far: 36% by reset$/ }))?.props.color).toBeUndefined()
  const [ctx, fiveHour, wk] = await desktop.findAll({ type: 'Svg' })
  expect(wk?.props.isInteractive).toBeUndefined()
  expect(ctx?.props.source).toContain('<rect x="63" width="2" height="12" fill="#c04742"/>')
  expect(fiveHour?.props.source).toContain('<rect x="25" width="2" height="12" fill="#9c9c9c"/>')
  expect(await desktop.find({ type: 'Text', text: /^cache 83%$/ })).toBeDefined()
  expect(wk?.props.source).toContain('#c04742')
  expect((await desktop.find({ type: 'Text', text: /^89%$/ }))?.props.color).toBe('error')
  expect((await desktop.find({ type: 'Text', text: /^42%$/ }))?.props.dimColor).toBe(true)
  expect(await desktop.find({ type: 'Text', text: /^84k\/200k$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^2d21h$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^3h20m$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^\$1\.23$/ })).toBeDefined()
  await desktop.unmount()
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

test('band shows the context a compaction leaves, not the one it removed', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  const summary: SessionMessage = { role: 'user', text: 'summary', toolUses: [] }
  on('session.compact', () => ({ messages: [summary], tokensAfter: 14000 }))
  await $.session.measure({ context: { tokens: 84000, window: 200000, percent: 42 }, rateLimits: [], changed: ['context'] })

  await $.session.compact({ trigger: 'manual', messages: [summary] })

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
  expect(ctx?.props.alt).toBe('ctx 0% · compacts at 16% · System prompt about 5k · Messages about 412')
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
  expect(await desktop.find({ type: 'Text', text: /^ctx 0%$/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: /^compacts at 16%$/ })).toBeDefined()
  const [ctx] = await desktop.findAll({ type: 'Svg' })
  expect(ctx?.props.alt).toBe(
    'ctx 0% · compacts at 16% · Messages about 6k · MCP tools about 5k · System tools about 4k · Memory files about 3k · Custom agents about 2k',
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
  expect(fiveHour?.props.alt).toMatch(/^5h 12% · 4h40m · 7% of window elapsed · resets \d\d:\d\d$/)
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
  const rows = (await desktop.findAll({ type: 'Box' })).filter(b => b.props.flexDirection === 'row' && b.props.gap !== 1)
  expect(rows.map(b => b.props.flexWrap)).toEqual(['wrap', 'wrap'])
  expect(rows.map(b => b.props.rowGap)).toEqual([1, 1])
  await desktop.unmount()
})
