import { addCards, toCleanCard } from "./util/card";
import { GAME_OPERATES, ICard, IGame, IPlayer } from "../../interfaces/game";
import { applyCalc, discardCard, drawCard, endGame, initGame, isValidPutCard, nxtPlayer, putCard, hasMultiPut } from "../../modules/gameroom/util/game";
import { CARD_SCORE } from "../../config/cards";
type roomMgrOps = {
    send(group: string, data: Record<string, any> | String, exceptConId?: number): void;
    sendPlayer(conId: number, data: Record<string, any> | String): void;
    on(type: string, room: string, cb: (from: number, data: Record<string, any>) => void): void;
    closePlayer(conId: number): void;
}
export default class Room {
    game?: IGame
    player: IPlayer[]
    id: string;
    roomMgr: roomMgrOps
    data: {
        toPutCard: ICard[],
        toPutPics: { select: ICard[], count: number, optGrp?: number, title?: string }[],
        toPutPinnedCard: ICard[],
        toPutAdd?: ICard,
        confirmedCha: {
            cards: ICard[],
            pics: { select: ICard[], count: number }[],
            player: number,
            do: boolean
        }[],
        calcFrom: number,
        calcPutCard: boolean,
        confirmedAntiCalc: {
            player: number,
            do: boolean
        }[],
        autoManaged: number[],
    } = {
            toPutCard: [],
            toPutPics: [],
            toPutPinnedCard: [],
            confirmedCha: [],
            confirmedAntiCalc: [],
            calcFrom: 0,
            calcPutCard: false,
            autoManaged: [],
        }
    pingDataTimeDown = 0;
    pingTick = 0;
    hasPongPlayer: Record<number, number> = {};
    playerTimeout: Record<number, number> = {};
    observer: IPlayer[] = [];
    constructor(id: string, roomMgrDatas: roomMgrOps) {
        this.id = id;
        this.player = [];
        this.roomMgr = roomMgrDatas;
        this.game = undefined;
        this.observer = [];
        this.on("ready", this.onReady.bind(this));
        this.on("setProfile", this.onSetProfile.bind(this));
        this.on("putCard", this.onPutCard.bind(this));
        this.on("putCardSelect", this.onPutCardSelect.bind(this));
        this.on("cha", this.onCha.bind(this));
        this.on("discard", this.onDiscardCard.bind(this));
        this.on("draw", this.onDrawCard.bind(this));
        this.on("calc", this.onCalc.bind(this));
        this.on("antiCalc", this.onAntiCalc.bind(this));
        this.on("msg", this.onMessage.bind(this));
        this.on("pong", this.onPong.bind(this));
    }
    join(uid: string, conId: number, name: string) {
        if (this.game) {
            for (let i = 0; i < this.game.players.length; i++) {
                let element = this.game.players[i];
                if (element.id == uid) {
                    if (this.data.autoManaged.includes(element.internalId)) {
                        this.game.players[i].ready = true;
                        this.game.players[i].internalId = conId;
                        this.game.players[i].offline = false;
                        this.data.autoManaged.splice(this.data.autoManaged.indexOf(element.internalId), 1);
                        this.sendPlayer(conId, { type: "hello", hasGame: true })
                        this.sendPlayer(conId, {
                            type: "start",
                            id: conId,
                            game: this.game,
                        })
                        console.log(`玩家${element.name}回到游戏`);
                        return true;
                    }
                }
            }
            console.log(`玩家${name}开始旁观`);
            this.observer.push({ id: uid, internalId: conId, name: name, score: 0, mark: {}, profile: {} });
            this.sendPlayer(conId, { type: "observer", hasGame: true, game: this.game });
            return true;
        }
        if (this.player.find((p) => p.id == uid)) {
            console.log(`玩家${name}开始旁观`);
            this.observer.push({ id: uid, internalId: conId, name: name, score: 0, mark: {}, profile: {} });
            this.sendPlayer(conId, { type: "observer" });
            return true;
        }
        let curp: IPlayer = { id: uid, internalId: conId, name: name, score: 0, mark: {}, profile: {} };
        this.player.push(curp);
        this.player.forEach((p) => {
            p.ready = false;
        });
        //等待玩家加入被房间管理系统确认后才能发送同步信息
        setTimeout(() => {
            this.sendPlayer(conId, { type: "hello" })
            this.send({
                type: "join",
                id: conId,
                playerId: uid,
                player: this.player
            });
        }, 0)
        console.log(`玩家${name}加入游戏`);
        return true;
    }
    leave(conId: number) {
        //case 1 :离开的是旁观者
        let obs = this.observer.find((p) => p.internalId == conId);
        if (obs) {
            console.log(`旁观者${obs.name}离开了房间`);
            this.observer = this.observer.filter((p) => p.internalId != conId);
            this.send({
                type: "leaveObs",
                player: obs
            })
            return;
        }
        //离开的是玩家
        let curp = (this.game ? this.game.players : this.player).find((p) => p.internalId == conId);
        if (curp) {
            console.log(`玩家${curp.name}连接中断`);
            let obsWithSameId = this.observer.find((p) => p.id == curp.id);
            if (obsWithSameId) {//同ID玩家在房间内：可能是同玩家的刷新行为，直接接管
                this.observer = this.observer.slice(this.observer.findIndex((p) => p.id == curp.id), 1);
                if (this.game) {
                    this.game.players.find((p) => p.internalId == conId).internalId = obsWithSameId.internalId;
                } else {
                    this.player.find((p) => p.internalId == conId).internalId = obsWithSameId.internalId;
                }
                this.sendPlayer(obsWithSameId.internalId, { type: "hello", hasGame: true });
                this.maskedSendPlayer(obsWithSameId.internalId, {
                    type: "takeGame",
                    game: this.game
                })
                console.log(`玩家${obsWithSameId.name}接管了游戏`);
            } else if (this.game) {//无同ID玩家且游戏已经开始：加入托管名单
                this.data.autoManaged.push(curp.internalId);
                this.game.players.find((p) => p.internalId == conId).offline = true;
                this.onCheckAutoManaged(curp.internalId);
                console.log(`玩家${curp.name}自动托管`);
            } else { //无同ID玩家且游戏未开始：直接退出
                this.player = this.player.filter((p) => p.internalId != conId);
            }

            this.send({
                type: "leave",
                player: this.player,
                id: conId,
                game: this.game
            })
        }
    }
    onSetProfile(conId: number, data: Record<string, any>) {
        let curp = this.player.find((p) => p.internalId == conId);
        if (curp) {
            if (this.game) {
                let p = this.game.players.find((p) => p.internalId == conId)
                if (p) p.profile = data.profile;
            }
            curp.profile = data.profile;
            this.send({
                type: "setProfile",
                id: conId,
                profile: data.profile,
                player: this.player,
                game: this.game
            })
        }
    }
    //全局时间刻(一般为1s)
    tick() {
        if (this.pingDataTimeDown > 0) this.pingDataTimeDown--;
        else this.pingDataTimeDown = 7
            ;
        if (this.pingDataTimeDown == 0) {
            let playerDelay: number[] = [];
            (this.game ? this.game.players : this.player).forEach((p) => {
                if (this.hasPongPlayer[p.internalId] == undefined)
                    this.hasPongPlayer[p.internalId] = 2000;
                p.delay = this.hasPongPlayer[p.internalId];
                if (p.delay == 2000 && p.offline != true) {
                    this.playerTimeout[p.internalId] = (this.playerTimeout[p.internalId] || 0) + 1;
                    if (this.playerTimeout[p.internalId] >= 2) {
                        p.offline = true;
                        this.roomMgr.closePlayer(p.internalId);
                    }
                } else {
                    this.playerTimeout[p.internalId] = 0;
                }
                playerDelay.push(p.delay);
            })
            this.send({
                type: "pingResult",
                ping: playerDelay,
            })
        } else if (this.pingDataTimeDown == 2) {
            this.pingTick = Date.now();
            if (this.game)
                this.hasPongPlayer = this.game.players.map(p => -1);
            else
                this.hasPongPlayer = this.player.map(p => -1);
            this.send({
                type: "ping"
            })
        }
    }
    send(msg: string | Object, unmasked = false) {
        if (unmasked) {
            this.roomMgr.send(this.id, msg);
        } else {
            this.maskedSend(msg);
        }
    }
    sendPlayer(conId: number, msg: string | Object) {
        this.roomMgr.sendPlayer(conId, msg);
    }
    maskedSend(msg: any) {
        if (msg.game && msg.game.players) {
            this.game.players.forEach((p: IPlayer) => {
                let tmpMsg = JSON.parse(JSON.stringify(msg));
                tmpMsg.game.allCards.cards = tmpMsg.game.allCards.cards.map((): ICard => ({ id: "JOK", color: 2 }))
                tmpMsg.game.players = tmpMsg.game.players.map((pt: IPlayer) => {
                    if (p.internalId != pt.internalId) {
                        pt.hand.cards = pt.hand.cards.map((): ICard => ({ id: "JOK", color: 2 }))
                    }
                    return pt;
                })
                this.sendPlayer(p.internalId, tmpMsg);
            })


            let fullMasked = JSON.parse(JSON.stringify(msg));
            fullMasked.game.players = fullMasked.game.players.map((pt: IPlayer) => {
                pt.hand.cards = pt.hand.cards.map((): ICard => ({ id: "JOK", color: 2 }))
                return pt;
            })
            this.observer.forEach((p: IPlayer) => {
                this.sendPlayer(p.internalId, fullMasked);
            })
        } else {
            this.roomMgr.send(this.id, msg);
        }
    }
    maskedSendPlayer(conId: number, msg: any) {
        if (!msg.game) return this.sendPlayer(conId, msg);
        let tmpMsg = JSON.parse(JSON.stringify(msg));
        tmpMsg.game.allCards.cards = tmpMsg.game.allCards.cards.map((): ICard => ({ id: "JOK", color: 2 }))
        tmpMsg.game.players = tmpMsg.game.players.map((pt: IPlayer) => {
            if (conId != pt.internalId) {
                pt.hand.cards = pt.hand.cards.map((): ICard => ({ id: "JOK", color: 2 }))
            }
            return pt;
        })
        this.sendPlayer(conId, tmpMsg);
    }
    on(type: string, cb: (conId: number, data: any) => void) {
        this.roomMgr.on(type, this.id, cb);
    }
    isPlayer(conId: number) {
        return this.game.players[this.game.stage.playerIndex].internalId == conId;
    }
    onStart() {
        this.game = initGame(this.player);
        this.send({
            type: "firstCard",
            card: this.game.stage.data.firstCard
        })
        this.send({
            type: "start",
            game: this.game,
        });
    }

