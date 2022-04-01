import * as T from "@effect-ts/core/Effect"
import { pipe } from "@effect-ts/core/Function"
import * as O from "@effect-ts/core/Option"
import * as CB from "callbag-effect-ts"
import * as Config from "../DiscordConfig"
import { rest } from "../DiscordREST"
import { GetGatewayBotResponse } from "../types"
import * as Shard from "./Shard"
import * as Store from "./ShardStore"

const configs = (totalCount: number) =>
  pipe(
    CB.resource(0, (sharderCount) =>
      pipe(
        Store.claimId({
          totalCount,
          sharderCount,
        }),
        T.chain(
          O.fold(
            () =>
              T.delay_(
                T.succeed([O.some(sharderCount), CB.empty] as const),
                3 * 60 * 1000,
              ),
            (id) => T.succeed([O.some(sharderCount + 1), CB.of(id)] as const),
          ),
        ),
        CB.fromEffect,
      ),
    ),
    CB.map((id) => ({
      id,
      totalCount,
    })),
  )

export const spawn = pipe(
  rest.getGatewayBot(),
  T.catchAll(() =>
    T.succeed<GetGatewayBotResponse>({
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

  T.zipPar(Config.gateway),
  T.map(({ tuple: [r, gateway] }) =>
    CB.map_(configs(gateway.shardCount ?? r.shards), (config) => ({
      ...config,
      url: r.url,
      concurrency: r.session_start_limit.max_concurrency,
    })),
  ),
  CB.unwrap,

  CB.groupBy((c) => c.id % c.concurrency),
  CB.chainPar(([config, key]) =>
    pipe(
      config,
      // TODO: apply rate limits for key
      CB.chain((c) => CB.fromManaged(Shard.make([c.id, c.totalCount], c.url))),
    ),
  ),

  CB.chainPar((shard) => CB.merge_(CB.of(shard), shard.effects)),
)
