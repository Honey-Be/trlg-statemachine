import { setup, assign } from "xstate"
import {
    CELLS, CELLS_COUNT,
    type Cell, type CityGroupType, type CityLocationType, type DiceType,
    type GameContext, type LandPropertyStatus, type LottoChoiceType, TRANSIT_TARGETS, type BuildableLocationType,
    _CITY_GROUPS, randomDices, BUILDABLE_LOCATIONS,
    type TicketsType } from "./gameDefinition";
import { caculateLandPropsPriceTotal, go, move, payToGovernment, payToMarket, purchase } from "./ruleDefinition";
import { copyMainStatuses, tupleMap } from "./utils";
import {
    commitCache, distributePayment, earnMoney, educate, imprison, jailAction,
    needBasicIncome, needFund, payCityLandFee, payIndustrialLandFee, sell
} from "./actions";
import {
    type ChanceCardKindType, type LandPropSaleType, NEEDS_CHECK_CHANCE_CARDS, NORMAL_CHANCE_CARDS,
    type NeedsCheckChanceCardKindType, SIDECAR_CHANCE_CARDS, bankruptcyCheck, basicIncomeCheck,
    fundCheck, getHelpFromBasicIncomeGeneral, getHelpFromFundGeneral, getTargetPid,
    randomChance, simplyLosingMoneyCheck, swapCash, swapLandProperties, useOneTicket } from "./gameutils";

export type EventType = {type: "purchase", value: {amount: number}}
    | {type: "sell", targets: LandPropSaleType[]}
    | {type: "nop"} //
    | {type: "rollDice"} //
    | {type: "thanksToLawyer"} //
    | {type: "showMeTheMONEY"} //
    | {type: "pickTargetPlayer"} //
    | {type: "pickTargetLocation", targetLocation: number} //
    | {type: "pickTargetGroup", targetGroupId: CityGroupType} //
    | {type: "tryLotto", choice: LottoChoiceType} //
    | {type: "stopLotto"} //
    | {type: "useTicket"} // 
    | {type: "startLotto", useDoubleLottoTicket: boolean} //
    | {type: "pickTargetsPair", my: CityLocationType, others: CityLocationType} //
    | {type: "noticeChecked"} //

