import { destroyEachBuildingForTargets, earnMoney, educate, getTicket, loseMoney, sell, warpTo } from "./actions"
import { BuildableLocationType, DICES_SUMS_LOOKUP, DiceType, DicesSumType, GameContext, HOSPITAL_LOCATION, JAIL_LOCATION, LandPropertyStatus, TicketsType, UNIVERSITY_LOCATION, getInfraLocation, isCoastal } from "./gameDefinition"
import { roundUnit, tupleMap } from "./utils"








const NORMAL_CHANCE_CARD_KINDS = [
    "newborn",
    "earthquake",
    "taxHeaven",
    "disease",
    "emergencyAid",
    "drug",
    "nursing",
    "inheritGet",
    "healthy",
    "typhoon",
    "scholarship",
    "feeExemption",
    "bonus",
    "doubleLotto",
    "insiderTrading",
    "taxExemption",
    "tooMuchElectricity",
    "lawyersHelp",
    "soaringStockPrice",
    "plungeInStockPrice",
    "studyingHard"
] as const
const NEEDS_CHECK_CHANCE_CARD_KINDS = [
    "maintenance",
    "inheritDonate",
    "cyberSecurityThreat",
    "fakeNews",
    "voicePhishing",
    "trafficAccident",
]
const SIDECAR_CHANCE_CARD_KINDS = [
    "catastrophe",
    "pandemic"
] as const
const TARGETTING_CHANCE_CARD_KINDS = [
    "quirkOfFate",
    "greenNewDeal",
    "trafficJam",
    "quickMove",
    "extinction",
    "trade"
] as const

export type NormalChanceCardKindType = typeof NORMAL_CHANCE_CARD_KINDS[number]
export type NeedsCheckChanceCardKindType = typeof NEEDS_CHECK_CHANCE_CARD_KINDS[number]
export type SidecarChanceCardKindType = typeof SIDECAR_CHANCE_CARD_KINDS[number]
export type TargettingChanceCardKindType = typeof TARGETTING_CHANCE_CARD_KINDS[number]

export type ChanceCardKindType = NormalChanceCardKindType | NeedsCheckChanceCardKindType | SidecarChanceCardKindType | TargettingChanceCardKindType

export function simplyLosingMoneyCheck(context: GameContext, fee: number): boolean {
    let values = Array.from(
        context.mainStatuses.landProperties.entries()
    ).filter(
        ([_,{operatorId}]) => operatorId === context.nowPid
    ).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
    let nowCash = context.mainStatuses.cashCache ?? context.mainStatuses.players[context.nowPid].cash
    return (nowCash < fee) && ((nowCash + values) >= fee)
}

export function fundCheck(context: GameContext, fee: number): boolean {
    let values = Array.from(
        context.mainStatuses.landProperties.entries()
    ).filter(
        ([_,{operatorId}]) => operatorId === context.nowPid
    ).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
    let nowCash = context.mainStatuses.players[context.nowPid].cash
    return ((nowCash + values) < fee) && ((nowCash + values + context.fund) >= fee)
}

export function basicIncomeCheck(context: GameContext, fee: number): boolean {
    let values = Array.from(
        context.mainStatuses.landProperties.entries()
    ).filter(
        ([_,{operatorId}]) => operatorId === context.nowPid
    ).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
    let nowCash = context.mainStatuses.players[context.nowPid].cash
    let basicIncome = context.mainStatuses.govIncome / 4
    return ((nowCash + values + context.fund) < fee) && ((nowCash + values + context.fund + basicIncome) >= fee)
}

export function bankruptcyCheck(context: GameContext, fee: number): boolean {
    let values = Array.from(
        context.mainStatuses.landProperties.entries()
    ).filter(
        ([_,{operatorId}]) => operatorId === context.nowPid
    ).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
    let nowCash = context.mainStatuses.players[context.nowPid].cash
    let basicIncome = context.mainStatuses.govIncome / 4
    return ((nowCash + values + context.fund + basicIncome) < fee)
}

export function getHelpFromFundGeneral(context: GameContext, invoice: number): GameContext['mainStatuses'] {
    const {
        players,
        landProperties,
        govIncome,
        cashCache
    } = context.mainStatuses
    const new_players: typeof players = [...players]
    let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
    new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - invoice
    return {
        players: new_players,
        landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
        govIncome,
        cashCache
    }
}

