import { CELLS_COUNT, GameContext, LandPropertyStatus, PlayerStatus, TicketsType } from "./gameDefinition";
import { LandPropSaleType } from "./gameutils";
import { getCityLandFee, payToGovernment } from "./ruleDefinition";
import { Tuple, tupleMap } from "./utils";

export function needFund(context: GameContext): GameContext['mainStatuses'] {
    const {
        players,
        landProperties,
        govIncome,
        cashCache
    } = context.mainStatuses
    const new_players: typeof players = [...players]
    new_players[context.nowPid].cash += context.fund
    return {
        players: new_players,
        landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
        govIncome,
        cashCache
    }
}

export function needBasicIncome(context: GameContext): GameContext['mainStatuses'] {
    const {
        players,
        landProperties,
        govIncome,
        cashCache
    } = context.mainStatuses
    const new_players = tupleMap(players,(p) => ({
        ...p,
        cash: p.cash + (govIncome / 4)
    } as PlayerStatus)) as typeof players
    return {
        players: new_players,
        landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
        govIncome: 0,
        cashCache
    }
}

export function payCityLandFee(context: GameContext): GameContext['mainStatuses'] {
    return payToGovernment(context,context.nowPid,getCityLandFee(context))
}

export function payIndustrialLandFee(context: GameContext): GameContext['mainStatuses'] {
    return payToGovernment(context,context.nowPid,600000)
}

export function payTax(context: GameContext): GameContext['mainStatuses'] {
    return payToGovernment(context,context.nowPid,300000)
}

export function jailAction(context: GameContext, immediate: "byLawyer" | "byDice" | "byCash" | false = false): GameContext['mainStatuses'] {
    const new_players = [
        ...tupleMap<PlayerStatus, PlayerStatus, 4>(context.mainStatuses.players, (player, idx) => {
            let output: PlayerStatus
            let nowTurn = context.nowPid
            if(idx === nowTurn) {
                if(immediate === "byLawyer") {
                    output = {
                        ...player,
                        remaining: {
                            ...player.remaining,
                            jailTurns: 0
                        }
                    }
                } else if(immediate === "byDice") {
                    output = {
                        ...player,
                        remaining: {
                            ...player.remaining,
                            jailTurns: 0
                        }
                    }
                } else if(immediate === "byCash") {
                    output = {
                        ...player,
                        cash: player.cash - 400000,
                        remaining: {
                            ...player.remaining,
                            jailTurns: 0
                        }
                    }
                } else {
                    output = {
                        ...player,
                        remaining: {
                            ...player.remaining,
                            jailTurns: (player.remaining.jailTurns > 2) ? 2 : (player.remaining.jailTurns > 2) ? 1 : 0
                        }
                    }
                }
            } else {
                output = player
            }
            return output
        })
    ] as GameContext['mainStatuses']['players']
    return {
        players: new_players,
        landProperties: context.mainStatuses.landProperties,
        govIncome: context.mainStatuses.govIncome,
        cashCache: context.mainStatuses.cashCache
    }
}

export function warpTo(context: GameContext, dest: number): GameContext['mainStatuses'] {
    const { mainStatuses: {players, landProperties, govIncome, cashCache }, nowPid } = context
    const new_players: typeof players = [...players]
    new_players[nowPid].location = dest % CELLS_COUNT
    return {
        players: new_players,
        landProperties,
        govIncome,
        cashCache
    }
}

export function earnMoney(context: GameContext, amount: number, targetPid?: 0|1|2|3): GameContext['mainStatuses'] {
    const { mainStatuses: {players, landProperties, govIncome, cashCache }} = context
    let pid = targetPid ?? context.nowPid
    const new_players: typeof players = [...players]
    new_players[pid].cash += Math.max(0, amount)
    return {
        players: new_players,
        landProperties,
        govIncome,
        cashCache
    }
}

export function loseMoney(context: GameContext, amount: number, targetPid?: 0|1|2|3): GameContext['mainStatuses'] {
    const { mainStatuses: {players, landProperties, govIncome, cashCache }} = context
    let pid = targetPid ?? context.nowPid
    const new_players: typeof players = [...players]
    new_players[pid].cash -= Math.max(0, amount)
    return {
        players: new_players,
        landProperties,
        govIncome,
        cashCache
    }
}

