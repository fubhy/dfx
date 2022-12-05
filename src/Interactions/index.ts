import * as D from "./definitions.js"
import * as Gateway from "./gateway.js"
import * as Webhook from "./webhook.js"

export * from "./context.js"

export {
  global,
  guild,
  messageComponent,
  modalSubmit,
  autocomplete,
  InteractionDefinition,
  InteractionResponse,
} from "./definitions.js"

export {
  makeConfig as makeWebhookConfig,
  WebhookConfig,
  WebhookParseError,
  BadWebhookSignature,
} from "./webhook.js"

class InteractionBuilder<R, E> {
  constructor(readonly definitions: D.InteractionDefinition<R, E>[]) {}

  add<R1, E1>(definition: D.InteractionDefinition<R1, E1>) {
    return new InteractionBuilder<R | R1, E | E1>([
      ...this.definitions,
      definition,
    ])
  }

  runGateway<R2, E2>(
    catchAll: (
      e: E | Http.FetchError | Http.StatusCodeError | Http.JsonParseError,
    ) => Effect<R2, E2, any>,
    opts: Gateway.RunOpts = {},
  ) {
    return Gateway.run<R, R2, E, E2>(this.definitions, catchAll, opts)
  }

  handleWebhook(headers: Webhook.Headers, rawBody: string) {
    return Webhook.run(this.definitions, headers, rawBody)
  }

  get syncGlobal() {
    const commands = this.definitions
      .filter(
        (c): c is D.GlobalApplicationCommand<R, E> =>
          c._tag === "GlobalApplicationCommand",
      )
      .map((c) => c.command)

    return Rest.rest
      .getCurrentBotApplicationInformation()
      .flatMap((r) => r.json)
      .flatMap((app) =>
        Rest.rest.bulkOverwriteGlobalApplicationCommands(app.id, {
          body: JSON.stringify(commands),
        }),
      )
  }

  syncGuild(appId: Discord.Snowflake, guildId: Discord.Snowflake) {
    const commands = this.definitions
      .filter(
        (c): c is D.GuildApplicationCommand<R, E> =>
          c._tag === "GuildApplicationCommand",
      )
      .map((c) => c.command)

    return Rest.rest.bulkOverwriteGuildApplicationCommands(
      appId,
      guildId,
      commands as any,
    )
  }
}

export const builder = new InteractionBuilder<never, never>([])

// Filters
export const id = (query: string) => (customId: string) =>
  Effect.succeed(query === customId)

export const idStartsWith = (query: string) => (customId: string) =>
  Effect.succeed(customId.startsWith(query))

export const regex = (query: RegExp) => (customId: string) =>
  Effect.succeed(query.test(customId))

export const option =
  (name: string) =>
  (focusedOption: Discord.ApplicationCommandInteractionDataOption) =>
    Effect.succeed(focusedOption.name === name)
