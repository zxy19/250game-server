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
export function hasMultiPut(cards: ICard[]): boolean {
    let hasCard: ICard | undefined, jokerCnt = 0;
    for (let i = 0; i < cards.length; i++) {
        if (cards[i].id != "JOK") {
            if (hasCard) {
                return false;
            }
            hasCard = cards[i];
        } else {
            jokerCnt++;
        }
    }
    if (!hasCard) return false;
    if ((Math.abs(CARDS.indexOf(hasCard.id) - 6) - 1) * 2 + 1 >= jokerCnt) return false;
    return true;
}
function _isValidPut(game: IGame, cards: ICard[], c: Record<string, number>, jokerCnt: number, shunziOnly?: boolean): { n: number, c: string | string[], color?: number }[] {
    let targetCardId: { n: number, c: string | string[], color?: number }[] = [];
    //case 1:XXX
    if (Object.keys(c).length == 1 && !shunziOnly) {
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
            }
        }
        let cnt = 0;
        for (let i = left; i <= right; i++) {
            if (c[CARDS[i]] == 0) {
                cnt++;
            }
        }
        if (cnt > jokerCnt) {
            throw new Error("摆牌非法");
        }
        for (let i = left; i <= right; i++) {
            if (c[CARDS[i]] == 0) {
                targetCardId.push({ n: 1, c: CARDS[i], color: col });
            }
        }
        while (jokerCnt - cnt > 0) {
            if (6 - left < right - 6) {
                if (left == 0) throw new Error("摆牌非法");
                left--;
                targetCardId.push({ n: 1, c: CARDS[left], color: col });
            } else if (6 - left > right - 6) {
                if (right >= CARDS.length - 2) throw new Error("摆牌非法");
                right++;
                targetCardId.push({ n: 1, c: CARDS[right], color: col });
            } else if (jokerCnt - cnt == 0) {
                let tc = [];
                if (left != 0) tc.push(CARDS[left - 1]);
                if (right != CARDS.length - 2) tc.push(CARDS[right + 1]);
                if (tc.length == 0) throw new Error("摆牌非法");
                targetCardId.push({ n: 1, c: tc, color: col });
            } else {
                if (left != 0) {
                    left--;
                    targetCardId.push({ n: 1, c: CARDS[left], color: col });
                } else if (right != CARDS.length - 2) {
                    right++;
                    targetCardId.push({ n: 1, c: CARDS[right], color: col });
                } else throw new Error("摆牌非法");
            }
            cnt++;
        }
        /**
         * 5,6,7,8,9=>6
         * 5,6,7,8=>5.5
         * 6,7,8,9=>6.5
         */
        if (Math.abs((left + right) / 2 - 6) >= 1) {
            throw new Error("顺子必须以7为中心");
        }
    }
    return targetCardId;
}
function _isValidCha(game: IGame, cards: ICard[], c: Record<string, number>, jokerCnt: number, additCard: ICard): { n: number, c: string | string[], color?: number }[] {
    let targetCardId: { n: number, c: string }[] = [];
    //case 1:XXX
    if (Object.keys(c).length == 1) {
        if (c[Object.keys(c)[0]] + jokerCnt >= 3) {
            if (jokerCnt)
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
function _isValidExt(game: IGame, cards: ICard[], c: Record<string, number>, jokerCnt: number, stored: IDeck): { n: number, c: string | string[], color?: number }[] {
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
                if (id == Object.keys(c)[0]) cnt++;
            });
            if (cnt >= 3) {
                if (jokerCnt) targetCardId.push({ n: jokerCnt, c: Object.keys(c)[0] });
            } else {
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
        if (jokerCnt)
            targetCardId.push({ n: jokerCnt, c: useableCards });
    }
    return targetCardId;
}


//检查摆牌/插牌合法。返回需要钉的牌的选项
export function isValidPutCard(game: IGame, cards: ICard[], putedCard?: IDeck, additCard?: ICard, shunzi?: boolean): { select: ICard[], count: number }[] {
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
    let targetCardId: { n: number, c: string | string[], color?: number }[] = [];
    if (additCard) {
        targetCardId = _isValidCha(game, cards, c, jokerCnt, additCard);
    } else if (cards.length <= 2 && putedCard) {
        targetCardId = _isValidExt(game, cards, c, jokerCnt, putedCard);
    } else {
        targetCardId = _isValidPut(game, cards, c, jokerCnt, shunzi);
    }
    let hasPinColor = -1, hasPinId = "";
    let ret: { select: ICard[], count: number }[] = [];
    targetCardId.forEach((targetCard) => {
        let _cardId = targetCard.c;
        let num = targetCard.n;
        let col = targetCard.color;
        if (jokerCnt >= num) {
            jokerCnt -= num;
            if (typeof _cardId === "string") {
                _cardId = [_cardId];
            }
            let tmp: { select: ICard[], count: number } = {
                select: [],
                count: num
            };
            _cardId.forEach((cardId) => {
                let selectColor = [true, true, true, true];
                if (col !== undefined) {
                    for (let i = 0; i < 4; i++) {
                        selectColor[i] = (i == col);
                    }
                }
                game.allShown.cards.forEach((card) => {
                    if (cardId == card.id) {
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
                selectColor.forEach((flg, idx) => {
                    if (flg) {
                        tmp.select.push({
                            id: cardId,
                            color: idx
                        })
                    }
                })
            })
            ret.push(tmp);
        } else {
            throw new Error("摆牌非法");
        }
    })
    return ret;
}
export function putCard(game: IGame, cards: ICard[], pinCard: ICard[], additCard?: ICard) {
    pickCardOrFail(game.players[game.stage.playerIndex].hand!, cards);
    let pickId = 0;
    addCards(game.allShown, cards);

    cards.forEach((card) => {
        if (pickId >= pinCard.length) return;
        if (card.id == "JOK") {
            card.real = pinCard[pickId];
            pickId++;
        }
    });
    if (additCard) {
        cards.push({
            id: "JOK",
            color: 2,
            real: additCard
        });
    }
    addCards(game.players[game.stage.playerIndex].stored!, cards);
}
export function canPutCard(game: IGame, deck: IDeck, storedCards?: IDeck, additCard?: ICard) {
    //注：由于中途发现忘记做的功能导致代码极为丑陋，后续修缮。
    let c: Record<number, Record<string, number>> = {}
    let c2: Record<string, number> = {}
    if (storedCards)
        storedCards.cards.forEach((card) => {
            c2[card.id] = (c2[card.id] || 0) + 1;
        });

    deck.cards.forEach((card) => {
        if (isCardPinned(game, card)) {
            return;
        }
        c[card.color] = (c[card.color] || {});
        c[card.color][card.id] = (c[card.color][card.id] || 0) + 1;
    });
    for (let card of deck.cards) {
        if (isCardPinned(game, card)) {
            continue;
        }
        if (c2[card.id] && c2[card.id] > 3) {
            console.log("补牌可能性", card);
            return true;
        }
    }
    let maxCnt = 0;
    let jokerCnt = 0;
    for (let i = 0; i < 4; i++) {
        if (c[i] && c[i]["JOK"]) {
            jokerCnt++;
        }
    }
    if (additCard) {
        if (additCard.id != "JOK") {
            c[additCard.color] = (c[additCard.color] || {})
            c[additCard.color][additCard.id] = (c[additCard.color][additCard.id] || 0) + 1;
        }
    }
    CARDS.forEach((card) => {
        let tmp = 0;
        if (card != "JOK") {
            if (additCard && card != additCard.id) return;
            for (let i = 0; i < 4; i++) {
                if (c[i] && c[i][card]) {
                    tmp++;
                }
            }
            maxCnt = Math.max(maxCnt, tmp);
        }
    });
    if (additCard) {
        if (additCard.id != "JOK") {
            c[additCard.color][additCard.id] = (c[additCard.color][additCard.id] || 0) - 1;
        }
    }
    if (maxCnt + jokerCnt >= 3) { console.log("摆牌可能性", maxCnt); return true; }
    else {
        if (additCard) return false;
        let tmp = 0;
        for (let i = 0; i < 4; i++) {
            if (c[i] && c[i]["7"]) {
                tmp++;
            } else continue;
            if (jokerCnt >= 2) return true;
            if (c[i] && c[i]["8"] && c[i]["6"]) {
                if (c[i]["8"]) tmp++;
                if (c[i]["6"]) tmp++;
            }
            if (jokerCnt + tmp >= 3) return true;
            if (c[i] && c[i]["9"] && c[i]["5"]) {
                if (c[i]["9"]) tmp++;
                if (c[i]["5"]) tmp++;
            }
            if (jokerCnt + tmp >= 5) return true;
        }
    }
    return false;
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
        player.stored = createDeck("", [], true);
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