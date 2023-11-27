import { addCards, toCleanCard } from "./util/card";
import { GAME_OPERATES, ICard, IGame, IPlayer } from "../../interfaces/game";
import { applyCalc, discardCard, drawCard, endGame, initGame, isValidPutCard, nxtPlayer, putCard } from "../../modules/gameroom/util/game";
type roomMgrOps = {
    send(group: string, data: Record<string, any> | String, exceptConId?: number): void;
    sendPlayer(conId: number, data: Record<string, any> | String): void;
    on(type: string, room: string, cb: (from: number, data: Record<string, any>) => void): void;
}
export default class Room {
    game?: IGame
    player: IPlayer[]
    id: string;
    roomMgr: roomMgrOps
    data: {
        toPutCard: ICard[],
        toPutPics: { select: ICard[], count: number }[],
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
        autoManaged: number[]
    } = {
            toPutCard: [],
            toPutPics: [],
            toPutPinnedCard: [],
            confirmedCha: [],
            confirmedAntiCalc: [],
            calcFrom: 0,
            calcPutCard: false,
            autoManaged: []
        }
    constructor(id: string, roomMgrDatas: roomMgrOps) {
        this.id = id;
        this.player = [];
        this.roomMgr = roomMgrDatas;
        this.game = undefined;
        this.on("ready", this.onReady.bind(this));
        this.on("putCard", this.onPutCard.bind(this));
        this.on("putCardSelect", this.onPutCardSelect.bind(this));
        this.on("cha", this.onCha.bind(this));
        this.on("discard", this.onDiscardCard.bind(this));
        this.on("draw", this.onDrawCard.bind(this));
        this.on("calc", this.onCalc.bind(this));
        this.on("antiCalc", this.onAntiCalc.bind(this));
    }
    join(uid: string, conId: number, name: string) {
        if (this.game) {
            for (let i = 0; i < this.game.players.length; i++) {
                let element = this.game.players[i];
                if (element.id == uid) {
                    if (this.data.autoManaged.includes(element.internalId)) {
                        this.game.players[i].ready = true;
                        this.game.players[i].internalId = conId;
                        this.data.autoManaged.splice(this.data.autoManaged.indexOf(element.internalId), 1);
                        this.sendPlayer(conId, {
                            type: "start",
                            id: conId,
                            game: this.game,
                        })
                        return true;
                    }
                }
            }
            return false;
        }
        if (this.player.find((p) => p.id == uid)) return false;
        let curp: IPlayer = { id: uid, internalId: conId, name: name, score: 0, mark: {} };
        this.player.push(curp);
        this.player.forEach((p) => {
            p.ready = false;
        });
        //等待玩家加入被房间管理系统确认后才能发送同步信息
        setTimeout(() => {
            this.send({
                type: "join",
                id: conId,
                player: this.player
            });
        }, 0)
        return true;
    }
    leave(conId: number) {
        let curp = this.player.find((p) => p.internalId == conId);
        if (curp) {
            this.player = this.player.filter((p) => p.internalId != conId);
            if (this.game) {
                this.data.autoManaged.push(curp.internalId);
                this.onCheckAutoManaged(curp.internalId);
            }
            this.send({
                type: "leave",
                player: this.player,
                id: conId,
                game: this.game
            })
        }
    }
    //全局时间刻(一般为1s)
    tick() {

    }
    send(msg: string | Object) {
        this.roomMgr.send(this.id, msg);
    }
    sendPlayer(conId: number, msg: string | Object) {
        this.roomMgr.sendPlayer(conId, msg);
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
            type: "start",
            game: this.game,
        });
    }


    /**插牌 */
    onCha(conId: number, data: Record<string, any>) {
        if (this.isPlayer(conId)) return;
        if (!this.game) return;
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
        try {
            data.cards = data.cards.map(toCleanCard);
            this.data.toPutPics = isValidPutCard(this.game, data.cards, this.game.players[this.game.stage.playerIndex].stored);
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
        putCard(this.game, this.data.toPutCard, this.game.players[this.game.stage.playerIndex].stored, this.data.toPutAdd);
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
        if (this.game.allCards.cards.length == 0) {
            this.onNoCard();
            return;
        }
        let card = drawCard(this.game);
        // //DEBUG
        // for (let i = 0; i < 4; i++) {
        //     if (i != card.color)
        //         addCards(this.game.players[this.game.stage.playerIndex].hand, [{ id: card.id, color: i }])
        // }
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
        })
    }

    onDiscardCard(conId: number, data: Record<string, any>) {
        if (!this.game) return;
        if (!this.isPlayer(conId)) return;
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
        })
        this.send({
            type: "calcDone",
            game: this.game,
            player: this.game.stage.playerIndex,
            res: calcRes
        })
    }
    onNextRound() {
        endGame(this.game);
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
            this.game.players.find((p) => p.internalId == conId).ready = !!(data.ready);
            this.send({
                type: "ready",
                game: this.game,
            })
            if (this.game.players.every((p) => p.ready)) {
                this.onNextRound();
            }
        } else {
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
                this.onDiscardCard(conId, { card: p.hand!.cards[p.hand!.cards.length - 1] });
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
}