import { Redis } from "@upstash/redis/cloudflare"
import type { ActorStorageJSON, StorageAdapter } from "../storage";


const jsonPool: {
    [gameId: string]: ActorStorageJSON
} = {}

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
})

export default class UpstashRedisAdapter implements StorageAdapter<true> {
    private gameId: string
    public constructor(gameId: string, initialJSON: ActorStorageJSON) {
        this.gameId = gameId
        jsonPool[gameId] = initialJSON
    }
    public async load(): Promise<"OK" | null> {
        const got = await redis.json.get<ActorStorageJSON>("session", `$.${this.gameId}`)
        if(got !== null) {
            jsonPool[this.gameId] = {
                initialized: got.initialized,
                snapshotJSON: got.snapshotJSON,
                playerAccounts: [...got.playerAccounts]
            }
            return "OK"
        } else {
            return await redis.json.set("session", `$.${this.gameId}`,jsonPool[this.gameId])
        }
    }

    public async persist(persistedSnapshot: string): Promise<"OK" | null> {
        jsonPool[this.gameId].snapshotJSON = persistedSnapshot
        if(!(jsonPool[this.gameId].initialized)) {
            jsonPool[this.gameId].initialized = true
        }
        return await redis.json.set("session", `$.${this.gameId}`,jsonPool[this.gameId])
    }

    public get json(): ActorStorageJSON {
        return {
            initialized: jsonPool[this.gameId].initialized,
            snapshotJSON: jsonPool[this.gameId].snapshotJSON,
            playerAccounts: [...jsonPool[this.gameId].playerAccounts]
        }
    }

    public get isInitialized() {
        return jsonPool[this.gameId].initialized
    }

    public get jsonLoaded() {
        return (this.gameId in jsonPool)
    }

    public async tryPreInit(pa0: string, pa1: string, pa2: string, pa3: string, snapshotJSON: string = "") {
        if((await redis.json.get<ActorStorageJSON>("session", `$.${this.gameId}`)) === null) {
            const json: ActorStorageJSON = {
                initialized: false,
                snapshotJSON,
                playerAccounts: [pa0, pa1, pa2, pa3]
            }
            jsonPool[this.gameId] = json
            const session_result = await redis.json.set("session", `$.${this.gameId}`,json)

            let id_result: "OK" | null
            const id_list = await redis.json.get<string[]>("id", "$")
            if(id_list === null) {
                let arrappend_result = await redis.json.arrappend("id","$",this.gameId)
                id_result = (arrappend_result.length > 0 && !(arrappend_result.includes(null))) ? "OK" : null
            } else if(id_list.includes(this.gameId)) {
                id_result = "OK"
            } else {
                let arrappend_result = await redis.json.arrappend("id","$",this.gameId)
                id_result = (arrappend_result.length > 0 && !(arrappend_result.includes(null))) ? "OK" : null
            }

            if(session_result === null || id_result === null) {
                return null
            } else {
                return "OK"
            }
        } else {
            let id_result: "OK" | "NO_NEED" | null
            const id_list = await redis.json.get<string[]>("id", "$")
            if(id_list === null) {
                id_result = await redis.json.set("id","$", new Array<string>(this.gameId))
            } else if(id_list.includes(this.gameId)) {
                id_result = "NO_NEED"
            } else {
                let arrappend_result = await redis.json.arrappend("id","$",this.gameId)
                id_result = (arrappend_result.length > 0 && !(arrappend_result.includes(null))) ? "OK" : null
            }

            return id_result
        }
    }
}