export function getHelpFromBasicIncomeGeneral(context: GameContext, invoice: number): GameContext['mainStatuses'] {
    const {
        players,
        landProperties,
        govIncome,
        cashCache
    } = context.mainStatuses
    const new_players: typeof players = tupleMap(players,(p) => ({
        ...p,
        cash: p.cash + (govIncome/4)
    })) as typeof players
    let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
    new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - invoice
    return {
        players: new_players,
        landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
        govIncome: 0,
        cashCache
    }
}


export const NEEDS_CHECK_CHANCE_CARDS: {
    [kind in NeedsCheckChanceCardKindType]: {
        mainStatuses: (context: GameContext) => GameContext['mainStatuses'],
        check: (context: GameContext) => boolean,
        needHelpFromFund: (context: GameContext) => boolean,
        getHelpFromFund: (context: GameContext) => GameContext['mainStatuses'],
        needHelpFromBasicIncome: (context: GameContext) => boolean,
        getHelpFromBasicIncome: (context: GameContext) => GameContext['mainStatuses'],
        bankrupt: (context: GameContext) => boolean,
        postSale: (context: GameContext, targets: LandPropSaleType[]) =>  GameContext['mainStatuses']
    }
} = {
    maintenance: { // 건물 유지보수 (건물 한 채당 10만씩)
        mainStatuses(context) {
            let fee = Array.from(
                context.mainStatuses.landProperties.entries()
            ).filter(
                ([_,{operatorId}]) => operatorId === context.nowPid
            ).reduce((acc, [_,{amount}]) => acc + (amount * 100000),0)
            return loseMoney(context,fee)
        },
        check(context) {
            let fee = Array.from(
                context.mainStatuses.landProperties.entries()
            ).filter(
                ([_,{operatorId}]) => operatorId === context.nowPid
            ).reduce((acc, [_,{amount}]) => acc + (amount * 100000),0)
            let nowCash = context.mainStatuses.players[context.nowPid].cash
            return (nowCash < fee)
        },
        needHelpFromFund: (_) => false,
        getHelpFromFund(context) {
            return context.mainStatuses
        },
        needHelpFromBasicIncome: (_) => false,
        getHelpFromBasicIncome(context) {
            return context.mainStatuses
        },
        bankrupt: (_) => false,
        postSale(context, targets) {
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
            
            let fee = Array.from(
                new_lp.entries()
            ).filter(
                ([_,{operatorId}]) => operatorId === context.nowPid
            ).reduce((acc, [_,{amount}]) => acc + (amount * 100000),0)

            
            const new_cashCache = (context.mainStatuses.cashCache ?? players[nowPid].cash) + (sold * 300000) - fee
            return {
                players,
                landProperties: new_lp,
                govIncome,
                cashCache: new_cashCache
            }
        }
    },  
    inheritDonate: { // 상속받은 유산 100만 기부
        mainStatuses(context) {
            return loseMoney(context, 1000000)
        },
        check(context) {
            return simplyLosingMoneyCheck(context,1000000)
        },
        needHelpFromFund(context) {
            return fundCheck(context,1000000)
        },
        getHelpFromFund(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = [...players]
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 1000000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome,
                cashCache
            }
        },
        needHelpFromBasicIncome(context) {
            return basicIncomeCheck(context,1000000)
        },
        getHelpFromBasicIncome(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = tupleMap(players,(p) => ({
                ...p,
                cash: p.cash + (govIncome/4)
            })) as typeof players
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 1000000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome: 0,
                cashCache
            }
        },
        bankrupt(context) {
            return bankruptcyCheck(context, 1000000)
        },
        postSale(context, targets) {
            return sell(context,targets,1000000)
        }
    },   
    cyberSecurityThreat: { // 사이버 범죄 (시장에 100만 지불)
        mainStatuses(context) {
            return loseMoney(context, 1000000)
        },
        check(context) {
            return simplyLosingMoneyCheck(context,1000000)
        },
        needHelpFromFund(context) {
            return fundCheck(context,1000000)
        },
        getHelpFromFund(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = [...players]
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 1000000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome,
                cashCache
            }
        },
        needHelpFromBasicIncome(context) {
            return basicIncomeCheck(context,1000000)
        },
        getHelpFromBasicIncome(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = tupleMap(players,(p) => ({
                ...p,
                cash: p.cash + (govIncome/4)
            })) as typeof players
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 1000000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome: 0,
                cashCache
            }
        },
        bankrupt(context) {
            return bankruptcyCheck(context, 1000000)
        },
        postSale(context, targets) {
            return sell(context,targets,1000000)
        }
    },
    fakeNews: { // 가짜뉴스에 대항할 이미지 메이킹 (시장에 100만 지불)
        mainStatuses(context) {
            return loseMoney(context, 1000000)
        },
        check(context) {
            return simplyLosingMoneyCheck(context,1000000)
        },
        needHelpFromFund(context) {
            return fundCheck(context,1000000)
        },
        getHelpFromFund(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = [...players]
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 1000000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome,
                cashCache
            }
        },
        needHelpFromBasicIncome(context) {
            return basicIncomeCheck(context,1000000)
        },
        getHelpFromBasicIncome(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = tupleMap(players,(p) => ({
                ...p,
                cash: p.cash + (govIncome/4)
            })) as typeof players
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 1000000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome: 0,
                cashCache
            }
        },
        bankrupt(context) {
            return bankruptcyCheck(context, 1000000)
        },
        postSale(context, targets) {
            return sell(context,targets,1000000)
        }
    },
    voicePhishing: { // 보이스피싱 (시장에 100만 지불)
        mainStatuses(context) {
            return loseMoney(context, 1000000)
        },
        check(context) {
            return simplyLosingMoneyCheck(context,1000000)
        },
        needHelpFromFund(context) {
            return fundCheck(context,1000000)
        },
        getHelpFromFund(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = [...players]
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 1000000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome,
                cashCache
            }
        },
        needHelpFromBasicIncome(context) {
            return basicIncomeCheck(context,1000000)
        },
        getHelpFromBasicIncome(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = tupleMap(players,(p) => ({
                ...p,
                cash: p.cash + (govIncome/4)
            })) as typeof players
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 1000000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome: 0,
                cashCache
            }
        },
        bankrupt(context) {
            return bankruptcyCheck(context, 1000000)
        },
        postSale(context, targets) {
            return sell(context,targets,1000000)
        }
    },
    trafficAccident: { // 교통사고 (시장에 50만 지불)
        mainStatuses(context) {
            return loseMoney(context, 500000)
        },
        check(context) {
            return simplyLosingMoneyCheck(context,500000)
        },
        needHelpFromFund(context) {
            return fundCheck(context,500000)
        },
        getHelpFromFund(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = [...players]
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 500000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome,
                cashCache
            }
        },
        needHelpFromBasicIncome(context) {
            return basicIncomeCheck(context,500000)
        },
        getHelpFromBasicIncome(context) {
            const {
                players,
                landProperties,
                govIncome,
                cashCache
            } = context.mainStatuses
            const new_players: typeof players = tupleMap(players,(p) => ({
                ...p,
                cash: p.cash + (govIncome/4)
            })) as typeof players
            let values = Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId === context.nowPid).reduce((acc, [_,{amount}]) => acc + (amount * 300000),0)
            new_players[context.nowPid].cash = (new_players[context.nowPid].cash + values + context.fund) - 500000
            return {
                players: new_players,
                landProperties: new Map(Array.from(landProperties.entries()).filter(([_, {operatorId}]) => operatorId !== context.nowPid)),
                govIncome: 0,
                cashCache
            }
        },
        bankrupt(context) {
            return bankruptcyCheck(context, 500000)
        },
        postSale(context, targets) {
            return sell(context,targets,500000)
        }
    },


}

