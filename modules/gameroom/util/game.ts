/**
 * 包含了游戏中的常见操作（直接处理Game对象）
 */

import { CARDS, CARD_SCORE } from "../../../config/cards";
import { GAME_OPERATES, IDeck, type ICard, type IGame, type IPlayer } from "../../../interfaces/game";
import { addCards, createDeck, getDeckAllCards, pickCardOrFail, pickRandom } from "../../../modules/gameroom/util/card";

export function getConfig(game: IGame, key: string, defaultValue: any) {
    return game.config[key] ?? defaultValue
}
/**
 * 
 * @param players 玩家列表
 * @returns 游戏对象
 */
export function initGame(players: IPlayer[]): IGame {

    for (let i = 0; i < players.length; i++) {
        players[i].score = 0
        players[i].hand = createDeck("", [])
        players[i].stored = createDeck("", [], true)
    }
    let ret: IGame = {
        stage: {
            round: 0,
            playerIndex: 0,
            operate: GAME_OPERATES.PUTCARD,
            data: {

            }
        },
        pinnedCard: [],
        players,
        allCards: createDeck("", getDeckAllCards()),
        lastOperate: "",
        lastOperatedCards: createDeck("弃牌堆", [], true),
        allShown: createDeck("", []),
        config: {

        }
    }
    for (let i = 0; i < players.length; i++) {
        ret.stage.playerIndex = i;
        for (let j = 0; j < 5; j++) {
            drawCard(ret);
        }
    }
    ret.stage.playerIndex = 0;
    drawCard(ret);
    ret.stage.operate = GAME_OPERATES.DISCARD;
    return ret;
}

export function nxtPlayer(game: IGame) {
    if (game.stage.round == 0) {
        game.stage.round = 1;
    } else {
        game.stage.playerIndex++;
        if (game.stage.playerIndex >= game.players.length) {
            game.stage.playerIndex = 0;
            game.stage.round++;
        }
    }
}

export function discardCard(game: IGame, card: ICard) {
    pickCardOrFail(game.players[game.stage.playerIndex].hand!, [card]);
    game.lastDiscard = card;
    addCards(game.lastOperatedCards, [card]);
    addCards(game.allShown, [card]);
}

export function drawCard(game: IGame): ICard {
    let tmp: ICard = pickRandom(game.allCards);
    addCards(game.players[game.stage.playerIndex].hand!, [tmp]);
    return tmp;
}

const putCardIdx: Record<string, number> = {
    "A": 6,
    "2": 5,
    "3": 4,
    "4": 3,
    "5": 2,
    "6": 1,
    "7": 0,
    "8": -1,
    "9": -2,
    "10": -3,
    "J": -4,
    "Q": -5,
    "K": -6,
}
const idxPutCard: Record<number, string> = {
    "6": "A",
    "5": "2",
    "4": "3",
    "3": "4",
    "2": "5",
    "1": "6",
    "0": "7",
    "-1": "8",
    "-2": "9",
    "-3": "10",
    "-4": "J",
    "-5": "Q",
    "-6": "K",
}

