import { Effect, EffectTypeId } from "@effect/io/Effect"
import * as Arr from "@fp-ts/data/ReadonlyArray"
import * as IxHelpers from "../Helpers/interactions.js"

export const InteractionContext = Tag<Discord.Interaction>()
export const ApplicationCommandContext = Tag<Discord.ApplicationCommandDatum>()
export const MessageComponentContext = Tag<Discord.MessageComponentDatum>()
export const ModalSubmitContext = Tag<Discord.ModalSubmitDatum>()

export interface FocusedOptionContext {
  readonly focusedOption: Discord.ApplicationCommandInteractionDataOption
}
export const FocusedOptionContext = Tag<FocusedOptionContext>()

export interface SubCommandContext {
  readonly command: Discord.ApplicationCommandInteractionDataOption
}
export const SubCommandContext = Tag<SubCommandContext>()

export const getCommand = Effect.service(ApplicationCommandContext)

export class ResolvedDataNotFound {
  readonly _tag = "ResolvedDataNotFound"
  constructor(readonly data: Discord.Interaction, readonly name?: string) {}
}

export const getResolvedValues = <A>(
  f: (id: Discord.Snowflake, data: Discord.ResolvedDatum) => A | undefined,
) =>
  Effect.serviceWithEffect(InteractionContext)((a) =>
    IxHelpers.resolveValues(f)(a).match(
      () => Effect.fail(new ResolvedDataNotFound(a)),
      Effect.succeed,
    ),
  )

export const getResolved = <A>(
  name: string,
  f: (id: Discord.Snowflake, data: Discord.ResolvedDatum) => A | undefined,
) =>
  Effect.serviceWithEffect(InteractionContext)((a) =>
    IxHelpers.resolveOptionValue(
      name,
      f,
    )(a).match(
      () => Effect.fail(new ResolvedDataNotFound(a, name)),
      Effect.succeed,
    ),
  )

export const focusedOptionValue = Effect.serviceWith(FocusedOptionContext)(
  (a) => a.focusedOption.value ?? "",
)

export class SubCommandNotFound {
  readonly _tag = "SubCommandNotFound"
  constructor(readonly data: Discord.ApplicationCommandDatum) {}
}

export const handleSubCommands = <
  NER extends Record<string, Effect<any, any, Discord.InteractionResponse>>,
>(
  commands: NER,
): Effect<
  | Exclude<
      [NER[keyof NER]] extends [
        { [EffectTypeId]: { _R: (_: never) => infer R } },
      ]
        ? R
        : never,
      SubCommandContext
    >
  | Discord.Interaction
  | Discord.ApplicationCommandDatum,
  | ([NER[keyof NER]] extends [
      { [EffectTypeId]: { _E: (_: never) => infer E } },
    ]
      ? E
      : never)
  | SubCommandNotFound,
  Discord.InteractionResponse
> =>
  Effect.service(ApplicationCommandContext).flatMap((data) =>
    pipe(
      IxHelpers.allSubCommands(data),
      Arr.findFirst((a) => !!commands[a.name]),
      (o) => o.toEither(() => new SubCommandNotFound(data)),
      Effect.fromEither,
      (a) =>
        a.flatMap((command) =>
          pipe(
            commands[command.name],
            Effect.provideService(SubCommandContext)({ command }),
          ),
        ),
    ),
  )

export const getSubCommand = Effect.serviceWith(SubCommandContext)(
  (a) => a.command,
)

export const optionsMap = Effect.serviceWith(ApplicationCommandContext)(
  IxHelpers.optionsMap,
)

export class RequiredOptionNotFound {
  readonly _tag = "RequiredOptionNotFound"
  constructor(
    readonly data:
      | Discord.ApplicationCommandDatum
      | Discord.ApplicationCommandInteractionDataOption,
    readonly name: string,
  ) {}
}

export const findOption = (name: string) =>
  Effect.serviceWith(ApplicationCommandContext)(IxHelpers.getOption(name))

export const optionValue = (name: string) =>
  findOption(name).flatMap((o) =>
    o
      .flatMapNullable((a) => a.value)
      .match(
        () =>
          getCommand.flatMap((data) =>
            Effect.fail(new RequiredOptionNotFound(data, name)),
          ),
        Effect.succeed,
      ),
  )

export const optionValueOptional = (name: string) =>
  findOption(name).map((o) => o.flatMapNullable((a) => a.value))

export const subCommandOptionsMap = getSubCommand.map(IxHelpers.optionsMap)

export const findSubCommandOption = (name: string) =>
  Effect.serviceWith(SubCommandContext)(({ command }) =>
    IxHelpers.getOption(name)(command),
  )

export const subCommandOptionValue = (name: string) =>
  findSubCommandOption(name).flatMap((o) =>
    o
      .flatMapNullable((a) => a.value)
      .match(
        () =>
          getSubCommand.flatMap((data) =>
            Effect.fail(new RequiredOptionNotFound(data, name)),
          ),
        Effect.succeed,
      ),
  )

export const subCommandOptionValueOptional = (name: string) =>
  findSubCommandOption(name).flatMap((o) =>
    o
      .flatMapNullable((a) => a.value)
      .match(
        () =>
          getSubCommand.flatMap((data) =>
            Effect.fail(new RequiredOptionNotFound(data, name)),
          ),
        Effect.succeed,
      ),
  )

export const modalValues = Effect.serviceWith(ModalSubmitContext)(
  IxHelpers.componentsMap,
)
