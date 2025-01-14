import type * as Option from "effect/Option"
import type * as Effect from "effect/Effect"
import type {
  DiscordApplicationCommand,
  DiscordFocusedOption,
  DiscordInteraction,
  DiscordMessageComponent,
  DiscordModalSubmit,
  ResolvedDataNotFound,
  SubCommandContext,
} from "dfx/Interactions/context"
import type * as Discord from "dfx/types"

export type InteractionDefinition<R, E> =
  | GlobalApplicationCommand<R, E>
  | GuildApplicationCommand<R, E>
  | MessageComponent<R, E>
  | ModalSubmit<R, E>
  | Autocomplete<R, E>

export class GlobalApplicationCommand<R, E> {
  readonly _tag = "GlobalApplicationCommand"
  constructor(
    readonly command: Discord.CreateGlobalApplicationCommandParams,
    readonly handle: CommandHandler<R, E>,
  ) {}
}

export const global = <
  R,
  E,
  const A extends
    DeepReadonlyObject<Discord.CreateGlobalApplicationCommandParams>,
>(
  command: A,
  handle: CommandHandler<R, E, A>,
) =>
  new GlobalApplicationCommand<
    Exclude<R, DiscordInteraction | DiscordApplicationCommand>,
    E
  >(command as any, handle as any)

export class GuildApplicationCommand<R, E> {
  readonly _tag = "GuildApplicationCommand"
  constructor(
    readonly command: Discord.CreateGuildApplicationCommandParams,
    readonly handle: CommandHandler<R, E>,
  ) {}
}

export const guild = <
  R,
  E,
  const A extends
    DeepReadonlyObject<Discord.CreateGuildApplicationCommandParams>,
>(
  command: A,
  handle: CommandHandler<R, E, A>,
) =>
  new GuildApplicationCommand<
    Exclude<R, DiscordInteraction | DiscordApplicationCommand>,
    E
  >(command as any, handle as any)

export class MessageComponent<R, E> {
  readonly _tag = "MessageComponent"
  constructor(
    readonly predicate: (customId: string) => Effect.Effect<R, E, boolean>,
    readonly handle: Effect.Effect<R, E, Discord.InteractionResponse>,
  ) {}
}

export const messageComponent = <R1, R2, E1, E2>(
  pred: (customId: string) => Effect.Effect<R1, E1, boolean>,
  handle: CommandHandler<R2, E2, Discord.InteractionResponse>,
) =>
  new MessageComponent<
    Exclude<R1 | R2, DiscordInteraction | DiscordMessageComponent>,
    E1 | E2
  >(pred as any, handle as any)

export class ModalSubmit<R, E> {
  readonly _tag = "ModalSubmit"
  constructor(
    readonly predicate: (customId: string) => Effect.Effect<R, E, boolean>,
    readonly handle: Effect.Effect<R, E, Discord.InteractionResponse>,
  ) {}
}

export const modalSubmit = <R1, R2, E1, E2>(
  pred: (customId: string) => Effect.Effect<R1, E1, boolean>,
  handle: Effect.Effect<R2, E2, Discord.InteractionResponse>,
) =>
  new ModalSubmit<
    Exclude<R1 | R2, DiscordInteraction | DiscordModalSubmit>,
    E1 | E2
  >(pred as any, handle as any)

export class Autocomplete<R, E> {
  readonly _tag = "Autocomplete"
  constructor(
    readonly predicate: (
      data: Discord.ApplicationCommandDatum,
      focusedOption: Discord.ApplicationCommandInteractionDataOption,
    ) => Effect.Effect<R, E, boolean>,
    readonly handle: Effect.Effect<R, E, Discord.InteractionResponse>,
  ) {}
}

export const autocomplete = <R1, R2, E1, E2>(
  pred: (
    data: Discord.ApplicationCommandDatum,
    focusedOption: Discord.ApplicationCommandInteractionDataOption,
  ) => Effect.Effect<R1, E1, boolean>,
  handle: Effect.Effect<R2, E2, Discord.InteractionResponse>,
) =>
  new Autocomplete<
    Exclude<
      R1 | R2,
      DiscordInteraction | DiscordApplicationCommand | DiscordFocusedOption
    >,
    E1 | E2
  >(pred as any, handle as any)

// ==== Command handler helpers
type DeepReadonly<T> = T extends Array<infer R>
  ? ReadonlyArray<DeepReadonly<R>>
  : T extends Function
    ? T
    : T extends object
      ? DeepReadonlyObject<T>
      : T
type DeepReadonlyObject<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>
}

export type CommandHandler<R, E, A = any> =
  | Effect.Effect<R, E, Discord.InteractionResponse>
  | CommandHandlerFn<R, E, A>

