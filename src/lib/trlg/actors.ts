import { createActor, Actor } from "xstate";
import { type EventType, machine } from "./machine";
import { type PlayerStatus } from "./gameDefinition";

import type { ActorStorageJSON, SerializedGameContext, StorageAdapter } from "./types";

export type TRLGActor = Actor<typeof machine>

export class ActorStorage<S extends StorageAdapter<false>> {
    public readonly gameId: string
    private db: S
    private actor: TRLGActor

    private constructor(gameId: string, path: string, initialJson: ActorStorageJSON, genAdapter: (path: string, init: ActorStorageJSON) => S) {
        this.gameId = gameId

        this.db = genAdapter(path,initialJson)

        this.db.load()
        
        if(this.db.json.initialized) {
            this.actor = createActor(machine, {
                snapshot: JSON.parse(this.db.json.snapshotJSON)
            })
        } else {
            this.actor = createActor(machine).start()
            this.persist()
        }
    }

    public static generate<S extends StorageAdapter<false>>(gameId: string, path: string, initialJson: ActorStorageJSON, genAdapter: (path: string, init: ActorStorageJSON) => S) {
        return new ActorStorage<S>(gameId, path, initialJson, genAdapter)
    }

    private persist() {
        const persistedSnapshot = this.actor.getPersistedSnapshot()
        this.db.persist(JSON.stringify(persistedSnapshot))
    }

    private manipulate(fn: (actor: TRLGActor) => void) {
        fn(this.actor)
        this.persist()
    }

    public manipulateWithResult<T>(fn: (actor: TRLGActor) => T): T {
        const result = fn(this.actor)
        this.persist()
        return result
    }

    public get gameTriple() {
        const { value, context } = this.actor.getSnapshot()
        const nowPlayerAccount = this.db.json.playerAccounts[context.nowPid]
        return {
            state: value,
            gameContext: context,
            nowPlayerAccount
        }
    }

    public get serializedGameContext() {
        const {
            value, context: {
                mainStatuses: {
                    players: [p0, p1, p2, p3],
                    landProperties,
                    govIncome,
                    cashCache
                },
                turns, nowPid, dicesNow,
                fund, ending,
                financialWarningCache,
                remainingSidecars,
                freshChanceCardCache,
                lottoTriesCountCache,
                lottoCache, doubleLotto,
                dicesSecondary, feeCache,
                maxPurchasableAmountCache,
                wonLotto,
                jailTurnResultCache
            }
        } = this.actor.getSnapshot()
        const state = value
        const nowPlayerAccount = this.db.json.playerAccounts[nowPid]
        const serializedLandProperties: SerializedGameContext['mainStatuses']['landProperties'] = {
            locations: [],
            map: {}
        }
        landProperties.forEach((status,loc) => {
            serializedLandProperties.map[loc] = status
            serializedLandProperties.locations.push(loc)
        })
        const serializedGameContext: SerializedGameContext = {
            mainStatuses: {
                players: [p0, p1, p2, p3] as [PlayerStatus, PlayerStatus, PlayerStatus, PlayerStatus],
                landProperties: serializedLandProperties,
                govIncome,
                cashCache
            },
            turns, nowPid, dicesNow,
            fund, ending,
            financialWarningCache,
            remainingSidecars,
            freshChanceCardCache,
            lottoTriesCountCache,
            lottoCache, doubleLotto,
            dicesSecondary, feeCache,
            maxPurchasableAmountCache,
            wonLotto,
            jailTurnResultCache
        }
        return {
            state,
            gameContext: serializedGameContext,
            nowPlayerAccount
        }
    }

    public trigger(event: EventType) {
        this.manipulate((actor) => {
            actor.send(event)
        })
    }

    public findPid(account: string) : 0|1|2|3|null {
        const players = this.db.json.playerAccounts
        const pids = [0,1,2,3] as const
        for(const pid of pids) {
            if(players[pid] === account) {
                return pid
            } else {
                continue
            }
        }
        return null
    }
}

export class AsyncActorStorage<A extends StorageAdapter<true>> {
    public readonly gameId: string
    private db: A
    private actor: TRLGActor


    private constructor(gameId: string, adapter: A) {
        this.gameId = gameId

        this.db = adapter
        
        if(this.db.jsonLoaded && this.db.json.initialized) {
            this.actor = createActor(machine, {
                snapshot: JSON.parse(this.db.json.snapshotJSON)
            })
        } else {
            this.actor = createActor(machine).start()
            this.persist()
        }
    }

