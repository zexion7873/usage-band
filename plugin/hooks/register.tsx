import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { UsageBand, UsageBandDetail, UsageBandLimit } from '../types'
import { BAR, bar, clampPct, COMPACT_TICK, PACE_TICK, tone } from './bar'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)


const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'wk', spend_limit: 'spend' }
// Desktop row shares, in proportion to each block's widest likely content (`100%`, `199k/200k`, `+12%`, `6d23h`); they sum to 100.
const ROW_SHARE: Record<string, string> = { ctx: '28%', five_hour: '30%', seven_day: '30%', cache: '12%' }
const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 86_400_000 }

const TEXT_COLOR = { calm: undefined, hot: 'warning', over: 'error' } as const

// The desktop /context panel colours categories by rank, whatever their theme key: literals sampled from that panel.
const CONTEXT_SWATCH = ['#3987e5', '#d95926', '#189e71', '#c98502']
const CONTEXT_SWATCH_REST = '#97958d'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Under this share of the window elapsed, a straight-line forecast swings on every response.
const MIN_FORECAST_PCT = 10

const duration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return days > 0 ? `${days}d${hours}h` : hours > 0 ? `${hours}h${minutes % 60}m` : `${minutes}m`
}

const untilReset = (resetsAt: string | undefined, now: number) =>
  resetsAt === undefined ? '' : duration(Date.parse(resetsAt) - now)

