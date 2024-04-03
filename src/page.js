import { getUrlSearchParam } from "./util.js";
import { beatmapFileNameList, getBeatmapFileName, loadBeatmapPackage, playBeatmap, readBeatmapFile } from "./loadBeatmap.js";
import { deciderState, waitForEnd } from "./decider.js";

import { getNElement, NElement, NList } from "../lib/qwqframe.js";
import { createNStyleList as styles } from "../lib/qwqframe.js";
import { NEvent } from "../lib/qwqframe.js";
import { delayPromise } from "../lib/qwqframe.js";
import { setInputEnable } from "./input.js";
import { clearState, state } from "./state.js";
import { NTagName } from "../lib/qwqframe.js";
import { NAttr } from "../lib/qwqframe.js";
import { saveConfig, storageContext } from "./storage.js";



/**
 * @param {string} beatmapFileName
 */
export async function showStartPage(beatmapFileName)
{
    setInputEnable(false);
    state.exitButton.enable = false;


    /**
     * @type {Awaited<ReturnType<readBeatmapFile>>}
     */
    let beatmapMeta = null;

    let errorText = "";
    try
    {
        beatmapMeta = await readBeatmapFile(beatmapFileName, true);
    }
    catch (err)
    {
        errorText = String(err);
    }
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

            ...(beatmapMeta != null ? [
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
            ] : [
                [
                    "铺面错误"
                ],

                [
                    styles({
                        fontSize: "0.8em"
                    }),
                    `${errorText}`
                ],
            ]),

            [
                "切换铺面: ",
                [
                    new NTagName("select"),

                    styles({
                        padding: "5px",
                        maxWidth: "300px",
                    }),

                    new NEvent("change", (e, ele) =>
                    {
                        ui.remove();
                        // @ts-ignore
                        state.beatmapFileName = ele.element.value;
                        showStartPage(state.beatmapFileName);
                    }),

                    ...beatmapFileNameList.map(o => [
                        new NTagName("option"),
                        (o == beatmapFileName ? new NAttr("selected", "true") : null),
                        new NAttr("value", o),
                        (o.endsWith(".osu") ? o.slice(0, -4) : o)
                    ])
                ]
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

                "设置",
                new NEvent("click", () =>
                {
                    showOptionPage();
                })
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
                        state.exitButton.enable = true;

                        await playBeatmap(beatmapFileName);

                        let finish = await waitForEnd();
                        if (finish)
                        {
                            await delayPromise(2000);
                            showDeciderResultsPage();
                        }
                    }, 50);
                })
            ]
        ]
    ]);

    getNElement(document.body).addChild(ui);
}

export function showDeciderResultsPage()
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
            return { rank: "D", color: { r: 95, g: 95, b: 95 } };
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

                minWidth: "fit-content",
                width: "300px",

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
            ],

            [
                styles({
                    padding: "8px",
                    paddingLeft: "20px",
                    paddingRight: "20px",
                    backgroundColor: "rgb(50, 50, 50)",
                    border: "1px solid rgb(190, 190, 190)",

                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",

                    cursor: "default"
                }),

                "关闭",
                new NEvent("click", () =>
                {
                    ui.remove();
                    clearState();
                    showStartPage(state.beatmapFileName);
                })
            ]
        ]
    ]);

    getNElement(document.body).addChild(ui);
}

/**
 * 
 */
export async function showOptionPage()
{
    /**
     * @type {Array<{ speed: number, duration: number }>}
     */
    let speedList = [];
    for (let i = 1; i <= 40; i++)
    {
        speedList.push({
            speed: i,
            duration: Math.floor(11485 / i)
        });
    }

    /**
     * @type {NElement<HTMLSelectElement>}
     */
    let speedSelect = null;
    /**
     * @type {NElement<HTMLInputElement>}
     */
    let audioLatencyInput = null;

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
                "设置"
            ],

            [
                "下落速度: ",
                [
                    new NTagName("select"),

                    styles({
                        padding: "5px",
                        maxWidth: "300px",
                    }),
                    ele => { speedSelect = ele; },

                    ...speedList.map(o => [
                        new NTagName("option"),
                        (o.duration == storageContext.config.noteDuration ? new NAttr("selected", "true") : null),
                        new NAttr("value", String(o.duration)),
                        `${o.speed}速 (${o.duration}ms)`
                    ])
                ]
            ],

            [
                "音频偏移: ",
                [
                    new NTagName("input"),
                    new NAttr("type", "number"),

                    new NAttr("max", "1000"),
                    new NAttr("min", "-1000"),
                    new NAttr("value", String(storageContext.config.userAudioLatency)),

                    styles({
                        padding: "5px",
                        maxWidth: "300px",
                    }),
                    ele => { audioLatencyInput = ele; }
                ]
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

                "取消",
                new NEvent("click", () =>
                {
                    ui.remove();
                })
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

                "保存",
                new NEvent("click", () =>
                {
                    ui.remove();

                    let noteDuration = Number(speedSelect.element.value);
                    storageContext.config.noteDuration = noteDuration;

                    let audioLatency = Number(audioLatencyInput.element.value);
                    if (!Number.isFinite(audioLatency))
                        audioLatency = 0;
                    audioLatency = Math.max(-1000, Math.min(1000, audioLatency));
                    storageContext.config.userAudioLatency = audioLatency;

                    saveConfig();
                })
            ]
        ]
    ]);

    getNElement(document.body).addChild(ui);
}

export function showSearchBeatmapPage()
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
                "搜索铺面"
            ],
        ]
    ]);

    getNElement(document.body).addChild(ui);
}