export const machine = setup({
    types: {
        context: {} as GameContext,
        events: {} as EventType
    },
    guards: {
        purchasable({context}, {nowTurn}: {nowTurn: 0|1|2|3| undefined} ) {
            let pid = nowTurn ?? context.nowPid
            let playerNow = context.mainStatuses.players[pid]
            let location = playerNow.location
            if (location in BUILDABLE_LOCATIONS) {
                let cash = context.mainStatuses.cashCache ?? playerNow.cash
                if (CELLS[location].type === "industrial") {
                    return !context.mainStatuses.landProperties.has(location as BuildableLocationType) && (cash >= 300000)
                } else if (CELLS[location].type === "city") {
                    if(context.mainStatuses.landProperties.has(location as BuildableLocationType)) {
                        let {amount, operatorId} = (context.mainStatuses.landProperties.get(location as BuildableLocationType) as LandPropertyStatus)
                        if (operatorId === pid) {
                            return (amount <= playerNow.cycle) && (cash >= 300000)
                        } else { return false }
                    } else {
                        return cash >= 300000
                    }
                } else { return false }
            } else { return false }
            
        },
        dicesSet({context}) {
            return context.dicesNow !== null
        },
        dicesDouble({context}) {
            let {dicesNow} = context
            return (dicesNow !== null) && (dicesNow[0] === dicesNow[1])
        },
        dicesDoubleButNotInPrison({context}, {nowTurn}: {nowTurn:0|1|2|3}) {
            let dicesNow = context.dicesNow
            let location = context.mainStatuses.players[nowTurn].location
            return (dicesNow !== null) && (dicesNow[0] === dicesNow[1]) && (CELLS[location].type !== "jail")
        },
        dicesNotSet({context}) {
            return context.dicesNow === null
        },
        cellTypeCheck({context}, {nowTurn, type}: {nowTurn: 0|1|2|3, type: Cell['type']}) {
            let location = context.mainStatuses.players[nowTurn].location
            return (CELLS[location].type === type)
        },
        notPurchasableButEnough({context}, {nowTurn}: {nowTurn: 0|1|2|3|undefined}) {
            let pid = nowTurn ?? context.nowPid
            let playerNow = context.mainStatuses.players[pid]
            let cash = context.mainStatuses.cashCache ?? playerNow.cash
            let loc = playerNow.location as BuildableLocationType
            let prp = context.mainStatuses.landProperties.get(loc)
            return (prp === undefined) || (prp.operatorId === pid) || (cash >= (prp.amount * 300000))
        },
        notEnoughMoney({context}, {nowTurn}: {nowTurn: 0|1|2|3|undefined}) {
            let pid = nowTurn ?? context.nowPid
            let playerNow = context.mainStatuses.players[pid]
            let cash = context.mainStatuses.cashCache ?? playerNow.cash
            let loc = playerNow.location as BuildableLocationType
            let amount = context.mainStatuses.landProperties.get(loc)?.amount as number
            return ((cash + caculateLandPropsPriceTotal(context.mainStatuses.landProperties,pid)) - (amount * 300000) >= 0)
        },
        bankrupt({context}, {nowTurn}: {nowTurn: 0|1|2|3|undefined}) {
            let pid = nowTurn ?? context.nowPid
            let playerNow = context.mainStatuses.players[pid]
            let cash = context.mainStatuses.cashCache ?? playerNow.cash
            let sum = cash + caculateLandPropsPriceTotal(context.mainStatuses.landProperties,pid)
            return (sum < 0) && (sum + context.fund >= 0)
        },
        stillBankrupt({context}, {nowTurn}: {nowTurn: 0|1|2|3|undefined}) {
            let pid = nowTurn ?? context.nowPid
            let playerNow = context.mainStatuses.players[pid]
            let cash = context.mainStatuses.cashCache ?? playerNow.cash
            let sum = cash + caculateLandPropsPriceTotal(context.mainStatuses.landProperties,pid) + context.fund
            return (sum < 0) && ((sum + (context.mainStatuses.govIncome / 4)) >= 0)
        },
        unsolvableBankrupt({context}, {nowTurn}: {nowTurn: 0|1|2|3|undefined}) {
            let pid = nowTurn ?? context.nowPid
            let playerNow = context.mainStatuses.players[pid]
            let cash = context.mainStatuses.cashCache ?? playerNow.cash
            let sum = cash + caculateLandPropsPriceTotal(context.mainStatuses.landProperties,pid) + context.fund + (context.mainStatuses.govIncome / 4)
            return (sum < 0)
        },
        jailRemaining({context}, {nowTurn}: {nowTurn: 0|1|2|3}) {
            let nowPlayer = context.mainStatuses.players[nowTurn]
            return (CELLS[nowPlayer.location].type === "jail") && (nowPlayer.remaining.jailTurns > 0)
        },
        allPlayersMoreThanFourCycles({context}) {
            let checked = tupleMap(context.mainStatuses.players,(player) => {
                return (player.cycle >= 4)
            }).reduce((acc, curr) => (acc && curr),true)
            return checked
        },
        checkChanceCardKind({context}, {kind}: {kind: ChanceCardKindType}) {
            return (context.freshChanceCardCache === kind)
        },
        notEnoughMoneyForChance({context}, {kind}: {kind: NeedsCheckChanceCardKindType}) {
            return (context.freshChanceCardCache === kind) && NEEDS_CHECK_CHANCE_CARDS[kind].check(context)
        },
        needHelpFromFundForChance({context}, {kind}: {kind: NeedsCheckChanceCardKindType}) {
            return (context.freshChanceCardCache === "maintenance") && NEEDS_CHECK_CHANCE_CARDS[kind].needHelpFromFund(context)
        },
        needHelpFromBasicIncomeForChance({context}, {kind}: {kind: NeedsCheckChanceCardKindType}) {
            return (context.freshChanceCardCache === "maintenance") && NEEDS_CHECK_CHANCE_CARDS[kind].needHelpFromBasicIncome(context)
        },
        bankruptForChance({context}, {kind}: {kind: NeedsCheckChanceCardKindType}) {
            return (context.freshChanceCardCache === "maintenance") && NEEDS_CHECK_CHANCE_CARDS[kind].bankrupt(context)
        },
        hasWonLotto({context}, {choice}: {choice: LottoChoiceType}) {
            if (context.dicesSecondary !== null) {
                let [d1, d2] = tupleMap(context.dicesSecondary, (dice) => ((dice % 2 > 0) ? 1 : 0) as (0|1)) as [0|1, 0|1]
                let diceResult: LottoChoiceType
                if(d1 === 0 && d2 === 0) {
                    diceResult = "bothEven"
                } else if (d1 === 1 && d2 === 1) {
                    diceResult = "bothOdd"
                } else {
                    diceResult = "oddEven"
                }
                return (diceResult === choice)
            } else {
                return false
            }
        },
        threeTimesWonLotto({context}) {
            return (context.lottoTriesCountCache === 3) && (context.lottoCache !== "won") && (context.lottoCache !== "lost")
        },
        checkLottoFinal({context}, {result}:{result: "won" | "lost"}) {
            return (context.lottoCache === result)
        },
        notEnoughMoneyForTax({context}) {
            return simplyLosingMoneyCheck(context,300000)
        },
        needHelpFromFundForTax({context}) {
            return fundCheck(context,300000)
        },
        needHelpFromBasicIncomeForTax({context}) {
            return basicIncomeCheck(context,300000)
        },
        bankruptForTax({context}) {
            return bankruptcyCheck(context,300000)
        },
        enoughForService({context}, {invoice}: {invoice: number}) {
            return ((context.mainStatuses.cashCache ?? context.mainStatuses.players[context.nowPid].cash) >= invoice)
        },
        notEnoughForHospital({context}) {
            return simplyLosingMoneyCheck(context,100000)
        },
        needHelpFromFundForHospital({context}) {
            return fundCheck(context,100000)
        },
        needHelpFromBasicIncomeForHospital({context}) {
            return basicIncomeCheck(context,100000)
        },
        bankruptForHospital({context}) {
            return bankruptcyCheck(context,100000)
        },
        hasTicket({context}, {ticketType}: {ticketType: keyof TicketsType}) {
            const {nowPid, mainStatuses: {players}} = context
            return (players[nowPid].remaining.tickets[ticketType] > 0)
        },
        mustStopLotto({context}) {
            const {nowPid, mainStatuses: {players, cashCache}} = context
            const cash = cashCache ?? players[nowPid].cash
            return (context.lottoCache === "ongoing") && (cash < 200000)
        }
    }
}).createMachine({
    context: {
        mainStatuses: {
            players: [
                {
                    cash: 3000000,
                    location: 0,
                    remaining: {
                        jailTurns: 0,
                        tickets: {
                            feeExemption: 0,
                            taxExemption: 0,
                            bonus: 0,
                            doubleLotto: 0,
                            lawyer: 0,
                            freeHospital: 0
                        }
                    },
                    cycle: 0,
                    univEducation: 0
                },
                {
                    cash: 3000000,
                    location: 0,
                    remaining: {
                        jailTurns: 0,
                        tickets: {
                            feeExemption: 0,
                            taxExemption: 0,
                            bonus: 0,
                            doubleLotto: 0,
                            lawyer: 0,
                            freeHospital: 0
                        }
                    },
                    cycle: 0,
                    univEducation: 0
                },
                {
                    cash: 3000000,
                    location: 0,
                    remaining: {
                        jailTurns: 0,
                        tickets: {
                            feeExemption: 0,
                            taxExemption: 0,
                            bonus: 0,
                            doubleLotto: 0,
                            lawyer: 0,
                            freeHospital: 0
                        }
                    },
                    cycle: 0,
                    univEducation: 0
                },
                {
                    cash: 3000000,
                    location: 0,
                    remaining: {
                        jailTurns: 0,
                        tickets: {
                            feeExemption: 0,
                            taxExemption: 0,
                            bonus: 0,
                            doubleLotto: 0,
                            lawyer: 0,
                            freeHospital: 0
                        }
                    },
                    cycle: 0,
                    univEducation: 0
                }
            ],
            landProperties: new Map<BuildableLocationType, LandPropertyStatus>(),
            govIncome: 0,
            cashCache: null
        },
        turns: 0,
        dicesNow: null,
        dicesSecondary: null,
        fund: 0,
        ending: null,
        financialWarningCache: null,
        nowPid: 0,
        remainingSidecars: {
            catastrophe: 0,
            pandemic: 0
        },
        freshChanceCardCache: null,
        lottoTriesCountCache: 0,
        doubleLotto: null,
        lottoCache: null,
        feeCache: 0,
        maxPurchasableAmountCache: 0,
        wonLotto: null,
        jailTurnResultCache: null
    },
    initial: 'turnBegin',
    states: {
        frozen: { //// ** works done
        },
        turnBegin: { //// ** works done
            always: {
                actions: assign({
                    dicesNow: (_) => null,
                    financialWarningCache: (_) => null,
                    turns: ({context}) => context.turns + 1,
                    freshChanceCardCache: (_) => null,
                    mainStatuses({context}) {
                        const {
                            players,
                            landProperties,
                            govIncome,
                            cashCache
                        } = context.mainStatuses
                        return {
                            players: [...players],
                            landProperties: new Map(Array.from(landProperties.entries())
                                .filter(([_, status]) => status.amount > 0)),
                            govIncome,
                            cashCache
                        }
                    },
                    feeCache: (_) => 0,
                    maxPurchasableAmountCache: (_) => 0
                }),
                target: "turnBeginCheck"
            }
        },
        turnBeginCheck: {
            always: [
                { // jail turns remaining
                    guard: {
                        type: "jailRemaining",
                        params({ context, event }) {
                            return {
                                nowTurn: context.nowPid
                            }
                        },
                    },
                    target: "jailModal"
                },
                { // otherwise
                    target: "rollDiceModal"
                }
            ]
        },
        cityArrived: { //// ** works done
            always: [
                {
                    guard: {
                        type: "hasTicket",
                        params: (_) => ({ticketType: "feeExemption"})
                    },
                    target: "cityFeeExemptionTicketModal"
                },
                {
                    target: "cityPayment"
                }
            ]
        },
        cityFeeExemptionTicketModal: { //// ** works done
            on: {
                useTicket: {
                    actions: assign({
                        mainStatuses: ({context}) => useOneTicket(context,"feeExemption")
                    }),
                    target: "turnEnd"
                },
                nop: {
                    target: "cityPayment"
                }
            }
        },
        cityPayment: { //// ** works done
            always: {
                actions: assign({
                    mainStatuses: ({context}) => {
                        return payCityLandFee(context)
                    }
                }),
                target: "cityPaymentCheck"
            },
        },
        cityPaymentCheck: {
            always: [
                { // purchasable
                    guard: {
                        type: "purchasable",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses({context}) {
                            return commitCache(context)
                        },
                        maxPurchasableAmountCache({context}) {
                            const { location, cycle } = context.mainStatuses.players[context.nowPid]
                            const exists = context.mainStatuses.landProperties.get(location as BuildableLocationType)?.amount ?? 0
                            return Math.max(Math.min(cycle + 1, 3) - exists, 0)
                        }
                    }),
                    target: "purchaseModal"
                },
                { // not purchasable but enough
                    guard: {
                        type: "notPurchasableButEnough",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses({context}) {
                            let pid = context.nowPid
                            let playerNow = context.mainStatuses.players[pid]
                            let cash = context.mainStatuses.cashCache ?? playerNow.cash
                            let loc = playerNow.location as BuildableLocationType
                            let prp = context.mainStatuses.landProperties.get(loc)
                            if ((prp === undefined) || (prp.operatorId === pid)) {
                                return {
                                    ...context.mainStatuses
                                }
                            } else {
                                return {
                                    ...context.mainStatuses,
                                    cashCache: cash - (prp.amount * 300000)
                                }
                            }
                        }
                    }),
                    target: "turnEnd"
                },
                { // not enough money, solvable by selling property/properties
                    guard: {
                        type: "notEnoughMoney",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        feeCache({context}) {
                            let playerNow = context.mainStatuses.players[context.nowPid]
                            let loc = playerNow.location as BuildableLocationType
                            let amount = context.mainStatuses.landProperties.get(loc)?.amount as number
                            return (amount * 300000)
                        }
                    }),
                    target: "sellModal"
                },
                { // need fund
                    guard: {
                        type: "bankrupt",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses: ({context, event}) => {
                            return needFund(context)
                        },
                        fund: (_) => 0,
                        financialWarningCache: (_) => "needFund"
                    }),
                    target: "turnEnd"
                },
                { // need basic income
                    guard: {
                        type: "stillBankrupt",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses: ({context}) => {
                            return needBasicIncome(context)
                        },
                        fund: (_) => 0,
                        financialWarningCache: (_) => "needBasicIncome"
                    }),
                    target: "turnEnd"
                },
                { // unsolvable => Game ends without any winner
                    guard: {
                        type: "unsolvableBankrupt",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        ending: (_) => "hasBankrupt",
                        financialWarningCache: (_) => null
                    }),
                    target: "frozen"
                },
                { // keep going gameplay
                    target: "turnEnd"
                }
            ]
        },
        industrialArrived: { //// ** works done
            always: [
                {
                    guard: {
                        type: "hasTicket",
                        params: (_) => ({ticketType: "feeExemption"})
                    },
                    target: "industrialFeeExemptionTicketModal"
                },
                {
                    target: "industrialPayment"
                }
            ]
        },
        industrialFeeExemptionTicketModal: { //// ** works done
            on: {
                useTicket: {
                    actions: assign({
                        mainStatuses: ({context}) => useOneTicket(context,"feeExemption")
                    }),
                    target: "turnEnd"
                },
                nop: {
                    target: "industrialPayment"
                }
            }
        },
        industrialPayment: { //// ** works done
            always: {
                actions: assign({
                    mainStatuses({context}) {
                        return payIndustrialLandFee(context)
                    }
                }),
                target: "industrialPaymentCheck"
            }
        },
        industrialPaymentCheck: {
            always: [
                { // purchasable
                    guard: {
                        type: "purchasable",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses({context}) {
                            return commitCache(context)
                        },
                        maxPurchasableAmountCache: (_) => 1
                    }),
                    target: "purchaseModal"
                },
                { // not purchasable but enough
                    guard: {
                        type: "notPurchasableButEnough",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses({context}) {
                            let pid = context.nowPid
                            let playerNow = context.mainStatuses.players[pid]
                            let cash = context.mainStatuses.cashCache ?? playerNow.cash
                            let loc = playerNow.location as BuildableLocationType
                            let prp = context.mainStatuses.landProperties.get(loc)
                            if ((prp === undefined) || (prp.operatorId === pid)) {
                                return copyMainStatuses(context.mainStatuses)
                            } else {
                                let output = distributePayment(context,100000)
                                output.cashCache = cash - (prp.amount * 300000)
                                return output
                            }
                        }
                    }),
                    target: "turnEnd"
                },
                { // not enough money, solvable by selling property/properties
                    guard: {
                        type: "notEnoughMoney",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses: ({context}) => distributePayment(context,100000),
                        feeCache({context}) {
                            return 300000
                        }
                    }),
                    target: "sellModal"
                },
                { // need fund
                    guard: {
                        type: "bankrupt",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses: ({context, event}) => {
                            const {
                                mainStatuses,
                                ...others
                            } = context
                            const intermediate: typeof context = {
                                mainStatuses: needFund(context),
                                ...others
                            }

                            const output = distributePayment(intermediate,100000)
                            return output
                        },
                        fund: (_) => 0,
                        financialWarningCache: (_) => "needFund"
                    }),
                    target: "turnEnd"
                },
                { // need basic income
                    guard: {
                        type: "stillBankrupt",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses: ({context}) => {
                            const {
                                mainStatuses,
                                ...others
                            } = context
                            const intermediate: typeof context = {
                                mainStatuses: needBasicIncome(context),
                                ...others
                            }

                            const output = distributePayment(intermediate,100000)
                            return output
                        },
                        fund: (_) => 0,
                        financialWarningCache: (_) => "needBasicIncome"
                    }),
                    target: "turnEnd"
                },
                { // unsolvable => Game ends without any winner
                    guard: {
                        type: "unsolvableBankrupt",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        ending: (_) => "hasBankrupt",
                        financialWarningCache: (_) => null
                    }),
                    target: "frozen"
                },
                { // keep going gameplay
                    target: "turnEnd"
                }
            ]
        },
        infraArrived: { //// ** works done
            always: {
                target: "infraPayment"
            }
        },
        infraPayment: { //// ** works done
            always: [{
                guard: "notEnoughMoneyForTax",
                actions: assign({
                    feeCache: ({context}) => 300000
                }),
                target: "taxSellModal"
            },{
                guard: "needHelpFromFundForTax",
                actions: assign({
                    mainStatuses({context}) {
                        return getHelpFromFundGeneral(context, 300000)
                    },
                    fund: (_) => 0,
                    financialWarningCache: (_) => "needFund"
                }),
                target: "turnEnd"
            },{
                guard: "needHelpFromBasicIncomeForTax",
                actions: assign({
                    mainStatuses({context}) {
                        return getHelpFromBasicIncomeGeneral(context, 300000)
                    },
                    fund: (_) => 0,
                    financialWarningCache: (_) => "needBasicIncome"
                }),
                target: "turnEnd"
            }, {
                guard: "bankruptForTax",
                actions: assign({
                    ending: (_) => "hasBankrupt",
                    financialWarningCache: (_) => null
                }),
                target: "frozen"
            }, {
                actions: assign({
                    mainStatuses: ({context}) => payToGovernment(context, context.nowPid, 300000)
                }),
                target: "turnEnd"
            }]
        },
        taxSellModal: { //// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses: ({context, event: {targets}}) => sell(context,targets,300000,true)
                    }),
                    target: "turnEnd"
                }
            }
        },
        chanceArrived: { //// ** works done
            entry: assign({
                freshChanceCardCache: (_) => randomChance()
            }),
            always: {
                target: "chanceKindNoticeCheck"
            }
        },
        chanceKindNoticeCheck: {
            on: {
                noticeChecked: [
                    // normal chances
                    { // newborn
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "newborn"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.newborn(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // earthquake
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "earthquake"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.earthquake(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // taxHeaven
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "taxHeaven"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.taxHeaven(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // disease
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "disease"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.disease(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // emergencyAid
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "emergencyAid"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.emergencyAid(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // drug
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "drug"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.drug(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // nursing
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "nursing"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.nursing(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // inheritGet
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "inheritGet"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.inheritGet(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // healthy
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "healthy"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.healthy(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // typhoon
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "typhoon"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.typhoon(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // scholarship
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "scholarship"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.scholarship(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // feeExemption
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "feeExemption"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.feeExemption(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // bonus
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "bonus"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.bonus(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // doubleLotto
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "doubleLotto"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.doubleLotto(context)
                            }
                        })
                    },
                    { // insiderTrading
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "insiderTrading"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.insiderTrading(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // taxExemption
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "taxExemption"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.taxExemption(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // tooMuchElectricity
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "tooMuchElectricity"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.tooMuchElectricity(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // lawyersHelp
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "lawyersHelp"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.lawyersHelp(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // soaringStockPrice
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "soaringStockPrice"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.soaringStockPrice(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // plungeInStockPrice
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "plungeInStockPrice"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.plungeInStockPrice(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // studyingHard
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "studyingHard"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NORMAL_CHANCE_CARDS.studyingHard(context)
                            }
                        }),
                        target: "turnEnd"
                    },

                    // chances that needs some checks
                    // maintenance
                    { 
                        guard: {
                            type: "notEnoughMoneyForChance",
                            params: ({context}) => ({kind: "maintenance"})
                        },
                        target: "maintenanceSellModal"
                    },
                    {
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "maintenance"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS.maintenance.mainStatuses(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    // inheritDonate
                    { // not enough money, solvable by selling property/properties
                        guard: {
                            type: "notEnoughMoneyForChance",
                            params: ({context}) => ({kind: "inheritDonate"})
                        },
                        actions: assign({
                            feeCache: (_) => 1000000
                        }),
                        target: "inheritDonateSellModal"
                    },
                    { // need fund
                        guard: {
                            type: "needHelpFromFundForChance",
                            params: ({context}) => ({kind: "inheritDonate"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["inheritDonate"].getHelpFromFund(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needFund"
                        }),
                        target: "turnEnd"
                    },
                    { // need basic income
                        guard: {
                            type: "needHelpFromBasicIncomeForChance",
                            params: ({context}) => ({kind: "inheritDonate"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["inheritDonate"].getHelpFromBasicIncome(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needBasicIncome"
                        }),
                        target: "turnEnd"
                    },
                    { // unsolvable => Game ends without any winner
                        guard: {
                            type: "bankruptForChance",
                            params: ({context}) => ({kind: "inheritDonate"})
                        },
                        actions: assign({
                            ending: (_) => "hasBankrupt",
                            financialWarningCache: (_) => null
                        }),
                        target: "frozen"
                    },
                    { // no problem
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "inheritDonate"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS.inheritDonate.mainStatuses(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    // cyberSecurityThreat
                    { // not enough money, solvable by selling property/properties
                        guard: {
                            type: "notEnoughMoneyForChance",
                            params: ({context}) => ({kind: "cyberSecurityThreat"})
                        },
                        actions: assign({
                            feeCache: (_) => 1000000
                        }),
                        target: "cyberSecurityThreatSellModal"
                    },
                    { // need fund
                        guard: {
                            type: "needHelpFromFundForChance",
                            params: ({context}) => ({kind: "cyberSecurityThreat"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["cyberSecurityThreat"].getHelpFromFund(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needFund"
                        }),
                        target: "turnEnd"
                    },
                    { // need basic income
                        guard: {
                            type: "needHelpFromBasicIncomeForChance",
                            params: ({context}) => ({kind: "cyberSecurityThreat"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["cyberSecurityThreat"].getHelpFromBasicIncome(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needBasicIncome"
                        }),
                        target: "turnEnd"
                    },
                    { // unsolvable => Game ends without any winner
                        guard: {
                            type: "bankruptForChance",
                            params: ({context}) => ({kind: "cyberSecurityThreat"})
                        },
                        actions: assign({
                            ending: (_) => "hasBankrupt",
                            financialWarningCache: (_) => null
                        }),
                        target: "frozen"
                    },
                    { // no problem
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "cyberSecurityThreat"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS.cyberSecurityThreat.mainStatuses(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    // fakeNews
                    { // not enough money, solvable by selling property/properties
                        guard: {
                            type: "notEnoughMoneyForChance",
                            params: ({context}) => ({kind: "fakeNews"})
                        },
                        actions: assign({
                            feeCache: (_) => 1000000
                        }),
                        target: "fakeNewsSellModal"
                    },
                    { // need fund
                        guard: {
                            type: "needHelpFromFundForChance",
                            params: ({context}) => ({kind: "fakeNews"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["fakeNews"].getHelpFromFund(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needFund"
                        }),
                        target: "turnEnd"
                    },
                    { // need basic income
                        guard: {
                            type: "needHelpFromBasicIncomeForChance",
                            params: ({context}) => ({kind: "fakeNews"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["fakeNews"].getHelpFromBasicIncome(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needBasicIncome"
                        }),
                        target: "turnEnd"
                    },
                    { // unsolvable => Game ends without any winner
                        guard: {
                            type: "bankruptForChance",
                            params: ({context}) => ({kind: "fakeNews"})
                        },
                        actions: assign({
                            ending: (_) => "hasBankrupt",
                            financialWarningCache: (_) => null
                        }),
                        target: "frozen"
                    },
                    { // no problem
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "fakeNews"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS.fakeNews.mainStatuses(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    // voicePhishing
                    { // not enough money, solvable by selling property/properties
                        guard: {
                            type: "notEnoughMoneyForChance",
                            params: ({context}) => ({kind: "voicePhishing"})
                        },
                        actions: assign({
                            feeCache: (_) => 1000000
                        }),
                        target: "voicePhishingSellModal"
                    },
                    { // need fund
                        guard: {
                            type: "needHelpFromFundForChance",
                            params: ({context}) => ({kind: "voicePhishing"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["voicePhishing"].getHelpFromFund(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needFund"
                        }),
                        target: "turnEnd"
                    },
                    { // need basic income
                        guard: {
                            type: "needHelpFromBasicIncomeForChance",
                            params: ({context}) => ({kind: "voicePhishing"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["voicePhishing"].getHelpFromBasicIncome(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needBasicIncome"
                        }),
                        target: "turnEnd"
                    },
                    { // unsolvable => Game ends without any winner
                        guard: {
                            type: "bankruptForChance",
                            params: ({context}) => ({kind: "voicePhishing"})
                        },
                        actions: assign({
                            ending: (_) => "hasBankrupt",
                            financialWarningCache: (_) => null
                        }),
                        target: "frozen"
                    },
                    { // no problem
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "voicePhishing"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS.voicePhishing.mainStatuses(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    // trafficAccident
                    { // not enough money, solvable by selling property/properties
                        guard: {
                            type: "notEnoughMoneyForChance",
                            params: ({context}) => ({kind: "trafficAccident"})
                        },
                        actions: assign({
                            feeCache: (_) => 500000
                        }),
                        target: "trafficAccidentSellModal"
                    },
                    { // need fund
                        guard: {
                            type: "needHelpFromFundForChance",
                            params: ({context}) => ({kind: "trafficAccident"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["trafficAccident"].getHelpFromFund(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needFund"
                        }),
                        target: "turnEnd"
                    },
                    { // need basic income
                        guard: {
                            type: "needHelpFromBasicIncomeForChance",
                            params: ({context}) => ({kind: "trafficAccident"})
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS["trafficAccident"].getHelpFromBasicIncome(context)
                            },
                            fund: (_) => 0,
                            financialWarningCache: (_) => "needBasicIncome"
                        }),
                        target: "turnEnd"
                    },
                    { // unsolvable => Game ends without any winner
                        guard: {
                            type: "bankruptForChance",
                            params: ({context}) => ({kind: "trafficAccident"})
                        },
                        actions: assign({
                            ending: (_) => "hasBankrupt",
                            financialWarningCache: (_) => null
                        }),
                        target: "frozen"
                    },
                    { // no problem
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "trafficAccident"
                                return {kind}
                            }
                        },
                        actions: assign({
                            mainStatuses({context}) {
                                return NEEDS_CHECK_CHANCE_CARDS.trafficAccident.mainStatuses(context)
                            }
                        }),
                        target: "turnEnd"
                    },

                    // chances with sidecar
                    { // catastrophe
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "catastrophe"
                                return {kind}
                            }
                        },
                        actions: assign({
                            remainingSidecars({context}) {
                                return SIDECAR_CHANCE_CARDS.catastrophe(context)
                            }
                        }),
                        target: "turnEnd"
                    },
                    { // pandemic
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "pandemic"
                                return {kind}
                            }
                        },
                        actions: assign({
                            remainingSidecars({context}) {
                                return SIDECAR_CHANCE_CARDS.pandemic(context)
                            }
                        }),
                        target: "turnEnd"
                    },

                    // chances with a modal dialog
                    { // quirkOfFate
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "quirkOfFate"
                                return {kind}
                            }
                        },
                        target: "quirkOfFateModal"
                    },
                    { // greenNewDeal
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "greenNewDeal"
                                return {kind}
                            }
                        },
                        target: "greenNewDealModal"
                    },
                    { // trafficJam
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "trafficJam"
                                return {kind}
                            }
                        },
                        target: "trafficJamModal"
                    },
                    { // quickMove
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "quickMove"
                                return {kind}
                            }
                        },
                        target: "quickMoveModal"
                    },
                    { // extinction
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "extinction"
                                return {kind}
                            }
                        },
                        target: "extinctionModal"
                    },
                    { // trade
                        guard: {
                            type: "checkChanceCardKind",
                            params: (_) => {
                                let kind: ChanceCardKindType = "trade"
                                return {kind}
                            }
                        },
                        target: "tradeModal"
                    }
                ]
            }
        },
        transportationArrived: { //// ** works done
            always: {
                actions: assign({
                    mainStatuses({context}) {
                        let loc = context.mainStatuses.players[context.nowPid].location
                        let target = TRANSIT_TARGETS[loc]
                        let amount = (target - loc) % CELLS_COUNT
                        return move(context, amount)
                    }
                }),
                target: "turnEnd"
            }
        },
        fundArrived: { //// ** works done
            always: [
                {
                    guard: {
                        type: "enoughForService",
                        params: (_) => ({invoice: 600000})
                    },
                    actions: assign({
                        mainStatuses({context}) {
                            return payToMarket(context,context.nowPid,600000)
                        },
                        fund: ({context}) => (context.fund + 600000)
                    }),
                    target: "turnEnd"
                },
                {
                    target: "turnEnd"
                }
            ]
        },
        concertArrived: { //// ** works done
            always: [
                {
                    guard: {
                        type: "enoughForService",
                        params: (_) => ({invoice: 600000})
                    },
                    actions: assign({
                        mainStatuses({context}) {
                            return payToMarket(context,context.nowPid,600000)
                        }
                    }),
                    target: "turnEnd"
                },
                {
                    target: "turnEnd"
                }
            ]
        },
        hospitalArrived: { //// ** works done
            always: [
                {
                    guard: {
                        type: "hasTicket",
                        params: (_) => ({ticketType: "freeHospital"})
                    },
                    target: "freeHospitalTicketModal"
                },
                {
                    target: "hospitalPayment"
                }
            ]
        },
        freeHospitalTicketModal: { //// ** works done
            on: {
                useTicket: {
                    actions: assign({
                        mainStatuses: ({context}) => useOneTicket(context,"freeHospital")
                    }),
                    target: "turnEnd"
                },
                nop: {
                    target: "hospitalPayment"
                }
            }
        },
        hospitalPayment: { //// ** works done
            always: [{
                guard: "notEnoughForHospital",
                actions: assign({
                    feeCache: (_) => 100000
                }),
                target: "hospitalSellModal"
            }, {
                guard: "needHelpFromFundForHospital",
                actions: assign({
                    mainStatuses({context}) {
                        return getHelpFromFundGeneral(context, 100000)
                    },
                    fund: (_) => 0,
                    financialWarningCache: (_) => "needFund"
                }),
                target: "turnEnd"
            }, {
                guard: "needHelpFromBasicIncomeForHospital",
                actions: assign({
                    mainStatuses({context}) {
                        return getHelpFromBasicIncomeGeneral(context, 100000)
                    },
                    fund: (_) => 0,
                    financialWarningCache: (_) => "needBasicIncome"
                }),
                target: "turnEnd"
            }, {
                guard: "bankruptForHospital",
                actions: assign({
                    ending: (_) => "hasBankrupt",
                    financialWarningCache: (_) => null
                }),
                target: "frozen"
            }, {
                actions: assign({
                    mainStatuses: ({context}) => payToGovernment(context, context.nowPid, 100000)
                }),
                target: "turnEnd"
            }]
        },
        hospitalSellModal: { //// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses: ({context, event: {targets}}) => sell(context,targets,100000,true)
                    }),
                    target: "turnEnd"
                }
            }
        },
        jailArrived: { //// ** works done
            always: {
                actions: assign({
                    mainStatuses: ({context}) => imprison(context)
                }),
                target: "turnEnd"
            }
        },
        lottoArrived: { //// ** works done
            always: [{
                guard: {
                    type: "enoughForService",
                    params: {invoice: 200000}
                },
                target: "preLottoModal"
            }, {
                target: "turnEnd"
            }]
        },
        preLottoModal: { //// ** works done
            on: {
                startLotto: [
                    {
                        guard: ({event}) => event.useDoubleLottoTicket,
                        actions: assign({
                            doubleLotto: (_) => true,
                            mainStatuses({context}) {
                                let {
                                    mainStatuses: {players,landProperties, govIncome, cashCache},
                                    nowPid
                                } = context
                                let new_players: typeof players = [...players]
                                const remaining_doubleLottoTickets = Math.max(0, new_players[nowPid].remaining.tickets.doubleLotto - 1)
                                new_players[nowPid].remaining.tickets.doubleLotto = remaining_doubleLottoTickets
                                return {
                                    players: new_players,
                                    landProperties,
                                    govIncome,
                                    cashCache
                                }
                            }
                        }),
                        target: "lottoModal"
                    },
                    {
                        guard: ({event}) => !(event.useDoubleLottoTicket),
                        actions: assign({
                            doubleLotto: (_) => false
                        }),
                        target: "lottoModal"
                    }
                ],
                nop: {
                    target: "turnEnd"
                }
            }
        },
        lottoModal: { //// ** works done
            entry: assign({
                lottoCache: ({context}) => context.lottoCache ?? "ongoing",
                dicesSecondary: ({context}) => {
                    if(context.lottoCache !== "lost" && context.lottoCache !== "won") {
                        return randomDices()
                    } else {
                        return null
                    }
                }
            }),
            on: {
                tryLotto: [{
                    guard: {
                        type: "hasWonLotto",
                        params: ({event}) => ({choice: event.choice})
                    },
                    actions: assign({
                        lottoTriesCountCache({context}) {
                            let new_count: 1|2|3
                            switch(context.lottoTriesCountCache) {
                                case 0:
                                    new_count = 1;
                                    break;
                                case 1:
                                    new_count = 2;
                                    break;
                                default:
                                    new_count = 3;
                                    break;
                            }
                            return new_count
                        },
                        mainStatuses: ({context}) => payToMarket(context,context.nowPid,200000),
                        fund: ({context}) => context.fund + 200000
                    }),
                    reenter: true
                }, {
                    actions: assign({
                        lottoCache: (_) => "lost",
                        mainStatuses: ({context}) => payToMarket(context,context.nowPid,200000),
                        fund: ({context}) => context.fund + 200000
                    }),
                    reenter: true
                }],
                stopLotto: {
                    actions: assign({
                        lottoCache: (_) => "won"
                    }),
                    reenter: true
                }
            },
            exit: assign({
                dicesSecondary: (_) => null
            }),
            always: [{
                guard: "mustStopLotto",
                actions: assign({
                    lottoCache: (_) => "won"
                }),
                reenter: true
            },{
                guard: "threeTimesWonLotto",
                actions: assign({
                    lottoCache: (_) => "won"
                }),
                reenter: true
            }, {
                guard: {
                    type: "checkLottoFinal",
                    params: (_) => ({result: "won"})
                },
                actions: assign({
                    mainStatuses({context}) {
                        let toEarn: number
                        switch(context.lottoTriesCountCache) {
                            case 0:
                                toEarn = 0
                                break;
                            case 1:
                                toEarn = 500000
                                break;
                            case 2:
                                toEarn = 1000000
                                break;
                            case 3:
                                toEarn = 2000000
                                break;
                        }
                        const doubler = (context.doubleLotto === true) ? 2 : 1
                        return earnMoney(context,toEarn * doubler)
                    },
                    lottoCache: (_) => null,
                    dicesSecondary: (_) => null,
                    wonLotto: ({context}) => context.lottoTriesCountCache
                }),
                target: "lottoFinalResultNotice"
            }, {
                guard: {
                    type: "checkLottoFinal",
                    params: (_) => ({result: "lost"})
                },
                actions: assign({
                    lottoCache: (_) => null,
                    dicesSecondary: (_) => null,
                    wonLotto: (_) => 0
                }),
                target: "lottoFinalResultNotice"
            }]
        },
        lottoFinalResultNotice: {
            on: {
                noticeChecked: {
                    actions: assign({
                        wonLotto: (_) => null,
                        doubleLotto: (_) => null,
                        lottoTriesCountCache: (_) => 0
                    }),
                    target: "turnEnd"
                }
            }
        },
        universityArrived: { //// ** works done
            always: {
                actions: assign({
                    mainStatuses: ({context}) => educate(context)
                })
            }
        },
        purchaseModal: { //// ** works done
            on: {
                purchase: {
                    actions: assign({
                        mainStatuses: ({context, event}) => {
                            return purchase(context,context.nowPid,event.value.amount)
                        }
                    }),
                    target: "turnEnd"
                },
                nop: {
                    target: "turnEnd"
                }
            }
        },
        sellModal: { //// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses({context, event: {targets}}) {
                            let playerNow = context.mainStatuses.players[context.nowPid]
                            let loc = playerNow.location as BuildableLocationType
                            let amount = context.mainStatuses.landProperties.get(loc)?.amount as number
                            return sell(context,targets,amount * 300000)
                        }
                    }),
                    target: "turnEnd"
                }
            }
        },
        maintenanceSellModal: { //// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses: ({context, event: {targets}}) => NEEDS_CHECK_CHANCE_CARDS.maintenance.postSale(context,targets)
                    }),
                    target: "turnEnd"
                }
            }
        },
        inheritDonateSellModal: {//// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses: ({context, event: {targets}}) => NEEDS_CHECK_CHANCE_CARDS.inheritDonate.postSale(context,targets)
                    }),
                    target: "turnEnd"
                }
            }
        },
        cyberSecurityThreatSellModal: {//// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses: ({context, event: {targets}}) => NEEDS_CHECK_CHANCE_CARDS.cyberSecurityThreat.postSale(context,targets)
                    }),
                    target: "turnEnd"
                }
            }
        },
        fakeNewsSellModal: {//// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses: ({context, event: {targets}}) => NEEDS_CHECK_CHANCE_CARDS.fakeNews.postSale(context,targets)
                    }),
                    target: "turnEnd"
                }
            }
        },
        voicePhishingSellModal: {//// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses: ({context, event: {targets}}) => NEEDS_CHECK_CHANCE_CARDS.voicePhishing.postSale(context,targets)
                    }),
                    target: "turnEnd"
                }
            }
        },
        trafficAccidentSellModal: {//// ** works done
            on: {
                sell: {
                    actions: assign({
                        mainStatuses: ({context, event: {targets}}) => NEEDS_CHECK_CHANCE_CARDS.trafficAccident.postSale(context,targets)
                    }),
                    target: "turnEnd"
                }
            }
        },
        rollDiceModal: { //// ** works done
            on: {
                rollDice: {
                    actions: assign({
                        dicesNow: (_) => randomDices()
                    })
                }
            },
            always: {
                guard: "dicesSet",
                actions: assign({
                    mainStatuses: ({context}) => {
                        return go(context)
                    }
                }),
                target: "arrivalCheck"
            }
        },
        arrivalCheck: { //// ** works done
            always: [
                { // city
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "city"
                        })
                    },
                    target: "cityArrived"
                },
                { // industrial
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "industrial"
                        })
                    },
                    target: "industrialArrived"
                },
                { // infrastructure
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "infra"
                        })
                    },
                    target: "infraArrived"
                },
                { // chance
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "chance"
                        })
                    },
                    target: "chanceArrived"
                },
                { // transportation
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "transportation"
                        })
                    },
                    target: "transportationArrived"
                },
                { // fund
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "fund"
                        })
                    },
                    target: "fundArrived"
                },
                { // concert
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "concert"
                        })
                    },
                    target: "concertArrived"
                },
                { // hospital
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "hospital"
                        })
                    },
                    target: "hospitalArrived"
                },
                { // jail
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "jail"
                        })
                    },
                    target: "jailArrived"
                },
                { // lotto
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "lotto"
                        })
                    },
                    target: "lottoArrived"
                },
                { // university
                    guard: {
                        type: "cellTypeCheck",
                        params: ({context}) => ({
                            nowTurn: context.nowPid,
                            type: "univ"
                        })
                    },
                    target: "universityArrived"
                },
                { // park, start
                    target: "turnEnd"
                }
            ]
        },
        jailModal: { 
            on: {
                showMeTheMONEY: {
                    actions: assign({
                        mainStatuses({context}) {
                            return jailAction(context, "byCash")
                        },
                        jailTurnResultCache: (_) => "byCash"
                    }),
                    target: "jailDicesResultNotice"
                },
                thanksToLawyer: {
                    actions: assign({
                        mainStatuses({context}) {
                            return jailAction(context, "byLawyer")
                        },
                        jailTurnResultCache: (_) => "byLawyer"
                    }),
                    target: "jailDicesResultNotice"
                },
                rollDice: {
                    actions: assign({
                        dicesNow: (_) => randomDices()
                    }),
                    target: "jailDicesCheck"
                }
            }
        },
        jailDicesCheck: {
            always: [
                {
                    guard: {
                        type: "dicesDouble"
                    },
                    actions: assign({
                        mainStatuses({context}) {
                            return jailAction(context, "byDice")
                        },
                        jailTurnResultCache: (_) => "byDice"
                    }),
                    target: "jailDicesResultNotice"
                },
                {
                    actions: assign({
                        mainStatuses({context}) {
                            return jailAction(context)
                        },
                        jailTurnResultCache: (_) => false
                    }),
                    target: "jailDicesResultNotice"
                }
            ]
        },
        jailDicesResultNotice: {
            on: {
                noticeChecked: {
                    actions: assign({
                        jailTurnResultCache: (_) => null
                    }),
                    target: "turnEnd"
                }
            }
        },
        turnEnd: { //// ** works done
            always: [
                { // terminate if all player has run at least 4 cycles
                    guard: {
                        type: "allPlayersMoreThanFourCycles",
                    },
                    actions: assign({
                        ending({context}) {
                            return "hasWinner"
                        },
                        mainStatuses({context}) {
                            return commitCache(context)
                        }
                    }),
                    target: "frozen"
                }, { // turn begin again
                    guard: {
                        type: "dicesDoubleButNotInPrison",
                        params: ({context}) => ({nowTurn: context.nowPid})
                    },
                    actions: assign({
                        mainStatuses({context}) {
                            return commitCache(context)
                        }
                    }),
                    target: "turnBegin"
                }, { // next player's turn
                    actions: assign({
                        nowPid({context}) {
                            let output: 0|1|2|3
                            switch(context.nowPid) {
                                case 0:
                                    output = 1;
                                    break;
                                case 1:
                                    output = 2;
                                    break;
                                case 2:
                                    output = 3;
                                    break;
                                case 3:
                                    output = 0;
                                    break;
                            }
                            return output
                        },
                        remainingSidecars({context}) {
                            return {
                                catastrophe: Math.max(context.remainingSidecars.catastrophe - 1, 0),
                                pandemic: Math.max(context.remainingSidecars.pandemic - 1, 0),
                            }
                        },
                        mainStatuses({context}) {
                            return commitCache(context)
                        }
                    }),
                    target: "turnBegin"
                }
            ]
        },
        quirkOfFateModal: { //// ** works done
            always: {
                guard({context}) {
                    return (context.dicesSecondary !== null)
                },
                actions: assign({
                    mainStatuses({context}) {
                        const [d1, d2] = context.dicesSecondary as [DiceType, DiceType]
                        const targetPid = getTargetPid(context.nowPid,d1,d2)
                        let {
                            mainStatuses: {players, landProperties, govIncome,cashCache}
                        } = context
                        if(targetPid === context.nowPid) {
                            return {players, landProperties, govIncome,cashCache}
                        } else {
                            return {
                                players: swapCash(players, context.nowPid, targetPid),
                                landProperties: swapLandProperties(landProperties, context.nowPid, targetPid),
                                govIncome,
                                cashCache
                            }
                        }
                    }
                }),
                target: "turnEnd"
            },
            on: {
                pickTargetPlayer: {
                    actions: assign({
                        dicesSecondary: (_) => randomDices()
                    }),
                    reenter: true
                }
            }
        },
        greenNewDealModal: { //// ** works done
            on: {
                pickTargetLocation: {
                    guard({context, event}) {
                        if (BUILDABLE_LOCATIONS.includes(event.targetLocation)) {
                            let target = context.mainStatuses.landProperties.get(event.targetLocation as BuildableLocationType)
                            return (target !== undefined) && (target.operatorId === context.nowPid) && (target.amount < 3)
                        } else {
                            return false
                        }
                    },
                    actions: assign({
                        mainStatuses({context, event}) {
                            const {
                                players,
                                landProperties,
                                govIncome,
                                cashCache
                            } = context.mainStatuses
                            
                            return {
                                players: [...players],
                                landProperties: new Map(
                                    Array.from(landProperties.entries())
                                    .map(([loc, status]) => {
                                        if(loc === event.targetLocation) {
                                            return [loc, {
                                                operatorId: status.operatorId,
                                                amount: Math.min(3, status.amount + 1)
                                            }] as [typeof loc, typeof status]
                                        } else {
                                            return [loc, status] as [typeof loc, typeof status]
                                        }
                                    })
                                ),
                                govIncome,
                                cashCache
                            }
                        }
                    }),
                    target: "turnEnd"
                }
            }
        },
        trafficJamModal: { //// ** works done
            on: {
                pickTargetLocation: {
                    guard({context, event}) {
                        if (event.targetLocation in BUILDABLE_LOCATIONS) {
                            let target = context.mainStatuses.landProperties.get(event.targetLocation as BuildableLocationType)
                            return (target !== undefined) && (target.operatorId !== context.nowPid)
                        } else {
                            return false
                        }
                    },
                    actions: assign({
                        mainStatuses({context, event}) {
                            const {
                                players,
                                landProperties,
                                govIncome,
                                cashCache
                            } = context.mainStatuses
                            
                            return {
                                players: [...players],
                                landProperties: new Map(
                                    Array.from(landProperties.entries())
                                    .map(([loc, status]) => {
                                        if(loc === event.targetLocation) {
                                            return [loc, {
                                                operatorId: status.operatorId,
                                                amount: Math.max(0, status.amount - 1)
                                            }] as [typeof loc, typeof status]
                                        } else {
                                            return [loc, status] as [typeof loc, typeof status]
                                        }
                                    })
                                ),
                                govIncome,
                                cashCache
                            }
                        }
                    }),
                    target: "turnEnd"
                }
            }
        },
        quickMoveModal: { //// ** works done
            on: {
                pickTargetLocation: {
                    actions: assign({
                        mainStatuses({context, event}) {
                            return move(context,event.targetLocation,0)
                        }
                    }),
                    target: "arrivalCheck"
                }
            }
        },
        extinctionModal: { //// ** works done
            on: {
                pickTargetGroup: {
                    actions: assign({
                        mainStatuses({context, event}) {
                            let {
                                players,
                                landProperties,
                                govIncome,
                                cashCache
                            } = context.mainStatuses
                            const targets = Array.from(_CITY_GROUPS[event.targetGroupId])
                            const new_lp = new Map(
                                Array.from(landProperties.entries())
                                .map(([loc, status]) => {
                                    return [loc, {
                                        amount: (loc in targets) ? Math.max(0, status.amount - 1) : status.amount,
                                        operatorId: status.operatorId
                                    }]
                                })
                            )
                            return {
                                players: [...players],
                                landProperties: new_lp,
                                govIncome,
                                cashCache
                            }
                        }
                    }),
                    target: "turnEnd"
                }
            }
        },
        tradeModal: { //// ** works done
            on: {
                pickTargetsPair: {
                    guard({context, event}) {
                        const {my, others} = event
                        const {
                            mainStatuses: {landProperties}, nowPid
                        } = context
                        let getMy = landProperties.get(my)
                        let getOthers = landProperties.get(others)
                        return (getMy !== undefined) && (getMy.operatorId === nowPid) && (getOthers !== undefined) && (getOthers.operatorId !== context.nowPid)
                    },
                    actions: assign({
                        mainStatuses({context, event}) {
                            let {
                                players,
                                landProperties,
                                govIncome,
                                cashCache
                            } = context.mainStatuses
                            const {my, others} = event
                            const othersPid = landProperties.get(others)?.operatorId as 0|1|2|3
                            const new_lp = new Map(
                                Array.from(landProperties.entries())
                                .map(([loc, status]) => {
                                    if(loc === my) {
                                        return [
                                            loc, {
                                                amount: status.amount,
                                                operatorId: othersPid
                                            }
                                        ]
                                    } else if(loc === others) {
                                        return [
                                            loc, {
                                                amount: status.amount,
                                                operatorId: context.nowPid
                                            }
                                        ]
                                    } else {
                                        return [
                                            loc,status
                                        ]
                                    }
                                })
                            )
                            return {
                                players: [...players],
                                landProperties: new_lp,
                                govIncome,
                                cashCache
                            }
                        }
                    }),
                    target: "turnEnd"
                }
            }
        },
    }
})
