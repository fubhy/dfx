import * as T from "@effect-ts/core/Effect"
import * as R from "@effect-ts/core/Effect/Ref"
import { flow, pipe } from "@effect-ts/core/Function"
import * as O from "@effect-ts/core/Option"
import * as CB from "callbag-effect-ts"
import {
  GatewayEvent,
  GatewayEvents,
  GatewayOpcode,
  GatewayPayload,
} from "../types"
import { memoize } from "../Utils/memoize"

export const opCode =
  <R, E>(source: CB.EffectSource<R, E, GatewayPayload>) =>
  <T = any>(code: GatewayOpcode) =>
    pipe(
      source,
      CB.filter((p): p is GatewayPayload<T> => p.op === code),
    )

const maybeUpdateRef = <T>(
  f: (p: GatewayPayload) => O.Option<T>,
  ref: R.Ref<O.Option<T>>,
) =>
  flow(
    f,
    O.fold(
      () => T.unit,
      (a) => R.set_(ref, O.some(a)),
    ),
  )

export const latest = <T>(f: (p: GatewayPayload) => O.Option<T>) =>
  pipe(
    R.makeRef<O.Option<T>>(O.none),
    T.map((ref) => [ref, CB.tap(maybeUpdateRef(f, ref))] as const),
  )

export const fromDispatch = <R, E>(
  source: CB.EffectSource<R, E, GatewayPayload<GatewayEvent>>,
): (<K extends keyof GatewayEvents>(
  event: K,
) => CB.EffectSource<R, E, GatewayEvents[K]>) =>
  memoize((event) =>
    pipe(
      CB.filter_(source, (p) => p.t === event),
      CB.map((p) => p.d as any),
      CB.share,
    ),
  )