export interface CommandHelper<A> {
  resolve: <T>(
    name: AllResolvables<A>["name"],
    f: (id: Discord.Snowflake, data: Discord.ResolvedDatum) => T | undefined,
  ) => Effect.Effect<DiscordInteraction, ResolvedDataNotFound, T>

  option: (
    name: AllCommandOptions<A>["name"],
  ) => Effect.Effect<
    DiscordApplicationCommand,
    never,
    Option.Option<Discord.ApplicationCommandInteractionDataOption>
  >

  optionValue: <N extends AllRequiredCommandOptions<A>["name"]>(
    name: N,
  ) => Effect.Effect<DiscordApplicationCommand, never, CommandValue<A, N>>

  optionValueOptional: <N extends AllCommandOptions<A>["name"]>(
    name: N,
  ) => Effect.Effect<
    DiscordApplicationCommand,
    never,
    Option.Option<CommandValue<A, N>>
  >

  subCommands: <
    NER extends SubCommandNames<A> extends never
      ? never
      : Record<
          SubCommandNames<A>,
          Effect.Effect<any, any, Discord.InteractionResponse>
        >,
  >(
    commands: NER,
  ) => Effect.Effect<
    | Exclude<
        [NER[keyof NER]] extends [
          { [Effect.EffectTypeId]: { _R: (_: never) => infer R } },
        ]
          ? R
          : never,
        SubCommandContext
      >
    | DiscordInteraction
    | DiscordApplicationCommand,
    [NER[keyof NER]] extends [
      { [Effect.EffectTypeId]: { _E: (_: never) => infer E } },
    ]
      ? E
      : never,
    Discord.InteractionResponse
  >
}

export type CommandHandlerFn<R, E, A> = (
  i: CommandHelper<A>,
) => Effect.Effect<R, E, Discord.InteractionResponse>

interface CommandOption {
  readonly type: any
  readonly name: string
  readonly options?: ReadonlyArray<CommandOption>
}

// == Sub commands
type SubCommands<A> = A extends {
  readonly type: Discord.ApplicationCommandOptionType.SUB_COMMAND
  readonly options?: ReadonlyArray<CommandOption>
}
  ? A
  : A extends { readonly options: ReadonlyArray<CommandOption> }
    ? SubCommands<A["options"][number]>
    : never

type SubCommandNames<A> = Option<SubCommands<A>>["name"]

// == Command options
type CommandOptionType = Exclude<
  Discord.ApplicationCommandOptionType,
  | Discord.ApplicationCommandOptionType.SUB_COMMAND
  | Discord.ApplicationCommandOptionType.SUB_COMMAND_GROUP
>

type CommandOptions<A> = OptionsWithLiteral<
  A,
  {
    readonly type: CommandOptionType
  }
>

type SubCommandOptions<A> = Extract<
  Option<Exclude<SubCommands<A>["options"], undefined>[number]>,
  {
    readonly type: CommandOptionType
  }
>

type AllCommandOptions<A> = CommandOptions<A> | SubCommandOptions<A>

type CommandWithName<A, N> = Extract<AllCommandOptions<A>, { readonly name: N }>

type OptionTypeValue = {
  [Discord.ApplicationCommandOptionType.BOOLEAN]: boolean
  [Discord.ApplicationCommandOptionType.INTEGER]: number
  [Discord.ApplicationCommandOptionType.NUMBER]: number
}
type CommandValue<A, N> = CommandWithName<
  A,
  N
>["type"] extends keyof OptionTypeValue
  ? OptionTypeValue[CommandWithName<A, N>["type"]]
  : string

// == Required options
type RequiredCommandOptions<A> = OptionsWithLiteral<
  A,
  {
    readonly type: CommandOptionType
    readonly required: true
  }
>

type RequiredSubCommandOptions<A> = Extract<
  SubCommandOptions<A>,
  { readonly required: true }
>

type AllRequiredCommandOptions<A> =
  | RequiredCommandOptions<A>
  | RequiredSubCommandOptions<A>

// == Resolveables
type ResolvableType =
  | Discord.ApplicationCommandOptionType.ROLE
  | Discord.ApplicationCommandOptionType.USER
  | Discord.ApplicationCommandOptionType.MENTIONABLE
  | Discord.ApplicationCommandOptionType.CHANNEL

type Resolvables<A> = OptionsWithLiteral<A, { readonly type: ResolvableType }>
type SubCommandResolvables<A> = Extract<
  Option<Exclude<SubCommands<A>["options"], undefined>[number]>,
  {
    readonly type: ResolvableType
  }
>
type AllResolvables<A> = Resolvables<A> | SubCommandResolvables<A>

// == Utilities
type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never

type Option<A> = A extends { readonly name: infer N }
  ? N extends StringLiteral<N>
    ? A
    : never
  : never

type OptionsWithLiteral<A, T> = A extends {
  readonly options: ReadonlyArray<CommandOption>
}
  ? Extract<A["options"][number], Option<A["options"][number]> & T>
  : never
