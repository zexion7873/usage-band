export type UsageBandLimit = { kind: string; percentUsed: number; resetsAt?: string }

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
  costUsd?: number
  detail?: UsageBandDetail
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: UsageBand | null }
  }
}
