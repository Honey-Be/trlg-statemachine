import { BiMap } from "@rimbu/core";
import { Tuple, circularPushMap, concatAll, concatAllReadonly, contains, equalSet, product, productLiteral, productLiteralFMap } from "./utils";
import { ChanceCardKindType } from "./gameutils";

export type TicketsType = {
    feeExemption: number;
    taxExemption: number;
    bonus: number;
    doubleLotto: number;
    lawyer: number;
    freeHospital: number;
}

export type PlayerStatus = {
    cash: number;
    location: number;
    remaining: {
      jailTurns: 0 | 1 | 2 | 3;
      tickets: TicketsType
    };
    cycle: number
    univEducation: 0|1|2;
};

export type LandPropertyStatus = {
    operatorId: 0|1|2|3;
    amount: number;
}

export const DICES = [1,2,3,4,5,6] as const

export type DiceType = typeof DICES[number]

export const DICES_SUMS_LOOKUP = {
    1: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7} ,
    2: { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8 },
    3: { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 },
    4: { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10 },
    5: { 1: 6, 2: 7, 3: 8, 4: 9, 5: 10, 6: 11 },
    6: { 1: 7, 2: 8, 3: 9, 4: 10, 5: 11, 6: 12 }
} as const

export type DicesSumType = typeof DICES_SUMS_LOOKUP[DiceType][DiceType]