export const TARGETTING_CHANCE_CARDS: {
    [kind in TargettingChanceCardKindType]: { target: string }
} = {
    quirkOfFate: { // 운명의 장난 [주사위 굴리기 프롬프트]
        target: "quirkOfFateModal"
    },
    greenNewDeal: { // 그린뉴딜 : 자신의 건물이 지어진 도시 한 곳에 무료로 건물을 1채 더 짓습니다.
        target: "greenNewDealModal"
    },
    trafficJam: { // 교통체증 : 원하는 도시의 건물 한 채 제거
        target: "buildingRemovalModal"
    },
    quickMove: { // 원하는 곳으로 이동(워프 아님!!)
        target: "quickMoveModal"
    },
    extinction: { // 지방 소멸 : 한 그룹의 도시들을 선택합니다. 해당 그룹의 모든 도시에 있는 집을 1채 씩 없앱니다.
        target: "extinctionModal"
    },
    trade: { // 도시 교환 : 자신의 도시 1개와 원하는 (상대방의) 도시 1개를 선택하여 통째로 맞교환합니다.
        target: "tradeModal"
    }
}

export const SIDECAR_CHANCE_CARDS: {
    catastrophe: (context: GameContext) => GameContext['remainingSidecars'],
    pandemic: (context: GameContext) => GameContext['remainingSidecars']
} = {
    catastrophe(context) { // 긴급재난 발생 : 대도시(서울, 부산, 인천, 대구, 대전, 광주, 울산, 창원, 고양, 수원)에 긴급재난이 발생했습니다. [지역 한정 사이드카]
        return {
            pandemic: context.remainingSidecars.pandemic,
            catastrophe: context.remainingSidecars.catastrophe + 4
        }
    },
    pandemic(context) { // 팬데믹 : 1턴 동안 모든 사용료(토지, 건물, 서비스)가 면제됩니다. [사이드카]
        return {
            pandemic: context.remainingSidecars.pandemic + 4,
            catastrophe: context.remainingSidecars.catastrophe
        }
    }
}

