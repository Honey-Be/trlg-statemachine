import type { GameContext } from "./gameDefinition";

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

export function contains<T, U extends T>(a: Set<U>, b: T[]): boolean {
    let checked = Array.from(a.values()).map((n) => b.includes(n)).includes(false)
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

export function copyMainStatuses(mainStatuses: GameContext['mainStatuses']): typeof mainStatuses {
    return {
        players: [mainStatuses.players[0], mainStatuses.players[1], mainStatuses.players[2], mainStatuses.players[3]],
        landProperties: new Map(mainStatuses.landProperties),
        govIncome: mainStatuses.govIncome,
        cashCache: mainStatuses.cashCache
    }
}
 
  
export interface IGuardedExecuter<T> {
    execute(val: T): boolean
}
  
export class GuardedExecuter<T> implements IGuardedExecuter<T> {
    private pairs: [(val: T) => boolean, (val: T) => void][] = []
    constructor() { }
  
    public addMatch(guard: (val: T) => boolean, x: (val: T) => void) {
        this.pairs.push([guard,x])
        return this
    }
  
    public execute(val: T): boolean {
        for(const [guard, x] of this.pairs) {
            if(guard(val)) {
            x(val)
            return true;
            } else {
            continue
            }
        }
        return false
    }
}
  
  
export class GuardedUnionMappedWeakExecuter<T, M> implements IGuardedExecuter<T> {
    private pairs: [(val: T) => boolean, (val: T) => M, (val: M) => void][] = []
    constructor () { }

    public addMatch(guard: (val: T) => boolean, m: (val: T) => M, x: (val: M) => void) {
        this.pairs.push([guard,m, x])
        return this
    }

    public execute(val: T): boolean {
        for(const [guard, m, x] of this.pairs) {
        if(guard(val)) {
            x(m(val))
            return true
        } else {
            continue
        }
        }
        return false
    }
}

export class GuardedConcatenatedExecuter<T> implements IGuardedExecuter<T> {
    private readonly executers: Array<IGuardedExecuter<T>> = []
    public concat<X extends IGuardedExecuter<T>>(executer: X) {
        this.executers.push(executer)
    }

    public execute(val: T): boolean {
        for(const executer of this.executers) {
        let result = executer.execute(val)
        if(result) {
            return true
        } else {
            continue;
        }
        }
        return false
    }
}



export interface IAsyncGuardedExecuter<T> {
    execute(val: T): Promise<boolean>
}
  
export class AsyncGuardedExecuter<T> implements IAsyncGuardedExecuter<T> {
    private pairs: [(val: T) => boolean, (val: T) => Promise<void>][] = []
    constructor() { }
  
    public addMatch(guard: (val: T) => boolean, x: (val: T) => Promise<void>) {
        this.pairs.push([guard,x])
        return this
    }
  
    public async execute(val: T): Promise<boolean> {
        for(const [guard, x] of this.pairs) {
            if(guard(val)) {
                await x(val)
                return true;
            } else {
                continue
            }
        }
        return false
    }
}
  
  
export class AsyncGuardedUnionMappedWeakExecuter<T, M> implements IAsyncGuardedExecuter<T> {
    private pairs: [(val: T) => boolean, (val: T) => M, (val: M) => Promise<void>][] = []
    constructor () { }

    public addMatch(guard: (val: T) => boolean, m: (val: T) => M, x: (val: M) => Promise<void>) {
        this.pairs.push([guard,m, x])
        return this
    }

    public async execute(val: T): Promise<boolean> {
        for(const [guard, m, x] of this.pairs) {
        if(guard(val)) {
            await x(m(val))
            return true
        } else {
            continue
        }
        }
        return false
    }
}

export class AsyncGuardedConcatenatedExecuter<T> implements IAsyncGuardedExecuter<T> {
    private readonly executers: Array<IAsyncGuardedExecuter<T>> = []
    public concat<X extends IAsyncGuardedExecuter<T>>(executer: X) {
        this.executers.push(executer)
    }

    public async execute(val: T): Promise<boolean> {
        for(const executer of this.executers) {
            let result = await executer.execute(val)
            if(result) {
                return true
            } else {
                continue;
            }
        }
        return false
    }
}