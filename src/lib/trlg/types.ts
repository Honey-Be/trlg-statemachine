import type { DiceType, JailTurnType, PlayerStatus } from "./gameDefinition";
import type { ChanceCardKindType } from "./gameutils";

export interface ClientInfoEntry {
    account: string | null;
    gameId: string;
    grant: 0 | 1 | 2 | 3 | null;
}

export type SerializedGameContext = {
    mainStatuses: {
        players: [PlayerStatus, PlayerStatus, PlayerStatus, PlayerStatus];
        landProperties: {
            locations: number[],
            map: {
                [loc: number]: {
                    operatorId: 0|1|2|3,
                    amount: number
                }
            }
        }
        govIncome: number;
        cashCache: number | null;
    }
    turns: number;
    nowPid: 0|1|2|3;
    dicesNow: [DiceType, DiceType] | null;
    fund: number;
    ending: "hasWinner" | "hasBankrupt" | null;
    financialWarningCache: "needFund" | "needBasicIncome" | null;
    remainingSidecars: {
        catastrophe: number;
        pandemic: number;
    };
    freshChanceCardCache: ChanceCardKindType | null;
    lottoTriesCountCache: 0|1|2|3;
    lottoCache: "ongoing" | "lost" | "won" | null;
    doubleLotto: boolean | null;
    dicesSecondary: [DiceType, DiceType] | null;
    feeCache: number;
    maxPurchasableAmountCache: number;
    wonLotto: number|null;
    jailTurnResultCache: JailTurnType | null;
}

export * from "./storage"