    public get jsonLoaded() {
        return this.db.jsonLoaded
    }

    public get jsonInitialized() {
        return this.db.isInitialized
    }
    public static async generate<A extends StorageAdapter<true>>(gameId: string, path: string, initialJson: ActorStorageJSON, genAdapter: (path: string, init: ActorStorageJSON) => Promise<A>) {
        const adapter = await genAdapter(path,initialJson)
        await adapter.load()
        return new AsyncActorStorage<A>(gameId, adapter)
    }

    private async persist() {
        const persistedSnapshot = this.actor.getPersistedSnapshot()
        await this.db.persist(JSON.stringify(persistedSnapshot))
    }

    private async manipulate(fn: (actor: TRLGActor) => void) {
        fn(this.actor)
        await this.persist()
    }

    private async manipulateWithResult<T>(fn: (actor: TRLGActor) => T): Promise<T> {
        const result = fn(this.actor)
        await this.persist()
        return result
    }

    public get gameTriple() {
        const { value, context } = this.actor.getSnapshot()
        const nowPlayerAccount = this.db.json.playerAccounts[context.nowPid]
        return {
            state: value,
            gameContext: context,
            nowPlayerAccount
        }
    }

    public get serializedGameContext() {
        const {
            value, context: {
                mainStatuses: {
                    players: [p0, p1, p2, p3],
                    landProperties,
                    govIncome,
                    cashCache
                },
                turns, nowPid, dicesNow,
                fund, ending,
                financialWarningCache,
                remainingSidecars,
                freshChanceCardCache,
                lottoTriesCountCache,
                lottoCache, doubleLotto,
                dicesSecondary, feeCache,
                maxPurchasableAmountCache,
                wonLotto,
                jailTurnResultCache
            }
        } = this.actor.getSnapshot()
        const state = value
        const nowPlayerAccount = this.db.json.playerAccounts[nowPid]
        const serializedLandProperties: SerializedGameContext['mainStatuses']['landProperties'] = {
            locations: [],
            map: {}
        }
        landProperties.forEach((status,loc) => {
            serializedLandProperties.map[loc] = status
            serializedLandProperties.locations.push(loc)
        })
        const serializedGameContext: SerializedGameContext = {
            mainStatuses: {
                players: [p0, p1, p2, p3] as [PlayerStatus, PlayerStatus, PlayerStatus, PlayerStatus],
                landProperties: serializedLandProperties,
                govIncome,
                cashCache
            },
            turns, nowPid, dicesNow,
            fund, ending,
            financialWarningCache,
            remainingSidecars,
            freshChanceCardCache,
            lottoTriesCountCache,
            lottoCache, doubleLotto,
            dicesSecondary, feeCache,
            maxPurchasableAmountCache,
            wonLotto,
            jailTurnResultCache
        }
        return {
            state,
            gameContext: serializedGameContext,
            nowPlayerAccount
        }
    }

    public async trigger(event: EventType) {
        await this.manipulate((actor) => {
            actor.send(event)
        })
    }

    public findPid(account: string) : 0|1|2|3|null {
        const players = this.db.json.playerAccounts
        const pids = [0,1,2,3] as const
        for(const pid of pids) {
            if(players[pid] === account) {
                return pid
            } else {
                continue
            }
        }
        return null
    }
}



const _COMMAND_MODAL_STATES = [
    "jailModal",
    "lottoModal",
    "maintenanceSellModal",
    "preLottoModal",
    "purchaseModal",
    "sellModal",
    "rollDiceModal",
    "useTicketModal",
    "quirkOfFateModal",
    "greenNewDealModal",
    "trafficJamModal",
    "quickMoveModal",
    "extinctionModal",
    "tradeModal"
] as const
export type CommandModalStateType = typeof _COMMAND_MODAL_STATES[number]


const _NOTICE_MODAL_STATES = [
    "chanceKindNotice",
    "jailResultNotice",
    "lottoFinalResultNotice"
] as const
export type NoticeModalStateType = typeof _NOTICE_MODAL_STATES[number]

export type ModalStateType = CommandModalStateType | NoticeModalStateType | "frozen"

export type SearchResultType = {
    nowPid: 0|1|2|3,
    ending: "hasWinner" | "hasBankrupt" | null
}