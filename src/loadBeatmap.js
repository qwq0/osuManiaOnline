import { ZipReader } from "../lib/zip.js";
import { TextWriter } from "../lib/zip.js";
import { BlobWriter } from "../lib/zip.js";
import { BlobReader } from "../lib/zip.js";

import { refreshDeciderMapNotes } from "./decider.js";
import { correctMatchTime, setMapNotes } from "./state.js";

let userAudioLatency = 0;

/**
 * @type {Array<string>}
 */
let beatmapFileNameList = [];

/**
 * @type {Map<string, {
 *  readAsText: () => string | Promise<string>,
 *  readAsBlob: () => Blob | Promise<Blob>
 * }>}
 */
let zipFileMap = new Map();

/**
 * @param {string} beatmapUrl
 */
export async function loadBeatmapPackage(beatmapUrl)
{
    let zipFileBlob = await (await fetch(beatmapUrl)).blob();
    let zipFileBlobReader = new BlobReader(zipFileBlob);
    let zipReader = new ZipReader(zipFileBlobReader);
    let fileEntries = await zipReader.getEntries();
    // console.log(fileEntries);

    zipFileMap.clear();
    beatmapFileNameList.length = 0;

    fileEntries.forEach(o =>
    {
        let fileName = o.filename;

        if (fileName.endsWith(".osu"))
        {
            beatmapFileNameList.push(fileName);
        }

        /**
         * @type {(typeof zipFileMap) extends Map<any, infer T> ? T : never}
         */
        let fileHandle = {
            readAsBlob: async () =>
            {
                let data = await o.getData(new BlobWriter());
                fileHandle.readAsBlob = () => { return data; };
                return data;
            },
            readAsText: async () =>
            {
                let data = await o.getData(new TextWriter());
                fileHandle.readAsText = () => { return data; };
                return data;
            }
        };
        zipFileMap.set(fileName, fileHandle);
    });

    console.log(beatmapFileNameList);
}

/**
 * 
 * @param {string} fileName 
 * @param {boolean} justMeta
 */
export async function readBeatmapFile(fileName, justMeta = false)
{
    let beatmapData = await zipFileMap.get(fileName).readAsText();

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
                    if (justMeta)
                        break;

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

    return {
        meta: beatmapMeta,
        hitObj: beatmapHibObjArray,
        columnNumber: beatmapColumnNumber
    };
}

/**
 * @param {"index" | "bid" | "fileName" | "rawFileName"} beatmapIdType
 * @param {string | number} beatmapId
 * @returns {Promise<string>}
 */
export async function getBeatmapFileName(beatmapIdType, beatmapId)
{
    if (beatmapIdType == "index")
        return beatmapFileNameList[beatmapId];
    else if (beatmapIdType == "fileName")
        return beatmapId + ".osu";
    else if (beatmapIdType == "rawFileName")
        return beatmapId + ".osu";
    else if (beatmapIdType == "bid")
    {
        for(let fileName of beatmapFileNameList)
        {
            let meta = await readBeatmapFile(fileName, true);
            if(meta.meta.Metadata.BeatmapID == String(beatmapId))
                return fileName;
        }
    }
    else
        throw "Could not get the beatmap file name";
}

/**
 * @param {string} fileName
 * @returns {Promise<HTMLAudioElement>}
 */
async function readAudioFile(fileName)
{
    let audioFile = await zipFileMap.get(fileName).readAsBlob();
    let audio = new Audio();
    audio.src = URL.createObjectURL(audioFile);
    return audio;
}

/**
 * @param {string} beatmapFileName
 */
export async function playBeatmap(beatmapFileName)
{

    let beatmap = await readBeatmapFile(beatmapFileName);
    let beatmapMeta = beatmap.meta;
    let beatmapHibObjArray = beatmap.hitObj;

    let audioFileName = String(beatmapMeta.General.AudioFilename);
    let audio = await readAudioFile(audioFileName);

    let audioLeadInTime = Number(beatmapMeta.General.AudioLeadIn || 0);

    let audioContext = new AudioContext();
    let audioLatency = audioContext.outputLatency * 1000 + userAudioLatency;

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

    setMapNotes(mapNotes, beatmap.columnNumber);
    refreshDeciderMapNotes();
}

/**
 * @param {number} latency
 */
export function setUserAudioLatency(latency)
{
    userAudioLatency = latency;
}