export function getTicket(context: GameContext, ticketType: keyof TicketsType): GameContext['mainStatuses'] {
    const { mainStatuses: {players, landProperties, govIncome, cashCache }, nowPid} = context
    const new_players: typeof players = [...players]
    new_players[nowPid].remaining.tickets[ticketType] += 1
    return {
        players: new_players,
        landProperties,
        govIncome,
        cashCache
    }
}

export function useTicket(context: GameContext, ticketType: keyof TicketsType): GameContext['mainStatuses'] {
    const { mainStatuses: {players, landProperties, govIncome, cashCache }, nowPid} = context
    const new_players: typeof players = [...players]
    if(new_players[nowPid].remaining.tickets[ticketType] > 0) {
        new_players[nowPid].remaining.tickets[ticketType] -= 1
    }
    return {
        players: new_players,
        landProperties,
        govIncome,
        cashCache
    }
}

export function destroyEachBuildingForTargets(context: GameContext, f: (loc: number, stat: LandPropertyStatus) => boolean): GameContext['mainStatuses'] {
    const {mainStatuses: {players, landProperties, govIncome, cashCache }, nowPid} = context
            const new_landProperties = new Map(Array.from(landProperties.entries()).map((entry) => {
                if(f(entry[0], entry[1])) {
                    return [entry[0], {
                        amount: entry[1].amount - 1,
                        operatorId: entry[1].operatorId
                    }] as typeof entry
                } else {
                    return entry
                }
            }).filter(([_,{amount}]) => amount > 0))
            return {
                players,
                landProperties: new_landProperties,
                govIncome,
                cashCache
            }
}


export function educate(context: GameContext, immediate: boolean = false, targetPid?: 0|1|2|3): GameContext['mainStatuses'] {
    const { mainStatuses: {players, landProperties, govIncome, cashCache }} = context
    let pid = targetPid ?? context.nowPid
    const new_players: typeof players = [...players]
    let acc_education = new_players[pid].univEducation
    new_players[pid].univEducation = (!immediate && (acc_education === 0)) ? 1 : 2
    return {
        players: new_players,
        landProperties,
        govIncome,
        cashCache
    }
}

export function imprison(context: GameContext, targetPid?: 0|1|2|3): GameContext['mainStatuses'] {
    const { mainStatuses: {players, landProperties, govIncome, cashCache }} = context
    let pid = targetPid ?? context.nowPid
    const new_players: typeof players = [...players]
    new_players[pid].remaining.jailTurns = 3
    return {
        players: new_players,
        landProperties,
        govIncome,
        cashCache
    }
}

export function commitCache(context: GameContext) {
    const { mainStatuses: {players, landProperties, govIncome, cashCache }, nowPid} = context
    const new_players: typeof players = [...players]
    if(cashCache !== null) {
        new_players[nowPid].cash = cashCache
    }
    return {
        players: new_players,
        landProperties,
        govIncome,
        cashCache: null
    }
}

export function sell(context: GameContext, targets: LandPropSaleType[], fee: number, toGov: boolean = false): GameContext['mainStatuses'] {
    if (fee > 0) {
        const {
            mainStatuses: { players, landProperties, govIncome },
            nowPid
        } = context
        let sold = 0
        const new_lp = new Map(Array.from(landProperties.entries()).map(([lp_loc,status]) => {
            let new_status: typeof status | null = null
            for (let {location, amount} of targets) {
                if((lp_loc === location) && (status.operatorId === nowPid)) {
                    new_status = {
                        operatorId: status.operatorId,
                        amount: Math.max(0,status.amount - amount)
                    }
                    sold += Math.min(status.amount, amount)
                } else {
                    continue
                }
            }
            return [lp_loc,(new_status ?? status)] as [typeof lp_loc, typeof status]
        }).filter(([_,status]) => status.amount > 0))
        const new_cashCache = (context.mainStatuses.cashCache ?? players[nowPid].cash) + (sold * 300000) - fee
        return {
            players,
            landProperties: new_lp,
            govIncome: (toGov) ? (govIncome + fee) : govIncome,
            cashCache: new_cashCache
        }
    } else {
        return context.mainStatuses
    }
}