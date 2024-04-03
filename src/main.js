import "./state.js";
import "./canvas.js";
import "./draw.js";
import "./decider.js";
import "./input.js";


import { getUrlSearchParam } from "./util.js";
import { getBeatmapFileName, loadBeatmapPackage, playBeatmap, readBeatmapFile } from "./loadBeatmap.js";
import { deciderState, waitForEnd } from "./decider.js";

import { getNElement, NElement, NList } from "../lib/qwqframe.js";
import { createNStyleList as styles } from "../lib/qwqframe.js";
import { NEvent } from "../lib/qwqframe.js";
import { delayPromise } from "../lib/qwqframe.js";
import { setInputEnable } from "./input.js";
import { state } from "./state.js";
import { loadAndShowLoadingPage, showSearchBeatmapPage, showStartPage } from "./page.js";
import { storageContext } from "./storage.js";


(async () =>
{
    let sid = getUrlSearchParam("sid");

    if (sid == undefined)
        showSearchBeatmapPage();
    else
    {
        let bid = getUrlSearchParam("bid");
        let bNum = Number(getUrlSearchParam("b-num"));
        if (!Number.isInteger(bNum))
            bNum = 0;

        loadAndShowLoadingPage(
            `https://cmcc.sayobot.cn:25225/beatmaps/${(sid.length >= 5 ? sid.slice(0, -4) : "0")}/${sid.slice(-4)}/novideo`,
            {
                bid: bid,
                bNum: bNum
            }
        );
    }
})();