function _isValidPut(game: IGame, cards: ICard[], c: Record<string, number>, jokerCnt: number): { n: number, c: string | string[] }[] {
    let targetCardId: { n: number, c: string }[] = [];
    //case 1:XXX
    if (Object.keys(c).length == 1) {
        if (c[Object.keys(c)[0]] + jokerCnt >= 3) {
            targetCardId.push({ n: jokerCnt, c: Object.keys(c)[0] });
        } else {
            throw new Error("摆牌非法");
        }
    }
    //case 2:56789
    else {
        let left = -1, right = -1, col = -1;
        //花色
        for (let i = 0; i < cards.length; i++) {
            if (cards[i].id == "JOK") { continue; }
            if (col == -1) {
                col = cards[i].color;
            } else if (col != cards[i].color) {
                throw new Error("顺子必须同花色");
            }
        }
        //数量和范围
        for (let i = 0; i < CARDS.length; i++) {
            let card = CARDS[i];
            if (c[card] == 1) {
                if (left == -1) left = i;
                if (left != -1) right = i;
            } else if (c[card] > 1) {
                throw new Error("顺子不能含有多张牌");
            } else {
                targetCardId.push({ n: 1, c: card });
            }
        }
        /**
         * 5,6,7,8,9=>7
         * 5,6,7,8=>6.5
         * 6,7,8,9=>7.5
         */
        if (Math.abs((left + right) / 2 - 7) >= 1) {
            throw new Error("顺子必须以7为中心");
        }
    }
    return targetCardId;
}
function _isValidCha(game: IGame, cards: ICard[], c: Record<string, number>, jokerCnt: number, additCard: ICard): { n: number, c: string | string[] }[] {
    let targetCardId: { n: number, c: string }[] = [];
    //case 1:XXX
    if (Object.keys(c).length == 1) {
        if (c[Object.keys(c)[0]] + jokerCnt >= 3) {
            targetCardId.push({ n: jokerCnt, c: Object.keys(c)[0] });
        } else {
            throw new Error("插牌非法");
        }
    }
    else {
        throw new Error("摆牌非法");
    }
    return targetCardId;
}
function _isValidExt(game: IGame, cards: ICard[], c: Record<string, number>, jokerCnt: number, stored: IDeck): { n: number, c: string | string[] }[] {
    let targetCardId: { n: number, c: string | string[] }[] = [];
    //case 1:XXX
    if (Object.keys(c).length == 1) {
        if (c[Object.keys(c)[0]] + jokerCnt >= 3) {
            let cnt = 0;
            stored.cards.forEach((card) => {
                let id = card.id;
                if (id == "JOK") {
                    if (card.real) id = card.real.id;
                    else return;
                }
                if(id == Object.keys(c)[0]) cnt++;
            });
            if (cnt >= 3) {
                if(jokerCnt)targetCardId.push({ n: jokerCnt, c: Object.keys(c)[0] });
            }else{
                throw new Error("补牌非法");
            }
        } else {
            throw new Error("插牌非法");
        }
    }
    else if (Object.keys(c).length == 0) {
        //补牌，选择的王牌
        let cd: Record<string, number> = {};
        stored.cards.forEach((card) => {
            let id = card.id;
            if (id == "JOK") {
                if (card.real) id = card.real.id;
                else return;
            }
            cd[id] = (cd[id] || 0) + 1;
        })
        let useableCards: string[] = [];
        Object.keys(cd).forEach((key) => {
            if (cd[key] >= 3) {
                useableCards.push(key);
            }
        })
        targetCardId.push({ n: jokerCnt, c: useableCards });
    }
    return targetCardId;
}
//检查摆牌/插牌合法。返回需要钉的牌的选项
export function isValidPutCard(game: IGame, cards: ICard[], putedCard?: IDeck, additCard?: ICard): { select: ICard[], count: number }[] {
    let c: Record<string, number> = {};
    let jokerCnt = 0;
    cards.forEach((card) => {
        if (card.id == "JOK") {
            jokerCnt += 1;
        } else if (isCardPinned(game, card)) {
            throw new Error("不能摆被钉的牌");
        } else {
            c[card.id] = (c[card.id] || 0) + 1;
        }
    })
    if (additCard) {
        if (additCard.id != "JOK")
            c[additCard.id] = (c[additCard.id] || 0) + 1;
        else
            throw new Error("王牌不可插");
    }
    let targetCardId: { n: number, c: string }[] = [];
    if (Object.keys(c).length == 0) {
        if (putedCard) {
            //传入了摆牌区的情况，且选中了若干王牌
            let cd: Record<string, number> = {};
            putedCard.cards.forEach((card) => {
                cd[card.id] = (cd[card.id] || 0) + 1;
            })
            Object.keys(cd).forEach((key) => {
                for (let i = 0; i < 4; i++) {

                }
            })
        } else
            throw new Error("摆牌非法");
    } else if (Object.keys(c).length == 1) {
        if (c[Object.keys(c)[0]] + jokerCnt >= 3) {
            targetCardId.push({ n: jokerCnt, c: idxPutCard[Object.keys(c)[0]] });
        } else {
            if (additCard) {
                throw new Error("摆牌非法");
            }
            //传入了摆牌区的情况：检查是否可以补张
            let dumpCnt = 0;
            if (putedCard)
                putedCard.cards.forEach((card) => {
                    if (card.id == idxPutCard[Object.keys(c)[0]]) {
                        dumpCnt++;
                    }
                })
            if (dumpCnt > 2) {
                targetCardId = []
            } else
                throw new Error("摆牌非法");
        }
    } else {
        if (additCard) {
            throw new Error("顺子不可插");
        }
        let col = -1
        for (let i = 0; i < cards.length; i++) {
            if (cards[i].id == "JOK") {
                continue;
            }
            if (!["5", "6", "7", "8", "9"].find(id => id == cards[i].id)) {
                throw new Error("摆牌非法");
            }
            if (c[putCardIdx[cards[i].id]] > 1) {
                throw new Error("摆牌非法");
            }
            if (col == -1) {
                col = cards[i].color;
            } else if (col != cards[i].color) {
                throw new Error("摆牌非法");
            }
        }

        if (c["6"] || c["8"]) {
            if (!c["6"]) {
                targetCardId.push({ n: 1, c: "6" });
            } else if (!c["8"]) {
                targetCardId.push({ n: 1, c: "8" });
            }
        }
        if (c["5"] || c["9"]) {
            if (!c["5"]) {
                targetCardId.push({ n: 1, c: "5" });
            } else if (!c["9"]) {
                targetCardId.push({ n: 1, c: "9" });
            }
        }
    }

    let hasPinColor = -1, hasPinId = "";
    let ret: { select: ICard[], count: number }[] = [];
    if (targetCardId.length > 2) {
        throw new Error("摆牌非法");
    }
    targetCardId.forEach(({ c: cardId, n: num }) => {
        if (jokerCnt > 0) {
            jokerCnt -= 1;
            let selectColor = [true, true, true, true];
            game.allShown.cards.forEach((card) => {
                if (card.id == cardId) {
                    selectColor[card.color] = false;
                }
            });
            if (hasPinId == cardId) {
                selectColor[hasPinColor] = false;
            }
            cards.forEach((card) => {
                if (card.id == cardId) {
                    selectColor[card.color] = false;
                }
            });
            game.pinnedCard.forEach((card) => {
                if (card.id == cardId) {
                    selectColor[card.color] = false;
                }
            });
            let trueCnt = 0;
            selectColor.forEach((flg, idx) => {
                if (flg) {
                    trueCnt += 1;
                }
            })
            if (trueCnt < num) {
                throw new Error("摆牌非法");
            }
            let tmp: { select: ICard[], count: number } = {
                select: [],
                count: num
            };
            selectColor.forEach((flg, idx) => {
                if (flg) {
                    tmp.select.push({
                        id: cardId,
                        color: idx
                    })
                }
            })
            ret.push(tmp);
        }
    })
    return ret;
}
export function putCard(game: IGame, cards: ICard[], putedCard: IDeck, additCard?: ICard) {
    let pics = isValidPutCard(game, cards, putedCard, additCard);
    pickCardOrFail(game.players[game.stage.playerIndex].hand!, cards);
    addCards(game.players[game.stage.playerIndex].stored!, cards);
    addCards(game.allShown, cards);
    return pics;
}

