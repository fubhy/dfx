import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import type * as Scope from "effect/Scope"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import type { CacheDriver, ParentCacheDriver } from "dfx/Cache/driver"

export * from "dfx/Cache/driver"
export {
  create as memoryDriver,
  createWithParent as memoryParentDriver,
} from "dfx/Cache/memory"
export {
  create as memoryTTLDriver,
  createWithParent as memoryTTLParentDriver,
} from "dfx/Cache/memoryTTL"

export type ParentCacheOp<T> =
  | { op: "create"; parentId: string; resourceId: string; resource: T }
  | { op: "update"; parentId: string; resourceId: string; resource: T }
  | { op: "delete"; parentId: string; resourceId: string }
  | { op: "parentDelete"; parentId: string }

export type CacheOp<T> =
  | { op: "create"; resourceId: string; resource: T }
  | { op: "update"; resourceId: string; resource: T }
  | { op: "delete"; resourceId: string }

const retryPolicy = Schedule.exponential("500 millis").pipe(
  Schedule.union(Schedule.spaced("10 seconds")),
)

export interface ParentCache<EDriver, EMiss, EPMiss, A> {
  readonly get: (
    parentId: string,
    id: string,
  ) => Effect.Effect<never, EDriver | EMiss, A>
  readonly put: (_: A) => Effect.Effect<never, EDriver | EMiss, void>
  readonly update: <R, E>(
    parentId: string,
    id: string,
    f: (_: A) => Effect.Effect<R, E, A>,
  ) => Effect.Effect<R, EDriver | EMiss | E, A>
  readonly getForParent: (
    parentId: string,
  ) => Effect.Effect<never, EDriver | EPMiss, ReadonlyMap<string, A>>
  readonly size: Effect.Effect<never, EDriver, number>
  readonly sizeForParent: (
    parentId: string,
  ) => Effect.Effect<never, EDriver, number>
  readonly set: (
    parentId: string,
    resourceId: string,
    resource: A,
  ) => Effect.Effect<never, EDriver, void>
  readonly delete: (
    parentId: string,
    resourceId: string,
  ) => Effect.Effect<never, EDriver, void>
  readonly parentDelete: (
    parentId: string,
  ) => Effect.Effect<never, EDriver, void>
  readonly refreshTTL: (
    parentId: string,
    resourceId: string,
  ) => Effect.Effect<never, EDriver, void>
}

export const makeWithParent = <EOps, EDriver, EMiss, EPMiss, A>({
  driver,
  id,
  onMiss,
  onParentMiss,
  ops = Stream.empty,
}: {
  driver: ParentCacheDriver<EDriver, A>
  ops?: Stream.Stream<never, EOps, ParentCacheOp<A>>
  id: (
    _: A,
  ) => Effect.Effect<never, EMiss, readonly [parentId: string, id: string]>
  onMiss: (parentId: string, id: string) => Effect.Effect<never, EMiss, A>
  onParentMiss: (
    parentId: string,
  ) => Effect.Effect<never, EPMiss, Array<[id: string, resource: A]>>
}): Effect.Effect<Scope.Scope, never, ParentCache<EDriver, EMiss, EPMiss, A>> =>
  Effect.gen(function* (_) {
    yield* _(
      Stream.runDrain(
        Stream.tap(ops, (op): Effect.Effect<never, EDriver, void> => {
          switch (op.op) {
            case "create":
            case "update":
              return driver.set(op.parentId, op.resourceId, op.resource)

            case "delete":
              return driver.delete(op.parentId, op.resourceId)

            case "parentDelete":
              return driver.parentDelete(op.parentId)
          }
        }),
      ),
      Effect.tapErrorCause(_ => Effect.logError("ops error, restarting", _)),
      Effect.retry(retryPolicy),
      Effect.forkScoped,
    )
    yield* _(
      driver.run,
      Effect.tapErrorCause(_ =>
        Effect.logError("cache driver error, restarting", _),
      ),
      Effect.retry(retryPolicy),
      Effect.forkScoped,
    )

    const get = (parentId: string, id: string) =>
      Effect.flatMap(
        driver.get(parentId, id),
        Option.match({
          onNone: () =>
            Effect.tap(onMiss(parentId, id), a => driver.set(parentId, id, a)),
          onSome: Effect.succeed,
        }),
      )

    const put = (_: A) =>
      Effect.flatMap(id(_), ([parentId, id]) => driver.set(parentId, id, _))

    const update = <R, E>(
      parentId: string,
      id: string,
      f: (_: A) => Effect.Effect<R, E, A>,
    ) =>
      get(parentId, id).pipe(
        Effect.flatMap(f),
        Effect.tap(_ => driver.set(parentId, id, _)),
      )

    return {
      ...driver,

      get,
      put,
      update,

      getForParent: (parentId: string) =>
        Effect.flatMap(
          driver.getForParent(parentId),
          Option.match({
            onNone: () =>
              onParentMiss(parentId).pipe(
                Effect.tap(entries =>
                  Effect.all(
                    entries.map(([id, a]) => driver.set(parentId, id, a)),
                    { concurrency: "unbounded" },
                  ),
                ),
                Effect.map(
                  entries => new Map(entries) as ReadonlyMap<string, A>,
                ),
              ),
            onSome: Effect.succeed,
          }),
        ),
    } as const
  }).pipe(
    Effect.annotateLogs({
      package: "dfx",
      service: "Cache",
    }),
  )

