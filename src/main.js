import { ZipReader } from "../lib/zip.js";
import { TextWriter } from "../lib/zip.js";
import { BlobWriter } from "../lib/zip.js";
import { BlobReader } from "../lib/zip.js";
import "./canvas.js";
import "./draw.js";
import "./decider.js";
import { correctDrawMatchTime, setDrawMapNotes, setNoteDuration } from "./draw.js";
import { correctDeciderMatchTime, setDeciderMapNotes } from "./decider.js";

/**
 * 
 * @param {string} paramName
 * @returns {string | undefined}
 */
function getUrlParam(paramName)
{
    let paramList = location.search.slice(1).split("&");
    for (let o of paramList)
    {
        if (o.startsWith(paramName + "="))
        {
            return decodeURIComponent(o.slice(paramName.length + 1));
        }
    }
    return undefined;
}

(async () =>
{
    let sid = getUrlParam("sid");
    let bNum = Number(getUrlParam("b-num"));
    let noteDuration = Number(getUrlParam("note-duration"));

    if (sid == undefined)
        throw "Need a param (sid)";
    if (!Number.isInteger(bNum))
        bNum = 0;
    if (!Number.isInteger(noteDuration))
        noteDuration = 441;

    setNoteDuration(noteDuration);

    let zipFileBlob = await (await fetch(`https://cmcc.sayobot.cn:25225/beatmaps/${sid.slice(0, 3)}/${sid.slice(3)}/novideo`)).blob();
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

        setTimeout(async () =>
        {
            await audio.play();
            correctDrawMatchTime(audioLeadInTime);
            correctDeciderMatchTime(audioLeadInTime);
        }, 3000 + audioLeadInTime);

        let mapNotes = beatmapHibObjArray.map(o => ({
            column: o.column,
            time: o.time,
            hold: o.type == "hold",
            endTime: (o.type == "hold" ? o.endTime : o.time)
        }));

        setDrawMapNotes(mapNotes, beatmapColumnNumber);
        setDeciderMapNotes(mapNotes, beatmapColumnNumber);
    }
})();