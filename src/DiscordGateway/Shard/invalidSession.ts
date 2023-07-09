import * as Option from "@effect/data/Option"
import * as Effect from "@effect/io/Effect"
import * as Ref from "@effect/io/Ref"
import { Message } from "dfx/DiscordGateway/DiscordWS"
import { Reconnect } from "dfx/DiscordGateway/WS"
import * as Discord from "dfx/types"

export const fromPayload = (
  p: Discord.GatewayPayload,
  latestReady: Ref.Ref<Option.Option<Discord.ReadyEvent>>,
): Effect.Effect<never, never, Message> =>
  Effect.as(p.d ? Effect.unit : Ref.set(latestReady, Option.none()), Reconnect)
