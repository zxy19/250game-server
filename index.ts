import roommgr from "./modules/roommgr";
import WSS from "./modules/wss";
const { readFileSync } = require('fs');
const wss = new WSS(19981,{
    "cert":readFileSync("../ssl/fullchain.pem"),
    "key":readFileSync("../ssl/privkey.pem")
});
const roomMgr = new roommgr(wss);