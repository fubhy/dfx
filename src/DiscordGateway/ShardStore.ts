import { Tag } from "effect/Context"
import * as Option from "effect/Option"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export interface ClaimIdContext {
  sharderCount: number
  totalCount: number
}

export interface ShardStore {
  claimId: (
    ctx: ClaimIdContext,
  ) => Effect.Effect<never, never, Option.Option<number>>
  allClaimed: (totalCount: number) => Effect.Effect<never, never, boolean>
  heartbeat?: (shardId: number) => Effect.Effect<never, never, void>
}
export const ShardStore = Tag<ShardStore>()

// Very basic shard id store, that does no health checks
const memoryStore = (): ShardStore => {
  let currentId = 0

  return {
    claimId: ({ totalCount }) =>
      Effect.sync(() => {
        if (currentId >= totalCount) {
          return Option.none()
        }

        const id = currentId
        currentId++
        return Option.some(id)
      }),

    allClaimed: totalCount => Effect.sync(() => currentId >= totalCount),
  }
}

export const LiveMemoryShardStore = Layer.sync(ShardStore, memoryStore)