const clockTime = (at: Date) => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`

// Local time of the reset; the weekday only when it is a day or more away.
const resetClock = (resetsAt: string, now: number) => {
  const at = new Date(resetsAt)
  return at.getTime() - now >= 86_400_000 ? `${DAYS[at.getDay()]} ${clockTime(at)}` : clockTime(at)
}

const line = (text: string, isWarning = false) => ({ text, isWarning })

// Where the window ends up if the rest of it burns at the rate so far; running out before the reset is a warning.
const forecast = (limit: SessionRateLimit, now: number) => {
  const span = WINDOW_MS[limit.kind]
  if (span === undefined || limit.resetsAt === undefined || limit.percentUsed >= 100) return undefined
  const left = Date.parse(limit.resetsAt) - now
  const elapsed = span - left
  if (left <= 0 || elapsed < (span * MIN_FORECAST_PCT) / 100) return undefined
  const atReset = (limit.percentUsed * span) / elapsed
  return atReset < 100
    ? line(`at this speed: ${Math.round(atReset)}% at reset`)
    : line(`at this speed: all used in ${duration((elapsed * (100 - limit.percentUsed)) / limit.percentUsed)}`, true)
}

// Share of the window already elapsed: usage above it is ahead of an even burn.
const pace = (limit: SessionRateLimit, now: number) => {
  const span = WINDOW_MS[limit.kind]
  if (span === undefined || limit.resetsAt === undefined) return undefined
  return Math.round(clampPct(100 * (1 - (Date.parse(limit.resetsAt) - now) / span)))
}

const tokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const detailOf = (breakdown: SessionContextBreakdown | undefined, window: number): UsageBandDetail | undefined => {
  if (breakdown === undefined) return undefined
  const api = breakdown.apiUsage
  const read = api?.cache_read_input_tokens ?? 0
  const input = api === null ? 0 : read + api.input_tokens + api.cache_creation_input_tokens
  return {
    compactPercent:
      breakdown.isAutoCompactEnabled && breakdown.autoCompactThreshold !== undefined
        ? Math.round((breakdown.autoCompactThreshold / window) * 100)
        : undefined,
    cacheHitPercent: input > 0 ? Math.round((read / input) * 100) : undefined,
    contextParts: breakdown.categories
      .filter(c => c.kind === 'used')
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5)
      .map(c => ({ name: c.name, tokens: c.tokens })),
  }
}

// Typed at a terminal, through Remote Control, or by the desktop app (an SDK host). An unknown kind leaves the step unshown, never wrong.
const YOUR_MESSAGE = new Set(['composer', 'bridge', 'sdk'])

// From the reading at your last message: a measure also fires each time a window crosses a whole point mid-turn.
// A window that reset since then has no step from it to show.
const withDeltas = (limits: SessionRateLimit[], before: UsageBandLimit[] | undefined): UsageBandLimit[] =>
  limits.map(limit => {
    const base = before?.find(b => b.kind === limit.kind && b.resetsAt === limit.resetsAt)?.base
    return base === undefined ? limit : { ...limit, base, delta: limit.percentUsed - base }
  })

const snapshot = (
  context: SessionContextUsage,
  rateLimits: UsageBandLimit[],
  cost: SessionCost | undefined,
  detail: UsageBandDetail | undefined,
): UsageBand => ({
  contextPercent: context.percent,
  contextTokens: context.tokens,
  contextWindow: context.window,
  rateLimits,
  costUsd: cost?.usd,
  detail,
})

const withContext = (prev: UsageBand, tokens: number): UsageBand => ({
  ...prev,
  contextTokens: tokens,
  contextPercent: Math.round(clampPct((100 * tokens) / prev.contextWindow)),
})

const seed = async ($: EngineInterface) => {
  const { context, rateLimits, cost } = await $.session.usage({ breakdown: 'summary' })
  await update($, usage, () => snapshot(context, rateLimits, cost, detailOf(context.breakdown, context.window)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await seed($)
    // Reset countdowns and pace ticks read the clock while drawing; without this an idle session freezes them.
    $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  // No session.start follows these, and /clear empties the session's state: without this the band vanishes until the next response.
  // Not compact: usage() there still holds the fill the compaction removed (session.compact writes it).
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await seed($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, prev => snapshot(e.context, withDeltas(e.rateLimits, prev?.rateLimits), e.cost, prev?.detail))
    // Second write so a failed breakdown leaves the headline figures current.
    if (e.changed.includes('context')) {
      const { context } = await $.session.usage({ breakdown: 'summary' })
      const detail = detailOf(context.breakdown, e.context.window)
      await update($, usage, prev => prev && { ...prev, detail })
    }
    return next(e)
  })

  // Not at turn.start: a background agent's report starts a main turn of its own, which would reset the step to 0.
  on('prompt.submit', async ($, e, next) => {
    if (YOUR_MESSAGE.has(e.origin.kind))
      await update($, usage, prev => prev && { ...prev, rateLimits: prev.rateLimits.map(l => ({ ...l, base: l.percentUsed })) })
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    // usage() keeps the last response's fill until a new response lands, and the next measure waits for the turn's end.
    if (result.skip !== undefined || result.tokensAfter === undefined || e.agentId !== undefined || e.trigger === 'precompute')
      return result
    const after = result.tokensAfter
    await update($, usage, prev => prev && withContext(prev, after))
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const detail = detailOf(context.breakdown, context.window)
    await update($, usage, prev => prev && { ...prev, detail })
    return result
  })

  // session.measure waits for the turn's end; a long turn would otherwise hold ctx at its starting fill.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (u === null || e.agentId !== undefined) return result
    const fill = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    await update($, usage, prev => prev && withContext(prev, fill))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const current = await read($, usage)
    if (e.props.hasSurvey || current === null) return below

    const now = await $.clock.now()
    const detail = current.detail
    const ctxPercent = current.contextPercent ?? 0
    const ctxDetail =
      current.contextTokens === undefined ? '' : `${tokens(current.contextTokens)}/${tokens(current.contextWindow)}`
    const meters = [
      {
        key: 'ctx',
        label: 'ctx',
        title: `ctx: ${ctxPercent}% used`,
        percent: ctxPercent,
        figure: `${ctxPercent}%`,
        detail: ctxDetail,
        moved: '',
        extra: detail?.compactPercent === undefined ? [] : [line(`auto-compact: at ${detail.compactPercent}%`)],
        // The summary breakdown is a local estimate; /context counts with the token-count API.
        parts: (detail?.contextParts ?? []).map((p, rank) => ({
          name: p.name,
          size: tokens(p.tokens),
          color: CONTEXT_SWATCH[rank] ?? CONTEXT_SWATCH_REST,
        })),
        marks: detail?.compactPercent === undefined ? [] : [{ percent: detail.compactPercent, color: COMPACT_TICK }],
      },
      ...current.rateLimits.map(limit => {
        const label = LABELS[limit.kind] ?? limit.kind
        // A reading only moves when a response lands, so an idle session can sit past a reset with the old fill.
        if (limit.resetsAt !== undefined && Date.parse(limit.resetsAt) <= now) {
          return {
            key: limit.kind,
            label,
            title: `${label}: reset`,
            percent: 0,
            // The window is the account's: other sessions may have spent since the reset, so no figure until a reading.
            figure: '—',
            detail: 'reset',
            moved: '',
            extra: [line(`reset at ${clockTime(new Date(limit.resetsAt))}`), line('new number after your next message')],
            parts: [],
            marks: [],
          }
        }
        const reset = untilReset(limit.resetsAt, now)
        const paceAt = pace(limit, now)
        const ahead = forecast(limit, now)
        // The engine reports one decimal; the CLI's own notice floors it, and floor never shows 100% early.
        const used = Math.floor(limit.percentUsed)
        // Readings come whole (seen on 2.1.300) or with a decimal; a whole step reads +1%, not +1.0%.
        const step = Math.round((limit.delta ?? 0) * 10) / 10
        const moved = step > 0 ? `+${step}%` : ''
        return {
          key: limit.kind,
          label,
          // Plain words: many readers of the card do not have English as a first language.
          title: `${label}: ${used}% used`,
          percent: used,
          figure: `${used}%`,
          detail: reset,
          moved,
          extra: [
            ...(moved === '' ? [] : [line(`since your last message: ${moved}`)]),
            ...(paceAt === undefined ? [] : [line(`time passed: ${paceAt}%`)]),
            ...(ahead === undefined ? [] : [ahead]),
            ...(limit.resetsAt === undefined ? [] : [line(`reset: ${resetClock(limit.resetsAt, now)}`)]),
          ],
          parts: [],
          marks: paceAt === undefined ? [] : [{ percent: paceAt, color: PACE_TICK }],
        }
      }),
    ]
    const cache = detail?.cacheHitPercent === undefined ? '' : `cache ${detail.cacheHitPercent}%`
    const cost = current.costUsd === undefined ? '' : `$${current.costUsd.toFixed(2)}`

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {below}
          {/* One Text, cut at the edge: a row of Texts wraps each meter in a column of its own once the line overflows. */}
          <Text wrap="truncate-end">
            {meters.map((m, i) => (
              <Text key={m.key}>
                <Text dimColor>{i > 0 ? ' · ' : ''}{m.label} </Text>
                <Text color={TEXT_COLOR[tone(m.percent)]} dimColor={tone(m.percent) === 'calm'}>{m.figure}</Text>
                {m.moved && <Text> {m.moved}</Text>}
                <Text dimColor>{m.detail && ` (${m.detail})`}</Text>
              </Text>
            ))}
            {cache && <Text dimColor> · {cache}</Text>}
            {cost && <Text dimColor> · {cost}</Text>}
          </Text>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)
    // A card line under its title, in grey: colour stays for what it means (ctx's ranked categories).
    const item = (l: { text: string; isWarning: boolean }) => (
      <Text key={l.text}>
        <Text color={CONTEXT_SWATCH_REST}>■ </Text>
        {l.isWarning ? <Text color="warning">{l.text}</Text> : <Text dimColor>{l.text}</Text>}
      </Text>
    )
    return (
      <Box flexDirection="column">
        {below}
        {/* Without wrap a narrow pane (split view) squeezes the meters until their text overlaps.
            One wrap row: a nested one took a whole line once it overflowed, pushing the cost onto a line alone. */}
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={0} rowGap={1}>
          {meters.map(m => (
            // A minimum, not a width: content past its share widens the block and wraps the row rather than overlapping.
            <Box key={m.key} flexDirection="row" alignItems="center" gap={0.5} minWidth={ROW_SHARE[m.key]}>
              <Text dimColor>{m.label}</Text>
              <Svg
                source={bar(m.percent, m.marks)}
                alt={[m.title, ...m.extra.map(l => l.text), ...m.parts.map(p => `${p.name} about ${p.size}`)].filter(Boolean).join(' · ')}
                width={BAR.width}
                height={BAR.tick}
              />
              {tone(m.percent) === 'calm' ? (
                <Text dimColor>{m.figure}</Text>
              ) : (
                <Text color={TEXT_COLOR[tone(m.percent)]}>{m.figure}</Text>
              )}
              {m.moved && <Text dimColor>{m.moved}</Text>}
              {m.detail && <Text dimColor>{m.detail}</Text>}
              {m.extra.length + m.parts.length > 0 && (
                // The desktop pops an absolute hover reveal above its keyed Box as a bordered card, whatever the offsets.
                <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
                  <Text>{m.title}</Text>
                  {m.extra.map(item)}
                  {m.parts.map(p => (
                    <Text key={p.name}>
                      <Text color={p.color}>■ </Text>
                      <Text dimColor>{`${p.name} ~${p.size}`}</Text>
                    </Text>
                  ))}
                </Box>
              )}
            </Box>
          ))}
          {/* The cost grows without bound and pushed itself off the row, so it waits in cache's card; with no cache, on the row. */}
          {(cache || cost) && (
            <Box key="cache" flexDirection="row" alignItems="center" justifyContent="flex-end" minWidth={ROW_SHARE.cache}>
              <Text dimColor>{cache || cost}</Text>
              {cache && cost && (
                <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
                  <Text>{`cost: ${cost}`}</Text>
                  {item(line('at API prices'))}
                  {item(line('a plan uses 5h and wk'))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
