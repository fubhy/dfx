import { millis } from "@effect/data/Duration"
import { ShardStore } from "./ShardStore.js"
import { LiveShard, Shard } from "./Shard.js"
import { LiveRateLimiter } from "dfx"

const make = Do($ => {
  const store = $(Effect.service(ShardStore))
  const rest = $(Effect.service(DiscordREST))
  const { gateway: config } = $(Effect.service(DiscordConfig.DiscordConfig))
  const limiter = $(Effect.service(RateLimiter))
  const shard = $(Shard.access)

  const takeConfig = (totalCount: number) =>
    Do($ => {
      const currentCount = $(Ref.make(0))

      const claimId = (sharderCount: number): Effect<never, never, number> =>
        store
          .claimId({
            totalCount,
            sharderCount,
          })
          .flatMap(a =>
            a.match(
              () => claimId(sharderCount).delay(Duration.minutes(3)),
              id => Effect.succeed(id),
            ),
          )

      return currentCount
        .getAndUpdate(_ => _ + 1)
        .flatMap(claimId)
        .map(id => ({ id, totalCount } as const))
    })

  const gateway = $(
    rest
      .getGatewayBot()
      .flatMap(r => r.json)
      .catchAll(() =>
        Effect.succeed<Discord.GetGatewayBotResponse>({
          url: "wss://gateway.discord.gg/",
          shards: 1,
          session_start_limit: {
            total: 0,
            remaining: 0,
            reset_after: 0,
            max_concurrency: 1,
          },
        }),
      ),
  )

  const run = (hub: Hub<Discord.GatewayPayload<Discord.ReceiveEvent>>) =>
    Do($ => {
      const deferred = $(Deferred.make<never, never>())
      const take = $(takeConfig(config.shardCount ?? gateway.shards))

      const spawner = take
        .map(config => ({
          ...config,
          url: gateway.url,
          concurrency: gateway.session_start_limit.max_concurrency,
        }))
        .tap(({ id, concurrency }) =>
          limiter.maybeWait(
            `dfx.sharder.${id % concurrency}`,
            millis(config.identifyRateLimit[0]),
            config.identifyRateLimit[1],
          ),
        )
        .flatMap(c => shard.connect([c.id, c.totalCount], hub))
        .flatMap(
          shard => shard.run.catchAllCause(_ => deferred.failCause(_)).fork,
        ).forever

      const spawners = Chunk.range(
        1,
        gateway.session_start_limit.max_concurrency,
      ).map(() => spawner)

      return $(
        spawners.collectAllParDiscard.zipParLeft(deferred.await) as Effect<
          never,
          never,
          never
        >,
      )
    })

  return { run } as const
})

export interface Sharder extends Effect.Success<typeof make> {}
export const Sharder = Tag<Sharder>()
export const LiveSharder =
  (LiveRateLimiter + LiveShard) >> Layer.scoped(Sharder, make)
