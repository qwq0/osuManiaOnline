import { ZipReader } from "../lib/zip.js";
import { TextWriter } from "../lib/zip.js";
import { BlobWriter } from "../lib/zip.js";
import { BlobReader } from "../lib/zip.js";

import { refreshDeciderMapNotes } from "./decider.js";
import { correctMatchTime, setMapNotes } from "./state.js";

let userAudioLatency = 0;

/**
 * @param {string} beatmapUrl
 * @param {number} bNum
 */
export async function loadBeatmap(beatmapUrl, bNum)
{
    let zipFileBlob = await (await fetch(beatmapUrl)).blob();
    let zipFileBlobReader = new BlobReader(zipFileBlob);
    let zipReader = new ZipReader(zipFileBlobReader);
    let fileEntries = await zipReader.getEntries();
    console.log(fileEntries);

    /**
     * @type {Map<string, {
     *  readAsText: () => string | Promise<string>,
     *  readAsBlob: () => Blob | Promise<Blob>
     * }>}
     */
    let zipFileMap = new Map();
    /**
     * @type {Array<string>}
     */
    let beatmapFiles = [];

    fileEntries.forEach(o =>
    {
        let fileName = o.filename;

        if (fileName.endsWith(".osu"))
        {
            beatmapFiles.push(fileName);
        }

        zipFileMap.set(fileName, {
            readAsBlob: async () =>
            {
                return await o.getData(new BlobWriter());
            },
            readAsText: async () =>
            {
                return await o.getData(new TextWriter());
            }
        });
    });

    console.log(beatmapFiles);

    {
        let beatmapFileName = beatmapFiles[bNum];
        let beatmapData = await zipFileMap.get(beatmapFileName).readAsText();

        console.log(beatmapData);

        let beatmapMeta = {
            General: {},
            Editor: {},
            Metadata: {},
            Difficulty: {},
        };
        /**
         * @type {Array<{
         *  type: "hit" | "hold",
         *  column: number,
         *  time: number,
         *  endTime?: number
         * }>}
         */
        let beatmapHibObjArray = [];

        let beatmapColumnNumber = 4;

        let nowPart = "";
        beatmapData.split("\n").forEach(rawLine =>
        {
            let line = (rawLine.at(-1) == "\r" ? rawLine.slice(0, -1) : rawLine);

            if (line.trim() == "")
                return;

            if (line[0] == "[" && line.at(-1) == "]")
            {
                nowPart = line.slice(1, -1);
            }
            else
            {
                switch (nowPart)
                {
                    case "General":
                    case "Editor":
                    case "Metadata":
                    case "Difficulty": {
                        let separatorIndex = line.indexOf(":");
                        if (separatorIndex != -1)
                        {
                            let key = line.slice(0, separatorIndex);
                            let value = line.slice(separatorIndex + 1).trim();
                            Object.defineProperty(beatmapMeta[nowPart], key, {
                                value: value
                            });

                            if (nowPart == "Difficulty" && key == "CircleSize")
                            {
                                beatmapColumnNumber = Math.round(Number(value));
                            }
                            if (nowPart == "General" && key == "Mode")
                            {
                                if (value != "3")
                                    throw "Unsupported beatmap type";
                            }
                        }
                        break;
                    }
                    case "Events": {
                        break;
                    }
                    case "TimingPoints": {
                        break;
                    }
                    case "HitObjects": {
                        let hitObj = line.split(",");

                        let x = Number(hitObj[0]);
                        let y = Number(hitObj[1]);
                        let startTime = Number(hitObj[2]);
                        let type = Number(hitObj[3]);

                        let isHold = Boolean(type & 128);

                        beatmapHibObjArray.push({
                            column: Math.floor(x * beatmapColumnNumber / 512),
                            time: startTime,
                            type: (isHold ? "hold" : "hit"),
                            endTime: (isHold ? Number(hitObj[5].split(":")[0]) : undefined)
                        });

                        break;
                    }
                }
            }
        });

        console.log(beatmapHibObjArray);

        let audioFileName = String(beatmapMeta.General.AudioFilename);

        let audioFile = await zipFileMap.get(audioFileName).readAsBlob();

        let audio = new Audio();
        audio.src = URL.createObjectURL(audioFile);

        let audioLeadInTime = Number(beatmapMeta.General.AudioLeadIn || 0);

        let audioContext = new AudioContext();
        let audioLatency = audioContext.outputLatency * 1000 + userAudioLatency;

        console.log("audio device latency:", audioLatency);

        setTimeout(async () =>
        {
            await audio.play();
            correctMatchTime(audioLeadInTime - audioLatency);
        }, 3000 + audioLeadInTime);

        let mapNotes = beatmapHibObjArray.map(o => ({
            column: o.column,
            time: o.time,
            hold: o.type == "hold",
            endTime: (o.type == "hold" ? o.endTime : o.time)
        }));

        setMapNotes(mapNotes, beatmapColumnNumber);
        refreshDeciderMapNotes();
    }
}

/**
 * @param {number} latency
 */
export function setUserAudioLatency(latency)
{
    userAudioLatency = latency;
}