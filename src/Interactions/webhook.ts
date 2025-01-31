import * as Chunk from "effect/Chunk"
import { Tag } from "effect/Context"
import { identity } from "effect/Function"
import * as Option from "effect/Option"
import type * as Cause from "effect/Cause"
import type * as Config from "effect/Config"
import type * as ConfigError from "effect/ConfigError"
import * as Secret from "effect/Secret"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as D from "dfx/Interactions/definitions"
import type { DefinitionNotFound } from "dfx/Interactions/handlers"
import { handlers } from "dfx/Interactions/handlers"
import type {
  DiscordInteraction,
  InteractionBuilder,
} from "dfx/Interactions/index"
import { Interaction } from "dfx/Interactions/index"
import type * as Discord from "dfx/types"
import * as Verify from "discord-verify"

export class BadWebhookSignature {
  readonly _tag = "BadWebhookSignature"
}

export type Headers = Record<string, string | Array<string> | undefined>

const checkSignature = (
  publicKey: string,
  headers: Headers,
  body: string,
  crypto: SubtleCrypto,
  algorithm: any,
) =>
  Option.all({
    signature: Option.fromNullable(headers["x-signature-ed25519"]),
    timestamp: Option.fromNullable(headers["x-signature-timestamp"]),
  }).pipe(
    Effect.flatMap(_ =>
      Effect.promise(() =>
        Verify.verify(
          body,
          _.signature as string,
          _.timestamp as string,
          publicKey,
          crypto,
          algorithm,
        ),
      ),
    ),
    Effect.filterOrFail(identity, () => new BadWebhookSignature()),
    Effect.catchAllCause(() => Effect.fail(new BadWebhookSignature())),
    Effect.asUnit,
  )

export interface MakeConfigOpts {
  readonly applicationId: string
  readonly publicKey: Secret.Secret
  readonly crypto: SubtleCrypto
  readonly algorithm: keyof typeof Verify.PlatformAlgorithm
}
const makeConfig = ({
  algorithm,
  applicationId,
  crypto,
  publicKey,
}: MakeConfigOpts) => ({
  applicationId,
  publicKey: Secret.value(publicKey),
  crypto,
  algorithm: Verify.PlatformAlgorithm[algorithm],
})

export interface WebhookConfig {
  readonly _: unique symbol
}
export const WebhookConfig = Tag<WebhookConfig, ReturnType<typeof makeConfig>>(
  "dfx/Interactions/WebhookConfig",
)

export const layer = (opts: MakeConfigOpts) =>
  Layer.succeed(WebhookConfig, makeConfig(opts))

export const layerConfig: (
  config: Config.Config<MakeConfigOpts>,
) => Layer.Layer<never, ConfigError.ConfigError, WebhookConfig> = (
  config: Config.Config<MakeConfigOpts>,
) => Layer.effect(WebhookConfig, Effect.map(config, makeConfig))

export class WebhookParseError {
  readonly _tag = "WebhookParseError"
  constructor(readonly reason: unknown) {}
}

const fromHeadersAndBody = (headers: Headers, body: string) =>
  Effect.tap(WebhookConfig, ({ algorithm, crypto, publicKey }) =>
    checkSignature(publicKey, headers, body, crypto, algorithm),
  ).pipe(
    Effect.flatMap(() =>
      Effect.try({
        try: () => JSON.parse(body) as Discord.Interaction,
        catch: reason => new WebhookParseError(reason),
      }),
    ),
  )

const run = <R, E>(
  definitions: Chunk.Chunk<
    readonly [
      handler: D.InteractionDefinition<R, E>,
      transform: (
        self: Effect.Effect<R, E, Discord.InteractionResponse>,
      ) => Effect.Effect<R, E, Discord.InteractionResponse>,
    ]
  >,
  handleResponse: (
    ix: Discord.Interaction,
    _: Discord.InteractionResponse,
  ) => Effect.Effect<R, E, Discord.InteractionResponse>,
) => {
  const handler = handlers(definitions, handleResponse)
  return (
    headers: Headers,
    body: string,
  ): Effect.Effect<
    WebhookConfig | Exclude<R, DiscordInteraction>,
    BadWebhookSignature | WebhookParseError | E | DefinitionNotFound,
    Discord.InteractionResponse
  > =>
    Effect.flatMap(fromHeadersAndBody(headers, body), interaction =>
      Effect.provideService(
        handler[interaction.type](interaction),
        Interaction,
        interaction,
      ),
    )
}

export interface HandleWebhookOpts<E> {
  headers: Headers
  body: string
  success: (a: Discord.InteractionResponse) => Effect.Effect<never, never, void>
  error: (e: Cause.Cause<E>) => Effect.Effect<never, never, void>
}

/**
 * @tsplus getter dfx/InteractionBuilder webhookHandler
 */
export const makeHandler = <R, E, TE>(
  ix: InteractionBuilder<R, E, TE>,
): (({
  body,
  error,
  headers,
  success,
}: HandleWebhookOpts<
  E | WebhookParseError | BadWebhookSignature | DefinitionNotFound
>) => Effect.Effect<WebhookConfig, never, void>) => {
  const handle = run(
    Chunk.map(ix.definitions, ([d]) => [d, identity] as any),
    (_i, r) => Effect.succeed(r),
  )

  return ({
    body,
    error,
    headers,
    success,
  }: HandleWebhookOpts<
    E | WebhookParseError | BadWebhookSignature | DefinitionNotFound
  >): Effect.Effect<WebhookConfig, never, void> =>
    handle(headers, body).pipe(
      Effect.flatMap(success),
      Effect.catchAllCause(error),
    )
}

/**
 * @tsplus getter dfx/InteractionBuilder simpleWebhookHandler
 */
export const makeSimpleHandler = <R, E, TE>(
  ix: InteractionBuilder<R, E, TE>,
): (({
  body,
  headers,
}: {
  headers: Headers
  body: string
}) => Effect.Effect<
  WebhookConfig,
  BadWebhookSignature | WebhookParseError | DefinitionNotFound,
  Discord.InteractionResponse
>) => {
  const handle = run(
    Chunk.map(ix.definitions, ([d]) => [d, identity] as any),
    (_i, r) => Effect.succeed(r),
  )

  return ({ body, headers }: { headers: Headers; body: string }) =>
    handle(headers, body)
}
