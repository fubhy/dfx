import { Context, Effect } from "dfx/_common"

export type Success<A extends Effect.Effect<any, any, any>> =
  A extends Effect.Effect<any, any, infer R> ? R : never

export type ShapeFn<T> = Pick<
  T,
  {
    [k in keyof T]: T[k] extends (
      ...args: infer ARGS
    ) => Effect.Effect<infer R, infer E, infer A>
      ? ((...args: ARGS) => Effect.Effect<R, E, A>) extends T[k]
        ? k
        : never
      : never
  }[keyof T]
>

export type ShapeCn<T> = Pick<
  T,
  {
    [k in keyof T]: T[k] extends Effect.Effect<any, any, any> ? k : never
  }[keyof T]
>

export type DerivedLifted<
  T,
  Fns extends keyof ShapeFn<T>,
  Cns extends keyof ShapeCn<T>,
  Values extends keyof T,
> = {
  [k in Fns]: T[k] extends (
    ...args: infer ARGS
  ) => Effect.Effect<infer R, infer E, infer A>
    ? (...args: ARGS) => Effect.Effect<R | T, E, A>
    : never
} & {
  [k in Cns]: T[k] extends Effect.Effect<infer R, infer E, infer A>
    ? Effect.Effect<R | T, E, A>
    : never
} & {
  [k in Values]: Effect.Effect<T, never, T[k]>
}

/**
 * @tsplus static effect/io/Effect.Ops deriveLifted
 */
export function deriveLifted<T>(
  S: Context.Tag<T>,
): <
  Fns extends keyof ShapeFn<T> = never,
  Cns extends keyof ShapeCn<T> = never,
  Values extends keyof T = never,
>(
  functions: Fns[],
  effects: Cns[],
  values: Values[],
) => DerivedLifted<T, Fns, Cns, Values> {
  return (functions, constants, values) => {
    const ret = {} as any

    for (const k of functions) {
      ret[k] = (...args: any[]) =>
        Effect.serviceWithEffect(S)((h) => (h[k] as any)(...args))
    }

    for (const k of constants) {
      ret[k] = Effect.serviceWithEffect(S)((h) => h[k] as any)
    }

    for (const k of values) {
      ret[k] = Effect.serviceWith(S)((h) => h[k])
    }

    return ret as any
  }
}
