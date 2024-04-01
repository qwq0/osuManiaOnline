import "./state.js";
import "./canvas.js";
import "./draw.js";
import "./decider.js";
import "./input.js";

import { setNoteDuration } from "./draw.js";

import { getUrlSearchParam } from "./util.js";
import { getBeatmapFileName, loadBeatmapPackage, playBeatmap, readBeatmapFile, setUserAudioLatency } from "./loadBeatmap.js";
import { deciderState, waitForEnd } from "./decider.js";

import { getNElement, NElement, NList } from "../lib/qwqframe.js";
import { createNStyleList as styles } from "../lib/qwqframe.js";
import { NEvent } from "../lib/qwqframe.js";
import { delayPromise } from "../lib/qwqframe.js";
import { setInputEnable } from "./input.js";


(async () =>
{
    let sid = getUrlSearchParam("sid");
    let bNum = Number(getUrlSearchParam("b-num"));
    let noteDuration = Number(getUrlSearchParam("note-duration"));
    let userAudioLatency = Number(getUrlSearchParam("audio-latency"));

    if (sid == undefined)
        throw "Need a param (sid)";
    if (!Number.isInteger(bNum))
        bNum = 0;
    if (!Number.isInteger(noteDuration))
        noteDuration = 441;
    if ((!Number.isInteger(userAudioLatency)) || userAudioLatency < -100 || userAudioLatency > 1000)
        userAudioLatency = 0;

    setNoteDuration(noteDuration);
    setUserAudioLatency(userAudioLatency);

    /**
     * @type {Awaited<ReturnType<readBeatmapFile>>}
     */
    let beatmapMeta = null;

    {
        /**
         * @type {NElement}
         */
        let textElement = null;
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
                    "Loading"
                ]
            ]
        ]);

        getNElement(document.body).addChild(ui);

        try
        {
            await loadBeatmapPackage(`https://cmcc.sayobot.cn:25225/beatmaps/${sid.slice(0, 3)}/${sid.slice(3)}/novideo`);
            beatmapMeta = await readBeatmapFile(await getBeatmapFileName("index", bNum), true);
        }
        catch (err)
        {
            textElement.setText(err.toString());
        }

        ui.remove();
    }


    {
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
                    `${beatmapMeta.meta.Metadata.TitleUnicode} - ${beatmapMeta.meta.Metadata.ArtistUnicode}`
                ],

                [
                    styles({
                        fontSize: "0.8em"
                    }),
                    `${beatmapMeta.meta.Metadata.Title} - ${beatmapMeta.meta.Metadata.Artist}`
                ],

                [
                    `谱师: ${beatmapMeta.meta.Metadata.Creator}`
                ],

                [
                    `难度: ${beatmapMeta.meta.Difficulty.OverallDifficulty} / ${beatmapMeta.meta.Metadata.Version}`
                ],

                [
                    `铺面id: ${beatmapMeta.meta.Metadata.BeatmapSetID} / ${beatmapMeta.meta.Metadata.BeatmapID}`
                ],

                [
                    styles({
                        padding: "8px",
                        paddingLeft: "40px",
                        paddingRight: "40px",
                        backgroundColor: "rgb(220, 220, 240)",
                        border: "1px solid rgb(20, 20, 20)",

                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",

                        cursor: "default"
                    }),

                    "准备",
                    new NEvent("click", () =>
                    {
                        ui.remove();
                        setTimeout(async () =>
                        {
                            setInputEnable(true);
                            await playBeatmap(await getBeatmapFileName("index", bNum));
                            await waitForEnd();
                            await delayPromise(2000);
                            showDeciderResults();
                        }, 50);
                    })
                ]
            ]
        ]);

        getNElement(document.body).addChild(ui);
    }


    function showDeciderResults()
    {
        setInputEnable(false);

        let achievingRate = (deciderState.totalScore > 0 ? deciderState.score / deciderState.totalScore : 0) * 100;

        let rank = ((achievingRate) =>
        {
            if (achievingRate >= 99.9)
                return { rank: "SSS+", color: { r: 206, g: 111, b: 243 } };
            else if (achievingRate >= 99.5)
                return { rank: "SSS", color: { r: 206, g: 111, b: 243 } };
            else if (achievingRate >= 99)
                return { rank: "SS+", color: { r: 220, g: 220, b: 60 } };
            else if (achievingRate >= 98.5)
                return { rank: "SS", color: { r: 220, g: 220, b: 60 } };
            else if (achievingRate >= 98)
                return { rank: "S+", color: { r: 220, g: 220, b: 60 } };
            else if (achievingRate >= 97)
                return { rank: "S", color: { r: 220, g: 220, b: 60 } };
            else if (achievingRate >= 95)
                return { rank: "AAA+", color: { r: 190, g: 40, b: 40 } };
            else if (achievingRate >= 94)
                return { rank: "AAA", color: { r: 190, g: 40, b: 40 } };
            else if (achievingRate >= 92)
                return { rank: "AA+", color: { r: 190, g: 40, b: 40 } };
            else if (achievingRate >= 90)
                return { rank: "AA", color: { r: 190, g: 40, b: 40 } };
            else if (achievingRate >= 85)
                return { rank: "A+", color: { r: 190, g: 40, b: 40 } };
            else if (achievingRate >= 80)
                return { rank: "A", color: { r: 190, g: 40, b: 40 } };
            else if (achievingRate >= 75)
                return { rank: "BBB", color: { r: 40, g: 40, b: 190 } };
            else if (achievingRate >= 70)
                return { rank: "BB", color: { r: 40, g: 40, b: 190 } };
            else if (achievingRate >= 60)
                return { rank: "B", color: { r: 40, g: 40, b: 190 } };
            else if (achievingRate >= 50)
                return { rank: "C", color: { r: 40, g: 190, b: 40 } };
            else
                return { rank: "D", color: { r: 65, g: 65, b: 65 } };
        })(achievingRate);

        let ui = NList.getElement([
            styles({
                position: "absolute",
                left: "0",
                top: "0",
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(130, 170, 190, 0.5)",

                display: "flex",
                justifyContent: "center",
                alignItems: "center",

                fontSize: "20px"
            }),

            [
                styles({
                    padding: "20px",
                    backgroundColor: "rgb(35, 35, 35)",
                    border: "2px solid rgb(60, 60, 60)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                    overflow: "auto",

                    maxHeight: "90%",
                    maxWidth: "90%",

                    color: "rgb(255, 255, 255)"
                }),

                [
                    styles({
                        color: `rgb(${rank.color.r}, ${rank.color.g}, ${rank.color.b})`,
                        textShadow: `2px 2px 4px rgb(255, 255, 255)`,
                        fontSize: "2em"
                    }),
                    rank.rank
                ],

                [
                    `${achievingRate.toFixed(4)}%`
                ],

                [
                    `Max Combo: ${deciderState.maxCombo} / ${deciderState.noteCount}`
                ],
                [
                    `Perfect: ${deciderState.perfect + deciderState.holdEndPerfect} (${deciderState.perfect} + ${deciderState.holdEndPerfect})`
                ],
                [
                    `Great: ${deciderState.great + deciderState.holdEndGreat} (${deciderState.great} + ${deciderState.holdEndGreat})`
                ],
                [
                    `Good: ${deciderState.good}`
                ],
                [
                    `Miss: ${deciderState.miss + deciderState.holdEndMiss} (${deciderState.miss} + ${deciderState.holdEndMiss})`
                ]
            ]
        ]);

        getNElement(document.body).addChild(ui);
    }
})();