export function calcScore(game: IGame, player: IPlayer, can20?: boolean): number {
    let tmp = 0;
    player.hand!.cards.forEach((card) => {
        if (isCardPinned(game, card)) {
            tmp += CARD_SCORE["JOK"];
        } else tmp += CARD_SCORE[card.id];
    });
    if (tmp == 0 && can20) {
        tmp = -20;
    }
    return tmp;
}
export function applyCalc(game: IGame, calcInternalId: number, antiCalcInternalId: number[], can20: boolean) {
    let t: number = 0, calcPlayer: number = 0, antiPlayer: number = 100;
    let scoreMp = {};
    game.players.forEach((player, idx) => {
        let tmpScore = calcScore(game, player, player.internalId == calcInternalId && can20);
        t += tmpScore;
        scoreMp[idx] = tmpScore;
        if (player.internalId == calcInternalId) {
            calcPlayer = tmpScore;
        }
        if (antiCalcInternalId.includes(player.internalId)) {
            antiPlayer = Math.min(tmpScore, antiPlayer);
        }
    })
    let finallyScore = game.players.map(() => 0);
    if (calcPlayer == -20) {
        //-20不允许反算
        game.players.forEach((player, idx) => {
            player.score += scoreMp[idx];
            finallyScore[idx] = scoreMp[idx];
        });
    }
    else if (calcPlayer >= antiPlayer) {
        //反算成功，包牌T
        game.players[game.players.findIndex((p) => p.internalId == calcInternalId)].score
            += t * antiCalcInternalId.length;
        finallyScore[game.players.findIndex((p) => p.internalId == calcInternalId)] = t * antiCalcInternalId.length;
    } else {
        game.players.forEach((player, idx) => {
            if (antiCalcInternalId.includes(player.internalId)) {
                if (scoreMp[idx] > 5) {
                    finallyScore[idx] = t * game.players.length
                    player.score += t * game.players.length;
                } else {
                    player.score += t * antiCalcInternalId.length;
                    finallyScore[idx] = t * antiCalcInternalId.length;
                }
            } else {
                player.score += scoreMp[idx];
                finallyScore[idx] = scoreMp[idx];
            }
        });
    }
    return finallyScore;
}


export function endGame(game: IGame) {
    game.allCards = createDeck("allCards", getDeckAllCards());
    game.allShown = createDeck("allShown", []);
    game.pinnedCard = [];
    game.lastOperate = "";
    game.lastDiscard = undefined;
    game.lastOperatedCards = createDeck("弃牌堆", [], true);
    let maxScore = 0, maxScoreIdx = 0;
    game.players.forEach((player, idx) => {
        player.hand = createDeck("", []);
        player.stored = createDeck("", []);
        player.mark = {};
        game.stage.playerIndex = idx;
        for (let j = 0; j < 5; j++) {
            drawCard(game);
        }
        if (player.score > maxScore) {
            maxScore = player.score;
            maxScoreIdx = idx;
        }
    });
    game.stage.playerIndex = maxScoreIdx;
    drawCard(game);
    game.stage.operate = GAME_OPERATES.DISCARD;
    game.stage.round = 0;
}


export function isCardPinned(game: IGame, card: ICard) {
    if (game.pinnedCard) {
        for (let c of game.pinnedCard) {
            if (c.id == card.id && c.color == card.color) {
                return true;
            }
        }
    }
    return false;
}