export const NORMAL_CHANCE_CARDS: {
    [kind in NormalChanceCardKindType]: (context: GameContext) => GameContext['mainStatuses']
} = {
    newborn(context) { // 출산 축하 : 시장으로부터 100만 받음
        return earnMoney(context,1000000)
    },
    earthquake(context) { // 지진 : 자신의 집이 있는 모든 도시에 집 한채씩 파괴됩니다.
        return destroyEachBuildingForTargets(context,(loc,stat) => stat.operatorId === context.nowPid)
    },
    taxHeaven(context) { // 조세회피처 [감옥으로 워프]
        return warpTo(context,JAIL_LOCATION)
    },
    disease(context) { // 병원행 [병원으로 워프]
        return warpTo(context,HOSPITAL_LOCATION)
    },
    emergencyAid(context) { // 긴급의료비 지원 (병원비 1회 무료) [티켓]
        return getTicket(context,"freeHospital")
    },
    drug(context) { // 마약 소지 적발 [감옥으로 워프]
        return warpTo(context,JAIL_LOCATION)
    },
    nursing(context) { // 병간호 [병원으로 워프]
        return warpTo(context,HOSPITAL_LOCATION)
    },
    inheritGet(context) { // 유산 상속 (100만 get)
        return earnMoney(context,1000000)
    },
    healthy(context) { // 건강한 식습관 (병원비 1회 무료) [티켓]
        return getTicket(context,"freeHospital")
    },
    typhoon(context) { // 태풍 : 해안 도시(목포, 강릉, 포항, 창원, 서산, 순천, 울산, 여수, 인천, 제주, 부산)에 있는 건물이 한 채씩 파괴됩니다.
        return destroyEachBuildingForTargets(context,(loc,stat) => isCoastal(loc))
    },
    scholarship(context) { // 장학금 [대학으로 워프]
        return warpTo(context,UNIVERSITY_LOCATION)
    },
    feeExemption(context) { // 토지 및 건물 사용료 면제 [티켓]
        return getTicket(context,"feeExemption")
    },
    bonus(context) { // 보너스 지급 : 다음 차례 출발지 도착/경유 시 2배의 급여를 받습니다.
        return getTicket(context,"bonus")
    },
    doubleLotto(context) { // 더블 로또 [티켓]
        return getTicket(context,"doubleLotto")
    },
    insiderTrading(context) { // 내부자 거래 적발 [감옥으로 워프]
        return warpTo(context,JAIL_LOCATION)
    },
    taxExemption(context) { // 다음 차례 출발점 도착/경유 시 공과금(물, 전기, 도시가스) 면제
        return getTicket(context,"taxExemption")
    },
    tooMuchElectricity(context) { // [전력회사로 워프]
        let dest = getInfraLocation("electricity")
        return warpTo(context, dest)
    },
    lawyersHelp(context) { // 변호사 : 즉시 감옥에서 석방 [티켓]
        return getTicket(context,"lawyer")
    },
    soaringStockPrice(context) { // 주식시장 급등 : 보유한 현금의 50%를 시장에서 받습니다. (현금 끝자리가 만 단위 이하일 경우 반올림)
        let toEarn = roundUnit(context.mainStatuses.players[context.nowPid].cash, 100000)
        return earnMoney(context,toEarn)
    },
    plungeInStockPrice(context) { // 주식시장 급락 : 현금자산의 절반을 잃습니다. (시장에 지불, 현금 끝자리가 만 단위 이하일 경우 반올림)
        let toLose = roundUnit(context.mainStatuses.players[context.nowPid].cash, 100000)
        return loseMoney(context,toLose)
    },
    studyingHard(context) { // 주경야독으로 학위 취득 성공 : 즉시 졸업
        return educate(context, true)
    }
}

