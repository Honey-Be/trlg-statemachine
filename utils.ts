import { LandPropertyStatus } from "./gameDefinition";

export function equalSet<T>(set1: Set<T>, set2: Set<T>): boolean {
    return (set1.size === set2.size) && [...set1].every(val => set2.has(val));
}

export type Tuple<TItem, TLength extends number> = [...TItem[]] & { length: TLength };


export function tupleMap<T, S, Length extends number>(input: Tuple<T, Length>, m: (u: T, idx: keyof typeof input) => S): Tuple<S, Length> {
    const result: Tuple<S, Length> = input.reduce<Tuple<S, Length>>((acc, currVal, currIdx) => {
        acc[currIdx] = m(currVal, currIdx)
        return acc
    }, [,] as Tuple<S, Length>)
    return result
}

export function contains<T>(a: Set<T>, b: Iterable<T>): boolean {
    let arrCopied = Array.from(b)
    let checked = Array.from(a.values()).map((n) => arrCopied.includes(n)).includes(false)
    return !checked
}

export function roundUnit(x: number, u: number) {
    let remainder = x % u
    if ((remainder * 2) < u) {
        return (x - remainder)
    } else {
        return (x - remainder) + u
    }
}

export function circularPush<T>(a: T[], amount: number) {
    return Array.from({length: a.length}).map((_, idx) => a[(idx + amount) % a.length])
}

export function zip<T, U>(a: T[], b: U[]): [T, U][] {
    let shorterLength = Math.min(a.length, b.length)
    return Array.from({length: shorterLength}).map((_,idx) => [a[idx], b[idx]])
}

export function circularPushMap(a: number[], amount: number) {
    const result: {[key: number]: number} = {}
    Array.from({length: a.length}).forEach((_, idx) => {
        result[a[idx]] = a[(idx + amount) % a.length]
    })
    return result
}

export function* product<T, U>(as: T[], bs: U[]) {
    for(const a of as) for(const b of bs) {
        yield [a,b] as [T, U]
    }
}

export function* productLiteral<T, U>(as: readonly T[], bs: readonly U[]) {
    for(const a of as) for(const b of bs) {
        yield [a,b] as [T, U]
    }
}

export function* productLiteralFMap<T, U, V>(as: readonly T[], bs: readonly U[], bifmap: (a: T, b: U) => V) {
    for(const a of as) for(const b of bs) {
        yield bifmap(a,b)
    }
}

export function concatAll<T>(...arrays: T[][]) {
    return arrays.reduce((acc, curr) => acc.concat(curr), [])
}

export function concatAllReadonly<T>(...arrays: readonly T[][]) {
    return arrays.reduce((acc, curr) => acc.concat(curr), [])
}