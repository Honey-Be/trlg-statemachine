import { type BuildableLocationType, CELLS_COUNT, CITY_GROUPS, type CityLocationType, type DiceType, type GameContext, type LandPropertyStatus, type PlayerStatus, _CITY_GROUPS, getGroupPrice } from "./gameDefinition";
import { tupleMap } from "./utils";

function selectInsert(oldPlayers: [PlayerStatus, PlayerStatus, PlayerStatus, PlayerStatus], newPlayer: PlayerStatus, turnNow: 0|1|2|3): [PlayerStatus, PlayerStatus, PlayerStatus, PlayerStatus] {
    switch(turnNow) {
        case 3:
            return [oldPlayers[0], oldPlayers[1], oldPlayers[2], newPlayer]
        case 2:
            return [oldPlayers[0], oldPlayers[1], newPlayer, oldPlayers[3]]
        case 1:
            return [oldPlayers[0], newPlayer, oldPlayers[2], oldPlayers[3]]
        case 0:
            return [newPlayer, oldPlayers[1], oldPlayers[2], oldPlayers[3]]
    }
}

export function purchase(context: GameContext, turnNow: 0|1|2|3, purchaseAmount: number) {

    const chosen_player: PlayerStatus = context.mainStatuses.players[turnNow]


    const new_chosenPlayer = {
        ...chosen_player,
        cash: chosen_player.cash - purchaseAmount * 300000
    }
    const {amount, operatorId} = context.mainStatuses.landProperties.get(new_chosenPlayer.location as BuildableLocationType) ?? {
        amount: 0,
        operatorId: turnNow
    };

    const players: typeof context.mainStatuses.players = selectInsert(context.mainStatuses.players,new_chosenPlayer,turnNow)

    return {
        players,
        landProperties: context.mainStatuses.landProperties.set(new_chosenPlayer.location as BuildableLocationType, {amount: amount+purchaseAmount, operatorId}),
        govIncome: context.mainStatuses.govIncome,
        cashCache: context.mainStatuses.cashCache
    }
}

export function move(context: GameContext, amount: number, basis?: number): GameContext['mainStatuses'] {
    let turnNow = context.nowPid
    const chosen_player: PlayerStatus = context.mainStatuses.players[turnNow]
    const virtual_location = (basis ?? chosen_player.location) + amount

    let new_chosenPlayer: PlayerStatus
    let hasTaxExemption: boolean = chosen_player.remaining.tickets.taxExemption > 0
    let hasBonus: boolean = chosen_player.remaining.tickets.bonus > 0
    let graduated: boolean = chosen_player.univEducation === 2
    if(virtual_location < CELLS_COUNT) {
        new_chosenPlayer = {
            ...chosen_player,
            location: virtual_location
        }
    } else if (graduated) {
        if (hasBonus) {
            if (hasTaxExemption) {
                new_chosenPlayer = {
                    ...chosen_player,
                    location: virtual_location % CELLS_COUNT,
                    cycle: chosen_player.cycle + 1,
                    cash: chosen_player.cash + 8000000,
                    remaining: {
                        jailTurns: chosen_player.remaining.jailTurns,
                        tickets: {
                            ...chosen_player.remaining.tickets,
                            bonus: Math.max(chosen_player.remaining.tickets.bonus - 1, 0),
                            taxExemption: Math.max(chosen_player.remaining.tickets.taxExemption - 1, 0)
                        }
                    }
                }
            } else {
                new_chosenPlayer = {
                    ...chosen_player,
                    location: virtual_location % CELLS_COUNT,
                    cycle: chosen_player.cycle + 1,
                    cash: chosen_player.cash + 7000000,
                    remaining: {
                        jailTurns: chosen_player.remaining.jailTurns,
                        tickets: {
                            ...chosen_player.remaining.tickets,
                            bonus: Math.max(chosen_player.remaining.tickets.bonus - 1, 0)
                        }
                    }
                }
            }
        } else if (hasTaxExemption) {
            new_chosenPlayer = {
                ...chosen_player,
                location: virtual_location % CELLS_COUNT,
                cycle: chosen_player.cycle + 1,
                cash: chosen_player.cash + 4000000,
                remaining: {
                    jailTurns: chosen_player.remaining.jailTurns,
                    tickets: {
                        ...chosen_player.remaining.tickets,
                        taxExemption: Math.max(chosen_player.remaining.tickets.taxExemption - 1, 0)
                    }
                }
            }
        } else {
            new_chosenPlayer = {
                ...chosen_player,
                location: virtual_location % CELLS_COUNT,
                cycle: chosen_player.cycle + 1,
                cash: chosen_player.cash + 3000000
            }
        }
    } else if (hasBonus) {
        if (hasTaxExemption) {
            new_chosenPlayer = {
                ...chosen_player,
                location: virtual_location % CELLS_COUNT,
                cycle: chosen_player.cycle + 1,
                cash: chosen_player.cash + 6000000,
                remaining: {
                    jailTurns: chosen_player.remaining.jailTurns,
                    tickets: {
                        ...chosen_player.remaining.tickets,
                        bonus: Math.max(chosen_player.remaining.tickets.bonus - 1, 0),
                        taxExemption: Math.max(chosen_player.remaining.tickets.taxExemption - 1, 0)
                    }
                }
            }
        } else {
            new_chosenPlayer = {
                ...chosen_player,
                location: virtual_location % CELLS_COUNT,
                cycle: chosen_player.cycle + 1,
                cash: chosen_player.cash + 5000000,
                remaining: {
                    jailTurns: chosen_player.remaining.jailTurns,
                    tickets: {
                        ...chosen_player.remaining.tickets,
                        bonus: Math.max(chosen_player.remaining.tickets.bonus - 1, 0)
                    }
                }
            }
        }
    } else if (hasTaxExemption) {
        new_chosenPlayer = {
            ...chosen_player,
            location: virtual_location % CELLS_COUNT,
            cycle: chosen_player.cycle + 1,
            cash: chosen_player.cash + 3000000,
            remaining: {
                jailTurns: chosen_player.remaining.jailTurns,
                tickets: {
                    ...chosen_player.remaining.tickets,
                    taxExemption: Math.max(chosen_player.remaining.tickets.taxExemption - 1, 0)
                }
            }
        }
    } else {
        new_chosenPlayer = {
            ...chosen_player,
            location: virtual_location % CELLS_COUNT,
            cycle: chosen_player.cycle + 1,
            cash: chosen_player.cash + 2000000
        }
    }

    const players = selectInsert(context.mainStatuses.players,new_chosenPlayer,turnNow)

    if(virtual_location < CELLS_COUNT) {
        return {
            players,
            landProperties: context.mainStatuses.landProperties,
            govIncome: context.mainStatuses.govIncome,
            cashCache: context.mainStatuses.cashCache
        }
    } else {
        let quarter_govIncome = (hasTaxExemption) ? ((context.mainStatuses.govIncome) / 4) : ((context.mainStatuses.govIncome + 1000000) / 4)
        const post_players = tupleMap<PlayerStatus, PlayerStatus, 4>(players,(v: PlayerStatus) => {
            return {
                ...v,
                cash: v.cash + quarter_govIncome
            }
        }) as [PlayerStatus, PlayerStatus, PlayerStatus, PlayerStatus]
        return {
            players: post_players,
            landProperties: context.mainStatuses.landProperties,
            govIncome: 0,
            cashCache: context.mainStatuses.cashCache
        }
    }
}


