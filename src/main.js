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
import { showStartPage } from "./page.js";
import { storageContext } from "./storage.js";


(async () =>
{
    { // loading页
        /**
         * @type {NElement}
         */
        let textElement = null;
        /**
         * @type {(x: number) => void}
         */
        let progressChange = null;
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
                    "Loading",
                    ele => { textElement = ele; }
                ],

                [
                    styles({
                        width: "200px",
                        height: "10px",
                        backgroundColor: "rgb(160, 160, 160)"
                    }),
                    [
                        styles({
                            height: "100%",
                            width: "0%",
                            backgroundColor: "rgb(190, 190, 240)"
                        }),
                        ele =>
                        {
                            progressChange = progress =>
                            {
                                ele.setStyle("width", (progress * 100).toFixed(2) + "%");
                            };
                        }
                    ]
                ]
            ]
        ]);

        getNElement(document.body).addChild(ui);

        try
        {
            let sid = getUrlSearchParam("sid");
            let bid = getUrlSearchParam("bid");
            let bNum = Number(getUrlSearchParam("b-num"));

            if (sid == undefined)
                throw "Need a param (sid)";
            if (!Number.isInteger(bNum))
                bNum = 0;


            await loadBeatmapPackage(`https://cmcc.sayobot.cn:25225/beatmaps/${(sid.length >= 5 ? sid.slice(0, -4) : "0")}/${sid.slice(-4)}/novideo`, progressChange);
            state.beatmapFileName = (bid != undefined ? await getBeatmapFileName("bid", bid) : await getBeatmapFileName("index", bNum));

            ui.remove();

            showStartPage(state.beatmapFileName);
        }
        catch (err)
        {
            textElement.setText(String(err));
        }
    }


})();



