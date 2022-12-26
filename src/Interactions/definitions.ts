import { Discord, Effect, Option } from "dfx/_common"
import type { F } from "ts-toolbelt"
import {
  FocusedOptionContext,
  ResolvedDataNotFound,
  SubCommandContext,
} from "./context.js"

type DescriptionMissing<A> = A extends {
  type: Exclude<Discord.ApplicationCommandType, 1>
}
  ? false
  : A extends { description: string }
  ? false
  : true

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
  A extends Discord.CreateGlobalApplicationCommandParams,
>(
  command: F.Narrow<A>,
  handle: DescriptionMissing<A> extends true
    ? "command description is missing"
    : CommandHandler<R, E, A>,
) =>
  new GlobalApplicationCommand<
    Exclude<R, Discord.Interaction | Discord.ApplicationCommandDatum>,
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
  A extends Discord.CreateGuildApplicationCommandParams,
>(
  command: F.Narrow<A>,
  handle: DescriptionMissing<A> extends true
    ? "command description is missing"
    : CommandHandler<R, E, A>,
) =>
  new GuildApplicationCommand<
    Exclude<R, Discord.Interaction | Discord.ApplicationCommandDatum>,
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
    Exclude<R1 | R2, Discord.Interaction | Discord.MessageComponentDatum>,
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
    Exclude<R1 | R2, Discord.Interaction | Discord.ModalSubmitDatum>,
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
      | Discord.Interaction
      | Discord.ApplicationCommandDatum
      | FocusedOptionContext
    >,
    E1 | E2
  >(pred as any, handle as any)

// ==== Command handler helpers

type CommandHandler<R, E, A = any> =
  | Effect.Effect<R, E, Discord.InteractionResponse>
  | CommandHandlerFn<R, E, A>

export interface CommandHelper<A> {
  resolve: <T>(
    name: AllResolvables<A>["name"],
    f: (id: Discord.Snowflake, data: Discord.ResolvedDatum) => T | undefined,
  ) => Effect.Effect<Discord.Interaction, ResolvedDataNotFound, T>

  option: (
    name: AllCommandOptions<A>["name"],
  ) => Effect.Effect<
    Discord.ApplicationCommandDatum,
    never,
    Option.Option<Discord.ApplicationCommandInteractionDataOption>
  >

  optionValue: <N extends AllRequiredCommandOptions<A>["name"]>(
    name: N,
  ) => Effect.Effect<Discord.ApplicationCommandDatum, never, CommandValue<A, N>>

  optionValueOptional: <N extends AllCommandOptions<A>["name"]>(
    name: N,
  ) => Effect.Effect<
    Discord.ApplicationCommandDatum,
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
    | Discord.Interaction
    | Discord.ApplicationCommandDatum,
    [NER[keyof NER]] extends [
      { [Effect.EffectTypeId]: { _E: (_: never) => infer E } },
    ]
      ? E
      : never,
    Discord.InteractionResponse
  >
}

type CommandHandlerFn<R, E, A> = (
  i: CommandHelper<A>,
) => Effect.Effect<R, E, Discord.InteractionResponse>

// == Sub commands
type SubCommands<A> = A extends {
  type: Discord.ApplicationCommandOptionType.SUB_COMMAND
  options?: Discord.ApplicationCommandOption[]
}
  ? A
  : A extends { options: Discord.ApplicationCommandOption[] }
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
    type: CommandOptionType
  }
>

type SubCommandOptions<A> = Extract<
  Option<Exclude<SubCommands<A>["options"], undefined>[number]>,
  {
    type: CommandOptionType
  }
>

type AllCommandOptions<A> = CommandOptions<A> | SubCommandOptions<A>

type CommandWithName<A, N> = Extract<AllCommandOptions<A>, { name: N }>

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
    type: CommandOptionType
    required: true
  }
>

type RequiredSubCommandOptions<A> = Extract<
  SubCommandOptions<A>,
  { required: true }
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

type Resolvables<A> = OptionsWithLiteral<A, { type: ResolvableType }>
type SubCommandResolvables<A> = Extract<
  Option<Exclude<SubCommands<A>["options"], undefined>[number]>,
  {
    type: ResolvableType
  }
>
type AllResolvables<A> = Resolvables<A> | SubCommandResolvables<A>

// == Utilities
type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never

type Option<A> = A extends { name: infer N }
  ? N extends StringLiteral<N>
    ? A
    : never
  : never

type OptionsWithLiteral<A, T> = A extends {
  options: Discord.ApplicationCommandOption[]
}
  ? Extract<A["options"][number], Option<A["options"][number]> & T>
  : never
