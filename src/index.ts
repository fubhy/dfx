export * as Config from "./DiscordConfig/index.js"
export * as DiscordWS from "./DiscordGateway/DiscordWS/index.js"
export * as Gateway from "./DiscordGateway/index.js"
export { DiscordREST, LiveDiscordREST, rest } from "./DiscordREST/index.js"
export * as Ix from "./Interactions/index.js"
export * as Log from "./Log/index.js"
export * as RateLimitStore from "./RateLimitStore/index.js"

export const LiveRateLimit =
  RateLimitStore.LiveMemoryRateLimitStore > RateLimitStore.LiveRateLimiter

export const LiveREST = LiveRateLimit > Rest.LiveDiscordREST

export const LiveGateway =
  LiveREST + ShardStore.LiveMemoryShardStore + DWS.LiveJsonDiscordWSCodec >
  Gateway.LiveDiscordGateway

export const LiveBot = LiveREST + LiveGateway

export const makeLayer = (config: Config.MakeOpts, debug = false) => {
  const LiveLog = debug ? Log.LiveLogDebug : Log.LiveLog
  const LiveConfig = Config.makeLayer(config)
  const LiveEnv = LiveLog + LiveConfig > LiveBot

  return LiveEnv
}