export function go(context: GameContext) {
    const [dice1, dice2] = context.dicesNow as [DiceType, DiceType]
    return move(context,dice1 + dice2)
}

export function caculateLandPropsPriceTotal(landProps: Map<BuildableLocationType, LandPropertyStatus>, turnNow: 0|1|2|3): number {
    return Array.from(landProps.entries()).map(([_, prop]) => prop).filter((prop) => {
        prop.operatorId === turnNow
    }).reduce((acc, currVal) => {
        return acc + (currVal.amount * 300000)
    },0)
}

export function getCityLandFee(context: GameContext) {
    let turnNow = context.nowPid
    let chosen_player = context.mainStatuses.players[turnNow]

    let loc = chosen_player.location as CityLocationType
    let gid = CITY_GROUPS[loc]
    let groupCellLocations = _CITY_GROUPS[gid]
    let mapped = groupCellLocations.map((_l) => {
        return context.mainStatuses.landProperties.get(_l)?? null
    })
    let monopoly_factor: 1 | 2 | 4 | 6
    if (mapped.includes(null)) {
        monopoly_factor = 1
    } else {
        let safeMapped = mapped.map((x) => x as LandPropertyStatus)
        let owners = new Set(safeMapped.map((x) => x.operatorId))
        if (owners.size == 1) {
            let minimumOwned = safeMapped.reduce((acc, currVal) => Math.min(acc,currVal.amount),3)
            switch (minimumOwned) {
                case 3:
                    monopoly_factor = 6;
                    break;
                case 2:
                    monopoly_factor = 4;
                    break;
                case 1:
                    monopoly_factor = 2;
                    break;
                default:
                    monopoly_factor = 1;
                    break;                
            }
        } else {
            monopoly_factor = 1;
        }
    }

    return getGroupPrice(loc) * monopoly_factor
}

export function payToGovernment(context: GameContext, targetPid: 0|1|2|3, payment: number) {
    const chosen_player = context.mainStatuses.players[targetPid]
    const cash = (context.mainStatuses.cashCache ?? chosen_player.cash)
    return {
        ...context.mainStatuses,
        govIncome: context.mainStatuses.govIncome + payment,
        cashCache: cash - payment
    }
}

export function payToMarket(context: GameContext, targetPid: 0|1|2|3, payment: number): GameContext['mainStatuses'] {
    const chosen_player = context.mainStatuses.players[targetPid]
    const cash = (context.mainStatuses.cashCache ?? chosen_player.cash)
    return {
        ...context.mainStatuses,
        cashCache: cash - payment
    }
}

