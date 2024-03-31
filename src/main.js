import "./state.js";
import "./canvas.js";
import "./draw.js";
import "./decider.js";
import "./input.js";

import { setNoteDuration } from "./draw.js";

import { getUrlSearchParam } from "./util.js";
import { loadBeatmap, setUserAudioLatency } from "./loadBeatmap.js";



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

    await loadBeatmap(`https://cmcc.sayobot.cn:25225/beatmaps/${sid.slice(0, 3)}/${sid.slice(3)}/novideo`, bNum);
})();