export type GameContext = {
    mainStatuses: {
        players: [PlayerStatus, PlayerStatus, PlayerStatus, PlayerStatus];
        landProperties: Map<BuildableLocationType, LandPropertyStatus>;
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
}

export type TriggerType = "buy" | "sell" | "pick" | "payment" | "paymentOwned" | "imprison" | "transport" | "nothing" | "roll";

export type SALARY = 3000000
export type TAXES = 1000000

export const JAIL_LOCATION = 9
export const UNIVERSITY_LOCATION = 18
export const CONCERT_LOCATION = 27
export const PARK_LOCATION = 36
export const HOSPITAL_LOCATION = 45
export const LOTTO_LOCATION = 3
export const FUND_LOCATION = 52

export const CELLS_COUNT = 54

export type Cell = ({
    location: 0;
    type: "start";
    maxBuildable: 0;
} | {
    location: CityLocationType;
    type: "city";
    maxBuildable: 3;
    group: CityGroupType;
} | {
    location: IndustrialLocationType;
    type: "industrial";
    maxBuildable: 1;
} | {
    location: number;
    type: "chance" | "infra";
    maxBuildable: 0;
} | {
    location: typeof JAIL_LOCATION;
    type: "jail";
    maxBuildable: 0;   
} | {
    location: number;
    type: "transportation",
    maxBuildable: 0;
    amountToTarget: number
} | {
    location: typeof UNIVERSITY_LOCATION;
    type: "univ";
    maxBuildable: 0;
} | {
    location: typeof CONCERT_LOCATION;
    type: "concert";
    maxBuildable: 0;
} | {
    location: typeof PARK_LOCATION;
    type: "park";
    maxBuildable: 0;
} | {
    location: typeof HOSPITAL_LOCATION;
    type: "hospital";
    maxBuildable: 0;
} | {
    location: typeof LOTTO_LOCATION;
    type: "lotto";
    maxBuildable: 0;
} | {
    location: typeof FUND_LOCATION;
    type: "fund";
    maxBuildable: 0;
})


export const _CITY_GROUPS = {
    0: [2,4] as const,
    1: [6,8] as const,
    2: [11,12,13] as const,
    3: [15,17] as const,
    4: [20,22] as const,
    5: [24,25,26] as const,
    6: [29,30] as const,
    7: [32,33,34] as const,
    8: [38,40] as const,
    9: [42,43] as const,
    10: [47,48,49] as const,
    11: [51,53] as const
}

export type CityGroupType = keyof typeof _CITY_GROUPS


const CITY_LOCATIONS = [2,4,6,8,11,12,13,15,17,20,22,24,25,26,29,30,32,33,34,38,40,42,43,47,48,49,51,53] as const
export type CityLocationType = typeof _CITY_GROUPS[CityGroupType][number]

export const CITY_GROUPS: {
    [loc in CityLocationType]: CityGroupType
} = {
    2: 0, 4: 0,
    6: 1, 8: 1,
    11: 2, 12: 2, 13: 2,
    15: 3, 17: 3,
    20: 4, 22: 4,
    24: 5, 25: 5, 26: 5,
    29: 6, 30: 6,
    32: 7, 33: 7, 34: 7,
    38: 8, 40: 8,
    42: 9, 43: 9,
    47: 10, 48: 10, 49: 10,
    51: 11, 53: 11
}


const TRANSITS = [1,10,19,28,37,46]
export const TRANSIT_TARGETS = circularPushMap(TRANSITS, 1)

const CHANCES = [5,14,23,31,41,50]

export type InfraKindType = "water" | "electricity" | "gas"
const INFRAS = BiMap.of<number, InfraKindType>(
    [7,"water"],
    [16, "electricity"],
    [21, "gas"]
)

export function getInfraLocation(kind: InfraKindType): number {
    return INFRAS.getKey(kind) as number
}

const INDUSTRIALS = [35,39,44] as const
export type IndustrialLocationType = typeof INDUSTRIALS[number]

const DEFINED_LOCATIONS = new Set([
    0,
    JAIL_LOCATION,
    UNIVERSITY_LOCATION,
    CONCERT_LOCATION,
    PARK_LOCATION,
    HOSPITAL_LOCATION,
    LOTTO_LOCATION,
    FUND_LOCATION
].concat(CITY_LOCATIONS, TRANSITS, CHANCES, INFRAS.toArray().map(([loc, _]) => loc), INDUSTRIALS))

const ALL_LOCATIONS = new Set(Array.from({length: CELLS_COUNT}, (_, k) => {
    return k
}))

if (!equalSet(DEFINED_LOCATIONS, ALL_LOCATIONS)) {
    throw new Error("There are some undefined cells :(")
}

const COASTAL_CITIES = new Set([2, 4, 8, 17, 25, 26, 30, 43, 48, 49, 51])
if (contains(COASTAL_CITIES,CITY_LOCATIONS)) {
    throw new Error("'isCoastal' can only be defined for cities :(")
}

const MEGACITIES = new Set([53, 51, 48, 47, 34, 33, 30, 17, 29, 32])
if (contains(MEGACITIES,CITY_LOCATIONS)) {
    throw new Error("'isMegacity' can only be defined for cities :(")
}


export const CELLS = Array.from<any, Cell>({length: CELLS_COUNT}, (_, k) => {
    if (k === 0) {
        return {
            location: 0,
            type: "start",
            maxBuildable: 0
        } as Cell
    } else if (k === LOTTO_LOCATION) {
        return {
            location: LOTTO_LOCATION,
            type: "lotto",
            maxBuildable: 0
        } as Cell
    } else if (k === JAIL_LOCATION) {
        return {
            location: JAIL_LOCATION,
            type: "jail",
            maxBuildable: 0
        } as Cell
    } else if (k === UNIVERSITY_LOCATION) {
        return {
            location: UNIVERSITY_LOCATION,
            type: "univ",
            maxBuildable: 0
        } as Cell
    } else if (k === CONCERT_LOCATION) {
        return {
            location: CONCERT_LOCATION,
            type: "concert",
            maxBuildable: 0
        } as Cell
    } else if (k === PARK_LOCATION) {
        return {
            location: PARK_LOCATION,
            type: "park",
            maxBuildable: 0
        } as Cell
    } else if (k === HOSPITAL_LOCATION) {
        return {
            location: HOSPITAL_LOCATION,
            type: "hospital",
            maxBuildable: 0
        } as Cell
    } else if (k === FUND_LOCATION) {
        return {
            location: FUND_LOCATION,
            type: "fund",
            maxBuildable: 0
        } as Cell
    } else if (k in CITY_LOCATIONS) {
        return {
            location: k,
            type: "city",
            maxBuildable: 3,
            group: CITY_GROUPS[k as CityLocationType]
        } as Cell
    } else if (TRANSITS.includes(k)) {
        let amount = TRANSIT_TARGETS[k] - k
        return {
            location: k,
            type: "transportation",
            maxBuildable: 0,
            amountToTarget: (amount > 0) ? amount : (amount + CELLS_COUNT)
        } as Cell
    } else if (INFRAS.hasKey(k)) {
        return {
            location: k,
            type: "infra",
            maxBuildable: 0
        } as Cell
    } else if (k in INDUSTRIALS) {
        return {
            location: k,
            type: "industrial",
            maxBuildable: 1
        } as Cell
    } else {
        return {
            location: k,
            type: "chance",
            maxBuildable: 0
        } as Cell
    }
})

export function getGroupPrice(loc: CityLocationType) {
    if (CITY_GROUPS[loc] === undefined) {
        return 0
    } else {
        return (CITY_GROUPS[loc] + 1) * 100000
    }
}


export function randomDices(): [DiceType, DiceType] {
    const mappedRandomBytes = crypto.getRandomValues(new Uint8Array(4)).map((byte) => ((byte % 36) + 64))
    const a = mappedRandomBytes[0] ^ mappedRandomBytes[3]
    const b = mappedRandomBytes[1] ^ mappedRandomBytes[2]
    const interm = (a + b) % 36
    let q: DiceType, r: DiceType
    switch (interm % 6) {
        case 0: r = 1; break;
        case 1: r = 2; break;
        case 2: r = 3; break;
        case 3: r = 4; break;
        case 4: r = 5; break;
        default: r = 6; break;
    }
    switch (Math.floor(interm / 6)) {
        case 0: q = 1; break;
        case 1: q = 2; break;
        case 2: q = 3; break;
        case 3: q = 4; break;
        case 4: q = 5; break;
        default: q = 6; break;
    }
    return [q,r]
}

export function isCoastal(loc: number) {
    return (loc in CITY_LOCATIONS) && (loc in COASTAL_CITIES)
}

export function isMegacity(loc: number) {
    return (loc in CITY_LOCATIONS) && (loc in MEGACITIES)
}

export type LottoChoiceType = "bothOdd" | "oddEven" | "bothEven"

export const BUILDABLE_LOCATIONS = [...CITY_LOCATIONS, ...INDUSTRIALS] as const
export type BuildableLocationType = typeof BUILDABLE_LOCATIONS[number]