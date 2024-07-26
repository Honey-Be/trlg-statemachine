export type ActorStorageJSON = {
    initialized: boolean,
    snapshotJSON: string,
    playerAccounts: [string, string, string, string]
}

export type WrapAsync<T, IsAsync extends boolean> = IsAsync extends true ? Promise<T> : T

export interface StorageAdapter<IsAsync extends boolean> {
    load(): WrapAsync<"OK" | null, IsAsync>
    persist(persistedSnapshot: string): WrapAsync<"OK" | null, IsAsync>
    get json(): ActorStorageJSON
    get jsonLoaded(): boolean
    get isInitialized(): boolean
}