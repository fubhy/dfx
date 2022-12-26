import * as Arr from "@fp-ts/data/ReadonlyArray"
import { Discord, flow, HashMap, identity, Option, pipe } from "dfx/_common"

/**
 * Maybe find a sub-command within the interaction options.
 */
export const allSubCommands = (interaction: Discord.ApplicationCommandDatum) =>
  pipe(
    optionsWithNested(interaction),
    Arr.filter(
      (o) => o.type === Discord.ApplicationCommandOptionType.SUB_COMMAND,
    ),
  )

/**
 * Maybe find a sub-command within the interaction options.
 */
export const findSubCommand =
  (name: string) => (interaction: Discord.ApplicationCommandDatum) =>
    pipe(
      optionsWithNested(interaction),
      Arr.findFirst(
        (o) =>
          o.type === Discord.ApplicationCommandOptionType.SUB_COMMAND &&
          o.name === name,
      ),
    )

/**
 * If the sub-command exists return `true`, else `false`.
 */
export const isSubCommand = (name: string) =>
  flow(findSubCommand(name), (o) => o.isSome())

/**
 * Maybe get the options for a sub-command
 */
export const subCommandOptions = (name: string) =>
  flow(findSubCommand(name), (o) => o.flatMapNullable((o) => o.options))

/**
 * A lens for accessing nested options in a interaction.
 */
export const optionsWithNested = (
  data: Pick<Discord.ApplicationCommandDatum, "options">,
): Discord.ApplicationCommandInteractionDataOption[] => {
  const optsFromOption = (
    opt: Discord.ApplicationCommandInteractionDataOption,
  ): Discord.ApplicationCommandInteractionDataOption[] =>
    Option.fromNullable(opt.options)
      .map((opts) => [...opts, ...opts.flatMap(optsFromOption)])
      .match(() => [], identity)

  return Option.fromNullable(data.options)
    .map((opts) => [...opts, ...opts.flatMap(optsFromOption)])
    .getOrElse(() => [])
}

/**
 * Return the interaction options as a name / value map.
 */
export const transformOptions = (
  options: Discord.ApplicationCommandInteractionDataOption[],
) =>
  options.reduce(
    (map, option) => map.set(option.name, option.value),
    HashMap.empty<string, string | undefined>(),
  )

/**
 * Return the interaction options as a name / value map.
 */
export const optionsMap = flow(optionsWithNested, transformOptions)

/**
 * Try find a matching option from the interaction.
 */
export const getOption = (name: string) =>
  flow(
    optionsWithNested,
    Arr.findFirst((o) => o.name === name),
  )

/**
 * Try find a matching option from the interaction.
 */
export const focusedOption = flow(
  optionsWithNested,
  Arr.findFirst((o) => o.focused === true),
)

/**
 * Try find a matching option value from the interaction.
 */
export const optionValue = (name: string) =>
  flow(getOption(name), (o) => o.flatMapNullable((o) => o.value))

/**
 * Try extract resolved data
 */
export const resolved = (data: Discord.Interaction) =>
  Option.fromNullable(data.data).flatMapNullable(
    (a) => (a as Discord.ApplicationCommandDatum).resolved,
  )

/**
 * Try find a matching option value from the interaction.
 */
export const resolveOptionValue =
  <T>(
    name: string,
    f: (id: Discord.Snowflake, data: Discord.ResolvedDatum) => T | undefined,
  ) =>
  (a: Discord.Interaction): Option.Option<T> =>
    Do(($) => {
      const data = $(
        Option.fromNullable(a.data as Discord.ApplicationCommandDatum),
      )
      const id = $(
        getOption(name)(data).flatMapNullable(
          ({ value }) => value as Discord.Snowflake,
        ),
      )
      const r = $(resolved(a))
      return $(Option.fromNullable(f(id, r)))
    })

/**
 * Try find matching option values from the interaction.
 */
export const resolveValues =
  <T>(
    f: (id: Discord.Snowflake, data: Discord.ResolvedDatum) => T | undefined,
  ) =>
  (a: Discord.Interaction): Option.Option<readonly T[]> =>
    Do(($) => {
      const values = $(
        Option.fromNullable(
          a.data as Discord.MessageComponentDatum,
        ).flatMapNullable((a) => a.values as unknown as string[]),
      )
      const r = $(resolved(a))
      return $(
        Option.productAll(
          values.map((a) => Option.fromNullable(f(a as any, r))),
        ),
      )
    })

const extractComponents = (c: Discord.Component): Discord.Component[] => {
  if ("components" in c) {
    return [...c.components, ...c.components.flatMap(extractComponents)]
  }

  return []
}

/**
 * A lens for accessing the components in a interaction.
 */
export const components = (
  a: Discord.ModalSubmitDatum,
): Discord.Component[] => [
  ...a.components,
  ...a.components.flatMap(extractComponents),
]

/**
 * A lens for accessing the components in a interaction.
 */
export const componentsWithValue = flow(
  components,
  Arr.filter((c) => "value" in c && c.value !== undefined),
)

/**
 * Return the interaction components as an id / value map.
 */
export const transformComponents = (options: Discord.Component[]) =>
  (options as Discord.TextInput[]).reduce(
    (map, c) => (c.custom_id ? map.set(c.custom_id, c.value) : map),
    HashMap.empty<string, string | undefined>(),
  )

/**
 * Return the interaction components as an id / value map.
 */
export const componentsMap = flow(components, transformComponents)

/**
 * Try find a matching component from the interaction.
 */
export const getComponent = (id: string) =>
  flow(
    components,
    Arr.findFirst((o) => (o as Discord.TextInput).custom_id === id),
  )

/**
 * Try find a matching component value from the interaction.
 */
export const componentValue = (id: string) =>
  flow(getComponent(id), (o) =>
    o.flatMapNullable((o) => (o as Discord.TextInput).value),
  )

export type InteractionResponse =
  | {
      type: Discord.InteractionCallbackType.CHANNEL_MESSAGE_WITH_SOURCE
      data: Discord.InteractionCallbackMessage
    }
  | {
      type: Discord.InteractionCallbackType.UPDATE_MESSAGE
      data: Discord.InteractionCallbackMessage
    }
  | {
      type: Discord.InteractionCallbackType.MODAL
      data: Discord.InteractionCallbackModal
    }
  | {
      type: Discord.InteractionCallbackType.DEFERRED_UPDATE_MESSAGE
    }
  | {
      type: Discord.InteractionCallbackType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    }
  | {
      type: Discord.InteractionCallbackType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
      data: Discord.InteractionCallbackAutocomplete
    }

export const response = (r: InteractionResponse) => r
