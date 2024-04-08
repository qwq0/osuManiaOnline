import { RcoContext } from "../lib/jsRco.js";
import { bindValue, createHookObj, EventHandler, uniqueIdentifierString } from "../lib/qwqframe.js";
import { getUrlSearchParam } from "./util.js";

import { getNElement, NElement, NList } from "../lib/qwqframe.js";
import { createNStyleList as styles } from "../lib/qwqframe.js";
import { loadAndShowLoadingPage } from "./page.js";

let playTogetherEnable = (getUrlSearchParam("type") == "playTogether");

if (playTogetherEnable)
{
    window.addEventListener("message", e =>
    {
        let data = e.data;
        if (
            typeof (data) == "object" &&
            data.label == "qwq-playTogether" &&
            data.type == "setMessagePort"

        )
        {
            setPort(data.port);
        }
    });
}

let messagePort = null;
/**
 * @type {RcoContext}
 */
let rcoContext = null;
/**
 * @type {{
 *  init: () => Promise<void>,
 *  sendInvite: (name: string, id: string, url: string) => Promise<void>,
 *  sendSlowPacket: (targetId: string, data: any) => Promise<void>
 * }}
 */
let playTogetherService = null;

let inviteGameId = "";
let hostUserId = "";
let hostMode = true;

let joinedEvent = new EventHandler();
export let beatmapChangedEvent = new EventHandler();
export let gameStartEvent = new EventHandler();

/**
 * @type {Map<string, string>}
 */
let partyUserMap = new Map();

/**
 * @type {Set<string>}
 */
let readyedUserSet = new Set();

export let playTogetherInfo = createHookObj({
    enable: playTogetherEnable,
    playerListInfo: "",
    clientInfo: "",
    isClient: false,
    replyDeciderResult: "",
    hostDeciderResult: "",
    sid: "",
    bid: ""
});

function refreshPlayerList()
{
    if (partyUserMap.size > 0)
    {
        let partyInfo = `派对中有 ${partyUserMap.size + 1} 名玩家:\n`;
        partyUserMap.forEach((displayName, id) =>
        {
            partyInfo += `${displayName} ${readyedUserSet.has(id) ? "(✔ 已准备)" : "(x 未准备)"}\n`;
        });
        playTogetherInfo.playerListInfo = partyInfo;
    }
    else
    {
        playTogetherInfo.playerListInfo = "正在等待其他玩家加入";
    }
}

/**
 * @type {Map<string, string>}
 */
let replyDeciderResultMap = new Map();

function refreshReplyDeciderResult()
{
    if (replyDeciderResultMap.size > 0)
    {
        let resultInfo = "";
        replyDeciderResultMap.forEach((info, id) =>
        {
            resultInfo += `${partyUserMap.get(id)}: ${info}\n`;
        });
        playTogetherInfo.replyDeciderResult = resultInfo;
    }
    else
    {
        playTogetherInfo.replyDeciderResult = "";
    }
}

/**
 * @param {MessagePort} port
 */
function setPort(port)
{
    rcoContext = new RcoContext();
    rcoContext.addGlobalNamedFunctions({
        onInviteAccept: (userId, displayName) =>
        {
            partyUserMap.set(userId, displayName);
            refreshPlayerList();
            playTogetherService.sendSlowPacket(userId, {
                type: "changeBeatmap",
                sid: playTogetherInfo.sid,
                bid: playTogetherInfo.bid
            });
        },
        onMemberLeave: (userId) =>
        {
            partyUserMap.delete(userId);
            refreshPlayerList();
        },
        onSlowPacket: (senderId, data) =>
        {
            switch (data.type)
            {
                case "changeBeatmap": {
                    if (senderId == hostUserId)
                    {
                        playTogetherInfo.sid = data.sid;
                        playTogetherInfo.bid = data.bid;
                        beatmapChangedEvent.trigger();
                    }
                    break;
                }
                case "replyDeciderResult": {
                    let oldResult = playTogetherInfo.replyDeciderResult;

                    replyDeciderResultMap.set(senderId, data.result);
                    refreshReplyDeciderResult();

                    let newResult = playTogetherInfo.replyDeciderResult;
                    if (oldResult != newResult)
                        sendHostDeciderResult();
                    break;
                }
                case "updateDeciderResult": {
                    if (senderId == hostUserId)
                    {
                        playTogetherInfo.replyDeciderResult = `${partyUserMap.get(hostUserId)}: ${data.hostResult}\n` + data.memberResults;
                    }
                    break;
                }
                case "startGame": {
                    if (senderId == hostUserId)
                        gameStartEvent.trigger();
                    break;
                }
                case "ready": {
                    if (data.sid == playTogetherInfo.sid && data.bid == playTogetherInfo.bid)
                    {
                        if (data.ready)
                            readyedUserSet.add(senderId);
                        else
                            readyedUserSet.delete(senderId);
                        refreshPlayerList();
                    }
                    break;
                }
            }
        },
        joinInvite: (inviteId, hostUser) =>
        {
            inviteGameId = inviteId;
            hostMode = false;
            hostUserId = hostUser;
            playTogetherInfo.isClient = true;
        },
        onJoinComplete: (inviteId, hostUser, hostDisplayName) =>
        {
            inviteGameId = inviteId;
            hostUserId = hostUser;
            partyUserMap.set(hostUser, hostDisplayName);
            joinedEvent.trigger();
        }
    });
    port.addEventListener("message", e => { rcoContext.onData(e.data); });
    rcoContext.bindOutStream(data => { port.postMessage(data); }, "raw");
    port.start();
    // @ts-ignore
    playTogetherService = rcoContext.getGlobalNamedFunctionProxy();
    playTogetherService.init();
}