export interface Cache<EDriver, EMiss, A> {
  readonly get: (id: string) => Effect.Effect<never, EDriver | EMiss, A>
  readonly put: (_: A) => Effect.Effect<never, EDriver, void>
  readonly update: <R, E>(
    id: string,
    f: (_: A) => Effect.Effect<R, E, A>,
  ) => Effect.Effect<R, EDriver | EMiss | E, A>
  readonly size: Effect.Effect<never, EDriver, number>
  readonly set: (
    resourceId: string,
    resource: A,
  ) => Effect.Effect<never, EDriver, void>
  readonly delete: (resourceId: string) => Effect.Effect<never, EDriver, void>
  readonly refreshTTL: (
    resourceId: string,
  ) => Effect.Effect<never, EDriver, void>
}

export const make = <EOps, EDriver, EMiss, A>({
  driver,
  id,
  onMiss,
  ops = Stream.empty,
}: {
  driver: CacheDriver<EDriver, A>
  ops?: Stream.Stream<never, EOps, CacheOp<A>>
  id: (_: A) => string
  onMiss: (id: string) => Effect.Effect<never, EMiss, A>
}): Effect.Effect<Scope.Scope, never, Cache<EDriver, EMiss, A>> =>
  Effect.gen(function* (_) {
    yield* _(
      Stream.runDrain(
        Stream.tap(ops, (op): Effect.Effect<never, EDriver, void> => {
          switch (op.op) {
            case "create":
            case "update":
              return driver.set(op.resourceId, op.resource)

            case "delete":
              return driver.delete(op.resourceId)
          }
        }),
      ),
      Effect.tapErrorCause(_ => Effect.logError("ops error, restarting", _)),
      Effect.retry(retryPolicy),
      Effect.forkScoped,
    )

    yield* _(
      driver.run,
      Effect.tapErrorCause(_ =>
        Effect.logError("cache driver error, restarting", _),
      ),
      Effect.retry(retryPolicy),
      Effect.forkScoped,
    )

    const get = (id: string) =>
      Effect.flatMap(
        driver.get(id),
        Option.match({
          onNone: () => Effect.tap(onMiss(id), a => driver.set(id, a)),
          onSome: Effect.succeed,
        }),
      )

    const put = (_: A) => driver.set(id(_), _)

    const update = <R, E>(id: string, f: (_: A) => Effect.Effect<R, E, A>) =>
      get(id).pipe(
        Effect.flatMap(f),
        Effect.tap(_ => driver.set(id, _)),
      )

    return {
      ...driver,
      get,
      put,
      update,
    } as const
  }).pipe(
    Effect.annotateLogs({
      package: "dfx",
      service: "Cache",
    }),
  )

export class CacheMissError {
  readonly _tag = "CacheMissError"
  constructor(
    readonly cacheName: string,
    readonly id: string,
  ) {}
}