export function randomChance(): ChanceCardKindType {
    let size_normal = NORMAL_CHANCE_CARD_KINDS.length
    let size_needs_check = NEEDS_CHECK_CHANCE_CARD_KINDS.length
    let size_sidecar = SIDECAR_CHANCE_CARD_KINDS.length
    let size_targetting = TARGETTING_CHANCE_CARD_KINDS.length
    let size = size_normal + size_needs_check + size_sidecar + size_targetting
    let mappedRandomBytes = crypto.getRandomValues(new Uint8Array(2)).map((byte) => ((byte % size) + 64))
    let interm = (mappedRandomBytes[0] ^ mappedRandomBytes[1]) % size
    if (interm in NORMAL_CHANCE_CARD_KINDS) {
        return NORMAL_CHANCE_CARD_KINDS[interm]
    }
    let interm_2nd = interm - size_normal
    if(interm_2nd in NEEDS_CHECK_CHANCE_CARD_KINDS) {
        return NEEDS_CHECK_CHANCE_CARD_KINDS[interm_2nd]
    }
    let interm_3rd = interm_2nd - size_needs_check
    if (interm_3rd in SIDECAR_CHANCE_CARD_KINDS) {
        return SIDECAR_CHANCE_CARD_KINDS[interm_3rd]
    }
    let interm_4th = interm_3rd - size_sidecar
    return TARGETTING_CHANCE_CARD_KINDS[interm_4th]
}

export type LandPropSaleType = {location: number, amount: number}

export function useOneTicket(context: GameContext, ticketType: keyof TicketsType): GameContext['mainStatuses'] {
    let { mainStatuses, nowPid } = context
    let new_players: typeof mainStatuses.players = [...mainStatuses.players]
    let rem_tickets = Math.max(0, new_players[nowPid].remaining.tickets[ticketType] - 1)
    new_players[nowPid].remaining.tickets[ticketType] = rem_tickets
    return {
        ...mainStatuses,
        players: new_players
    }
}

export function swapMap<T, U>([a,b]: [T, T], fmap: (v: T) => U): [U, U] {
    return [fmap(b), fmap(a)]
}

export function swapCash(old_players: GameContext['mainStatuses']['players'], nowPid: 0|1|2|3, targetPid: 0|1|2|3): GameContext['mainStatuses']['players'] {
    if (nowPid !== targetPid) {
        let new_players: typeof old_players = [...old_players]
        let [nowCash, targetCash] = swapMap([nowPid, targetPid],(v) => old_players[v].cash)
        new_players[nowPid].cash = nowCash
        new_players[targetPid].cash = targetCash
        return new_players
    } else {
        return old_players
    }
}

export function swapLandProperties(old_lp: Map<BuildableLocationType, LandPropertyStatus>, nowPid: 0|1|2|3, targetPid: 0|1|2|3): Map<BuildableLocationType, LandPropertyStatus> {
    if (nowPid !== targetPid) {
        const output = new Map<BuildableLocationType, LandPropertyStatus>()
        old_lp.forEach(({amount, operatorId},loc) => {
            if(operatorId === nowPid) {
                output.set(loc,{
                    amount,
                    operatorId: targetPid
                })
            } else if(operatorId === targetPid) {
                output.set(loc,{
                    amount,
                    operatorId: nowPid
                })
            } else {
                output.set(loc,{
                    amount,
                    operatorId
                })
            }
        })
        return output
    } else {
        return new Map(old_lp)
    }
}

const DS_MOD4_LOOKUP: {
    [sum in DicesSumType]: 0|1|2|3
} = {
    2: 2, 3: 3, 4: 0, 5: 1, 6: 2, 7: 3, 8: 0, 9: 1, 10: 2, 11: 3, 12: 0
}

const PID_CYCLING_LOOKUP = [
    [0,1,2,3],
    [1,2,3,0],
    [2,3,0,1],
    [3,0,1,2]
] as const


export function getTargetPid(nowPid: 0|1|2|3, d1: DiceType, d2: DiceType) {
    let sum_then_mod = DS_MOD4_LOOKUP[DICES_SUMS_LOOKUP[d1][d2]]
    return PID_CYCLING_LOOKUP[nowPid][sum_then_mod]
}