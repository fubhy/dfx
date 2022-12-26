import { Config, LiveDiscordREST, Log } from "dfx"
import { LiveJsonDiscordWSCodec } from "./DiscordGateway/DiscordWS/index.js"
import { LiveDiscordGateway } from "./DiscordGateway/index.js"
import { LiveSharder } from "./DiscordGateway/Sharder/index.js"
import { LiveMemoryShardStore } from "./DiscordGateway/ShardStore/index.js"
import { LiveHttp } from "./Http/index.js"
import { LiveMemoryRateLimitStore, LiveRateLimiter } from "./RateLimit/index.js"
import { Layer, Scope } from "./_common.js"

export * as CachePrelude from "./Cache/prelude.js"
export * as DiscordWS from "./DiscordGateway/DiscordWS/index.js"
export * as Gateway from "./DiscordGateway/index.js"
export * as Shard from "./DiscordGateway/Shard/index.js"
export * as ShardStore from "./DiscordGateway/ShardStore/index.js"
export * as WS from "./DiscordGateway/WS/index.js"
export { run as runIx } from "./Interactions/gateway.js"

const _layer = Layer.LayerTypeId

export const MemoryRateLimit = LiveMemoryRateLimitStore > LiveRateLimiter

export const MemoryREST = (LiveHttp + MemoryRateLimit) >> LiveDiscordREST

export const MemorySharder =
  (MemoryREST +
    LiveMemoryShardStore +
    MemoryRateLimit +
    LiveJsonDiscordWSCodec) >>
  LiveSharder

export const MemoryGateway = MemorySharder >> LiveDiscordGateway

export const MemoryBot = MemoryREST > MemoryGateway + MemoryRateLimit

export const make = (config: Config.MakeOpts, debug = false) => {
  const LiveLog = debug ? Log.LiveLogDebug : Log.LiveLog
  const LiveConfig = Config.makeLayer(config)
  const LiveEnv = LiveLog + LiveConfig > MemoryBot

  return LiveEnv
}
