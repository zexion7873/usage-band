import { atom, read, update } from 'claude-code'
import type { Register, SessionContextBreakdown, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { UsageBand, UsageBandDetail } from '../types'
import { BAR, bar, clampPct, COMPACT_TICK, PACE_TICK, tone } from './bar'

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)


const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'wk', spend_limit: 'spend' }
const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 86_400_000 }

const TEXT_COLOR = { calm: undefined, hot: 'warning', over: 'error' } as const

const untilReset = (resetsAt: string | undefined, now: number) => {
  if (resetsAt === undefined) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return days > 0 ? `${days}d${hours}h` : `${hours}h${minutes % 60}m`
}

// Share of the window already elapsed: usage above it is ahead of an even burn.
const pace = (limit: SessionRateLimit, now: number) => {
  const span = WINDOW_MS[limit.kind]
  if (span === undefined || limit.resetsAt === undefined) return undefined
  return Math.round(clampPct(100 * (1 - (Date.parse(limit.resetsAt) - now) / span)))
}

// An image Svg shows no tooltip: hover reaches a <title> only in an isInteractive frame.
const titled = (svg: string, text: string) =>
  svg.replace('>', `><title>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>`)

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
      .slice(0, 3)
      .map(c => ({ name: c.name, tokens: c.tokens })),
  }
}

const snapshot = (
  context: SessionContextUsage,
  rateLimits: SessionRateLimit[],
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const { context, rateLimits, cost } = await $.session.usage({ breakdown: 'summary' })
    await update($, usage, () => snapshot(context, rateLimits, cost, detailOf(context.breakdown, context.window)))
    // Reset countdowns and pace ticks read the clock while drawing; without this an idle session freezes them.
    $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, prev => snapshot(e.context, e.rateLimits, e.cost, prev?.detail))
    // Second write so a failed breakdown leaves the headline figures current.
    if (e.changed.includes('context')) {
      const { context } = await $.session.usage({ breakdown: 'summary' })
      const detail = detailOf(context.breakdown, e.context.window)
      await update($, usage, prev => prev && { ...prev, detail })
    }
    return next(e)
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
        percent: ctxPercent,
        detail: ctxDetail,
        extra: [
          ...(detail?.compactPercent === undefined ? [] : [`compacts at ${detail.compactPercent}%`]),
          ...(detail?.contextParts ?? []).map(p => `${p.name} ${tokens(p.tokens)}`),
        ],
        marks: detail?.compactPercent === undefined ? [] : [{ percent: detail.compactPercent, color: COMPACT_TICK }],
      },
      ...current.rateLimits.map(limit => {
        const label = LABELS[limit.kind] ?? limit.kind
        const reset = untilReset(limit.resetsAt, now)
        const paceAt = pace(limit, now)
        return {
          key: limit.kind,
          label,
          percent: limit.percentUsed,
          detail: reset,
          extra: paceAt === undefined ? [] : [`pace ${paceAt}%`],
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
          <Box>
            {meters.map((m, i) => (
              <Text key={m.key}>
                <Text dimColor>{i > 0 ? ' · ' : ''}{m.label} </Text>
                <Text color={TEXT_COLOR[tone(m.percent)]} dimColor={tone(m.percent) === 'calm'}>{m.percent}%</Text>
                <Text dimColor>{m.detail && ` (${m.detail})`}</Text>
              </Text>
            ))}
            {cache && <Text dimColor> · {cache}</Text>}
            {cost && <Text dimColor> · {cost}</Text>}
          </Box>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box flexDirection="row" alignItems="center" gap={3}>
            {meters.map(m => {
              const summary = [`${m.label} ${m.percent}%`, m.detail, ...m.extra].filter(Boolean).join(' · ')
              return (
                <Box key={m.key} flexDirection="row" alignItems="center" gap={1}>
                  <Text dimColor>{m.label}</Text>
                  <Svg
                    source={titled(bar(m.percent, m.marks), summary)}
                    alt={summary}
                    width={BAR.width}
                    height={BAR.tick}
                    isInteractive
                  />
                  {tone(m.percent) === 'calm' ? (
                    <Text dimColor>{m.percent}%</Text>
                  ) : (
                    <Text color={TEXT_COLOR[tone(m.percent)]}>{m.percent}%</Text>
                  )}
                  {m.detail && <Text dimColor>{m.detail}</Text>}
                </Box>
              )
            })}
            {cache && <Text dimColor>{cache}</Text>}
          </Box>
          {cost && <Text dimColor>{cost}</Text>}
        </Box>
      </Box>
    )
  })
}