export async function showWaitingHostPage()
{
    playTogetherInfo.clientInfo = "正在等待连接至主机...\n如果一直显示此页面则可能主机已离线";
    let ui = NList.getElement([
        styles({
            position: "absolute",
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(180, 220, 240, 0.5)",

            display: "flex",
            justifyContent: "center",
            alignItems: "center",

            fontSize: "20px"
        }),

        [
            styles({
                padding: "20px",
                backgroundColor: "rgb(180, 220, 240)",
                border: "2px solid rgb(40, 40, 40)",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                overflow: "auto",

                maxHeight: "90%",
                maxWidth: "90%"
            }),

            [
                styles({
                    whiteSpace: "pre-wrap"
                }),
                bindValue(playTogetherInfo, "clientInfo")
            ]
        ]
    ]);
    getNElement(document.body).addChild(ui);

    await joinedEvent.oncePromise();
    playTogetherInfo.clientInfo = "已经连接到主机\n等待中...";

    if (!playTogetherInfo.sid)
        await beatmapChangedEvent.oncePromise();

    ui.remove();
    loadAndShowLoadingPage(`https://txy1.sayobot.cn/beatmaps/download/mini/${playTogetherInfo.sid}`, { bid: playTogetherInfo.bid });
}


export function sendPlayTogetherInvite()
{
    if (!inviteGameId)
        inviteGameId = uniqueIdentifierString();
    let url = "https://qwq0.github.io/osuManiaOnline/";
    // let url = "http://localhost:5510/test/test.html";
    playTogetherService.sendInvite("osu-mania-online", inviteGameId, `${url}?type=playTogether&invite-id=${inviteGameId}`);
    refreshPlayerList();
}

export function sendStartGameSignal()
{
    partyUserMap.forEach((_username, targetId) =>
    {
        playTogetherService.sendSlowPacket(targetId, {
            type: "startGame"
        });
    });
    readyedUserSet.clear();
    refreshPlayerList();
    playTogetherInfo.replyDeciderResult = "";
    playTogetherInfo.hostDeciderResult = "";
}

export function sendReadySignal()
{
    playTogetherService.sendSlowPacket(hostUserId, {
        type: "ready",
        ready: true,
        sid: playTogetherInfo.sid,
        bid: playTogetherInfo.bid
    });
    playTogetherInfo.replyDeciderResult = "";
    playTogetherInfo.hostDeciderResult = "";
}

/**
 * 
 * @param {string} result 
 */
export function sendDeciderResult(result)
{
    playTogetherService.sendSlowPacket(hostUserId, {
        type: "replyDeciderResult",
        result: result
    });
}

/**
 * 
 */
export function sendHostDeciderResult()
{
    partyUserMap.forEach((_username, targetId) =>
    {
        playTogetherService.sendSlowPacket(targetId, {
            type: "updateDeciderResult",
            memberResults: playTogetherInfo.replyDeciderResult,
            hostResult: playTogetherInfo.hostDeciderResult
        });
    });
}

export function sendChangeBeatmapSignal()
{
    readyedUserSet.clear();
    refreshPlayerList();
    partyUserMap.forEach((_username, targetId) =>
    {
        playTogetherService.sendSlowPacket(targetId, {
            type: "changeBeatmap",
            sid: playTogetherInfo.sid,
            bid: playTogetherInfo.bid
        });
    });
}