    /**插牌 */
    onCha(conId: number, data: Record<string, any>) {
        if (this.isPlayer(conId)) return;
        if (!this.game) return;
        if (!this.game.players.find((p) => p.internalId == conId)) return;
        if (this.game.stage.operate != GAME_OPERATES.WAIT_CHA) return;
        if (this.data.confirmedCha.find((data) => data.player == conId)) {
            return;
        }
        if (data.do) {
            try {
                data.cards = data.cards.map(toCleanCard);
                this.data.confirmedCha.push({
                    cards: data.cards,
                    pics: isValidPutCard(this.game, data.cards, undefined, this.game.lastDiscard),
                    player: conId,
                    do: data.do
                })
            } catch (e) {
                this.sendPlayer(conId, {
                    type: "error",
                    msg: e.message
                });
                return;
            }
        } else {
            this.data.confirmedCha.push({
                cards: [],
                pics: [],
                player: conId,
                do: data.do
            })
        }
        if (this.data.confirmedCha.length == this.game.players.length - 1) {
            this.onChaDone();
        }
    }
    onChaDone() {
        let minFakeCnt = 10;
        let maxData: any;
        for (let chaOp of this.data.confirmedCha) {
            if (chaOp.do) {
                if (chaOp.pics.length < minFakeCnt) {
                    minFakeCnt = chaOp.pics.length;
                    maxData = chaOp;
                } else if (chaOp.pics.length == minFakeCnt) {
                    for (
                        let i = this.game.stage.playerIndex, j = 0;
                        j < this.game.players.length;
                        i = (i + 1) % this.game.players.length, j++) {
                        if (this.game.players[i].internalId == chaOp.player) {
                            maxData = chaOp;
                            break;
                        } else if (this.game.players[i].internalId == maxData.player) {
                            break;
                        }
                    }
                }
            }
        }
        if (minFakeCnt == 10) {
            this.game.stage.operate = GAME_OPERATES.PUTCARD;
            this.game.stage.playerIndex = (this.game.stage.playerIndex + 1) % this.game.players.length;
            this.send({
                type: "next",
                game: this.game,
                player: this.game.stage.playerIndex,
            })
            this.onCheckAutoManaged(this.game.players[this.game.stage.playerIndex].internalId);
            return;
        }
        this.game.stage.operate = GAME_OPERATES.AFTER_CHA;
        this.game.stage.playerIndex = this.game.players.findIndex((p) => p.internalId == maxData.player);
        this.send({
            type: "cha",
            game: this.game,
            player: this.game.stage.playerIndex,
            cards: maxData.cards,
        })
        this.data.confirmedCha = [];
        this.data.toPutCard = maxData.cards;
        this.data.toPutPics = maxData.pics;
        this.data.toPutAdd = this.game.lastDiscard;
        this.data.toPutPinnedCard = [];
        this.onSendPutCardSelect(maxData.player);
    }
    /**摆牌功能区 */
    onPutCard(conId: number, data: Record<string, any>) {
        if (!this.game) return;
        if (!this.isPlayer(conId)) return;
        if (!this.game.players.find((p) => p.internalId == conId)) return;
        try {
            if (!data.putMethod) {
                if (hasMultiPut(data.cards)) {
                    this.sendPlayer(conId, {
                        type: "optSelect",
                        game: this.game,
                        player: this.game.stage.playerIndex,
                        orgData: data,
                        key: "putMethod",
                        selections: [
                            { title: "选择摆顺子", value: 1 },
                            { title: "选择摆对", value: 2 },
                        ]
                    });
                    return;
                }
            }
            data.cards = data.cards.map(toCleanCard);
            this.data.toPutPics = isValidPutCard(this.game, data.cards, this.game.players[this.game.stage.playerIndex].stored, undefined, data.putMethod === 1);
            this.data.toPutCard = data.cards;
            this.data.toPutAdd = undefined;
            this.data.toPutPinnedCard = [];
            this.onSendPutCardSelect(conId);
        } catch (e) {
            this.sendPlayer(conId, {
                type: "error",
                msg: e.message
            });
            return;
        }
        this.data.calcPutCard = true;
        this.send({
            type: "putCard",
            game: this.game,
            player: this.game.stage.playerIndex,
            cards: data.cards
        })
    }
    onPutCardSelect(conId: number, data: Record<string, any>) {
        if (!this.game) return;
        if (!this.isPlayer(conId)) return;
        if (!this.game.players.find((p) => p.internalId == conId)) return;
        if (!this.data.toPutPics) return;
        let cardGrp1: { select: ICard[], count: number } = this.data.toPutPics.shift();
        data.selection = data.selection.map(toCleanCard);
        let selectedCards: ICard[] = data.selection;
        if (selectedCards.length != cardGrp1.count) {
            this.sendPlayer(conId, { type: "error", msg: "选择数量不正确" });
            return;
        }
        selectedCards.forEach((selectedCard: ICard) => {
            if (!cardGrp1.select.find((card: ICard) => card.id == selectedCard.id)) {
                this.sendPlayer(conId, {
                    type: "error",
                    msg: "选择错误"
                });
                return;
            }
            this.data.toPutPinnedCard.push(selectedCard);
        })
        this.onSendPutCardSelect(conId);
    }
    onSendPutCardSelect(conId: number) {
        while (true) {
            if (this.data.toPutPics.length == 0) {
                this.onPutCardDone(conId);
            } else {
                if (this.data.toPutPics[0].count == 0) {
                    this.data.toPutPics.shift();
                    continue;
                }
                if (this.data.toPutPics[0].select.length == 1) {
                    let cardGrp1: { select: ICard[], count: number } = this.data.toPutPics.shift();
                    this.data.toPutPinnedCard.push(cardGrp1.select[0])
                    continue;
                }
                this.sendPlayer(conId, {
                    type: "putCardSelect",
                    game: this.game,
                    player: this.game.stage.playerIndex,
                    selection: this.data.toPutPics[0].select,
                    count: this.data.toPutPics[0].count
                })
            }
            break;
        }
    }
    onPutCardDone(conId: number) {
        putCard(this.game, this.data.toPutCard, this.data.toPutPinnedCard, this.data.toPutAdd);
        this.data.toPutPinnedCard.forEach((card) => {
            this.game.pinnedCard.push(card);
        });
        this.send({
            type: "putCardDone",
            game: this.game,
            player: this.game.stage.playerIndex,
            cards: this.data.toPutCard,
            pinnedCard: this.data.toPutPinnedCard,
            add: this.data.toPutAdd
        });
    }
    /**弃牌和抽牌 */
    onDrawCard(conId: number, data: Record<string, any>) {
        if (!this.game) return;
        if (!this.isPlayer(conId)) return;
        if (!this.game.players.find((p) => p.internalId == conId)) return;
        if (this.game.stage.operate != GAME_OPERATES.PUTCARD && this.game.stage.operate != GAME_OPERATES.AFTER_CHA) return;
        if (this.game.allCards.cards.length == 0) {
            this.onNoCard();
            return;
        }
        let card = drawCard(this.game);
        this.game.stage.operate = GAME_OPERATES.DISCARD;
        this.send({
            type: "drawCard",
            game: this.game,
            player: this.game.stage.playerIndex
        });
        this.onCheckAutoManaged(this.game.players[this.game.stage.playerIndex].internalId);
    }
    onNoCard() {
        this.game.stage.operate = GAME_OPERATES.SCORE;
        this.game.players.forEach((p) => {
            p.ready = false;
        })
        this.send({
            type: "calcDone",
            game: this.game,
            player: -1,
            res: this.game.players.map(_ => 0)
        }, true);
    }

