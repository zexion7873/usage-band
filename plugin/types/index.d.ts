export type UsageBandRise = { pct: number; at: number }

export type UsageBandLimit = {
  kind: string
  percentUsed: number
  resetsAt?: string
  base?: number
  delta?: number
  rises?: UsageBandRise[]
}

export type UsageBandPart = { name: string; tokens: number }

export type UsageBandDetail = {
  compactPercent?: number
  cacheHitPercent?: number
  contextParts: UsageBandPart[]
}

export type UsageBand = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  rateLimits: UsageBandLimit[]
  limitsPending?: boolean
  readAt?: number
  basePending?: boolean
  costUsd?: number
  detail?: UsageBandDetail
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: UsageBand | null; warned: string[] }
  }
}
