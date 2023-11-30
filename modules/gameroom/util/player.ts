import type { IGame, IPlayer } from "../../../interfaces/game";
import { createDeck } from "../../../modules/gameroom/util/card";
import { v4 as uuidv4 } from 'uuid';

export function isPlayer(game:IGame,player:IPlayer):boolean{
    for(let i=0;i<game.players.length;i++){
        if(game.players[i].id == player.id){
            return game.stage.playerIndex==i;
        }
    }
    return false;
}
export function id2index(game:IGame,id:string):number{
    for(let i=0;i<game.players.length;i++){
        if(game.players[i].id == id){
            return i;
        }
    }
    return -1;
}
export function createPlayer():IPlayer{
    let id = uuidv4();
    return {
        id,
        name: "玩家"+(id.split('-')[0] as string),
        score: 0,
        mark: {},
        internalId:0,
        hand:createDeck("手牌",[]),
        profile: {},
    }
}