    onDiscardCard(conId: number, data: Record<string, any>) {
        if (!this.game) return;
        if (!this.isPlayer(conId)) return;
        if (!this.game.players.find((p) => p.internalId == conId)) return;
        if (this.game.stage.operate != GAME_OPERATES.DISCARD) return;
        try {
            data.card = toCleanCard(data.card);
            discardCard(this.game, data.card);
        } catch (e) {
            this.sendPlayer(conId, {
                type: "error",
                msg: e.message
            });
            return;
        }
        this.game.stage.operate = GAME_OPERATES.WAIT_CHA;
        this.send({
            type: "discardCard",
            game: this.game,
            player: this.game.stage.playerIndex,
            card: data.card
        });
        this.data.calcPutCard = false;
        this.data.confirmedCha = []
        this.onCheckAutoManaged();
    }
    onCalc(conId: number, data: Record<string, any>) {
        if (!this.game) return;
        if (!this.isPlayer(conId)) return;
        if (!this.game.players.find((p) => p.internalId == conId)) return;
        this.game.stage.operate = GAME_OPERATES.CALC;
        this.data.calcFrom = conId;
        this.data.confirmedAntiCalc = [];
        if (this.data.calcPutCard && this.game.players[this.game.stage.playerIndex].hand.cards.length == 0) {
            //-20不允许反算
            this.onAntiCalcDone();
        } else {
            this.send({
                type: "calc",
                game: this.game,
                player: this.game.stage.playerIndex
            });
            this.onCheckAutoManaged();
        }
    }
    onAntiCalc(conId: number, data: Record<string, any>) {
        if (this.isPlayer(conId)) return;
        if (!this.game) return;
        if (!this.game.players.find((p) => p.internalId == conId)) return;
        if (this.game.stage.operate != GAME_OPERATES.CALC) return;
        if (this.data.confirmedAntiCalc.find((data) => data.player == conId)) {
            return;
        }
        this.data.confirmedAntiCalc.push({
            player: conId,
            do: data.do
        })
        if (this.data.confirmedAntiCalc.length == this.game.players.length - 1) {
            this.onAntiCalcDone();
        }
    }
    onAntiCalcDone() {
        let antiCalcInternalId = [];
        this.data.confirmedAntiCalc.forEach((data) => {
            if (data.do) {
                antiCalcInternalId.push(data.player);
            }
        });
        let calcRes = applyCalc(this.game, this.data.calcFrom, antiCalcInternalId, this.data.calcPutCard);
        this.data.calcPutCard = false;
        this.game.stage.operate = GAME_OPERATES.SCORE;
        this.game.players.forEach((p) => {
            p.ready = false;
        });
        this.send({
            type: "calcDone",
            game: this.game,
            player: this.data.calcFrom,
            antiCalc: antiCalcInternalId,
            res: calcRes
        }, true);
        this.onCheckAutoManaged();
    }
    onNextRound() {
        for (let p of this.game.players) {
            if (p.score > 250) {
                this.player = this.game.players;
                for (let p of this.player) {
                    p.ready = false;
                }
                this.player = this.player.filter((p) => this.data.autoManaged.indexOf(p.internalId) == -1);
                this.data.autoManaged = [];
                this.send({
                    type: "gameOver",
                    game: this.game,
                }, true)
                this.game = undefined;
                return;
            }
        }
        endGame(this.game);
        this.send({
            type: "firstCard",
            card: this.game.stage.data.firstCard
        })
        this.data.confirmedAntiCalc = [];
        this.game.stage.operate = GAME_OPERATES.DISCARD;

        this.send({
            type: "next",
            game: this.game,
            player: this.game.stage.playerIndex,
        })
        this.onCheckAutoManaged(this.game.players[this.game.stage.playerIndex].internalId);
    }
    onReady(conId: number, data: Record<string, any>) {
        if (this.game) {
            let player = this.game.players.find((p) => p.internalId == conId);
            if (!player) return;
            if (player.ready == !!(data.ready)) return;
            this.game.players.find((p) => p.internalId == conId).ready = !!(data.ready);
            this.send({
                type: "ready",
                game: this.game,
            }, true)
            if (this.game.players.every((p) => p.ready)) {
                this.onNextRound();
            }
        } else {
            3
            if (!this.player.find((p) => p.internalId == conId))
                return;
            this.player.find((p) => p.internalId == conId).ready = !!(data.ready);
            this.send({
                type: "ready",
                game: false,
                player: this.player
            })
            if (this.player.every((p) => p.ready)) {
                this.onStart();
            }
        }
    }
    onCheckAutoManaged(conId?: number, ignChk?: boolean) {
        if (!this.game) return;
        if (!conId) return this.data.autoManaged.forEach(d => this.onCheckAutoManaged(d, true));
        if (!ignChk) {
            if (!this.data.autoManaged.includes(conId)) return;
        }
        if (this.isPlayer(conId)) {
            let p = this.game.players.find((p) => p.internalId == conId);
            if (this.game.stage.operate == GAME_OPERATES.PUTCARD) this.onDrawCard(conId, {});
            else if (this.game.stage.operate == GAME_OPERATES.DISCARD) {
                let maxScore = 0, maxIndex = 0;
                for (let i = 0; i < p.hand!.cards.length - 1; i++) {
                    if (CARD_SCORE[p.hand!.cards[i].id] > maxScore) {
                        maxScore = CARD_SCORE[p.hand!.cards[i].id];
                        maxIndex = i;
                    }
                }
                this.onDiscardCard(conId, { card: p.hand!.cards[maxIndex] });
            }
        } else {
            if (this.game.stage.operate == GAME_OPERATES.WAIT_CHA) {
                if (!this.data.confirmedCha.find((data) => data.player == conId)) {
                    this.onCha(conId, { do: false });
                }
            } else if (this.game.stage.operate == GAME_OPERATES.CALC) {
                if (!this.data.confirmedAntiCalc.find((data) => data.player == conId)) {
                    this.onAntiCalc(conId, { do: false });
                }
            } else if (this.game.stage.operate == GAME_OPERATES.SCORE) {
                this.onReady(conId, { ready: true });
            }
        }
    }
    onMessage(conId: number, data: Record<string, any>) {
        this.send({
            type: "msg",
            from: data.from,
            msg: data.msg
        }, true);
    }
    onPong(conId: number, data: Record<string, any>) {
        let delay = Date.now() - this.pingTick;
        this.hasPongPlayer[conId] = delay;
    }
}