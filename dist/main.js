(function () {
    'use strict';

    let state = {
        /**
         * @type {Array<{ column: number, time: number, hold: boolean, endTime: number, judged: boolean, holding: boolean }>}
         */
        mapNotes: [],

        mapNotesPointer: 0,

        /**
         * @type {Set<{ column: number, time: number, hold: boolean, endTime: number, judged: boolean, holding: boolean }>}
         */
        sceneNotes: new Set(),

        matchStartTime: 0,

        columnNumber: 0,

        noteWidthRatio: 1,

        canvasRatio: 1,

        /**
         * @type {HTMLAudioElement}
         */
        audio: null,

        titleText: "",

        beatmapFileName: "",

        exitButton: {
            enable: false,
            x: 70,
            y: 70,
            radius: 60,
            activeStartTime: -1,
            activeDuration: 390,
            alpha: 0.5
        }
    };

    /**
     * 
     * @param {Array<{ column: number, time: number, hold: boolean, endTime: number }>} notes
     * @param {number} mapColumnNumber
     */
    function setMapNotes(notes, mapColumnNumber)
    {
        state.mapNotes = notes.map(o => ({
            column: o.column,
            time: o.time,
            hold: o.hold,
            endTime: o.endTime,
            holding: false,
            judged: false
        }));
        let matchTime = -3 * 1000;
        state.matchStartTime = performance.now() - matchTime;
        state.columnNumber = mapColumnNumber;
    }

    /**
     * 
     * @param {number} time
     */
    function correctMatchTime(time)
    {
        state.matchStartTime = performance.now() - time;
    }


    function clearState()
    {
        if (state.audio)
        {
            state.audio.pause();
            state.audio = null;
        }
        state.mapNotes.length = 0;
        state.mapNotesPointer = 0;
        state.sceneNotes.clear();
    }

    document.body.style.margin = "0";

    let canvasElement = document.createElement("canvas");
    canvasElement.style.position = "absolute";
    canvasElement.style.top = "absolute";
    canvasElement.style.left = "absolute";
    canvasElement.style.height = "100%";
    canvasElement.style.width = "100%";
    document.body.appendChild(canvasElement);

    let oldWidth = -1;
    let oldHeight = -1;
    function resizeCanvas()
    {
        let canvasRatio = window.devicePixelRatio;
        let width = Math.floor(canvasElement.clientWidth * canvasRatio);
        let height = Math.floor(canvasElement.clientHeight * canvasRatio);
        if (width != oldWidth || height != oldHeight || canvasRatio != state.canvasRatio)
        {
            state.canvasRatio = canvasRatio;
            canvasElement.width = width;
            canvasElement.height = height;

            oldWidth = width;
            oldHeight = height;
        }
    }

    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);
    setInterval(o =>
    {
        resizeCanvas();
    }, 3 * 1000);

    let canvasContext = canvasElement.getContext("2d");

    let storageContext = {
        config: {
            noteDuration: 1435,
            userAudioLatency: 0
        }
    };
    readConfig();

    function readConfig()
    {
        try
        {
            let configJson = localStorage.getItem("omo_config");
            if (configJson)
            {
                let config = JSON.parse(configJson);
                Object.entries(config).forEach(([key, value]) =>
                {
                    storageContext.config[key] = value;
                });
            }
        }
        catch (err)
        {
            console.error(err);
        }
    }

    function saveConfig()
    {
        try
        {
            localStorage.setItem("omo_config", JSON.stringify(storageContext.config));
        }
        catch (err)
        {
            console.error(err);
        }
    }

    /**
     * @type {typeof state.sceneNotes}
     */
    let sceneNotes = state.sceneNotes;



    /** @type {Array<boolean>} */
    let keyState$1 = [];

    /** @type {Array<{ color: { r: number, g: number, b: number }, endTime: number, ratio: number }>} */
    let keyVisualEffect = [];

    let decisionText = {
        text: "",
        color: { r: 255, g: 255, b: 255 },
        duration: 200,
        midTime: 0,
        endTime: 0
    };

    let lastTime = performance.now();
    function draw()
    {
        let context = canvasContext;

        let now = performance.now();

        let matchTime = now - state.matchStartTime;

        let canvasWidth = canvasElement.width;
        let canvasHeight = canvasElement.height;

        context.fillStyle = "rgb(0, 0, 0)";
        context.fillRect(0, 0, canvasWidth, canvasHeight);

        if (state.columnNumber > 0)
            state.noteWidthRatio = (canvasWidth >= canvasHeight ? 1 / 15 : 1 / state.columnNumber);
        else
            state.noteWidthRatio = 1;
        let trackWidth = canvasWidth * state.noteWidthRatio;
        let noteHeight = Math.min(canvasWidth, canvasHeight) / 55;
        let trackOffsetX = (canvasWidth - trackWidth * state.columnNumber) / 2;
        let noteDuration = storageContext.config.noteDuration;

        {
            context.save();

            context.fillStyle = "rgb(25, 25, 25)";
            context.fillRect(trackOffsetX, 0, trackWidth * state.columnNumber, canvasHeight);

            let bottomFillHeight = canvasHeight * 0.13;
            let trackHeight = canvasHeight - bottomFillHeight;
            let bottomFillDuration = noteDuration * (bottomFillHeight + noteHeight) / trackHeight;

            // 移除离开场景的物件
            sceneNotes.forEach(o =>
            {
                if (o.endTime + bottomFillDuration < matchTime)
                    sceneNotes.delete(o);
            });

            // 将进入场景的物件添加到场景
            for (let i = state.mapNotesPointer, length = state.mapNotes.length; i < length; i++)
            {
                let now = state.mapNotes[i];
                if (now.time <= matchTime + noteDuration)
                {
                    sceneNotes.add(now);
                    state.mapNotesPointer = i + 1;
                }
                else
                {
                    break;
                }
            }

            // 绘制物件
            if (sceneNotes.size > 0)
            {
                context.fillStyle = "rgb(255, 255, 255)";
                sceneNotes.forEach(o =>
                {
                    if (o.judged)
                        return;

                    let progress = 1 - ((o.time - matchTime) / noteDuration);
                    let noteX = trackOffsetX + o.column * trackWidth + 1;
                    let noteW = trackWidth - 2;

                    if (o.hold)
                    {
                        let holdStartY = progress * trackHeight - noteHeight;
                        if (o.holding)
                            holdStartY = Math.min(holdStartY, trackHeight - noteHeight);

                        let holdEndProgress = 1 - ((o.endTime - matchTime) / noteDuration);
                        let holdEndY = holdEndProgress * trackHeight - noteHeight;

                        let holdLength = holdStartY - holdEndY;

                        if (holdLength >= 0)
                        {
                            // hold body
                            context.fillStyle = "rgb(170, 212, 215)";
                            context.fillRect(noteX, holdEndY, noteW, noteHeight + holdLength);

                            // hold start
                            context.fillStyle = "rgb(255, 255, 255)";
                            context.fillRect(noteX, holdStartY, noteW, noteHeight);

                            // hold end
                            context.fillStyle = "rgb(130, 160, 160)";
                            context.fillRect(noteX, holdEndY, noteW, noteHeight);
                        }
                    }
                    else
                    {
                        let noteY = progress * trackHeight - noteHeight;

                        context.fillStyle = "rgb(255, 255, 255)";
                        context.fillRect(noteX, noteY, noteW, noteHeight);
                    }
                });
            }
            else
            { // 空闲倒计时
                let nextNode = state.mapNotes[state.mapNotesPointer];
                if (nextNode && nextNode.time > matchTime + 3000)
                {
                    context.textBaseline = "middle";
                    context.textAlign = "center";
                    context.fillStyle = "rgb(255, 255, 255)";
                    context.font = "50px sans-serif";
                    context.fillText(`${1 + Math.floor((nextNode.time - matchTime - 3000) / 1000)}`, canvasWidth / 2, canvasHeight / 2);
                }
            }

            // 判定线与打击特效
            for (let i = 0; i < state.columnNumber; i++)
            {
                let columnX = trackOffsetX + i * trackWidth;

                // 打击特效
                if (keyVisualEffect[i])
                {
                    let effect = keyVisualEffect[i];
                    if (effect.endTime - now > 0)
                    {
                        let effectHeight = canvasHeight * 0.13;

                        let colorKey = `${effect.color.r},${effect.color.g},${effect.color.b}`;
                        let gradient = canvasContext.createLinearGradient(0, trackHeight - effectHeight, 0, trackHeight);
                        gradient.addColorStop(0, `rgba(${colorKey}, 0.01)`);
                        gradient.addColorStop(1, `rgba(${colorKey}, 1)`);

                        context.fillStyle = gradient;
                        context.globalAlpha = (effect.endTime - now) * effect.ratio;
                        context.fillRect(columnX, trackHeight - effectHeight - noteHeight / 2, trackWidth, effectHeight);
                        context.globalAlpha = 1;
                    }
                    else
                    {
                        keyVisualEffect[i] = undefined;
                    }
                }

                // 判定线
                let lineWidth = (keyState$1[i] ? 7 : 2);
                context.fillStyle = (keyState$1[i] ? "rgb(230, 230, 230)" : "rgb(200, 200, 200)");
                context.fillRect(columnX, trackHeight - noteHeight / 2 - lineWidth / 2, trackWidth, lineWidth);
            }

            // 判定文本
            if (decisionText.endTime > now)
            {
                context.textBaseline = "middle";
                context.textAlign = "center";
                context.fillStyle = `rgb(${decisionText.color.r}, ${decisionText.color.g}, ${decisionText.color.b})`;
                let ratio = (
                    decisionText.midTime > now ?
                        Math.pow(1 - ((decisionText.midTime - now) / decisionText.duration), 0.25) :
                        Math.pow((decisionText.endTime - now) / decisionText.duration, 0.25)
                );
                context.font = `${((0.4 + ratio * 0.6) * 42).toFixed(1)}px sans-serif`;
                context.globalAlpha = ratio;
                context.fillText(decisionText.text, canvasWidth / 2, canvasHeight * 0.3);
                context.globalAlpha = 1;
            }

            // 顶部信息文本
            if (state.titleText)
            {
                context.textBaseline = "top";
                context.textAlign = "center";
                context.fillStyle = "rgb(255, 255, 255)";
                context.font = "30px sans-serif";
                context.fillText(state.titleText, canvasWidth / 2, canvasHeight * 0.03);
            }

            // 退出按钮
            if (state.exitButton.enable && state.exitButton.alpha > 0)
            {
                context.save();

                let exitButton = state.exitButton;

                context.scale(state.canvasRatio, state.canvasRatio);

                context.beginPath();
                context.arc(exitButton.x, exitButton.y, exitButton.radius, 0, 2 * Math.PI);
                context.closePath();
                context.globalAlpha = exitButton.alpha;
                context.fillStyle = "rgb(80, 80, 80)";
                context.fill();
                context.globalAlpha = 1;

                if (exitButton.activeStartTime != -1)
                {
                    let progress = Math.min(1, (now - exitButton.activeStartTime) / exitButton.activeDuration);
                    context.beginPath();
                    context.moveTo(exitButton.x, exitButton.y);
                    // context.lineTo(exitButton.x, exitButton.y - exitButton.radius);
                    context.arc(exitButton.x, exitButton.y, exitButton.radius, -Math.PI * 0.5, -Math.PI * (0.5 + 2 * progress), true);
                    context.closePath();
                    context.fillStyle = "rgb(180, 180, 180)";
                    context.fill();
                }

                context.textBaseline = "middle";
                context.textAlign = "center";
                context.fillStyle = "rgb(255, 255, 255)";
                context.font = `${(exitButton.radius * 0.6).toFixed(1)}px sans-serif`;
                context.fillText(`\xd7`, exitButton.x, exitButton.y);

                context.restore();
            }

            context.restore();
        }

        lastTime = now;
        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);


    /**
     * 
     * @param {number} column
     * @param {boolean} pressing
     */
    function setKeyState(column, pressing)
    {
        keyState$1[column] = pressing;
    }

    /**
     * @param {number} column
     * @param {{ r: number, g: number, b: number }} color
     */
    function showKeyVisualEffect(column, color)
    {
        keyVisualEffect[column] = {
            color: color,
            endTime: lastTime + 200,
            ratio: 1 / 250
        };
    }

    /**
     * @param {string} text
     * @param {{ r: number, g: number, b: number }} color
     */
    function showDecisionText(text, color)
    {
        decisionText = {
            text: text,
            color: color,
            duration: 120,
            midTime: lastTime + 120,
            endTime: lastTime + 120 * 2
        };
    }

    /**
     * @type {Promise<boolean>}
     */
    let deciderEndPromise = null;
    /**
     * @type {(finish: boolean) => void}
     */
    let deciderEndCallback = null;

    /** @type {Array<boolean>} */
    let keyState = [];

    let matchTime = 0;

    /**
     * @type {Array<Array<{ time: number, hold: boolean, endTime: number, index: number }>>}
     */
    let deciderQueueList = [];
    /**
     * @type {Array<number>}
     */
    let deciderPointerList = [];
    /**
     * @type {Array<number>}
     */
    let deciderHoldEndTimeList = [];

    let deciderState = {
        noteCount: 0,

        perfect: 0,
        great: 0,
        good: 0,
        miss: 0,

        combo: 0,
        maxCombo: 0,

        holdEndCount: 0,

        holdEndPerfect: 0,
        holdEndGreat: 0,
        holdEndMiss: 0,

        totalScore: 0,
        score: 0,

        deciderEnded: false
    };

    let perfectScore = 500;
    let greatScore = 400;
    let goodScore = 250;

    let perfectTime = 50;
    let greatTime = 100;
    let goodTime = 149;

    let holdEndPerfectTime = 80;
    let holdEndGreatTime = 150;

    let holdEndPerfectScore = 500;
    let holdEndGreatScore = 400;

    /**
     * @param {number} column
     */
    function getPerfect(column)
    {
        showKeyVisualEffect(column, { r: 220, g: 220, b: 60 });
        showDecisionText("Perfect", { r: 220, g: 220, b: 60 });
        deciderState.score += perfectScore;
        deciderState.totalScore += perfectScore;

        deciderState.combo++;
        deciderState.maxCombo = Math.max(deciderState.maxCombo, deciderState.combo);
        deciderState.perfect++;
        deciderState.noteCount++;
    }
    /**
     * @param {number} column
     */
    function getGreat(column)
    {
        showKeyVisualEffect(column, { r: 220, g: 160, b: 160 });
        showDecisionText("Great", { r: 220, g: 160, b: 160 });
        deciderState.score += greatScore;
        deciderState.totalScore += perfectScore;

        deciderState.combo++;
        deciderState.maxCombo = Math.max(deciderState.maxCombo, deciderState.combo);
        deciderState.great++;
        deciderState.noteCount++;
    }
    /**
     * @param {number} column
     */
    function getGood(column)
    {
        showKeyVisualEffect(column, { r: 60, g: 220, b: 60 });
        showDecisionText("Good", { r: 60, g: 220, b: 60 });
        deciderState.score += goodScore;
        deciderState.totalScore += perfectScore;

        deciderState.combo++;
        deciderState.maxCombo = Math.max(deciderState.maxCombo, deciderState.combo);
        deciderState.good++;
        deciderState.noteCount++;
    }
    /**
     * @param {number} column
     */
    function getMiss(column)
    {
        showKeyVisualEffect(column, { r: 220, g: 60, b: 60 });
        showDecisionText("Miss", { r: 220, g: 60, b: 60 });
        deciderState.totalScore += perfectScore;

        deciderState.combo = 0;
        deciderState.miss++;
        deciderState.noteCount++;
    }
    /**
     * @param {number} column
     */
    function getHoldEndPerfect(column)
    {
        showKeyVisualEffect(column, { r: 220, g: 220, b: 60 });
        showDecisionText("Perfect", { r: 220, g: 220, b: 60 });
        deciderState.score += holdEndPerfectScore;
        deciderState.totalScore += holdEndPerfectScore;

        deciderState.holdEndPerfect++;
        deciderState.holdEndCount++;
    }
    /**
     * @param {number} column
     */
    function getHoldEndGreat(column)
    {
        showKeyVisualEffect(column, { r: 220, g: 160, b: 160 });
        showDecisionText("Great", { r: 220, g: 160, b: 160 });
        deciderState.score += holdEndGreatScore;
        deciderState.totalScore += holdEndPerfectScore;

        deciderState.holdEndGreat++;
        deciderState.holdEndCount++;
    }
    /**
     * @param {number} column
     * @param {boolean} silent
     */
    function getHoldEndMiss(column, silent)
    {
        if (!silent)
        {
            showKeyVisualEffect(column, { r: 220, g: 60, b: 60 });
            showDecisionText("Miss", { r: 220, g: 60, b: 60 });
        }
        deciderState.totalScore += holdEndPerfectScore;
        deciderState.combo = 0;

        deciderState.holdEndMiss++;
        deciderState.holdEndCount++;
    }

    function deciderTick()
    {
        let deciderEnded = true;

        for (let column = 0; column < state.columnNumber; column++)
        {
            for (let i = deciderPointerList[column]; i < deciderQueueList[column].length; i++)
            {
                let nowNote = deciderQueueList[column][i];
                if (nowNote.time + goodTime >= matchTime)
                {
                    deciderEnded = false;
                    break;
                }
                else
                {
                    getMiss(column);
                    if (nowNote.hold)
                        getHoldEndMiss(column, true);
                    deciderPointerList[column] = i + 1;
                }
            }

            let holdEndTime = deciderHoldEndTimeList[column];
            if (holdEndTime != undefined)
            {
                deciderEnded = false;
                if (holdEndTime + holdEndGreatTime < matchTime)
                {
                    getHoldEndMiss(column, false);
                    deciderHoldEndTimeList[column] = undefined;
                }
            }
        }
        refreshScoreDisplay();

        if (deciderEnded)
        {
            deciderState.deciderEnded = true;
            if (deciderEndCallback)
                deciderEndCallback(true);
            deciderEndCallback = null;
            deciderEndPromise = null;
        }
    }

    function refreshScoreDisplay()
    {
        state.titleText = `${((deciderState.totalScore > 0 ? deciderState.score / deciderState.totalScore : 1) * 100).toFixed(3)}%  ${deciderState.combo} combo`;
    }

    setInterval(() =>
    {
        matchTime = performance.now() - state.matchStartTime;
        deciderTick();
    }, 35);

    /**
     * @param {number} column
     */
    function keydown(column)
    {
        if (!keyState[column])
        {
            setKeyState(column, true);
            keyState[column] = true;

            matchTime = performance.now() - state.matchStartTime;
            deciderTick();

            let nowNote = deciderQueueList[column][deciderPointerList[column]];
            if (nowNote && nowNote.time - goodTime <= matchTime)
            {
                let notMiss = true;
                if (Math.abs(nowNote.time - matchTime) <= perfectTime)
                { // perfect
                    getPerfect(column);
                }
                else if (Math.abs(nowNote.time - matchTime) <= greatTime)
                { // great
                    getGreat(column);
                }
                else if (Math.abs(nowNote.time - matchTime) <= goodTime)
                { // good
                    getGood(column);
                }
                else
                { // miss
                    getMiss(column);
                    notMiss = false;
                    if (nowNote.hold)
                        getHoldEndMiss(column, true);
                }
                deciderPointerList[column]++;
                refreshScoreDisplay();

                if (notMiss && nowNote.hold)
                {
                    state.mapNotes[nowNote.index].holding = true;
                    deciderHoldEndTimeList[column] = nowNote.endTime;
                }

                if (!nowNote.hold)
                    state.mapNotes[nowNote.index].judged = true;
            }
        }
    }

    /**
     * @param {number} column
     */
    function keyup(column)
    {
        if (keyState[column])
        {
            setKeyState(column, false);
            keyState[column] = false;

            matchTime = performance.now() - state.matchStartTime;
            deciderTick();

            let holdEndTime = deciderHoldEndTimeList[column];
            if (holdEndTime != undefined)
            {
                if (Math.abs(holdEndTime - matchTime) <= holdEndPerfectTime)
                { // hold end perfect
                    getHoldEndPerfect(column);
                }
                else if (Math.abs(holdEndTime - matchTime) <= holdEndGreatTime)
                { // hold end great
                    getHoldEndGreat(column);
                }
                else
                { // hold end miss
                    getHoldEndMiss(column, false);
                }
                deciderHoldEndTimeList[column] = undefined;
            }
            refreshScoreDisplay();
        }
    }


    function refreshDeciderMapNotes()
    {
        {
            deciderState.noteCount = 0;

            deciderState.perfect = 0;
            deciderState.great = 0;
            deciderState.good = 0;
            deciderState.miss = 0;

            deciderState.combo = 0;
            deciderState.maxCombo = 0;

            deciderState.holdEndCount = 0;

            deciderState.holdEndPerfect = 0;
            deciderState.holdEndGreat = 0;
            deciderState.holdEndMiss = 0;

            deciderState.totalScore = 0;
            deciderState.score = 0;

            deciderState.deciderEnded = false;
        }

        {
            keyState = [];
            deciderHoldEndTimeList = [];
        }

        deciderQueueList = [];
        deciderPointerList = [];
        for (let i = 0; i < state.columnNumber; i++)
        {
            deciderQueueList[i] = [];
            deciderPointerList[i] = 0;
        }
        state.mapNotes.forEach((o, index) =>
        {
            deciderQueueList[o.column].push({
                time: o.time,
                endTime: o.endTime,
                hold: o.hold,
                index: index
            });
        });
    }

    function abortDecider()
    {
        keyState = [];
        deciderHoldEndTimeList = [];

        deciderQueueList = [];
        deciderPointerList = [];
        for (let i = 0; i < state.columnNumber; i++)
        {
            deciderQueueList[i] = [];
            deciderPointerList[i] = 0;
        }
        if (deciderEndCallback)
            deciderEndCallback(false);
        deciderEndCallback = null;
        deciderEndPromise = null;
    }

    /**
     * 
     * @returns {Promise<boolean>}
     */
    function waitForEnd()
    {
        if (deciderState.deciderEnded)
            return Promise.resolve(false);
        if (!deciderEndPromise)
        {
            deciderEndPromise = new Promise(resolve =>
            {
                deciderEndCallback = resolve;
            });
        }
        return deciderEndPromise;
    }

    /**
     * 
     * @param {string} paramName
     * @returns {string | undefined}
     */
    function getUrlSearchParam(paramName)
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

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    /*
     * This program is based on JZlib 1.0.2 ymnk, JCraft,Inc.
     * JZlib is based on zlib-1.1.3, so all credit should go authors
     * Jean-loup Gailly(jloup@gzip.org) and Mark Adler(madler@alumni.caltech.edu)
     * and contributors of zlib.
     */

    // deno-lint-ignore-file no-this-alias prefer-const

    // Global

    const MAX_BITS$1 = 15;
    const D_CODES = 30;
    const BL_CODES = 19;

    const LENGTH_CODES = 29;
    const LITERALS = 256;
    const L_CODES = (LITERALS + 1 + LENGTH_CODES);
    const HEAP_SIZE = (2 * L_CODES + 1);

    const END_BLOCK = 256;

    // Bit length codes must not exceed MAX_BL_BITS bits
    const MAX_BL_BITS = 7;

    // repeat previous bit length 3-6 times (2 bits of repeat count)
    const REP_3_6 = 16;

    // repeat a zero length 3-10 times (3 bits of repeat count)
    const REPZ_3_10 = 17;

    // repeat a zero length 11-138 times (7 bits of repeat count)
    const REPZ_11_138 = 18;

    // The lengths of the bit length codes are sent in order of decreasing
    // probability, to avoid transmitting the lengths for unused bit
    // length codes.

    const Buf_size = 8 * 2;

    // JZlib version : "1.0.2"
    const Z_DEFAULT_COMPRESSION = -1;

    // compression strategy
    const Z_FILTERED = 1;
    const Z_HUFFMAN_ONLY = 2;
    const Z_DEFAULT_STRATEGY = 0;

    const Z_NO_FLUSH$1 = 0;
    const Z_PARTIAL_FLUSH = 1;
    const Z_FULL_FLUSH = 3;
    const Z_FINISH$1 = 4;

    const Z_OK$1 = 0;
    const Z_STREAM_END$1 = 1;
    const Z_NEED_DICT$1 = 2;
    const Z_STREAM_ERROR$1 = -2;
    const Z_DATA_ERROR$1 = -3;
    const Z_BUF_ERROR$1 = -5;

    // Tree

    function extractArray(array) {
    	return flatArray(array.map(([length, value]) => (new Array(length)).fill(value, 0, length)));
    }

    function flatArray(array) {
    	return array.reduce((a, b) => a.concat(Array.isArray(b) ? flatArray(b) : b), []);
    }

    // see definition of array dist_code below
    const _dist_code = [0, 1, 2, 3].concat(...extractArray([
    	[2, 4], [2, 5], [4, 6], [4, 7], [8, 8], [8, 9], [16, 10], [16, 11], [32, 12], [32, 13], [64, 14], [64, 15], [2, 0], [1, 16],
    	[1, 17], [2, 18], [2, 19], [4, 20], [4, 21], [8, 22], [8, 23], [16, 24], [16, 25], [32, 26], [32, 27], [64, 28], [64, 29]
    ]));

    function Tree() {
    	const that = this;

    	// dyn_tree; // the dynamic tree
    	// max_code; // largest code with non zero frequency
    	// stat_desc; // the corresponding static tree

    	// Compute the optimal bit lengths for a tree and update the total bit
    	// length
    	// for the current block.
    	// IN assertion: the fields freq and dad are set, heap[heap_max] and
    	// above are the tree nodes sorted by increasing frequency.
    	// OUT assertions: the field len is set to the optimal bit length, the
    	// array bl_count contains the frequencies for each bit length.
    	// The length opt_len is updated; static_len is also updated if stree is
    	// not null.
    	function gen_bitlen(s) {
    		const tree = that.dyn_tree;
    		const stree = that.stat_desc.static_tree;
    		const extra = that.stat_desc.extra_bits;
    		const base = that.stat_desc.extra_base;
    		const max_length = that.stat_desc.max_length;
    		let h; // heap index
    		let n, m; // iterate over the tree elements
    		let bits; // bit length
    		let xbits; // extra bits
    		let f; // frequency
    		let overflow = 0; // number of elements with bit length too large

    		for (bits = 0; bits <= MAX_BITS$1; bits++)
    			s.bl_count[bits] = 0;

    		// In a first pass, compute the optimal bit lengths (which may
    		// overflow in the case of the bit length tree).
    		tree[s.heap[s.heap_max] * 2 + 1] = 0; // root of the heap

    		for (h = s.heap_max + 1; h < HEAP_SIZE; h++) {
    			n = s.heap[h];
    			bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
    			if (bits > max_length) {
    				bits = max_length;
    				overflow++;
    			}
    			tree[n * 2 + 1] = bits;
    			// We overwrite tree[n*2+1] which is no longer needed

    			if (n > that.max_code)
    				continue; // not a leaf node

    			s.bl_count[bits]++;
    			xbits = 0;
    			if (n >= base)
    				xbits = extra[n - base];
    			f = tree[n * 2];
    			s.opt_len += f * (bits + xbits);
    			if (stree)
    				s.static_len += f * (stree[n * 2 + 1] + xbits);
    		}
    		if (overflow === 0)
    			return;

    		// This happens for example on obj2 and pic of the Calgary corpus
    		// Find the first bit length which could increase:
    		do {
    			bits = max_length - 1;
    			while (s.bl_count[bits] === 0)
    				bits--;
    			s.bl_count[bits]--; // move one leaf down the tree
    			s.bl_count[bits + 1] += 2; // move one overflow item as its brother
    			s.bl_count[max_length]--;
    			// The brother of the overflow item also moves one step up,
    			// but this does not affect bl_count[max_length]
    			overflow -= 2;
    		} while (overflow > 0);

    		for (bits = max_length; bits !== 0; bits--) {
    			n = s.bl_count[bits];
    			while (n !== 0) {
    				m = s.heap[--h];
    				if (m > that.max_code)
    					continue;
    				if (tree[m * 2 + 1] != bits) {
    					s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
    					tree[m * 2 + 1] = bits;
    				}
    				n--;
    			}
    		}
    	}

    	// Reverse the first len bits of a code, using straightforward code (a
    	// faster
    	// method would use a table)
    	// IN assertion: 1 <= len <= 15
    	function bi_reverse(code, // the value to invert
    		len // its bit length
    	) {
    		let res = 0;
    		do {
    			res |= code & 1;
    			code >>>= 1;
    			res <<= 1;
    		} while (--len > 0);
    		return res >>> 1;
    	}

    	// Generate the codes for a given tree and bit counts (which need not be
    	// optimal).
    	// IN assertion: the array bl_count contains the bit length statistics for
    	// the given tree and the field len is set for all tree elements.
    	// OUT assertion: the field code is set for all tree elements of non
    	// zero code length.
    	function gen_codes(tree, // the tree to decorate
    		max_code, // largest code with non zero frequency
    		bl_count // number of codes at each bit length
    	) {
    		const next_code = []; // next code value for each
    		// bit length
    		let code = 0; // running code value
    		let bits; // bit index
    		let n; // code index
    		let len;

    		// The distribution counts are first used to generate the code values
    		// without bit reversal.
    		for (bits = 1; bits <= MAX_BITS$1; bits++) {
    			next_code[bits] = code = ((code + bl_count[bits - 1]) << 1);
    		}

    		// Check that the bit counts in bl_count are consistent. The last code
    		// must be all ones.
    		// Assert (code + bl_count[MAX_BITS]-1 == (1<<MAX_BITS)-1,
    		// "inconsistent bit counts");
    		// Tracev((stderr,"gen_codes: max_code %d ", max_code));

    		for (n = 0; n <= max_code; n++) {
    			len = tree[n * 2 + 1];
    			if (len === 0)
    				continue;
    			// Now reverse the bits
    			tree[n * 2] = bi_reverse(next_code[len]++, len);
    		}
    	}

    	// Construct one Huffman tree and assigns the code bit strings and lengths.
    	// Update the total bit length for the current block.
    	// IN assertion: the field freq is set for all tree elements.
    	// OUT assertions: the fields len and code are set to the optimal bit length
    	// and corresponding code. The length opt_len is updated; static_len is
    	// also updated if stree is not null. The field max_code is set.
    	that.build_tree = function (s) {
    		const tree = that.dyn_tree;
    		const stree = that.stat_desc.static_tree;
    		const elems = that.stat_desc.elems;
    		let n, m; // iterate over heap elements
    		let max_code = -1; // largest code with non zero frequency
    		let node; // new node being created

    		// Construct the initial heap, with least frequent element in
    		// heap[1]. The sons of heap[n] are heap[2*n] and heap[2*n+1].
    		// heap[0] is not used.
    		s.heap_len = 0;
    		s.heap_max = HEAP_SIZE;

    		for (n = 0; n < elems; n++) {
    			if (tree[n * 2] !== 0) {
    				s.heap[++s.heap_len] = max_code = n;
    				s.depth[n] = 0;
    			} else {
    				tree[n * 2 + 1] = 0;
    			}
    		}

    		// The pkzip format requires that at least one distance code exists,
    		// and that at least one bit should be sent even if there is only one
    		// possible code. So to avoid special checks later on we force at least
    		// two codes of non zero frequency.
    		while (s.heap_len < 2) {
    			node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
    			tree[node * 2] = 1;
    			s.depth[node] = 0;
    			s.opt_len--;
    			if (stree)
    				s.static_len -= stree[node * 2 + 1];
    			// node is 0 or 1 so it does not have extra bits
    		}
    		that.max_code = max_code;

    		// The elements heap[heap_len/2+1 .. heap_len] are leaves of the tree,
    		// establish sub-heaps of increasing lengths:

    		for (n = Math.floor(s.heap_len / 2); n >= 1; n--)
    			s.pqdownheap(tree, n);

    		// Construct the Huffman tree by repeatedly combining the least two
    		// frequent nodes.

    		node = elems; // next internal node of the tree
    		do {
    			// n = node of least frequency
    			n = s.heap[1];
    			s.heap[1] = s.heap[s.heap_len--];
    			s.pqdownheap(tree, 1);
    			m = s.heap[1]; // m = node of next least frequency

    			s.heap[--s.heap_max] = n; // keep the nodes sorted by frequency
    			s.heap[--s.heap_max] = m;

    			// Create a new node father of n and m
    			tree[node * 2] = (tree[n * 2] + tree[m * 2]);
    			s.depth[node] = Math.max(s.depth[n], s.depth[m]) + 1;
    			tree[n * 2 + 1] = tree[m * 2 + 1] = node;

    			// and insert the new node in the heap
    			s.heap[1] = node++;
    			s.pqdownheap(tree, 1);
    		} while (s.heap_len >= 2);

    		s.heap[--s.heap_max] = s.heap[1];

    		// At this point, the fields freq and dad are set. We can now
    		// generate the bit lengths.

    		gen_bitlen(s);

    		// The field len is now set, we can generate the bit codes
    		gen_codes(tree, that.max_code, s.bl_count);
    	};

    }

    Tree._length_code = [0, 1, 2, 3, 4, 5, 6, 7].concat(...extractArray([
    	[2, 8], [2, 9], [2, 10], [2, 11], [4, 12], [4, 13], [4, 14], [4, 15], [8, 16], [8, 17], [8, 18], [8, 19],
    	[16, 20], [16, 21], [16, 22], [16, 23], [32, 24], [32, 25], [32, 26], [31, 27], [1, 28]]));

    Tree.base_length = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 0];

    Tree.base_dist = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192, 12288, 16384,
    	24576];

    // Mapping from a distance to a distance code. dist is the distance - 1 and
    // must not have side effects. _dist_code[256] and _dist_code[257] are never
    // used.
    Tree.d_code = function (dist) {
    	return ((dist) < 256 ? _dist_code[dist] : _dist_code[256 + ((dist) >>> 7)]);
    };

    // extra bits for each length code
    Tree.extra_lbits = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

    // extra bits for each distance code
    Tree.extra_dbits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

    // extra bits for each bit length code
    Tree.extra_blbits = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7];

    Tree.bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

    // StaticTree

    function StaticTree(static_tree, extra_bits, extra_base, elems, max_length) {
    	const that = this;
    	that.static_tree = static_tree;
    	that.extra_bits = extra_bits;
    	that.extra_base = extra_base;
    	that.elems = elems;
    	that.max_length = max_length;
    }

    const static_ltree2_first_part = [12, 140, 76, 204, 44, 172, 108, 236, 28, 156, 92, 220, 60, 188, 124, 252, 2, 130, 66, 194, 34, 162, 98, 226, 18, 146, 82,
    	210, 50, 178, 114, 242, 10, 138, 74, 202, 42, 170, 106, 234, 26, 154, 90, 218, 58, 186, 122, 250, 6, 134, 70, 198, 38, 166, 102, 230, 22, 150, 86,
    	214, 54, 182, 118, 246, 14, 142, 78, 206, 46, 174, 110, 238, 30, 158, 94, 222, 62, 190, 126, 254, 1, 129, 65, 193, 33, 161, 97, 225, 17, 145, 81,
    	209, 49, 177, 113, 241, 9, 137, 73, 201, 41, 169, 105, 233, 25, 153, 89, 217, 57, 185, 121, 249, 5, 133, 69, 197, 37, 165, 101, 229, 21, 149, 85,
    	213, 53, 181, 117, 245, 13, 141, 77, 205, 45, 173, 109, 237, 29, 157, 93, 221, 61, 189, 125, 253, 19, 275, 147, 403, 83, 339, 211, 467, 51, 307,
    	179, 435, 115, 371, 243, 499, 11, 267, 139, 395, 75, 331, 203, 459, 43, 299, 171, 427, 107, 363, 235, 491, 27, 283, 155, 411, 91, 347, 219, 475,
    	59, 315, 187, 443, 123, 379, 251, 507, 7, 263, 135, 391, 71, 327, 199, 455, 39, 295, 167, 423, 103, 359, 231, 487, 23, 279, 151, 407, 87, 343, 215,
    	471, 55, 311, 183, 439, 119, 375, 247, 503, 15, 271, 143, 399, 79, 335, 207, 463, 47, 303, 175, 431, 111, 367, 239, 495, 31, 287, 159, 415, 95,
    	351, 223, 479, 63, 319, 191, 447, 127, 383, 255, 511, 0, 64, 32, 96, 16, 80, 48, 112, 8, 72, 40, 104, 24, 88, 56, 120, 4, 68, 36, 100, 20, 84, 52,
    	116, 3, 131, 67, 195, 35, 163, 99, 227];
    const static_ltree2_second_part = extractArray([[144, 8], [112, 9], [24, 7], [8, 8]]);
    StaticTree.static_ltree = flatArray(static_ltree2_first_part.map((value, index) => [value, static_ltree2_second_part[index]]));

    const static_dtree_first_part = [0, 16, 8, 24, 4, 20, 12, 28, 2, 18, 10, 26, 6, 22, 14, 30, 1, 17, 9, 25, 5, 21, 13, 29, 3, 19, 11, 27, 7, 23];
    const static_dtree_second_part = extractArray([[30, 5]]);
    StaticTree.static_dtree = flatArray(static_dtree_first_part.map((value, index) => [value, static_dtree_second_part[index]]));

    StaticTree.static_l_desc = new StaticTree(StaticTree.static_ltree, Tree.extra_lbits, LITERALS + 1, L_CODES, MAX_BITS$1);

    StaticTree.static_d_desc = new StaticTree(StaticTree.static_dtree, Tree.extra_dbits, 0, D_CODES, MAX_BITS$1);

    StaticTree.static_bl_desc = new StaticTree(null, Tree.extra_blbits, 0, BL_CODES, MAX_BL_BITS);

    // Deflate

    const MAX_MEM_LEVEL = 9;
    const DEF_MEM_LEVEL = 8;

    function Config(good_length, max_lazy, nice_length, max_chain, func) {
    	const that = this;
    	that.good_length = good_length;
    	that.max_lazy = max_lazy;
    	that.nice_length = nice_length;
    	that.max_chain = max_chain;
    	that.func = func;
    }

    const STORED$1 = 0;
    const FAST = 1;
    const SLOW = 2;
    const config_table = [
    	new Config(0, 0, 0, 0, STORED$1),
    	new Config(4, 4, 8, 4, FAST),
    	new Config(4, 5, 16, 8, FAST),
    	new Config(4, 6, 32, 32, FAST),
    	new Config(4, 4, 16, 16, SLOW),
    	new Config(8, 16, 32, 32, SLOW),
    	new Config(8, 16, 128, 128, SLOW),
    	new Config(8, 32, 128, 256, SLOW),
    	new Config(32, 128, 258, 1024, SLOW),
    	new Config(32, 258, 258, 4096, SLOW)
    ];

    const z_errmsg = ["need dictionary", // Z_NEED_DICT
    	// 2
    	"stream end", // Z_STREAM_END 1
    	"", // Z_OK 0
    	"", // Z_ERRNO (-1)
    	"stream error", // Z_STREAM_ERROR (-2)
    	"data error", // Z_DATA_ERROR (-3)
    	"", // Z_MEM_ERROR (-4)
    	"buffer error", // Z_BUF_ERROR (-5)
    	"",// Z_VERSION_ERROR (-6)
    	""];

    // block not completed, need more input or more output
    const NeedMore = 0;

    // block flush performed
    const BlockDone = 1;

    // finish started, need only more output at next deflate
    const FinishStarted = 2;

    // finish done, accept no more input or output
    const FinishDone = 3;

    // preset dictionary flag in zlib header
    const PRESET_DICT$1 = 0x20;

    const INIT_STATE = 42;
    const BUSY_STATE = 113;
    const FINISH_STATE = 666;

    // The deflate compression method
    const Z_DEFLATED$1 = 8;

    const STORED_BLOCK = 0;
    const STATIC_TREES = 1;
    const DYN_TREES = 2;

    const MIN_MATCH = 3;
    const MAX_MATCH = 258;
    const MIN_LOOKAHEAD = (MAX_MATCH + MIN_MATCH + 1);

    function smaller(tree, n, m, depth) {
    	const tn2 = tree[n * 2];
    	const tm2 = tree[m * 2];
    	return (tn2 < tm2 || (tn2 == tm2 && depth[n] <= depth[m]));
    }

    function Deflate() {

    	const that = this;
    	let strm; // pointer back to this zlib stream
    	let status; // as the name implies
    	// pending_buf; // output still pending
    	let pending_buf_size; // size of pending_buf
    	// pending_out; // next pending byte to output to the stream
    	// pending; // nb of bytes in the pending buffer

    	// dist_buf; // buffer for distances
    	// lc_buf; // buffer for literals or lengths
    	// To simplify the code, dist_buf and lc_buf have the same number of elements.
    	// To use different lengths, an extra flag array would be necessary.

    	let last_flush; // value of flush param for previous deflate call

    	let w_size; // LZ77 win size (32K by default)
    	let w_bits; // log2(w_size) (8..16)
    	let w_mask; // w_size - 1

    	let win;
    	// Sliding win. Input bytes are read into the second half of the win,
    	// and move to the first half later to keep a dictionary of at least wSize
    	// bytes. With this organization, matches are limited to a distance of
    	// wSize-MAX_MATCH bytes, but this ensures that IO is always
    	// performed with a length multiple of the block size. Also, it limits
    	// the win size to 64K, which is quite useful on MSDOS.
    	// To do: use the user input buffer as sliding win.

    	let window_size;
    	// Actual size of win: 2*wSize, except when the user input buffer
    	// is directly used as sliding win.

    	let prev;
    	// Link to older string with same hash index. To limit the size of this
    	// array to 64K, this link is maintained only for the last 32K strings.
    	// An index in this array is thus a win index modulo 32K.

    	let head; // Heads of the hash chains or NIL.

    	let ins_h; // hash index of string to be inserted
    	let hash_size; // number of elements in hash table
    	let hash_bits; // log2(hash_size)
    	let hash_mask; // hash_size-1

    	// Number of bits by which ins_h must be shifted at each input
    	// step. It must be such that after MIN_MATCH steps, the oldest
    	// byte no longer takes part in the hash key, that is:
    	// hash_shift * MIN_MATCH >= hash_bits
    	let hash_shift;

    	// Window position at the beginning of the current output block. Gets
    	// negative when the win is moved backwards.

    	let block_start;

    	let match_length; // length of best match
    	let prev_match; // previous match
    	let match_available; // set if previous match exists
    	let strstart; // start of string to insert
    	let match_start; // start of matching string
    	let lookahead; // number of valid bytes ahead in win

    	// Length of the best match at previous step. Matches not greater than this
    	// are discarded. This is used in the lazy match evaluation.
    	let prev_length;

    	// To speed up deflation, hash chains are never searched beyond this
    	// length. A higher limit improves compression ratio but degrades the speed.
    	let max_chain_length;

    	// Attempt to find a better match only when the current match is strictly
    	// smaller than this value. This mechanism is used only for compression
    	// levels >= 4.
    	let max_lazy_match;

    	// Insert new strings in the hash table only if the match length is not
    	// greater than this length. This saves time but degrades compression.
    	// max_insert_length is used only for compression levels <= 3.

    	let level; // compression level (1..9)
    	let strategy; // favor or force Huffman coding

    	// Use a faster search when the previous match is longer than this
    	let good_match;

    	// Stop searching when current match exceeds this
    	let nice_match;

    	let dyn_ltree; // literal and length tree
    	let dyn_dtree; // distance tree
    	let bl_tree; // Huffman tree for bit lengths

    	const l_desc = new Tree(); // desc for literal tree
    	const d_desc = new Tree(); // desc for distance tree
    	const bl_desc = new Tree(); // desc for bit length tree

    	// that.heap_len; // number of elements in the heap
    	// that.heap_max; // element of largest frequency
    	// The sons of heap[n] are heap[2*n] and heap[2*n+1]. heap[0] is not used.
    	// The same heap array is used to build all trees.

    	// Depth of each subtree used as tie breaker for trees of equal frequency
    	that.depth = [];

    	// Size of match buffer for literals/lengths. There are 4 reasons for
    	// limiting lit_bufsize to 64K:
    	// - frequencies can be kept in 16 bit counters
    	// - if compression is not successful for the first block, all input
    	// data is still in the win so we can still emit a stored block even
    	// when input comes from standard input. (This can also be done for
    	// all blocks if lit_bufsize is not greater than 32K.)
    	// - if compression is not successful for a file smaller than 64K, we can
    	// even emit a stored file instead of a stored block (saving 5 bytes).
    	// This is applicable only for zip (not gzip or zlib).
    	// - creating new Huffman trees less frequently may not provide fast
    	// adaptation to changes in the input data statistics. (Take for
    	// example a binary file with poorly compressible code followed by
    	// a highly compressible string table.) Smaller buffer sizes give
    	// fast adaptation but have of course the overhead of transmitting
    	// trees more frequently.
    	// - I can't count above 4
    	let lit_bufsize;

    	let last_lit; // running index in dist_buf and lc_buf

    	// that.opt_len; // bit length of current block with optimal trees
    	// that.static_len; // bit length of current block with static trees
    	let matches; // number of string matches in current block
    	let last_eob_len; // bit length of EOB code for last block

    	// Output buffer. bits are inserted starting at the bottom (least
    	// significant bits).
    	let bi_buf;

    	// Number of valid bits in bi_buf. All bits above the last valid bit
    	// are always zero.
    	let bi_valid;

    	// number of codes at each bit length for an optimal tree
    	that.bl_count = [];

    	// heap used to build the Huffman trees
    	that.heap = [];

    	dyn_ltree = [];
    	dyn_dtree = [];
    	bl_tree = [];

    	function lm_init() {
    		window_size = 2 * w_size;

    		head[hash_size - 1] = 0;
    		for (let i = 0; i < hash_size - 1; i++) {
    			head[i] = 0;
    		}

    		// Set the default configuration parameters:
    		max_lazy_match = config_table[level].max_lazy;
    		good_match = config_table[level].good_length;
    		nice_match = config_table[level].nice_length;
    		max_chain_length = config_table[level].max_chain;

    		strstart = 0;
    		block_start = 0;
    		lookahead = 0;
    		match_length = prev_length = MIN_MATCH - 1;
    		match_available = 0;
    		ins_h = 0;
    	}

    	function init_block() {
    		let i;
    		// Initialize the trees.
    		for (i = 0; i < L_CODES; i++)
    			dyn_ltree[i * 2] = 0;
    		for (i = 0; i < D_CODES; i++)
    			dyn_dtree[i * 2] = 0;
    		for (i = 0; i < BL_CODES; i++)
    			bl_tree[i * 2] = 0;

    		dyn_ltree[END_BLOCK * 2] = 1;
    		that.opt_len = that.static_len = 0;
    		last_lit = matches = 0;
    	}

    	// Initialize the tree data structures for a new zlib stream.
    	function tr_init() {

    		l_desc.dyn_tree = dyn_ltree;
    		l_desc.stat_desc = StaticTree.static_l_desc;

    		d_desc.dyn_tree = dyn_dtree;
    		d_desc.stat_desc = StaticTree.static_d_desc;

    		bl_desc.dyn_tree = bl_tree;
    		bl_desc.stat_desc = StaticTree.static_bl_desc;

    		bi_buf = 0;
    		bi_valid = 0;
    		last_eob_len = 8; // enough lookahead for inflate

    		// Initialize the first block of the first file:
    		init_block();
    	}

    	// Restore the heap property by moving down the tree starting at node k,
    	// exchanging a node with the smallest of its two sons if necessary,
    	// stopping
    	// when the heap property is re-established (each father smaller than its
    	// two sons).
    	that.pqdownheap = function (tree, // the tree to restore
    		k // node to move down
    	) {
    		const heap = that.heap;
    		const v = heap[k];
    		let j = k << 1; // left son of k
    		while (j <= that.heap_len) {
    			// Set j to the smallest of the two sons:
    			if (j < that.heap_len && smaller(tree, heap[j + 1], heap[j], that.depth)) {
    				j++;
    			}
    			// Exit if v is smaller than both sons
    			if (smaller(tree, v, heap[j], that.depth))
    				break;

    			// Exchange v with the smallest son
    			heap[k] = heap[j];
    			k = j;
    			// And continue down the tree, setting j to the left son of k
    			j <<= 1;
    		}
    		heap[k] = v;
    	};

    	// Scan a literal or distance tree to determine the frequencies of the codes
    	// in the bit length tree.
    	function scan_tree(tree,// the tree to be scanned
    		max_code // and its largest code of non zero frequency
    	) {
    		let prevlen = -1; // last emitted length
    		let curlen; // length of current code
    		let nextlen = tree[0 * 2 + 1]; // length of next code
    		let count = 0; // repeat count of the current code
    		let max_count = 7; // max repeat count
    		let min_count = 4; // min repeat count

    		if (nextlen === 0) {
    			max_count = 138;
    			min_count = 3;
    		}
    		tree[(max_code + 1) * 2 + 1] = 0xffff; // guard

    		for (let n = 0; n <= max_code; n++) {
    			curlen = nextlen;
    			nextlen = tree[(n + 1) * 2 + 1];
    			if (++count < max_count && curlen == nextlen) {
    				continue;
    			} else if (count < min_count) {
    				bl_tree[curlen * 2] += count;
    			} else if (curlen !== 0) {
    				if (curlen != prevlen)
    					bl_tree[curlen * 2]++;
    				bl_tree[REP_3_6 * 2]++;
    			} else if (count <= 10) {
    				bl_tree[REPZ_3_10 * 2]++;
    			} else {
    				bl_tree[REPZ_11_138 * 2]++;
    			}
    			count = 0;
    			prevlen = curlen;
    			if (nextlen === 0) {
    				max_count = 138;
    				min_count = 3;
    			} else if (curlen == nextlen) {
    				max_count = 6;
    				min_count = 3;
    			} else {
    				max_count = 7;
    				min_count = 4;
    			}
    		}
    	}

    	// Construct the Huffman tree for the bit lengths and return the index in
    	// bl_order of the last bit length code to send.
    	function build_bl_tree() {
    		let max_blindex; // index of last bit length code of non zero freq

    		// Determine the bit length frequencies for literal and distance trees
    		scan_tree(dyn_ltree, l_desc.max_code);
    		scan_tree(dyn_dtree, d_desc.max_code);

    		// Build the bit length tree:
    		bl_desc.build_tree(that);
    		// opt_len now includes the length of the tree representations, except
    		// the lengths of the bit lengths codes and the 5+5+4 bits for the
    		// counts.

    		// Determine the number of bit length codes to send. The pkzip format
    		// requires that at least 4 bit length codes be sent. (appnote.txt says
    		// 3 but the actual value used is 4.)
    		for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
    			if (bl_tree[Tree.bl_order[max_blindex] * 2 + 1] !== 0)
    				break;
    		}
    		// Update opt_len to include the bit length tree and counts
    		that.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;

    		return max_blindex;
    	}

    	// Output a byte on the stream.
    	// IN assertion: there is enough room in pending_buf.
    	function put_byte(p) {
    		that.pending_buf[that.pending++] = p;
    	}

    	function put_short(w) {
    		put_byte(w & 0xff);
    		put_byte((w >>> 8) & 0xff);
    	}

    	function putShortMSB(b) {
    		put_byte((b >> 8) & 0xff);
    		put_byte((b & 0xff) & 0xff);
    	}

    	function send_bits(value, length) {
    		let val;
    		const len = length;
    		if (bi_valid > Buf_size - len) {
    			val = value;
    			// bi_buf |= (val << bi_valid);
    			bi_buf |= ((val << bi_valid) & 0xffff);
    			put_short(bi_buf);
    			bi_buf = val >>> (Buf_size - bi_valid);
    			bi_valid += len - Buf_size;
    		} else {
    			// bi_buf |= (value) << bi_valid;
    			bi_buf |= (((value) << bi_valid) & 0xffff);
    			bi_valid += len;
    		}
    	}

    	function send_code(c, tree) {
    		const c2 = c * 2;
    		send_bits(tree[c2] & 0xffff, tree[c2 + 1] & 0xffff);
    	}

    	// Send a literal or distance tree in compressed form, using the codes in
    	// bl_tree.
    	function send_tree(tree,// the tree to be sent
    		max_code // and its largest code of non zero frequency
    	) {
    		let n; // iterates over all tree elements
    		let prevlen = -1; // last emitted length
    		let curlen; // length of current code
    		let nextlen = tree[0 * 2 + 1]; // length of next code
    		let count = 0; // repeat count of the current code
    		let max_count = 7; // max repeat count
    		let min_count = 4; // min repeat count

    		if (nextlen === 0) {
    			max_count = 138;
    			min_count = 3;
    		}

    		for (n = 0; n <= max_code; n++) {
    			curlen = nextlen;
    			nextlen = tree[(n + 1) * 2 + 1];
    			if (++count < max_count && curlen == nextlen) {
    				continue;
    			} else if (count < min_count) {
    				do {
    					send_code(curlen, bl_tree);
    				} while (--count !== 0);
    			} else if (curlen !== 0) {
    				if (curlen != prevlen) {
    					send_code(curlen, bl_tree);
    					count--;
    				}
    				send_code(REP_3_6, bl_tree);
    				send_bits(count - 3, 2);
    			} else if (count <= 10) {
    				send_code(REPZ_3_10, bl_tree);
    				send_bits(count - 3, 3);
    			} else {
    				send_code(REPZ_11_138, bl_tree);
    				send_bits(count - 11, 7);
    			}
    			count = 0;
    			prevlen = curlen;
    			if (nextlen === 0) {
    				max_count = 138;
    				min_count = 3;
    			} else if (curlen == nextlen) {
    				max_count = 6;
    				min_count = 3;
    			} else {
    				max_count = 7;
    				min_count = 4;
    			}
    		}
    	}

    	// Send the header for a block using dynamic Huffman trees: the counts, the
    	// lengths of the bit length codes, the literal tree and the distance tree.
    	// IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.
    	function send_all_trees(lcodes, dcodes, blcodes) {
    		let rank; // index in bl_order

    		send_bits(lcodes - 257, 5); // not +255 as stated in appnote.txt
    		send_bits(dcodes - 1, 5);
    		send_bits(blcodes - 4, 4); // not -3 as stated in appnote.txt
    		for (rank = 0; rank < blcodes; rank++) {
    			send_bits(bl_tree[Tree.bl_order[rank] * 2 + 1], 3);
    		}
    		send_tree(dyn_ltree, lcodes - 1); // literal tree
    		send_tree(dyn_dtree, dcodes - 1); // distance tree
    	}

    	// Flush the bit buffer, keeping at most 7 bits in it.
    	function bi_flush() {
    		if (bi_valid == 16) {
    			put_short(bi_buf);
    			bi_buf = 0;
    			bi_valid = 0;
    		} else if (bi_valid >= 8) {
    			put_byte(bi_buf & 0xff);
    			bi_buf >>>= 8;
    			bi_valid -= 8;
    		}
    	}

    	// Send one empty static block to give enough lookahead for inflate.
    	// This takes 10 bits, of which 7 may remain in the bit buffer.
    	// The current inflate code requires 9 bits of lookahead. If the
    	// last two codes for the previous block (real code plus EOB) were coded
    	// on 5 bits or less, inflate may have only 5+3 bits of lookahead to decode
    	// the last real code. In this case we send two empty static blocks instead
    	// of one. (There are no problems if the previous block is stored or fixed.)
    	// To simplify the code, we assume the worst case of last real code encoded
    	// on one bit only.
    	function _tr_align() {
    		send_bits(STATIC_TREES << 1, 3);
    		send_code(END_BLOCK, StaticTree.static_ltree);

    		bi_flush();

    		// Of the 10 bits for the empty block, we have already sent
    		// (10 - bi_valid) bits. The lookahead for the last real code (before
    		// the EOB of the previous block) was thus at least one plus the length
    		// of the EOB plus what we have just sent of the empty static block.
    		if (1 + last_eob_len + 10 - bi_valid < 9) {
    			send_bits(STATIC_TREES << 1, 3);
    			send_code(END_BLOCK, StaticTree.static_ltree);
    			bi_flush();
    		}
    		last_eob_len = 7;
    	}

    	// Save the match info and tally the frequency counts. Return true if
    	// the current block must be flushed.
    	function _tr_tally(dist, // distance of matched string
    		lc // match length-MIN_MATCH or unmatched char (if dist==0)
    	) {
    		let out_length, in_length, dcode;
    		that.dist_buf[last_lit] = dist;
    		that.lc_buf[last_lit] = lc & 0xff;
    		last_lit++;

    		if (dist === 0) {
    			// lc is the unmatched char
    			dyn_ltree[lc * 2]++;
    		} else {
    			matches++;
    			// Here, lc is the match length - MIN_MATCH
    			dist--; // dist = match distance - 1
    			dyn_ltree[(Tree._length_code[lc] + LITERALS + 1) * 2]++;
    			dyn_dtree[Tree.d_code(dist) * 2]++;
    		}

    		if ((last_lit & 0x1fff) === 0 && level > 2) {
    			// Compute an upper bound for the compressed length
    			out_length = last_lit * 8;
    			in_length = strstart - block_start;
    			for (dcode = 0; dcode < D_CODES; dcode++) {
    				out_length += dyn_dtree[dcode * 2] * (5 + Tree.extra_dbits[dcode]);
    			}
    			out_length >>>= 3;
    			if ((matches < Math.floor(last_lit / 2)) && out_length < Math.floor(in_length / 2))
    				return true;
    		}

    		return (last_lit == lit_bufsize - 1);
    		// We avoid equality with lit_bufsize because of wraparound at 64K
    		// on 16 bit machines and because stored blocks are restricted to
    		// 64K-1 bytes.
    	}

    	// Send the block data compressed using the given Huffman trees
    	function compress_block(ltree, dtree) {
    		let dist; // distance of matched string
    		let lc; // match length or unmatched char (if dist === 0)
    		let lx = 0; // running index in dist_buf and lc_buf
    		let code; // the code to send
    		let extra; // number of extra bits to send

    		if (last_lit !== 0) {
    			do {
    				dist = that.dist_buf[lx];
    				lc = that.lc_buf[lx];
    				lx++;

    				if (dist === 0) {
    					send_code(lc, ltree); // send a literal byte
    				} else {
    					// Here, lc is the match length - MIN_MATCH
    					code = Tree._length_code[lc];

    					send_code(code + LITERALS + 1, ltree); // send the length
    					// code
    					extra = Tree.extra_lbits[code];
    					if (extra !== 0) {
    						lc -= Tree.base_length[code];
    						send_bits(lc, extra); // send the extra length bits
    					}
    					dist--; // dist is now the match distance - 1
    					code = Tree.d_code(dist);

    					send_code(code, dtree); // send the distance code
    					extra = Tree.extra_dbits[code];
    					if (extra !== 0) {
    						dist -= Tree.base_dist[code];
    						send_bits(dist, extra); // send the extra distance bits
    					}
    				} // literal or match pair ?
    			} while (lx < last_lit);
    		}

    		send_code(END_BLOCK, ltree);
    		last_eob_len = ltree[END_BLOCK * 2 + 1];
    	}

    	// Flush the bit buffer and align the output on a byte boundary
    	function bi_windup() {
    		if (bi_valid > 8) {
    			put_short(bi_buf);
    		} else if (bi_valid > 0) {
    			put_byte(bi_buf & 0xff);
    		}
    		bi_buf = 0;
    		bi_valid = 0;
    	}

    	// Copy a stored block, storing first the length and its
    	// one's complement if requested.
    	function copy_block(buf, // the input data
    		len, // its length
    		header // true if block header must be written
    	) {
    		bi_windup(); // align on byte boundary
    		last_eob_len = 8; // enough lookahead for inflate

    		if (header) {
    			put_short(len);
    			put_short(~len);
    		}

    		that.pending_buf.set(win.subarray(buf, buf + len), that.pending);
    		that.pending += len;
    	}

    	// Send a stored block
    	function _tr_stored_block(buf, // input block
    		stored_len, // length of input block
    		eof // true if this is the last block for a file
    	) {
    		send_bits((STORED_BLOCK << 1) + (eof ? 1 : 0), 3); // send block type
    		copy_block(buf, stored_len, true); // with header
    	}

    	// Determine the best encoding for the current block: dynamic trees, static
    	// trees or store, and output the encoded block to the zip file.
    	function _tr_flush_block(buf, // input block, or NULL if too old
    		stored_len, // length of input block
    		eof // true if this is the last block for a file
    	) {
    		let opt_lenb, static_lenb;// opt_len and static_len in bytes
    		let max_blindex = 0; // index of last bit length code of non zero freq

    		// Build the Huffman trees unless a stored block is forced
    		if (level > 0) {
    			// Construct the literal and distance trees
    			l_desc.build_tree(that);

    			d_desc.build_tree(that);

    			// At this point, opt_len and static_len are the total bit lengths
    			// of
    			// the compressed block data, excluding the tree representations.

    			// Build the bit length tree for the above two trees, and get the
    			// index
    			// in bl_order of the last bit length code to send.
    			max_blindex = build_bl_tree();

    			// Determine the best encoding. Compute first the block length in
    			// bytes
    			opt_lenb = (that.opt_len + 3 + 7) >>> 3;
    			static_lenb = (that.static_len + 3 + 7) >>> 3;

    			if (static_lenb <= opt_lenb)
    				opt_lenb = static_lenb;
    		} else {
    			opt_lenb = static_lenb = stored_len + 5; // force a stored block
    		}

    		if ((stored_len + 4 <= opt_lenb) && buf != -1) {
    			// 4: two words for the lengths
    			// The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.
    			// Otherwise we can't have processed more than WSIZE input bytes
    			// since
    			// the last block flush, because compression would have been
    			// successful. If LIT_BUFSIZE <= WSIZE, it is never too late to
    			// transform a block into a stored block.
    			_tr_stored_block(buf, stored_len, eof);
    		} else if (static_lenb == opt_lenb) {
    			send_bits((STATIC_TREES << 1) + (eof ? 1 : 0), 3);
    			compress_block(StaticTree.static_ltree, StaticTree.static_dtree);
    		} else {
    			send_bits((DYN_TREES << 1) + (eof ? 1 : 0), 3);
    			send_all_trees(l_desc.max_code + 1, d_desc.max_code + 1, max_blindex + 1);
    			compress_block(dyn_ltree, dyn_dtree);
    		}

    		// The above check is made mod 2^32, for files larger than 512 MB
    		// and uLong implemented on 32 bits.

    		init_block();

    		if (eof) {
    			bi_windup();
    		}
    	}

    	function flush_block_only(eof) {
    		_tr_flush_block(block_start >= 0 ? block_start : -1, strstart - block_start, eof);
    		block_start = strstart;
    		strm.flush_pending();
    	}

    	// Fill the win when the lookahead becomes insufficient.
    	// Updates strstart and lookahead.
    	//
    	// IN assertion: lookahead < MIN_LOOKAHEAD
    	// OUT assertions: strstart <= window_size-MIN_LOOKAHEAD
    	// At least one byte has been read, or avail_in === 0; reads are
    	// performed for at least two bytes (required for the zip translate_eol
    	// option -- not supported here).
    	function fill_window() {
    		let n, m;
    		let p;
    		let more; // Amount of free space at the end of the win.

    		do {
    			more = (window_size - lookahead - strstart);

    			// Deal with !@#$% 64K limit:
    			if (more === 0 && strstart === 0 && lookahead === 0) {
    				more = w_size;
    			} else if (more == -1) {
    				// Very unlikely, but possible on 16 bit machine if strstart ==
    				// 0
    				// and lookahead == 1 (input done one byte at time)
    				more--;

    				// If the win is almost full and there is insufficient
    				// lookahead,
    				// move the upper half to the lower one to make room in the
    				// upper half.
    			} else if (strstart >= w_size + w_size - MIN_LOOKAHEAD) {
    				win.set(win.subarray(w_size, w_size + w_size), 0);

    				match_start -= w_size;
    				strstart -= w_size; // we now have strstart >= MAX_DIST
    				block_start -= w_size;

    				// Slide the hash table (could be avoided with 32 bit values
    				// at the expense of memory usage). We slide even when level ==
    				// 0
    				// to keep the hash table consistent if we switch back to level
    				// > 0
    				// later. (Using level 0 permanently is not an optimal usage of
    				// zlib, so we don't care about this pathological case.)

    				n = hash_size;
    				p = n;
    				do {
    					m = (head[--p] & 0xffff);
    					head[p] = (m >= w_size ? m - w_size : 0);
    				} while (--n !== 0);

    				n = w_size;
    				p = n;
    				do {
    					m = (prev[--p] & 0xffff);
    					prev[p] = (m >= w_size ? m - w_size : 0);
    					// If n is not on any hash chain, prev[n] is garbage but
    					// its value will never be used.
    				} while (--n !== 0);
    				more += w_size;
    			}

    			if (strm.avail_in === 0)
    				return;

    			// If there was no sliding:
    			// strstart <= WSIZE+MAX_DIST-1 && lookahead <= MIN_LOOKAHEAD - 1 &&
    			// more == window_size - lookahead - strstart
    			// => more >= window_size - (MIN_LOOKAHEAD-1 + WSIZE + MAX_DIST-1)
    			// => more >= window_size - 2*WSIZE + 2
    			// In the BIG_MEM or MMAP case (not yet supported),
    			// window_size == input_size + MIN_LOOKAHEAD &&
    			// strstart + s->lookahead <= input_size => more >= MIN_LOOKAHEAD.
    			// Otherwise, window_size == 2*WSIZE so more >= 2.
    			// If there was sliding, more >= WSIZE. So in all cases, more >= 2.

    			n = strm.read_buf(win, strstart + lookahead, more);
    			lookahead += n;

    			// Initialize the hash value now that we have some input:
    			if (lookahead >= MIN_MATCH) {
    				ins_h = win[strstart] & 0xff;
    				ins_h = (((ins_h) << hash_shift) ^ (win[strstart + 1] & 0xff)) & hash_mask;
    			}
    			// If the whole input has less than MIN_MATCH bytes, ins_h is
    			// garbage,
    			// but this is not important since only literal bytes will be
    			// emitted.
    		} while (lookahead < MIN_LOOKAHEAD && strm.avail_in !== 0);
    	}

    	// Copy without compression as much as possible from the input stream,
    	// return
    	// the current block state.
    	// This function does not insert new strings in the dictionary since
    	// uncompressible data is probably not useful. This function is used
    	// only for the level=0 compression option.
    	// NOTE: this function should be optimized to avoid extra copying from
    	// win to pending_buf.
    	function deflate_stored(flush) {
    		// Stored blocks are limited to 0xffff bytes, pending_buf is limited
    		// to pending_buf_size, and each stored block has a 5 byte header:

    		let max_block_size = 0xffff;
    		let max_start;

    		if (max_block_size > pending_buf_size - 5) {
    			max_block_size = pending_buf_size - 5;
    		}

    		// Copy as much as possible from input to output:
    		// eslint-disable-next-line no-constant-condition
    		while (true) {
    			// Fill the win as much as possible:
    			if (lookahead <= 1) {
    				fill_window();
    				if (lookahead === 0 && flush == Z_NO_FLUSH$1)
    					return NeedMore;
    				if (lookahead === 0)
    					break; // flush the current block
    			}

    			strstart += lookahead;
    			lookahead = 0;

    			// Emit a stored block if pending_buf will be full:
    			max_start = block_start + max_block_size;
    			if (strstart === 0 || strstart >= max_start) {
    				// strstart === 0 is possible when wraparound on 16-bit machine
    				lookahead = (strstart - max_start);
    				strstart = max_start;

    				flush_block_only(false);
    				if (strm.avail_out === 0)
    					return NeedMore;

    			}

    			// Flush if we may have to slide, otherwise block_start may become
    			// negative and the data will be gone:
    			if (strstart - block_start >= w_size - MIN_LOOKAHEAD) {
    				flush_block_only(false);
    				if (strm.avail_out === 0)
    					return NeedMore;
    			}
    		}

    		flush_block_only(flush == Z_FINISH$1);
    		if (strm.avail_out === 0)
    			return (flush == Z_FINISH$1) ? FinishStarted : NeedMore;

    		return flush == Z_FINISH$1 ? FinishDone : BlockDone;
    	}

    	function longest_match(cur_match) {
    		let chain_length = max_chain_length; // max hash chain length
    		let scan = strstart; // current string
    		let match; // matched string
    		let len; // length of current match
    		let best_len = prev_length; // best match length so far
    		const limit = strstart > (w_size - MIN_LOOKAHEAD) ? strstart - (w_size - MIN_LOOKAHEAD) : 0;
    		let _nice_match = nice_match;

    		// Stop when cur_match becomes <= limit. To simplify the code,
    		// we prevent matches with the string of win index 0.

    		const wmask = w_mask;

    		const strend = strstart + MAX_MATCH;
    		let scan_end1 = win[scan + best_len - 1];
    		let scan_end = win[scan + best_len];

    		// The code is optimized for HASH_BITS >= 8 and MAX_MATCH-2 multiple of
    		// 16.
    		// It is easy to get rid of this optimization if necessary.

    		// Do not waste too much time if we already have a good match:
    		if (prev_length >= good_match) {
    			chain_length >>= 2;
    		}

    		// Do not look for matches beyond the end of the input. This is
    		// necessary
    		// to make deflate deterministic.
    		if (_nice_match > lookahead)
    			_nice_match = lookahead;

    		do {
    			match = cur_match;

    			// Skip to next match if the match length cannot increase
    			// or if the match length is less than 2:
    			if (win[match + best_len] != scan_end || win[match + best_len - 1] != scan_end1 || win[match] != win[scan]
    				|| win[++match] != win[scan + 1])
    				continue;

    			// The check at best_len-1 can be removed because it will be made
    			// again later. (This heuristic is not always a win.)
    			// It is not necessary to compare scan[2] and match[2] since they
    			// are always equal when the other bytes match, given that
    			// the hash keys are equal and that HASH_BITS >= 8.
    			scan += 2;
    			match++;

    			// We check for insufficient lookahead only every 8th comparison;
    			// the 256th check will be made at strstart+258.
    			// eslint-disable-next-line no-empty
    			do {
    				// empty block
    			} while (win[++scan] == win[++match] && win[++scan] == win[++match] && win[++scan] == win[++match]
    			&& win[++scan] == win[++match] && win[++scan] == win[++match] && win[++scan] == win[++match]
    			&& win[++scan] == win[++match] && win[++scan] == win[++match] && scan < strend);

    			len = MAX_MATCH - (strend - scan);
    			scan = strend - MAX_MATCH;

    			if (len > best_len) {
    				match_start = cur_match;
    				best_len = len;
    				if (len >= _nice_match)
    					break;
    				scan_end1 = win[scan + best_len - 1];
    				scan_end = win[scan + best_len];
    			}

    		} while ((cur_match = (prev[cur_match & wmask] & 0xffff)) > limit && --chain_length !== 0);

    		if (best_len <= lookahead)
    			return best_len;
    		return lookahead;
    	}

    	// Compress as much as possible from the input stream, return the current
    	// block state.
    	// This function does not perform lazy evaluation of matches and inserts
    	// new strings in the dictionary only for unmatched strings or for short
    	// matches. It is used only for the fast compression options.
    	function deflate_fast(flush) {
    		// short hash_head = 0; // head of the hash chain
    		let hash_head = 0; // head of the hash chain
    		let bflush; // set if current block must be flushed

    		// eslint-disable-next-line no-constant-condition
    		while (true) {
    			// Make sure that we always have enough lookahead, except
    			// at the end of the input file. We need MAX_MATCH bytes
    			// for the next match, plus MIN_MATCH bytes to insert the
    			// string following the next match.
    			if (lookahead < MIN_LOOKAHEAD) {
    				fill_window();
    				if (lookahead < MIN_LOOKAHEAD && flush == Z_NO_FLUSH$1) {
    					return NeedMore;
    				}
    				if (lookahead === 0)
    					break; // flush the current block
    			}

    			// Insert the string win[strstart .. strstart+2] in the
    			// dictionary, and set hash_head to the head of the hash chain:
    			if (lookahead >= MIN_MATCH) {
    				ins_h = (((ins_h) << hash_shift) ^ (win[(strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;

    				// prev[strstart&w_mask]=hash_head=head[ins_h];
    				hash_head = (head[ins_h] & 0xffff);
    				prev[strstart & w_mask] = head[ins_h];
    				head[ins_h] = strstart;
    			}

    			// Find the longest match, discarding those <= prev_length.
    			// At this point we have always match_length < MIN_MATCH

    			if (hash_head !== 0 && ((strstart - hash_head) & 0xffff) <= w_size - MIN_LOOKAHEAD) {
    				// To simplify the code, we prevent matches with the string
    				// of win index 0 (in particular we have to avoid a match
    				// of the string with itself at the start of the input file).
    				if (strategy != Z_HUFFMAN_ONLY) {
    					match_length = longest_match(hash_head);
    				}
    				// longest_match() sets match_start
    			}
    			if (match_length >= MIN_MATCH) {
    				// check_match(strstart, match_start, match_length);

    				bflush = _tr_tally(strstart - match_start, match_length - MIN_MATCH);

    				lookahead -= match_length;

    				// Insert new strings in the hash table only if the match length
    				// is not too large. This saves time but degrades compression.
    				if (match_length <= max_lazy_match && lookahead >= MIN_MATCH) {
    					match_length--; // string at strstart already in hash table
    					do {
    						strstart++;

    						ins_h = ((ins_h << hash_shift) ^ (win[(strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;
    						// prev[strstart&w_mask]=hash_head=head[ins_h];
    						hash_head = (head[ins_h] & 0xffff);
    						prev[strstart & w_mask] = head[ins_h];
    						head[ins_h] = strstart;

    						// strstart never exceeds WSIZE-MAX_MATCH, so there are
    						// always MIN_MATCH bytes ahead.
    					} while (--match_length !== 0);
    					strstart++;
    				} else {
    					strstart += match_length;
    					match_length = 0;
    					ins_h = win[strstart] & 0xff;

    					ins_h = (((ins_h) << hash_shift) ^ (win[strstart + 1] & 0xff)) & hash_mask;
    					// If lookahead < MIN_MATCH, ins_h is garbage, but it does
    					// not
    					// matter since it will be recomputed at next deflate call.
    				}
    			} else {
    				// No match, output a literal byte

    				bflush = _tr_tally(0, win[strstart] & 0xff);
    				lookahead--;
    				strstart++;
    			}
    			if (bflush) {

    				flush_block_only(false);
    				if (strm.avail_out === 0)
    					return NeedMore;
    			}
    		}

    		flush_block_only(flush == Z_FINISH$1);
    		if (strm.avail_out === 0) {
    			if (flush == Z_FINISH$1)
    				return FinishStarted;
    			else
    				return NeedMore;
    		}
    		return flush == Z_FINISH$1 ? FinishDone : BlockDone;
    	}

    	// Same as above, but achieves better compression. We use a lazy
    	// evaluation for matches: a match is finally adopted only if there is
    	// no better match at the next win position.
    	function deflate_slow(flush) {
    		// short hash_head = 0; // head of hash chain
    		let hash_head = 0; // head of hash chain
    		let bflush; // set if current block must be flushed
    		let max_insert;

    		// Process the input block.
    		// eslint-disable-next-line no-constant-condition
    		while (true) {
    			// Make sure that we always have enough lookahead, except
    			// at the end of the input file. We need MAX_MATCH bytes
    			// for the next match, plus MIN_MATCH bytes to insert the
    			// string following the next match.

    			if (lookahead < MIN_LOOKAHEAD) {
    				fill_window();
    				if (lookahead < MIN_LOOKAHEAD && flush == Z_NO_FLUSH$1) {
    					return NeedMore;
    				}
    				if (lookahead === 0)
    					break; // flush the current block
    			}

    			// Insert the string win[strstart .. strstart+2] in the
    			// dictionary, and set hash_head to the head of the hash chain:

    			if (lookahead >= MIN_MATCH) {
    				ins_h = (((ins_h) << hash_shift) ^ (win[(strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;
    				// prev[strstart&w_mask]=hash_head=head[ins_h];
    				hash_head = (head[ins_h] & 0xffff);
    				prev[strstart & w_mask] = head[ins_h];
    				head[ins_h] = strstart;
    			}

    			// Find the longest match, discarding those <= prev_length.
    			prev_length = match_length;
    			prev_match = match_start;
    			match_length = MIN_MATCH - 1;

    			if (hash_head !== 0 && prev_length < max_lazy_match && ((strstart - hash_head) & 0xffff) <= w_size - MIN_LOOKAHEAD) {
    				// To simplify the code, we prevent matches with the string
    				// of win index 0 (in particular we have to avoid a match
    				// of the string with itself at the start of the input file).

    				if (strategy != Z_HUFFMAN_ONLY) {
    					match_length = longest_match(hash_head);
    				}
    				// longest_match() sets match_start

    				if (match_length <= 5 && (strategy == Z_FILTERED || (match_length == MIN_MATCH && strstart - match_start > 4096))) {

    					// If prev_match is also MIN_MATCH, match_start is garbage
    					// but we will ignore the current match anyway.
    					match_length = MIN_MATCH - 1;
    				}
    			}

    			// If there was a match at the previous step and the current
    			// match is not better, output the previous match:
    			if (prev_length >= MIN_MATCH && match_length <= prev_length) {
    				max_insert = strstart + lookahead - MIN_MATCH;
    				// Do not insert strings in hash table beyond this.

    				// check_match(strstart-1, prev_match, prev_length);

    				bflush = _tr_tally(strstart - 1 - prev_match, prev_length - MIN_MATCH);

    				// Insert in hash table all strings up to the end of the match.
    				// strstart-1 and strstart are already inserted. If there is not
    				// enough lookahead, the last two strings are not inserted in
    				// the hash table.
    				lookahead -= prev_length - 1;
    				prev_length -= 2;
    				do {
    					if (++strstart <= max_insert) {
    						ins_h = (((ins_h) << hash_shift) ^ (win[(strstart) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;
    						// prev[strstart&w_mask]=hash_head=head[ins_h];
    						hash_head = (head[ins_h] & 0xffff);
    						prev[strstart & w_mask] = head[ins_h];
    						head[ins_h] = strstart;
    					}
    				} while (--prev_length !== 0);
    				match_available = 0;
    				match_length = MIN_MATCH - 1;
    				strstart++;

    				if (bflush) {
    					flush_block_only(false);
    					if (strm.avail_out === 0)
    						return NeedMore;
    				}
    			} else if (match_available !== 0) {

    				// If there was no match at the previous position, output a
    				// single literal. If there was a match but the current match
    				// is longer, truncate the previous match to a single literal.

    				bflush = _tr_tally(0, win[strstart - 1] & 0xff);

    				if (bflush) {
    					flush_block_only(false);
    				}
    				strstart++;
    				lookahead--;
    				if (strm.avail_out === 0)
    					return NeedMore;
    			} else {
    				// There is no previous match to compare with, wait for
    				// the next step to decide.

    				match_available = 1;
    				strstart++;
    				lookahead--;
    			}
    		}

    		if (match_available !== 0) {
    			bflush = _tr_tally(0, win[strstart - 1] & 0xff);
    			match_available = 0;
    		}
    		flush_block_only(flush == Z_FINISH$1);

    		if (strm.avail_out === 0) {
    			if (flush == Z_FINISH$1)
    				return FinishStarted;
    			else
    				return NeedMore;
    		}

    		return flush == Z_FINISH$1 ? FinishDone : BlockDone;
    	}

    	function deflateReset(strm) {
    		strm.total_in = strm.total_out = 0;
    		strm.msg = null; //

    		that.pending = 0;
    		that.pending_out = 0;

    		status = BUSY_STATE;

    		last_flush = Z_NO_FLUSH$1;

    		tr_init();
    		lm_init();
    		return Z_OK$1;
    	}

    	that.deflateInit = function (strm, _level, bits, _method, memLevel, _strategy) {
    		if (!_method)
    			_method = Z_DEFLATED$1;
    		if (!memLevel)
    			memLevel = DEF_MEM_LEVEL;
    		if (!_strategy)
    			_strategy = Z_DEFAULT_STRATEGY;

    		// byte[] my_version=ZLIB_VERSION;

    		//
    		// if (!version || version[0] != my_version[0]
    		// || stream_size != sizeof(z_stream)) {
    		// return Z_VERSION_ERROR;
    		// }

    		strm.msg = null;

    		if (_level == Z_DEFAULT_COMPRESSION)
    			_level = 6;

    		if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || _method != Z_DEFLATED$1 || bits < 9 || bits > 15 || _level < 0 || _level > 9 || _strategy < 0
    			|| _strategy > Z_HUFFMAN_ONLY) {
    			return Z_STREAM_ERROR$1;
    		}

    		strm.dstate = that;

    		w_bits = bits;
    		w_size = 1 << w_bits;
    		w_mask = w_size - 1;

    		hash_bits = memLevel + 7;
    		hash_size = 1 << hash_bits;
    		hash_mask = hash_size - 1;
    		hash_shift = Math.floor((hash_bits + MIN_MATCH - 1) / MIN_MATCH);

    		win = new Uint8Array(w_size * 2);
    		prev = [];
    		head = [];

    		lit_bufsize = 1 << (memLevel + 6); // 16K elements by default

    		that.pending_buf = new Uint8Array(lit_bufsize * 4);
    		pending_buf_size = lit_bufsize * 4;

    		that.dist_buf = new Uint16Array(lit_bufsize);
    		that.lc_buf = new Uint8Array(lit_bufsize);

    		level = _level;

    		strategy = _strategy;

    		return deflateReset(strm);
    	};

    	that.deflateEnd = function () {
    		if (status != INIT_STATE && status != BUSY_STATE && status != FINISH_STATE) {
    			return Z_STREAM_ERROR$1;
    		}
    		// Deallocate in reverse order of allocations:
    		that.lc_buf = null;
    		that.dist_buf = null;
    		that.pending_buf = null;
    		head = null;
    		prev = null;
    		win = null;
    		// free
    		that.dstate = null;
    		return status == BUSY_STATE ? Z_DATA_ERROR$1 : Z_OK$1;
    	};

    	that.deflateParams = function (strm, _level, _strategy) {
    		let err = Z_OK$1;

    		if (_level == Z_DEFAULT_COMPRESSION) {
    			_level = 6;
    		}
    		if (_level < 0 || _level > 9 || _strategy < 0 || _strategy > Z_HUFFMAN_ONLY) {
    			return Z_STREAM_ERROR$1;
    		}

    		if (config_table[level].func != config_table[_level].func && strm.total_in !== 0) {
    			// Flush the last buffer:
    			err = strm.deflate(Z_PARTIAL_FLUSH);
    		}

    		if (level != _level) {
    			level = _level;
    			max_lazy_match = config_table[level].max_lazy;
    			good_match = config_table[level].good_length;
    			nice_match = config_table[level].nice_length;
    			max_chain_length = config_table[level].max_chain;
    		}
    		strategy = _strategy;
    		return err;
    	};

    	that.deflateSetDictionary = function (_strm, dictionary, dictLength) {
    		let length = dictLength;
    		let n, index = 0;

    		if (!dictionary || status != INIT_STATE)
    			return Z_STREAM_ERROR$1;

    		if (length < MIN_MATCH)
    			return Z_OK$1;
    		if (length > w_size - MIN_LOOKAHEAD) {
    			length = w_size - MIN_LOOKAHEAD;
    			index = dictLength - length; // use the tail of the dictionary
    		}
    		win.set(dictionary.subarray(index, index + length), 0);

    		strstart = length;
    		block_start = length;

    		// Insert all strings in the hash table (except for the last two bytes).
    		// s->lookahead stays null, so s->ins_h will be recomputed at the next
    		// call of fill_window.

    		ins_h = win[0] & 0xff;
    		ins_h = (((ins_h) << hash_shift) ^ (win[1] & 0xff)) & hash_mask;

    		for (n = 0; n <= length - MIN_MATCH; n++) {
    			ins_h = (((ins_h) << hash_shift) ^ (win[(n) + (MIN_MATCH - 1)] & 0xff)) & hash_mask;
    			prev[n & w_mask] = head[ins_h];
    			head[ins_h] = n;
    		}
    		return Z_OK$1;
    	};

    	that.deflate = function (_strm, flush) {
    		let i, header, level_flags, old_flush, bstate;

    		if (flush > Z_FINISH$1 || flush < 0) {
    			return Z_STREAM_ERROR$1;
    		}

    		if (!_strm.next_out || (!_strm.next_in && _strm.avail_in !== 0) || (status == FINISH_STATE && flush != Z_FINISH$1)) {
    			_strm.msg = z_errmsg[Z_NEED_DICT$1 - (Z_STREAM_ERROR$1)];
    			return Z_STREAM_ERROR$1;
    		}
    		if (_strm.avail_out === 0) {
    			_strm.msg = z_errmsg[Z_NEED_DICT$1 - (Z_BUF_ERROR$1)];
    			return Z_BUF_ERROR$1;
    		}

    		strm = _strm; // just in case
    		old_flush = last_flush;
    		last_flush = flush;

    		// Write the zlib header
    		if (status == INIT_STATE) {
    			header = (Z_DEFLATED$1 + ((w_bits - 8) << 4)) << 8;
    			level_flags = ((level - 1) & 0xff) >> 1;

    			if (level_flags > 3)
    				level_flags = 3;
    			header |= (level_flags << 6);
    			if (strstart !== 0)
    				header |= PRESET_DICT$1;
    			header += 31 - (header % 31);

    			status = BUSY_STATE;
    			putShortMSB(header);
    		}

    		// Flush as much pending output as possible
    		if (that.pending !== 0) {
    			strm.flush_pending();
    			if (strm.avail_out === 0) {
    				// console.log(" avail_out==0");
    				// Since avail_out is 0, deflate will be called again with
    				// more output space, but possibly with both pending and
    				// avail_in equal to zero. There won't be anything to do,
    				// but this is not an error situation so make sure we
    				// return OK instead of BUF_ERROR at next call of deflate:
    				last_flush = -1;
    				return Z_OK$1;
    			}

    			// Make sure there is something to do and avoid duplicate
    			// consecutive
    			// flushes. For repeated and useless calls with Z_FINISH, we keep
    			// returning Z_STREAM_END instead of Z_BUFF_ERROR.
    		} else if (strm.avail_in === 0 && flush <= old_flush && flush != Z_FINISH$1) {
    			strm.msg = z_errmsg[Z_NEED_DICT$1 - (Z_BUF_ERROR$1)];
    			return Z_BUF_ERROR$1;
    		}

    		// User must not provide more input after the first FINISH:
    		if (status == FINISH_STATE && strm.avail_in !== 0) {
    			_strm.msg = z_errmsg[Z_NEED_DICT$1 - (Z_BUF_ERROR$1)];
    			return Z_BUF_ERROR$1;
    		}

    		// Start a new block or continue the current one.
    		if (strm.avail_in !== 0 || lookahead !== 0 || (flush != Z_NO_FLUSH$1 && status != FINISH_STATE)) {
    			bstate = -1;
    			switch (config_table[level].func) {
    				case STORED$1:
    					bstate = deflate_stored(flush);
    					break;
    				case FAST:
    					bstate = deflate_fast(flush);
    					break;
    				case SLOW:
    					bstate = deflate_slow(flush);
    					break;
    			}

    			if (bstate == FinishStarted || bstate == FinishDone) {
    				status = FINISH_STATE;
    			}
    			if (bstate == NeedMore || bstate == FinishStarted) {
    				if (strm.avail_out === 0) {
    					last_flush = -1; // avoid BUF_ERROR next call, see above
    				}
    				return Z_OK$1;
    				// If flush != Z_NO_FLUSH && avail_out === 0, the next call
    				// of deflate should use the same flush parameter to make sure
    				// that the flush is complete. So we don't have to output an
    				// empty block here, this will be done at next call. This also
    				// ensures that for a very small output buffer, we emit at most
    				// one empty block.
    			}

    			if (bstate == BlockDone) {
    				if (flush == Z_PARTIAL_FLUSH) {
    					_tr_align();
    				} else { // FULL_FLUSH or SYNC_FLUSH
    					_tr_stored_block(0, 0, false);
    					// For a full flush, this empty block will be recognized
    					// as a special marker by inflate_sync().
    					if (flush == Z_FULL_FLUSH) {
    						// state.head[s.hash_size-1]=0;
    						for (i = 0; i < hash_size/*-1*/; i++)
    							// forget history
    							head[i] = 0;
    					}
    				}
    				strm.flush_pending();
    				if (strm.avail_out === 0) {
    					last_flush = -1; // avoid BUF_ERROR at next call, see above
    					return Z_OK$1;
    				}
    			}
    		}

    		if (flush != Z_FINISH$1)
    			return Z_OK$1;
    		return Z_STREAM_END$1;
    	};
    }

    // ZStream

    function ZStream$1() {
    	const that = this;
    	that.next_in_index = 0;
    	that.next_out_index = 0;
    	// that.next_in; // next input byte
    	that.avail_in = 0; // number of bytes available at next_in
    	that.total_in = 0; // total nb of input bytes read so far
    	// that.next_out; // next output byte should be put there
    	that.avail_out = 0; // remaining free space at next_out
    	that.total_out = 0; // total nb of bytes output so far
    	// that.msg;
    	// that.dstate;
    }

    ZStream$1.prototype = {
    	deflateInit(level, bits) {
    		const that = this;
    		that.dstate = new Deflate();
    		if (!bits)
    			bits = MAX_BITS$1;
    		return that.dstate.deflateInit(that, level, bits);
    	},

    	deflate(flush) {
    		const that = this;
    		if (!that.dstate) {
    			return Z_STREAM_ERROR$1;
    		}
    		return that.dstate.deflate(that, flush);
    	},

    	deflateEnd() {
    		const that = this;
    		if (!that.dstate)
    			return Z_STREAM_ERROR$1;
    		const ret = that.dstate.deflateEnd();
    		that.dstate = null;
    		return ret;
    	},

    	deflateParams(level, strategy) {
    		const that = this;
    		if (!that.dstate)
    			return Z_STREAM_ERROR$1;
    		return that.dstate.deflateParams(that, level, strategy);
    	},

    	deflateSetDictionary(dictionary, dictLength) {
    		const that = this;
    		if (!that.dstate)
    			return Z_STREAM_ERROR$1;
    		return that.dstate.deflateSetDictionary(that, dictionary, dictLength);
    	},

    	// Read a new buffer from the current input stream, update the
    	// total number of bytes read. All deflate() input goes through
    	// this function so some applications may wish to modify it to avoid
    	// allocating a large strm->next_in buffer and copying from it.
    	// (See also flush_pending()).
    	read_buf(buf, start, size) {
    		const that = this;
    		let len = that.avail_in;
    		if (len > size)
    			len = size;
    		if (len === 0)
    			return 0;
    		that.avail_in -= len;
    		buf.set(that.next_in.subarray(that.next_in_index, that.next_in_index + len), start);
    		that.next_in_index += len;
    		that.total_in += len;
    		return len;
    	},

    	// Flush as much pending output as possible. All deflate() output goes
    	// through this function so some applications may wish to modify it
    	// to avoid allocating a large strm->next_out buffer and copying into it.
    	// (See also read_buf()).
    	flush_pending() {
    		const that = this;
    		let len = that.dstate.pending;

    		if (len > that.avail_out)
    			len = that.avail_out;
    		if (len === 0)
    			return;

    		// if (that.dstate.pending_buf.length <= that.dstate.pending_out || that.next_out.length <= that.next_out_index
    		// || that.dstate.pending_buf.length < (that.dstate.pending_out + len) || that.next_out.length < (that.next_out_index +
    		// len)) {
    		// console.log(that.dstate.pending_buf.length + ", " + that.dstate.pending_out + ", " + that.next_out.length + ", " +
    		// that.next_out_index + ", " + len);
    		// console.log("avail_out=" + that.avail_out);
    		// }

    		that.next_out.set(that.dstate.pending_buf.subarray(that.dstate.pending_out, that.dstate.pending_out + len), that.next_out_index);

    		that.next_out_index += len;
    		that.dstate.pending_out += len;
    		that.total_out += len;
    		that.avail_out -= len;
    		that.dstate.pending -= len;
    		if (that.dstate.pending === 0) {
    			that.dstate.pending_out = 0;
    		}
    	}
    };

    // Deflate

    function ZipDeflate(options) {
    	const that = this;
    	const z = new ZStream$1();
    	const bufsize = getMaximumCompressedSize$1(options && options.chunkSize ? options.chunkSize : 64 * 1024);
    	const flush = Z_NO_FLUSH$1;
    	const buf = new Uint8Array(bufsize);
    	let level = options ? options.level : Z_DEFAULT_COMPRESSION;
    	if (typeof level == "undefined")
    		level = Z_DEFAULT_COMPRESSION;
    	z.deflateInit(level);
    	z.next_out = buf;

    	that.append = function (data, onprogress) {
    		let err, array, lastIndex = 0, bufferIndex = 0, bufferSize = 0;
    		const buffers = [];
    		if (!data.length)
    			return;
    		z.next_in_index = 0;
    		z.next_in = data;
    		z.avail_in = data.length;
    		do {
    			z.next_out_index = 0;
    			z.avail_out = bufsize;
    			err = z.deflate(flush);
    			if (err != Z_OK$1)
    				throw new Error("deflating: " + z.msg);
    			if (z.next_out_index)
    				if (z.next_out_index == bufsize)
    					buffers.push(new Uint8Array(buf));
    				else
    					buffers.push(buf.subarray(0, z.next_out_index));
    			bufferSize += z.next_out_index;
    			if (onprogress && z.next_in_index > 0 && z.next_in_index != lastIndex) {
    				onprogress(z.next_in_index);
    				lastIndex = z.next_in_index;
    			}
    		} while (z.avail_in > 0 || z.avail_out === 0);
    		if (buffers.length > 1) {
    			array = new Uint8Array(bufferSize);
    			buffers.forEach(function (chunk) {
    				array.set(chunk, bufferIndex);
    				bufferIndex += chunk.length;
    			});
    		} else {
    			array = buffers[0] ? new Uint8Array(buffers[0]) : new Uint8Array();
    		}
    		return array;
    	};
    	that.flush = function () {
    		let err, array, bufferIndex = 0, bufferSize = 0;
    		const buffers = [];
    		do {
    			z.next_out_index = 0;
    			z.avail_out = bufsize;
    			err = z.deflate(Z_FINISH$1);
    			if (err != Z_STREAM_END$1 && err != Z_OK$1)
    				throw new Error("deflating: " + z.msg);
    			if (bufsize - z.avail_out > 0)
    				buffers.push(buf.slice(0, z.next_out_index));
    			bufferSize += z.next_out_index;
    		} while (z.avail_in > 0 || z.avail_out === 0);
    		z.deflateEnd();
    		array = new Uint8Array(bufferSize);
    		buffers.forEach(function (chunk) {
    			array.set(chunk, bufferIndex);
    			bufferIndex += chunk.length;
    		});
    		return array;
    	};
    }

    function getMaximumCompressedSize$1(uncompressedSize) {
    	return uncompressedSize + (5 * (Math.floor(uncompressedSize / 16383) + 1));
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    /*
     * This program is based on JZlib 1.0.2 ymnk, JCraft,Inc.
     * JZlib is based on zlib-1.1.3, so all credit should go authors
     * Jean-loup Gailly(jloup@gzip.org) and Mark Adler(madler@alumni.caltech.edu)
     * and contributors of zlib.
     */

    // deno-lint-ignore-file no-this-alias prefer-const

    // Global

    const MAX_BITS = 15;

    const Z_OK = 0;
    const Z_STREAM_END = 1;
    const Z_NEED_DICT = 2;
    const Z_STREAM_ERROR = -2;
    const Z_DATA_ERROR = -3;
    const Z_MEM_ERROR = -4;
    const Z_BUF_ERROR = -5;

    const inflate_mask = [0x00000000, 0x00000001, 0x00000003, 0x00000007, 0x0000000f, 0x0000001f, 0x0000003f, 0x0000007f, 0x000000ff, 0x000001ff, 0x000003ff,
    	0x000007ff, 0x00000fff, 0x00001fff, 0x00003fff, 0x00007fff, 0x0000ffff];

    const MANY = 1440;

    // JZlib version : "1.0.2"
    const Z_NO_FLUSH = 0;
    const Z_FINISH = 4;

    // InfTree
    const fixed_bl = 9;
    const fixed_bd = 5;

    const fixed_tl = [96, 7, 256, 0, 8, 80, 0, 8, 16, 84, 8, 115, 82, 7, 31, 0, 8, 112, 0, 8, 48, 0, 9, 192, 80, 7, 10, 0, 8, 96, 0, 8, 32, 0, 9, 160, 0, 8, 0,
    	0, 8, 128, 0, 8, 64, 0, 9, 224, 80, 7, 6, 0, 8, 88, 0, 8, 24, 0, 9, 144, 83, 7, 59, 0, 8, 120, 0, 8, 56, 0, 9, 208, 81, 7, 17, 0, 8, 104, 0, 8, 40,
    	0, 9, 176, 0, 8, 8, 0, 8, 136, 0, 8, 72, 0, 9, 240, 80, 7, 4, 0, 8, 84, 0, 8, 20, 85, 8, 227, 83, 7, 43, 0, 8, 116, 0, 8, 52, 0, 9, 200, 81, 7, 13,
    	0, 8, 100, 0, 8, 36, 0, 9, 168, 0, 8, 4, 0, 8, 132, 0, 8, 68, 0, 9, 232, 80, 7, 8, 0, 8, 92, 0, 8, 28, 0, 9, 152, 84, 7, 83, 0, 8, 124, 0, 8, 60,
    	0, 9, 216, 82, 7, 23, 0, 8, 108, 0, 8, 44, 0, 9, 184, 0, 8, 12, 0, 8, 140, 0, 8, 76, 0, 9, 248, 80, 7, 3, 0, 8, 82, 0, 8, 18, 85, 8, 163, 83, 7,
    	35, 0, 8, 114, 0, 8, 50, 0, 9, 196, 81, 7, 11, 0, 8, 98, 0, 8, 34, 0, 9, 164, 0, 8, 2, 0, 8, 130, 0, 8, 66, 0, 9, 228, 80, 7, 7, 0, 8, 90, 0, 8,
    	26, 0, 9, 148, 84, 7, 67, 0, 8, 122, 0, 8, 58, 0, 9, 212, 82, 7, 19, 0, 8, 106, 0, 8, 42, 0, 9, 180, 0, 8, 10, 0, 8, 138, 0, 8, 74, 0, 9, 244, 80,
    	7, 5, 0, 8, 86, 0, 8, 22, 192, 8, 0, 83, 7, 51, 0, 8, 118, 0, 8, 54, 0, 9, 204, 81, 7, 15, 0, 8, 102, 0, 8, 38, 0, 9, 172, 0, 8, 6, 0, 8, 134, 0,
    	8, 70, 0, 9, 236, 80, 7, 9, 0, 8, 94, 0, 8, 30, 0, 9, 156, 84, 7, 99, 0, 8, 126, 0, 8, 62, 0, 9, 220, 82, 7, 27, 0, 8, 110, 0, 8, 46, 0, 9, 188, 0,
    	8, 14, 0, 8, 142, 0, 8, 78, 0, 9, 252, 96, 7, 256, 0, 8, 81, 0, 8, 17, 85, 8, 131, 82, 7, 31, 0, 8, 113, 0, 8, 49, 0, 9, 194, 80, 7, 10, 0, 8, 97,
    	0, 8, 33, 0, 9, 162, 0, 8, 1, 0, 8, 129, 0, 8, 65, 0, 9, 226, 80, 7, 6, 0, 8, 89, 0, 8, 25, 0, 9, 146, 83, 7, 59, 0, 8, 121, 0, 8, 57, 0, 9, 210,
    	81, 7, 17, 0, 8, 105, 0, 8, 41, 0, 9, 178, 0, 8, 9, 0, 8, 137, 0, 8, 73, 0, 9, 242, 80, 7, 4, 0, 8, 85, 0, 8, 21, 80, 8, 258, 83, 7, 43, 0, 8, 117,
    	0, 8, 53, 0, 9, 202, 81, 7, 13, 0, 8, 101, 0, 8, 37, 0, 9, 170, 0, 8, 5, 0, 8, 133, 0, 8, 69, 0, 9, 234, 80, 7, 8, 0, 8, 93, 0, 8, 29, 0, 9, 154,
    	84, 7, 83, 0, 8, 125, 0, 8, 61, 0, 9, 218, 82, 7, 23, 0, 8, 109, 0, 8, 45, 0, 9, 186, 0, 8, 13, 0, 8, 141, 0, 8, 77, 0, 9, 250, 80, 7, 3, 0, 8, 83,
    	0, 8, 19, 85, 8, 195, 83, 7, 35, 0, 8, 115, 0, 8, 51, 0, 9, 198, 81, 7, 11, 0, 8, 99, 0, 8, 35, 0, 9, 166, 0, 8, 3, 0, 8, 131, 0, 8, 67, 0, 9, 230,
    	80, 7, 7, 0, 8, 91, 0, 8, 27, 0, 9, 150, 84, 7, 67, 0, 8, 123, 0, 8, 59, 0, 9, 214, 82, 7, 19, 0, 8, 107, 0, 8, 43, 0, 9, 182, 0, 8, 11, 0, 8, 139,
    	0, 8, 75, 0, 9, 246, 80, 7, 5, 0, 8, 87, 0, 8, 23, 192, 8, 0, 83, 7, 51, 0, 8, 119, 0, 8, 55, 0, 9, 206, 81, 7, 15, 0, 8, 103, 0, 8, 39, 0, 9, 174,
    	0, 8, 7, 0, 8, 135, 0, 8, 71, 0, 9, 238, 80, 7, 9, 0, 8, 95, 0, 8, 31, 0, 9, 158, 84, 7, 99, 0, 8, 127, 0, 8, 63, 0, 9, 222, 82, 7, 27, 0, 8, 111,
    	0, 8, 47, 0, 9, 190, 0, 8, 15, 0, 8, 143, 0, 8, 79, 0, 9, 254, 96, 7, 256, 0, 8, 80, 0, 8, 16, 84, 8, 115, 82, 7, 31, 0, 8, 112, 0, 8, 48, 0, 9,
    	193, 80, 7, 10, 0, 8, 96, 0, 8, 32, 0, 9, 161, 0, 8, 0, 0, 8, 128, 0, 8, 64, 0, 9, 225, 80, 7, 6, 0, 8, 88, 0, 8, 24, 0, 9, 145, 83, 7, 59, 0, 8,
    	120, 0, 8, 56, 0, 9, 209, 81, 7, 17, 0, 8, 104, 0, 8, 40, 0, 9, 177, 0, 8, 8, 0, 8, 136, 0, 8, 72, 0, 9, 241, 80, 7, 4, 0, 8, 84, 0, 8, 20, 85, 8,
    	227, 83, 7, 43, 0, 8, 116, 0, 8, 52, 0, 9, 201, 81, 7, 13, 0, 8, 100, 0, 8, 36, 0, 9, 169, 0, 8, 4, 0, 8, 132, 0, 8, 68, 0, 9, 233, 80, 7, 8, 0, 8,
    	92, 0, 8, 28, 0, 9, 153, 84, 7, 83, 0, 8, 124, 0, 8, 60, 0, 9, 217, 82, 7, 23, 0, 8, 108, 0, 8, 44, 0, 9, 185, 0, 8, 12, 0, 8, 140, 0, 8, 76, 0, 9,
    	249, 80, 7, 3, 0, 8, 82, 0, 8, 18, 85, 8, 163, 83, 7, 35, 0, 8, 114, 0, 8, 50, 0, 9, 197, 81, 7, 11, 0, 8, 98, 0, 8, 34, 0, 9, 165, 0, 8, 2, 0, 8,
    	130, 0, 8, 66, 0, 9, 229, 80, 7, 7, 0, 8, 90, 0, 8, 26, 0, 9, 149, 84, 7, 67, 0, 8, 122, 0, 8, 58, 0, 9, 213, 82, 7, 19, 0, 8, 106, 0, 8, 42, 0, 9,
    	181, 0, 8, 10, 0, 8, 138, 0, 8, 74, 0, 9, 245, 80, 7, 5, 0, 8, 86, 0, 8, 22, 192, 8, 0, 83, 7, 51, 0, 8, 118, 0, 8, 54, 0, 9, 205, 81, 7, 15, 0, 8,
    	102, 0, 8, 38, 0, 9, 173, 0, 8, 6, 0, 8, 134, 0, 8, 70, 0, 9, 237, 80, 7, 9, 0, 8, 94, 0, 8, 30, 0, 9, 157, 84, 7, 99, 0, 8, 126, 0, 8, 62, 0, 9,
    	221, 82, 7, 27, 0, 8, 110, 0, 8, 46, 0, 9, 189, 0, 8, 14, 0, 8, 142, 0, 8, 78, 0, 9, 253, 96, 7, 256, 0, 8, 81, 0, 8, 17, 85, 8, 131, 82, 7, 31, 0,
    	8, 113, 0, 8, 49, 0, 9, 195, 80, 7, 10, 0, 8, 97, 0, 8, 33, 0, 9, 163, 0, 8, 1, 0, 8, 129, 0, 8, 65, 0, 9, 227, 80, 7, 6, 0, 8, 89, 0, 8, 25, 0, 9,
    	147, 83, 7, 59, 0, 8, 121, 0, 8, 57, 0, 9, 211, 81, 7, 17, 0, 8, 105, 0, 8, 41, 0, 9, 179, 0, 8, 9, 0, 8, 137, 0, 8, 73, 0, 9, 243, 80, 7, 4, 0, 8,
    	85, 0, 8, 21, 80, 8, 258, 83, 7, 43, 0, 8, 117, 0, 8, 53, 0, 9, 203, 81, 7, 13, 0, 8, 101, 0, 8, 37, 0, 9, 171, 0, 8, 5, 0, 8, 133, 0, 8, 69, 0, 9,
    	235, 80, 7, 8, 0, 8, 93, 0, 8, 29, 0, 9, 155, 84, 7, 83, 0, 8, 125, 0, 8, 61, 0, 9, 219, 82, 7, 23, 0, 8, 109, 0, 8, 45, 0, 9, 187, 0, 8, 13, 0, 8,
    	141, 0, 8, 77, 0, 9, 251, 80, 7, 3, 0, 8, 83, 0, 8, 19, 85, 8, 195, 83, 7, 35, 0, 8, 115, 0, 8, 51, 0, 9, 199, 81, 7, 11, 0, 8, 99, 0, 8, 35, 0, 9,
    	167, 0, 8, 3, 0, 8, 131, 0, 8, 67, 0, 9, 231, 80, 7, 7, 0, 8, 91, 0, 8, 27, 0, 9, 151, 84, 7, 67, 0, 8, 123, 0, 8, 59, 0, 9, 215, 82, 7, 19, 0, 8,
    	107, 0, 8, 43, 0, 9, 183, 0, 8, 11, 0, 8, 139, 0, 8, 75, 0, 9, 247, 80, 7, 5, 0, 8, 87, 0, 8, 23, 192, 8, 0, 83, 7, 51, 0, 8, 119, 0, 8, 55, 0, 9,
    	207, 81, 7, 15, 0, 8, 103, 0, 8, 39, 0, 9, 175, 0, 8, 7, 0, 8, 135, 0, 8, 71, 0, 9, 239, 80, 7, 9, 0, 8, 95, 0, 8, 31, 0, 9, 159, 84, 7, 99, 0, 8,
    	127, 0, 8, 63, 0, 9, 223, 82, 7, 27, 0, 8, 111, 0, 8, 47, 0, 9, 191, 0, 8, 15, 0, 8, 143, 0, 8, 79, 0, 9, 255];
    const fixed_td = [80, 5, 1, 87, 5, 257, 83, 5, 17, 91, 5, 4097, 81, 5, 5, 89, 5, 1025, 85, 5, 65, 93, 5, 16385, 80, 5, 3, 88, 5, 513, 84, 5, 33, 92, 5,
    	8193, 82, 5, 9, 90, 5, 2049, 86, 5, 129, 192, 5, 24577, 80, 5, 2, 87, 5, 385, 83, 5, 25, 91, 5, 6145, 81, 5, 7, 89, 5, 1537, 85, 5, 97, 93, 5,
    	24577, 80, 5, 4, 88, 5, 769, 84, 5, 49, 92, 5, 12289, 82, 5, 13, 90, 5, 3073, 86, 5, 193, 192, 5, 24577];

    // Tables for deflate from PKZIP's appnote.txt.
    const cplens = [ // Copy lengths for literal codes 257..285
    	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0];

    // see note #13 above about 258
    const cplext = [ // Extra bits for literal codes 257..285
    	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 112, 112 // 112==invalid
    ];

    const cpdist = [ // Copy offsets for distance codes 0..29
    	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];

    const cpdext = [ // Extra bits for distance codes
    	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

    // If BMAX needs to be larger than 16, then h and x[] should be uLong.
    const BMAX = 15; // maximum bit length of any code

    function InfTree() {
    	const that = this;

    	let hn; // hufts used in space
    	let v; // work area for huft_build
    	let c; // bit length count table
    	let r; // table entry for structure assignment
    	let u; // table stack
    	let x; // bit offsets, then code stack

    	function huft_build(b, // code lengths in bits (all assumed <=
    		// BMAX)
    		bindex, n, // number of codes (assumed <= 288)
    		s, // number of simple-valued codes (0..s-1)
    		d, // list of base values for non-simple codes
    		e, // list of extra bits for non-simple codes
    		t, // result: starting table
    		m, // maximum lookup bits, returns actual
    		hp,// space for trees
    		hn,// hufts used in space
    		v // working area: values in order of bit length
    	) {
    		// Given a list of code lengths and a maximum table size, make a set of
    		// tables to decode that set of codes. Return Z_OK on success,
    		// Z_BUF_ERROR
    		// if the given code set is incomplete (the tables are still built in
    		// this
    		// case), Z_DATA_ERROR if the input is invalid (an over-subscribed set
    		// of
    		// lengths), or Z_MEM_ERROR if not enough memory.

    		let a; // counter for codes of length k
    		let f; // i repeats in table every f entries
    		let g; // maximum code length
    		let h; // table level
    		let i; // counter, current code
    		let j; // counter
    		let k; // number of bits in current code
    		let l; // bits per table (returned in m)
    		let mask; // (1 << w) - 1, to avoid cc -O bug on HP
    		let p; // pointer into c[], b[], or v[]
    		let q; // points to current table
    		let w; // bits before this table == (l * h)
    		let xp; // pointer into x
    		let y; // number of dummy codes added
    		let z; // number of entries in current table

    		// Generate counts for each bit length

    		p = 0;
    		i = n;
    		do {
    			c[b[bindex + p]]++;
    			p++;
    			i--; // assume all entries <= BMAX
    		} while (i !== 0);

    		if (c[0] == n) { // null input--all zero length codes
    			t[0] = -1;
    			m[0] = 0;
    			return Z_OK;
    		}

    		// Find minimum and maximum length, bound *m by those
    		l = m[0];
    		for (j = 1; j <= BMAX; j++)
    			if (c[j] !== 0)
    				break;
    		k = j; // minimum code length
    		if (l < j) {
    			l = j;
    		}
    		for (i = BMAX; i !== 0; i--) {
    			if (c[i] !== 0)
    				break;
    		}
    		g = i; // maximum code length
    		if (l > i) {
    			l = i;
    		}
    		m[0] = l;

    		// Adjust last length count to fill out codes, if needed
    		for (y = 1 << j; j < i; j++, y <<= 1) {
    			if ((y -= c[j]) < 0) {
    				return Z_DATA_ERROR;
    			}
    		}
    		if ((y -= c[i]) < 0) {
    			return Z_DATA_ERROR;
    		}
    		c[i] += y;

    		// Generate starting offsets into the value table for each length
    		x[1] = j = 0;
    		p = 1;
    		xp = 2;
    		while (--i !== 0) { // note that i == g from above
    			x[xp] = (j += c[p]);
    			xp++;
    			p++;
    		}

    		// Make a table of values in order of bit lengths
    		i = 0;
    		p = 0;
    		do {
    			if ((j = b[bindex + p]) !== 0) {
    				v[x[j]++] = i;
    			}
    			p++;
    		} while (++i < n);
    		n = x[g]; // set n to length of v

    		// Generate the Huffman codes and for each, make the table entries
    		x[0] = i = 0; // first Huffman code is zero
    		p = 0; // grab values in bit order
    		h = -1; // no tables yet--level -1
    		w = -l; // bits decoded == (l * h)
    		u[0] = 0; // just to keep compilers happy
    		q = 0; // ditto
    		z = 0; // ditto

    		// go through the bit lengths (k already is bits in shortest code)
    		for (; k <= g; k++) {
    			a = c[k];
    			while (a-- !== 0) {
    				// here i is the Huffman code of length k bits for value *p
    				// make tables up to required level
    				while (k > w + l) {
    					h++;
    					w += l; // previous table always l bits
    					// compute minimum size table less than or equal to l bits
    					z = g - w;
    					z = (z > l) ? l : z; // table size upper limit
    					if ((f = 1 << (j = k - w)) > a + 1) { // try a k-w bit table
    						// too few codes for
    						// k-w bit table
    						f -= a + 1; // deduct codes from patterns left
    						xp = k;
    						if (j < z) {
    							while (++j < z) { // try smaller tables up to z bits
    								if ((f <<= 1) <= c[++xp])
    									break; // enough codes to use up j bits
    								f -= c[xp]; // else deduct codes from patterns
    							}
    						}
    					}
    					z = 1 << j; // table entries for j-bit table

    					// allocate new table
    					if (hn[0] + z > MANY) { // (note: doesn't matter for fixed)
    						return Z_DATA_ERROR; // overflow of MANY
    					}
    					u[h] = q = /* hp+ */hn[0]; // DEBUG
    					hn[0] += z;

    					// connect to last table, if there is one
    					if (h !== 0) {
    						x[h] = i; // save pattern for backing up
    						r[0] = /* (byte) */j; // bits in this table
    						r[1] = /* (byte) */l; // bits to dump before this table
    						j = i >>> (w - l);
    						r[2] = /* (int) */(q - u[h - 1] - j); // offset to this table
    						hp.set(r, (u[h - 1] + j) * 3);
    						// to
    						// last
    						// table
    					} else {
    						t[0] = q; // first table is returned result
    					}
    				}

    				// set up table entry in r
    				r[1] = /* (byte) */(k - w);
    				if (p >= n) {
    					r[0] = 128 + 64; // out of values--invalid code
    				} else if (v[p] < s) {
    					r[0] = /* (byte) */(v[p] < 256 ? 0 : 32 + 64); // 256 is
    					// end-of-block
    					r[2] = v[p++]; // simple code is just the value
    				} else {
    					r[0] = /* (byte) */(e[v[p] - s] + 16 + 64); // non-simple--look
    					// up in lists
    					r[2] = d[v[p++] - s];
    				}

    				// fill code-like entries with r
    				f = 1 << (k - w);
    				for (j = i >>> w; j < z; j += f) {
    					hp.set(r, (q + j) * 3);
    				}

    				// backwards increment the k-bit code i
    				for (j = 1 << (k - 1); (i & j) !== 0; j >>>= 1) {
    					i ^= j;
    				}
    				i ^= j;

    				// backup over finished tables
    				mask = (1 << w) - 1; // needed on HP, cc -O bug
    				while ((i & mask) != x[h]) {
    					h--; // don't need to update q
    					w -= l;
    					mask = (1 << w) - 1;
    				}
    			}
    		}
    		// Return Z_BUF_ERROR if we were given an incomplete table
    		return y !== 0 && g != 1 ? Z_BUF_ERROR : Z_OK;
    	}

    	function initWorkArea(vsize) {
    		let i;
    		if (!hn) {
    			hn = []; // []; //new Array(1);
    			v = []; // new Array(vsize);
    			c = new Int32Array(BMAX + 1); // new Array(BMAX + 1);
    			r = []; // new Array(3);
    			u = new Int32Array(BMAX); // new Array(BMAX);
    			x = new Int32Array(BMAX + 1); // new Array(BMAX + 1);
    		}
    		if (v.length < vsize) {
    			v = []; // new Array(vsize);
    		}
    		for (i = 0; i < vsize; i++) {
    			v[i] = 0;
    		}
    		for (i = 0; i < BMAX + 1; i++) {
    			c[i] = 0;
    		}
    		for (i = 0; i < 3; i++) {
    			r[i] = 0;
    		}
    		// for(int i=0; i<BMAX; i++){u[i]=0;}
    		u.set(c.subarray(0, BMAX), 0);
    		// for(int i=0; i<BMAX+1; i++){x[i]=0;}
    		x.set(c.subarray(0, BMAX + 1), 0);
    	}

    	that.inflate_trees_bits = function (c, // 19 code lengths
    		bb, // bits tree desired/actual depth
    		tb, // bits tree result
    		hp, // space for trees
    		z // for messages
    	) {
    		let result;
    		initWorkArea(19);
    		hn[0] = 0;
    		result = huft_build(c, 0, 19, 19, null, null, tb, bb, hp, hn, v);

    		if (result == Z_DATA_ERROR) {
    			z.msg = "oversubscribed dynamic bit lengths tree";
    		} else if (result == Z_BUF_ERROR || bb[0] === 0) {
    			z.msg = "incomplete dynamic bit lengths tree";
    			result = Z_DATA_ERROR;
    		}
    		return result;
    	};

    	that.inflate_trees_dynamic = function (nl, // number of literal/length codes
    		nd, // number of distance codes
    		c, // that many (total) code lengths
    		bl, // literal desired/actual bit depth
    		bd, // distance desired/actual bit depth
    		tl, // literal/length tree result
    		td, // distance tree result
    		hp, // space for trees
    		z // for messages
    	) {
    		let result;

    		// build literal/length tree
    		initWorkArea(288);
    		hn[0] = 0;
    		result = huft_build(c, 0, nl, 257, cplens, cplext, tl, bl, hp, hn, v);
    		if (result != Z_OK || bl[0] === 0) {
    			if (result == Z_DATA_ERROR) {
    				z.msg = "oversubscribed literal/length tree";
    			} else if (result != Z_MEM_ERROR) {
    				z.msg = "incomplete literal/length tree";
    				result = Z_DATA_ERROR;
    			}
    			return result;
    		}

    		// build distance tree
    		initWorkArea(288);
    		result = huft_build(c, nl, nd, 0, cpdist, cpdext, td, bd, hp, hn, v);

    		if (result != Z_OK || (bd[0] === 0 && nl > 257)) {
    			if (result == Z_DATA_ERROR) {
    				z.msg = "oversubscribed distance tree";
    			} else if (result == Z_BUF_ERROR) {
    				z.msg = "incomplete distance tree";
    				result = Z_DATA_ERROR;
    			} else if (result != Z_MEM_ERROR) {
    				z.msg = "empty distance tree with lengths";
    				result = Z_DATA_ERROR;
    			}
    			return result;
    		}

    		return Z_OK;
    	};

    }

    InfTree.inflate_trees_fixed = function (bl, // literal desired/actual bit depth
    	bd, // distance desired/actual bit depth
    	tl,// literal/length tree result
    	td// distance tree result
    ) {
    	bl[0] = fixed_bl;
    	bd[0] = fixed_bd;
    	tl[0] = fixed_tl;
    	td[0] = fixed_td;
    	return Z_OK;
    };

    // InfCodes

    // waiting for "i:"=input,
    // "o:"=output,
    // "x:"=nothing
    const START = 0; // x: set up for LEN
    const LEN = 1; // i: get length/literal/eob next
    const LENEXT = 2; // i: getting length extra (have base)
    const DIST = 3; // i: get distance next
    const DISTEXT = 4;// i: getting distance extra
    const COPY = 5; // o: copying bytes in win, waiting
    // for space
    const LIT = 6; // o: got literal, waiting for output
    // space
    const WASH = 7; // o: got eob, possibly still output
    // waiting
    const END = 8; // x: got eob and all data flushed
    const BADCODE = 9;// x: got error

    function InfCodes() {
    	const that = this;

    	let mode; // current inflate_codes mode

    	// mode dependent information
    	let len = 0;

    	let tree; // pointer into tree
    	let tree_index = 0;
    	let need = 0; // bits needed

    	let lit = 0;

    	// if EXT or COPY, where and how much
    	let get = 0; // bits to get for extra
    	let dist = 0; // distance back to copy from

    	let lbits = 0; // ltree bits decoded per branch
    	let dbits = 0; // dtree bits decoder per branch
    	let ltree; // literal/length/eob tree
    	let ltree_index = 0; // literal/length/eob tree
    	let dtree; // distance tree
    	let dtree_index = 0; // distance tree

    	// Called with number of bytes left to write in win at least 258
    	// (the maximum string length) and number of input bytes available
    	// at least ten. The ten bytes are six bytes for the longest length/
    	// distance pair plus four bytes for overloading the bit buffer.

    	function inflate_fast(bl, bd, tl, tl_index, td, td_index, s, z) {
    		let t; // temporary pointer
    		let tp; // temporary pointer
    		let tp_index; // temporary pointer
    		let e; // extra bits or operation
    		let b; // bit buffer
    		let k; // bits in bit buffer
    		let p; // input data pointer
    		let n; // bytes available there
    		let q; // output win write pointer
    		let m; // bytes to end of win or read pointer
    		let ml; // mask for literal/length tree
    		let md; // mask for distance tree
    		let c; // bytes to copy
    		let d; // distance back to copy from
    		let r; // copy source pointer

    		let tp_index_t_3; // (tp_index+t)*3

    		// load input, output, bit values
    		p = z.next_in_index;
    		n = z.avail_in;
    		b = s.bitb;
    		k = s.bitk;
    		q = s.write;
    		m = q < s.read ? s.read - q - 1 : s.end - q;

    		// initialize masks
    		ml = inflate_mask[bl];
    		md = inflate_mask[bd];

    		// do until not enough input or output space for fast loop
    		do { // assume called with m >= 258 && n >= 10
    			// get literal/length code
    			while (k < (20)) { // max bits for literal/length code
    				n--;
    				b |= (z.read_byte(p++) & 0xff) << k;
    				k += 8;
    			}

    			t = b & ml;
    			tp = tl;
    			tp_index = tl_index;
    			tp_index_t_3 = (tp_index + t) * 3;
    			if ((e = tp[tp_index_t_3]) === 0) {
    				b >>= (tp[tp_index_t_3 + 1]);
    				k -= (tp[tp_index_t_3 + 1]);

    				s.win[q++] = /* (byte) */tp[tp_index_t_3 + 2];
    				m--;
    				continue;
    			}
    			do {

    				b >>= (tp[tp_index_t_3 + 1]);
    				k -= (tp[tp_index_t_3 + 1]);

    				if ((e & 16) !== 0) {
    					e &= 15;
    					c = tp[tp_index_t_3 + 2] + (/* (int) */b & inflate_mask[e]);

    					b >>= e;
    					k -= e;

    					// decode distance base of block to copy
    					while (k < (15)) { // max bits for distance code
    						n--;
    						b |= (z.read_byte(p++) & 0xff) << k;
    						k += 8;
    					}

    					t = b & md;
    					tp = td;
    					tp_index = td_index;
    					tp_index_t_3 = (tp_index + t) * 3;
    					e = tp[tp_index_t_3];

    					do {

    						b >>= (tp[tp_index_t_3 + 1]);
    						k -= (tp[tp_index_t_3 + 1]);

    						if ((e & 16) !== 0) {
    							// get extra bits to add to distance base
    							e &= 15;
    							while (k < (e)) { // get extra bits (up to 13)
    								n--;
    								b |= (z.read_byte(p++) & 0xff) << k;
    								k += 8;
    							}

    							d = tp[tp_index_t_3 + 2] + (b & inflate_mask[e]);

    							b >>= (e);
    							k -= (e);

    							// do the copy
    							m -= c;
    							if (q >= d) { // offset before dest
    								// just copy
    								r = q - d;
    								if (q - r > 0 && 2 > (q - r)) {
    									s.win[q++] = s.win[r++]; // minimum
    									// count is
    									// three,
    									s.win[q++] = s.win[r++]; // so unroll
    									// loop a
    									// little
    									c -= 2;
    								} else {
    									s.win.set(s.win.subarray(r, r + 2), q);
    									q += 2;
    									r += 2;
    									c -= 2;
    								}
    							} else { // else offset after destination
    								r = q - d;
    								do {
    									r += s.end; // force pointer in win
    								} while (r < 0); // covers invalid distances
    								e = s.end - r;
    								if (c > e) { // if source crosses,
    									c -= e; // wrapped copy
    									if (q - r > 0 && e > (q - r)) {
    										do {
    											s.win[q++] = s.win[r++];
    										} while (--e !== 0);
    									} else {
    										s.win.set(s.win.subarray(r, r + e), q);
    										q += e;
    										r += e;
    										e = 0;
    									}
    									r = 0; // copy rest from start of win
    								}

    							}

    							// copy all or what's left
    							if (q - r > 0 && c > (q - r)) {
    								do {
    									s.win[q++] = s.win[r++];
    								} while (--c !== 0);
    							} else {
    								s.win.set(s.win.subarray(r, r + c), q);
    								q += c;
    								r += c;
    								c = 0;
    							}
    							break;
    						} else if ((e & 64) === 0) {
    							t += tp[tp_index_t_3 + 2];
    							t += (b & inflate_mask[e]);
    							tp_index_t_3 = (tp_index + t) * 3;
    							e = tp[tp_index_t_3];
    						} else {
    							z.msg = "invalid distance code";

    							c = z.avail_in - n;
    							c = (k >> 3) < c ? k >> 3 : c;
    							n += c;
    							p -= c;
    							k -= c << 3;

    							s.bitb = b;
    							s.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							s.write = q;

    							return Z_DATA_ERROR;
    						}
    						// eslint-disable-next-line no-constant-condition
    					} while (true);
    					break;
    				}

    				if ((e & 64) === 0) {
    					t += tp[tp_index_t_3 + 2];
    					t += (b & inflate_mask[e]);
    					tp_index_t_3 = (tp_index + t) * 3;
    					if ((e = tp[tp_index_t_3]) === 0) {

    						b >>= (tp[tp_index_t_3 + 1]);
    						k -= (tp[tp_index_t_3 + 1]);

    						s.win[q++] = /* (byte) */tp[tp_index_t_3 + 2];
    						m--;
    						break;
    					}
    				} else if ((e & 32) !== 0) {

    					c = z.avail_in - n;
    					c = (k >> 3) < c ? k >> 3 : c;
    					n += c;
    					p -= c;
    					k -= c << 3;

    					s.bitb = b;
    					s.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					s.write = q;

    					return Z_STREAM_END;
    				} else {
    					z.msg = "invalid literal/length code";

    					c = z.avail_in - n;
    					c = (k >> 3) < c ? k >> 3 : c;
    					n += c;
    					p -= c;
    					k -= c << 3;

    					s.bitb = b;
    					s.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					s.write = q;

    					return Z_DATA_ERROR;
    				}
    				// eslint-disable-next-line no-constant-condition
    			} while (true);
    		} while (m >= 258 && n >= 10);

    		// not enough input or output--restore pointers and return
    		c = z.avail_in - n;
    		c = (k >> 3) < c ? k >> 3 : c;
    		n += c;
    		p -= c;
    		k -= c << 3;

    		s.bitb = b;
    		s.bitk = k;
    		z.avail_in = n;
    		z.total_in += p - z.next_in_index;
    		z.next_in_index = p;
    		s.write = q;

    		return Z_OK;
    	}

    	that.init = function (bl, bd, tl, tl_index, td, td_index) {
    		mode = START;
    		lbits = /* (byte) */bl;
    		dbits = /* (byte) */bd;
    		ltree = tl;
    		ltree_index = tl_index;
    		dtree = td;
    		dtree_index = td_index;
    		tree = null;
    	};

    	that.proc = function (s, z, r) {
    		let j; // temporary storage
    		let tindex; // temporary pointer
    		let e; // extra bits or operation
    		let b = 0; // bit buffer
    		let k = 0; // bits in bit buffer
    		let p = 0; // input data pointer
    		let n; // bytes available there
    		let q; // output win write pointer
    		let m; // bytes to end of win or read pointer
    		let f; // pointer to copy strings from

    		// copy input/output information to locals (UPDATE macro restores)
    		p = z.next_in_index;
    		n = z.avail_in;
    		b = s.bitb;
    		k = s.bitk;
    		q = s.write;
    		m = q < s.read ? s.read - q - 1 : s.end - q;

    		// process input and output based on current state
    		// eslint-disable-next-line no-constant-condition
    		while (true) {
    			switch (mode) {
    				// waiting for "i:"=input, "o:"=output, "x:"=nothing
    				case START: // x: set up for LEN
    					if (m >= 258 && n >= 10) {

    						s.bitb = b;
    						s.bitk = k;
    						z.avail_in = n;
    						z.total_in += p - z.next_in_index;
    						z.next_in_index = p;
    						s.write = q;
    						r = inflate_fast(lbits, dbits, ltree, ltree_index, dtree, dtree_index, s, z);

    						p = z.next_in_index;
    						n = z.avail_in;
    						b = s.bitb;
    						k = s.bitk;
    						q = s.write;
    						m = q < s.read ? s.read - q - 1 : s.end - q;

    						if (r != Z_OK) {
    							mode = r == Z_STREAM_END ? WASH : BADCODE;
    							break;
    						}
    					}
    					need = lbits;
    					tree = ltree;
    					tree_index = ltree_index;

    					mode = LEN;
    				/* falls through */
    				case LEN: // i: get length/literal/eob next
    					j = need;

    					while (k < (j)) {
    						if (n !== 0)
    							r = Z_OK;
    						else {

    							s.bitb = b;
    							s.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							s.write = q;
    							return s.inflate_flush(z, r);
    						}
    						n--;
    						b |= (z.read_byte(p++) & 0xff) << k;
    						k += 8;
    					}

    					tindex = (tree_index + (b & inflate_mask[j])) * 3;

    					b >>>= (tree[tindex + 1]);
    					k -= (tree[tindex + 1]);

    					e = tree[tindex];

    					if (e === 0) { // literal
    						lit = tree[tindex + 2];
    						mode = LIT;
    						break;
    					}
    					if ((e & 16) !== 0) { // length
    						get = e & 15;
    						len = tree[tindex + 2];
    						mode = LENEXT;
    						break;
    					}
    					if ((e & 64) === 0) { // next table
    						need = e;
    						tree_index = tindex / 3 + tree[tindex + 2];
    						break;
    					}
    					if ((e & 32) !== 0) { // end of block
    						mode = WASH;
    						break;
    					}
    					mode = BADCODE; // invalid code
    					z.msg = "invalid literal/length code";
    					r = Z_DATA_ERROR;

    					s.bitb = b;
    					s.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					s.write = q;
    					return s.inflate_flush(z, r);

    				case LENEXT: // i: getting length extra (have base)
    					j = get;

    					while (k < (j)) {
    						if (n !== 0)
    							r = Z_OK;
    						else {

    							s.bitb = b;
    							s.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							s.write = q;
    							return s.inflate_flush(z, r);
    						}
    						n--;
    						b |= (z.read_byte(p++) & 0xff) << k;
    						k += 8;
    					}

    					len += (b & inflate_mask[j]);

    					b >>= j;
    					k -= j;

    					need = dbits;
    					tree = dtree;
    					tree_index = dtree_index;
    					mode = DIST;
    				/* falls through */
    				case DIST: // i: get distance next
    					j = need;

    					while (k < (j)) {
    						if (n !== 0)
    							r = Z_OK;
    						else {

    							s.bitb = b;
    							s.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							s.write = q;
    							return s.inflate_flush(z, r);
    						}
    						n--;
    						b |= (z.read_byte(p++) & 0xff) << k;
    						k += 8;
    					}

    					tindex = (tree_index + (b & inflate_mask[j])) * 3;

    					b >>= tree[tindex + 1];
    					k -= tree[tindex + 1];

    					e = (tree[tindex]);
    					if ((e & 16) !== 0) { // distance
    						get = e & 15;
    						dist = tree[tindex + 2];
    						mode = DISTEXT;
    						break;
    					}
    					if ((e & 64) === 0) { // next table
    						need = e;
    						tree_index = tindex / 3 + tree[tindex + 2];
    						break;
    					}
    					mode = BADCODE; // invalid code
    					z.msg = "invalid distance code";
    					r = Z_DATA_ERROR;

    					s.bitb = b;
    					s.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					s.write = q;
    					return s.inflate_flush(z, r);

    				case DISTEXT: // i: getting distance extra
    					j = get;

    					while (k < (j)) {
    						if (n !== 0)
    							r = Z_OK;
    						else {

    							s.bitb = b;
    							s.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							s.write = q;
    							return s.inflate_flush(z, r);
    						}
    						n--;
    						b |= (z.read_byte(p++) & 0xff) << k;
    						k += 8;
    					}

    					dist += (b & inflate_mask[j]);

    					b >>= j;
    					k -= j;

    					mode = COPY;
    				/* falls through */
    				case COPY: // o: copying bytes in win, waiting for space
    					f = q - dist;
    					while (f < 0) { // modulo win size-"while" instead
    						f += s.end; // of "if" handles invalid distances
    					}
    					while (len !== 0) {

    						if (m === 0) {
    							if (q == s.end && s.read !== 0) {
    								q = 0;
    								m = q < s.read ? s.read - q - 1 : s.end - q;
    							}
    							if (m === 0) {
    								s.write = q;
    								r = s.inflate_flush(z, r);
    								q = s.write;
    								m = q < s.read ? s.read - q - 1 : s.end - q;

    								if (q == s.end && s.read !== 0) {
    									q = 0;
    									m = q < s.read ? s.read - q - 1 : s.end - q;
    								}

    								if (m === 0) {
    									s.bitb = b;
    									s.bitk = k;
    									z.avail_in = n;
    									z.total_in += p - z.next_in_index;
    									z.next_in_index = p;
    									s.write = q;
    									return s.inflate_flush(z, r);
    								}
    							}
    						}

    						s.win[q++] = s.win[f++];
    						m--;

    						if (f == s.end)
    							f = 0;
    						len--;
    					}
    					mode = START;
    					break;
    				case LIT: // o: got literal, waiting for output space
    					if (m === 0) {
    						if (q == s.end && s.read !== 0) {
    							q = 0;
    							m = q < s.read ? s.read - q - 1 : s.end - q;
    						}
    						if (m === 0) {
    							s.write = q;
    							r = s.inflate_flush(z, r);
    							q = s.write;
    							m = q < s.read ? s.read - q - 1 : s.end - q;

    							if (q == s.end && s.read !== 0) {
    								q = 0;
    								m = q < s.read ? s.read - q - 1 : s.end - q;
    							}
    							if (m === 0) {
    								s.bitb = b;
    								s.bitk = k;
    								z.avail_in = n;
    								z.total_in += p - z.next_in_index;
    								z.next_in_index = p;
    								s.write = q;
    								return s.inflate_flush(z, r);
    							}
    						}
    					}
    					r = Z_OK;

    					s.win[q++] = /* (byte) */lit;
    					m--;

    					mode = START;
    					break;
    				case WASH: // o: got eob, possibly more output
    					if (k > 7) { // return unused byte, if any
    						k -= 8;
    						n++;
    						p--; // can always return one
    					}

    					s.write = q;
    					r = s.inflate_flush(z, r);
    					q = s.write;
    					m = q < s.read ? s.read - q - 1 : s.end - q;

    					if (s.read != s.write) {
    						s.bitb = b;
    						s.bitk = k;
    						z.avail_in = n;
    						z.total_in += p - z.next_in_index;
    						z.next_in_index = p;
    						s.write = q;
    						return s.inflate_flush(z, r);
    					}
    					mode = END;
    				/* falls through */
    				case END:
    					r = Z_STREAM_END;
    					s.bitb = b;
    					s.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					s.write = q;
    					return s.inflate_flush(z, r);

    				case BADCODE: // x: got error

    					r = Z_DATA_ERROR;

    					s.bitb = b;
    					s.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					s.write = q;
    					return s.inflate_flush(z, r);

    				default:
    					r = Z_STREAM_ERROR;

    					s.bitb = b;
    					s.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					s.write = q;
    					return s.inflate_flush(z, r);
    			}
    		}
    	};

    	that.free = function () {
    		// ZFREE(z, c);
    	};

    }

    // InfBlocks

    // Table for deflate from PKZIP's appnote.txt.
    const border = [ // Order of the bit length code lengths
    	16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

    const TYPE = 0; // get type bits (3, including end bit)
    const LENS = 1; // get lengths for stored
    const STORED = 2;// processing stored block
    const TABLE = 3; // get table lengths
    const BTREE = 4; // get bit lengths tree for a dynamic
    // block
    const DTREE = 5; // get length, distance trees for a
    // dynamic block
    const CODES = 6; // processing fixed or dynamic block
    const DRY = 7; // output remaining win bytes
    const DONELOCKS = 8; // finished last block, done
    const BADBLOCKS = 9; // ot a data error--stuck here

    function InfBlocks(z, w) {
    	const that = this;

    	let mode = TYPE; // current inflate_block mode

    	let left = 0; // if STORED, bytes left to copy

    	let table = 0; // table lengths (14 bits)
    	let index = 0; // index into blens (or border)
    	let blens; // bit lengths of codes
    	const bb = [0]; // bit length tree depth
    	const tb = [0]; // bit length decoding tree

    	const codes = new InfCodes(); // if CODES, current state

    	let last = 0; // true if this block is the last block

    	let hufts = new Int32Array(MANY * 3); // single malloc for tree space
    	const check = 0; // check on output
    	const inftree = new InfTree();

    	that.bitk = 0; // bits in bit buffer
    	that.bitb = 0; // bit buffer
    	that.win = new Uint8Array(w); // sliding win
    	that.end = w; // one byte after sliding win
    	that.read = 0; // win read pointer
    	that.write = 0; // win write pointer

    	that.reset = function (z, c) {
    		if (c)
    			c[0] = check;
    		// if (mode == BTREE || mode == DTREE) {
    		// }
    		if (mode == CODES) {
    			codes.free(z);
    		}
    		mode = TYPE;
    		that.bitk = 0;
    		that.bitb = 0;
    		that.read = that.write = 0;
    	};

    	that.reset(z, null);

    	// copy as much as possible from the sliding win to the output area
    	that.inflate_flush = function (z, r) {
    		let n;
    		let p;
    		let q;

    		// local copies of source and destination pointers
    		p = z.next_out_index;
    		q = that.read;

    		// compute number of bytes to copy as far as end of win
    		n = /* (int) */((q <= that.write ? that.write : that.end) - q);
    		if (n > z.avail_out)
    			n = z.avail_out;
    		if (n !== 0 && r == Z_BUF_ERROR)
    			r = Z_OK;

    		// update counters
    		z.avail_out -= n;
    		z.total_out += n;

    		// copy as far as end of win
    		z.next_out.set(that.win.subarray(q, q + n), p);
    		p += n;
    		q += n;

    		// see if more to copy at beginning of win
    		if (q == that.end) {
    			// wrap pointers
    			q = 0;
    			if (that.write == that.end)
    				that.write = 0;

    			// compute bytes to copy
    			n = that.write - q;
    			if (n > z.avail_out)
    				n = z.avail_out;
    			if (n !== 0 && r == Z_BUF_ERROR)
    				r = Z_OK;

    			// update counters
    			z.avail_out -= n;
    			z.total_out += n;

    			// copy
    			z.next_out.set(that.win.subarray(q, q + n), p);
    			p += n;
    			q += n;
    		}

    		// update pointers
    		z.next_out_index = p;
    		that.read = q;

    		// done
    		return r;
    	};

    	that.proc = function (z, r) {
    		let t; // temporary storage
    		let b; // bit buffer
    		let k; // bits in bit buffer
    		let p; // input data pointer
    		let n; // bytes available there
    		let q; // output win write pointer
    		let m; // bytes to end of win or read pointer

    		let i;

    		// copy input/output information to locals (UPDATE macro restores)
    		// {
    		p = z.next_in_index;
    		n = z.avail_in;
    		b = that.bitb;
    		k = that.bitk;
    		// }
    		// {
    		q = that.write;
    		m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
    		// }

    		// process input based on current state
    		// DEBUG dtree
    		// eslint-disable-next-line no-constant-condition
    		while (true) {
    			let bl, bd, tl, td, bl_, bd_, tl_, td_;
    			switch (mode) {
    				case TYPE:

    					while (k < (3)) {
    						if (n !== 0) {
    							r = Z_OK;
    						} else {
    							that.bitb = b;
    							that.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							that.write = q;
    							return that.inflate_flush(z, r);
    						}
    						n--;
    						b |= (z.read_byte(p++) & 0xff) << k;
    						k += 8;
    					}
    					t = /* (int) */(b & 7);
    					last = t & 1;

    					switch (t >>> 1) {
    						case 0: // stored
    							// {
    							b >>>= (3);
    							k -= (3);
    							// }
    							t = k & 7; // go to byte boundary

    							// {
    							b >>>= (t);
    							k -= (t);
    							// }
    							mode = LENS; // get length of stored block
    							break;
    						case 1: // fixed
    							// {
    							bl = []; // new Array(1);
    							bd = []; // new Array(1);
    							tl = [[]]; // new Array(1);
    							td = [[]]; // new Array(1);

    							InfTree.inflate_trees_fixed(bl, bd, tl, td);
    							codes.init(bl[0], bd[0], tl[0], 0, td[0], 0);
    							// }

    							// {
    							b >>>= (3);
    							k -= (3);
    							// }

    							mode = CODES;
    							break;
    						case 2: // dynamic

    							// {
    							b >>>= (3);
    							k -= (3);
    							// }

    							mode = TABLE;
    							break;
    						case 3: // illegal

    							// {
    							b >>>= (3);
    							k -= (3);
    							// }
    							mode = BADBLOCKS;
    							z.msg = "invalid block type";
    							r = Z_DATA_ERROR;

    							that.bitb = b;
    							that.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							that.write = q;
    							return that.inflate_flush(z, r);
    					}
    					break;
    				case LENS:

    					while (k < (32)) {
    						if (n !== 0) {
    							r = Z_OK;
    						} else {
    							that.bitb = b;
    							that.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							that.write = q;
    							return that.inflate_flush(z, r);
    						}
    						n--;
    						b |= (z.read_byte(p++) & 0xff) << k;
    						k += 8;
    					}

    					if ((((~b) >>> 16) & 0xffff) != (b & 0xffff)) {
    						mode = BADBLOCKS;
    						z.msg = "invalid stored block lengths";
    						r = Z_DATA_ERROR;

    						that.bitb = b;
    						that.bitk = k;
    						z.avail_in = n;
    						z.total_in += p - z.next_in_index;
    						z.next_in_index = p;
    						that.write = q;
    						return that.inflate_flush(z, r);
    					}
    					left = (b & 0xffff);
    					b = k = 0; // dump bits
    					mode = left !== 0 ? STORED : (last !== 0 ? DRY : TYPE);
    					break;
    				case STORED:
    					if (n === 0) {
    						that.bitb = b;
    						that.bitk = k;
    						z.avail_in = n;
    						z.total_in += p - z.next_in_index;
    						z.next_in_index = p;
    						that.write = q;
    						return that.inflate_flush(z, r);
    					}

    					if (m === 0) {
    						if (q == that.end && that.read !== 0) {
    							q = 0;
    							m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
    						}
    						if (m === 0) {
    							that.write = q;
    							r = that.inflate_flush(z, r);
    							q = that.write;
    							m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
    							if (q == that.end && that.read !== 0) {
    								q = 0;
    								m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
    							}
    							if (m === 0) {
    								that.bitb = b;
    								that.bitk = k;
    								z.avail_in = n;
    								z.total_in += p - z.next_in_index;
    								z.next_in_index = p;
    								that.write = q;
    								return that.inflate_flush(z, r);
    							}
    						}
    					}
    					r = Z_OK;

    					t = left;
    					if (t > n)
    						t = n;
    					if (t > m)
    						t = m;
    					that.win.set(z.read_buf(p, t), q);
    					p += t;
    					n -= t;
    					q += t;
    					m -= t;
    					if ((left -= t) !== 0)
    						break;
    					mode = last !== 0 ? DRY : TYPE;
    					break;
    				case TABLE:

    					while (k < (14)) {
    						if (n !== 0) {
    							r = Z_OK;
    						} else {
    							that.bitb = b;
    							that.bitk = k;
    							z.avail_in = n;
    							z.total_in += p - z.next_in_index;
    							z.next_in_index = p;
    							that.write = q;
    							return that.inflate_flush(z, r);
    						}

    						n--;
    						b |= (z.read_byte(p++) & 0xff) << k;
    						k += 8;
    					}

    					table = t = (b & 0x3fff);
    					if ((t & 0x1f) > 29 || ((t >> 5) & 0x1f) > 29) {
    						mode = BADBLOCKS;
    						z.msg = "too many length or distance symbols";
    						r = Z_DATA_ERROR;

    						that.bitb = b;
    						that.bitk = k;
    						z.avail_in = n;
    						z.total_in += p - z.next_in_index;
    						z.next_in_index = p;
    						that.write = q;
    						return that.inflate_flush(z, r);
    					}
    					t = 258 + (t & 0x1f) + ((t >> 5) & 0x1f);
    					if (!blens || blens.length < t) {
    						blens = []; // new Array(t);
    					} else {
    						for (i = 0; i < t; i++) {
    							blens[i] = 0;
    						}
    					}

    					// {
    					b >>>= (14);
    					k -= (14);
    					// }

    					index = 0;
    					mode = BTREE;
    				/* falls through */
    				case BTREE:
    					while (index < 4 + (table >>> 10)) {
    						while (k < (3)) {
    							if (n !== 0) {
    								r = Z_OK;
    							} else {
    								that.bitb = b;
    								that.bitk = k;
    								z.avail_in = n;
    								z.total_in += p - z.next_in_index;
    								z.next_in_index = p;
    								that.write = q;
    								return that.inflate_flush(z, r);
    							}
    							n--;
    							b |= (z.read_byte(p++) & 0xff) << k;
    							k += 8;
    						}

    						blens[border[index++]] = b & 7;

    						// {
    						b >>>= (3);
    						k -= (3);
    						// }
    					}

    					while (index < 19) {
    						blens[border[index++]] = 0;
    					}

    					bb[0] = 7;
    					t = inftree.inflate_trees_bits(blens, bb, tb, hufts, z);
    					if (t != Z_OK) {
    						r = t;
    						if (r == Z_DATA_ERROR) {
    							blens = null;
    							mode = BADBLOCKS;
    						}

    						that.bitb = b;
    						that.bitk = k;
    						z.avail_in = n;
    						z.total_in += p - z.next_in_index;
    						z.next_in_index = p;
    						that.write = q;
    						return that.inflate_flush(z, r);
    					}

    					index = 0;
    					mode = DTREE;
    				/* falls through */
    				case DTREE:
    					// eslint-disable-next-line no-constant-condition
    					while (true) {
    						t = table;
    						if (index >= 258 + (t & 0x1f) + ((t >> 5) & 0x1f)) {
    							break;
    						}

    						let j, c;

    						t = bb[0];

    						while (k < (t)) {
    							if (n !== 0) {
    								r = Z_OK;
    							} else {
    								that.bitb = b;
    								that.bitk = k;
    								z.avail_in = n;
    								z.total_in += p - z.next_in_index;
    								z.next_in_index = p;
    								that.write = q;
    								return that.inflate_flush(z, r);
    							}
    							n--;
    							b |= (z.read_byte(p++) & 0xff) << k;
    							k += 8;
    						}

    						// if (tb[0] == -1) {
    						// System.err.println("null...");
    						// }

    						t = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 1];
    						c = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 2];

    						if (c < 16) {
    							b >>>= (t);
    							k -= (t);
    							blens[index++] = c;
    						} else { // c == 16..18
    							i = c == 18 ? 7 : c - 14;
    							j = c == 18 ? 11 : 3;

    							while (k < (t + i)) {
    								if (n !== 0) {
    									r = Z_OK;
    								} else {
    									that.bitb = b;
    									that.bitk = k;
    									z.avail_in = n;
    									z.total_in += p - z.next_in_index;
    									z.next_in_index = p;
    									that.write = q;
    									return that.inflate_flush(z, r);
    								}
    								n--;
    								b |= (z.read_byte(p++) & 0xff) << k;
    								k += 8;
    							}

    							b >>>= (t);
    							k -= (t);

    							j += (b & inflate_mask[i]);

    							b >>>= (i);
    							k -= (i);

    							i = index;
    							t = table;
    							if (i + j > 258 + (t & 0x1f) + ((t >> 5) & 0x1f) || (c == 16 && i < 1)) {
    								blens = null;
    								mode = BADBLOCKS;
    								z.msg = "invalid bit length repeat";
    								r = Z_DATA_ERROR;

    								that.bitb = b;
    								that.bitk = k;
    								z.avail_in = n;
    								z.total_in += p - z.next_in_index;
    								z.next_in_index = p;
    								that.write = q;
    								return that.inflate_flush(z, r);
    							}

    							c = c == 16 ? blens[i - 1] : 0;
    							do {
    								blens[i++] = c;
    							} while (--j !== 0);
    							index = i;
    						}
    					}

    					tb[0] = -1;
    					// {
    					bl_ = []; // new Array(1);
    					bd_ = []; // new Array(1);
    					tl_ = []; // new Array(1);
    					td_ = []; // new Array(1);
    					bl_[0] = 9; // must be <= 9 for lookahead assumptions
    					bd_[0] = 6; // must be <= 9 for lookahead assumptions

    					t = table;
    					t = inftree.inflate_trees_dynamic(257 + (t & 0x1f), 1 + ((t >> 5) & 0x1f), blens, bl_, bd_, tl_, td_, hufts, z);

    					if (t != Z_OK) {
    						if (t == Z_DATA_ERROR) {
    							blens = null;
    							mode = BADBLOCKS;
    						}
    						r = t;

    						that.bitb = b;
    						that.bitk = k;
    						z.avail_in = n;
    						z.total_in += p - z.next_in_index;
    						z.next_in_index = p;
    						that.write = q;
    						return that.inflate_flush(z, r);
    					}
    					codes.init(bl_[0], bd_[0], hufts, tl_[0], hufts, td_[0]);
    					// }
    					mode = CODES;
    				/* falls through */
    				case CODES:
    					that.bitb = b;
    					that.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					that.write = q;

    					if ((r = codes.proc(that, z, r)) != Z_STREAM_END) {
    						return that.inflate_flush(z, r);
    					}
    					r = Z_OK;
    					codes.free(z);

    					p = z.next_in_index;
    					n = z.avail_in;
    					b = that.bitb;
    					k = that.bitk;
    					q = that.write;
    					m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);

    					if (last === 0) {
    						mode = TYPE;
    						break;
    					}
    					mode = DRY;
    				/* falls through */
    				case DRY:
    					that.write = q;
    					r = that.inflate_flush(z, r);
    					q = that.write;
    					m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
    					if (that.read != that.write) {
    						that.bitb = b;
    						that.bitk = k;
    						z.avail_in = n;
    						z.total_in += p - z.next_in_index;
    						z.next_in_index = p;
    						that.write = q;
    						return that.inflate_flush(z, r);
    					}
    					mode = DONELOCKS;
    				/* falls through */
    				case DONELOCKS:
    					r = Z_STREAM_END;

    					that.bitb = b;
    					that.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					that.write = q;
    					return that.inflate_flush(z, r);
    				case BADBLOCKS:
    					r = Z_DATA_ERROR;

    					that.bitb = b;
    					that.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					that.write = q;
    					return that.inflate_flush(z, r);

    				default:
    					r = Z_STREAM_ERROR;

    					that.bitb = b;
    					that.bitk = k;
    					z.avail_in = n;
    					z.total_in += p - z.next_in_index;
    					z.next_in_index = p;
    					that.write = q;
    					return that.inflate_flush(z, r);
    			}
    		}
    	};

    	that.free = function (z) {
    		that.reset(z, null);
    		that.win = null;
    		hufts = null;
    		// ZFREE(z, s);
    	};

    	that.set_dictionary = function (d, start, n) {
    		that.win.set(d.subarray(start, start + n), 0);
    		that.read = that.write = n;
    	};

    	// Returns true if inflate is currently at the end of a block generated
    	// by Z_SYNC_FLUSH or Z_FULL_FLUSH.
    	that.sync_point = function () {
    		return mode == LENS ? 1 : 0;
    	};

    }

    // Inflate

    // preset dictionary flag in zlib header
    const PRESET_DICT = 0x20;

    const Z_DEFLATED = 8;

    const METHOD = 0; // waiting for method byte
    const FLAG = 1; // waiting for flag byte
    const DICT4 = 2; // four dictionary check bytes to go
    const DICT3 = 3; // three dictionary check bytes to go
    const DICT2 = 4; // two dictionary check bytes to go
    const DICT1 = 5; // one dictionary check byte to go
    const DICT0 = 6; // waiting for inflateSetDictionary
    const BLOCKS = 7; // decompressing blocks
    const DONE = 12; // finished check, done
    const BAD = 13; // got an error--stay here

    const mark = [0, 0, 0xff, 0xff];

    function Inflate() {
    	const that = this;

    	that.mode = 0; // current inflate mode

    	// mode dependent information
    	that.method = 0; // if FLAGS, method byte

    	// if CHECK, check values to compare
    	that.was = [0]; // new Array(1); // computed check value
    	that.need = 0; // stream check value

    	// if BAD, inflateSync's marker bytes count
    	that.marker = 0;

    	// mode independent information
    	that.wbits = 0; // log2(win size) (8..15, defaults to 15)

    	// this.blocks; // current inflate_blocks state

    	function inflateReset(z) {
    		if (!z || !z.istate)
    			return Z_STREAM_ERROR;

    		z.total_in = z.total_out = 0;
    		z.msg = null;
    		z.istate.mode = BLOCKS;
    		z.istate.blocks.reset(z, null);
    		return Z_OK;
    	}

    	that.inflateEnd = function (z) {
    		if (that.blocks)
    			that.blocks.free(z);
    		that.blocks = null;
    		// ZFREE(z, z->state);
    		return Z_OK;
    	};

    	that.inflateInit = function (z, w) {
    		z.msg = null;
    		that.blocks = null;

    		// set win size
    		if (w < 8 || w > 15) {
    			that.inflateEnd(z);
    			return Z_STREAM_ERROR;
    		}
    		that.wbits = w;

    		z.istate.blocks = new InfBlocks(z, 1 << w);

    		// reset state
    		inflateReset(z);
    		return Z_OK;
    	};

    	that.inflate = function (z, f) {
    		let r;
    		let b;

    		if (!z || !z.istate || !z.next_in)
    			return Z_STREAM_ERROR;
    		const istate = z.istate;
    		f = f == Z_FINISH ? Z_BUF_ERROR : Z_OK;
    		r = Z_BUF_ERROR;
    		// eslint-disable-next-line no-constant-condition
    		while (true) {
    			switch (istate.mode) {
    				case METHOD:

    					if (z.avail_in === 0)
    						return r;
    					r = f;

    					z.avail_in--;
    					z.total_in++;
    					if (((istate.method = z.read_byte(z.next_in_index++)) & 0xf) != Z_DEFLATED) {
    						istate.mode = BAD;
    						z.msg = "unknown compression method";
    						istate.marker = 5; // can't try inflateSync
    						break;
    					}
    					if ((istate.method >> 4) + 8 > istate.wbits) {
    						istate.mode = BAD;
    						z.msg = "invalid win size";
    						istate.marker = 5; // can't try inflateSync
    						break;
    					}
    					istate.mode = FLAG;
    				/* falls through */
    				case FLAG:

    					if (z.avail_in === 0)
    						return r;
    					r = f;

    					z.avail_in--;
    					z.total_in++;
    					b = (z.read_byte(z.next_in_index++)) & 0xff;

    					if ((((istate.method << 8) + b) % 31) !== 0) {
    						istate.mode = BAD;
    						z.msg = "incorrect header check";
    						istate.marker = 5; // can't try inflateSync
    						break;
    					}

    					if ((b & PRESET_DICT) === 0) {
    						istate.mode = BLOCKS;
    						break;
    					}
    					istate.mode = DICT4;
    				/* falls through */
    				case DICT4:

    					if (z.avail_in === 0)
    						return r;
    					r = f;

    					z.avail_in--;
    					z.total_in++;
    					istate.need = ((z.read_byte(z.next_in_index++) & 0xff) << 24) & 0xff000000;
    					istate.mode = DICT3;
    				/* falls through */
    				case DICT3:

    					if (z.avail_in === 0)
    						return r;
    					r = f;

    					z.avail_in--;
    					z.total_in++;
    					istate.need += ((z.read_byte(z.next_in_index++) & 0xff) << 16) & 0xff0000;
    					istate.mode = DICT2;
    				/* falls through */
    				case DICT2:

    					if (z.avail_in === 0)
    						return r;
    					r = f;

    					z.avail_in--;
    					z.total_in++;
    					istate.need += ((z.read_byte(z.next_in_index++) & 0xff) << 8) & 0xff00;
    					istate.mode = DICT1;
    				/* falls through */
    				case DICT1:

    					if (z.avail_in === 0)
    						return r;
    					r = f;

    					z.avail_in--;
    					z.total_in++;
    					istate.need += (z.read_byte(z.next_in_index++) & 0xff);
    					istate.mode = DICT0;
    					return Z_NEED_DICT;
    				case DICT0:
    					istate.mode = BAD;
    					z.msg = "need dictionary";
    					istate.marker = 0; // can try inflateSync
    					return Z_STREAM_ERROR;
    				case BLOCKS:

    					r = istate.blocks.proc(z, r);
    					if (r == Z_DATA_ERROR) {
    						istate.mode = BAD;
    						istate.marker = 0; // can try inflateSync
    						break;
    					}
    					if (r == Z_OK) {
    						r = f;
    					}
    					if (r != Z_STREAM_END) {
    						return r;
    					}
    					r = f;
    					istate.blocks.reset(z, istate.was);
    					istate.mode = DONE;
    				/* falls through */
    				case DONE:
    					z.avail_in = 0;
    					return Z_STREAM_END;
    				case BAD:
    					return Z_DATA_ERROR;
    				default:
    					return Z_STREAM_ERROR;
    			}
    		}
    	};

    	that.inflateSetDictionary = function (z, dictionary, dictLength) {
    		let index = 0, length = dictLength;
    		if (!z || !z.istate || z.istate.mode != DICT0)
    			return Z_STREAM_ERROR;
    		const istate = z.istate;
    		if (length >= (1 << istate.wbits)) {
    			length = (1 << istate.wbits) - 1;
    			index = dictLength - length;
    		}
    		istate.blocks.set_dictionary(dictionary, index, length);
    		istate.mode = BLOCKS;
    		return Z_OK;
    	};

    	that.inflateSync = function (z) {
    		let n; // number of bytes to look at
    		let p; // pointer to bytes
    		let m; // number of marker bytes found in a row
    		let r, w; // temporaries to save total_in and total_out

    		// set up
    		if (!z || !z.istate)
    			return Z_STREAM_ERROR;
    		const istate = z.istate;
    		if (istate.mode != BAD) {
    			istate.mode = BAD;
    			istate.marker = 0;
    		}
    		if ((n = z.avail_in) === 0)
    			return Z_BUF_ERROR;
    		p = z.next_in_index;
    		m = istate.marker;

    		// search
    		while (n !== 0 && m < 4) {
    			if (z.read_byte(p) == mark[m]) {
    				m++;
    			} else if (z.read_byte(p) !== 0) {
    				m = 0;
    			} else {
    				m = 4 - m;
    			}
    			p++;
    			n--;
    		}

    		// restore
    		z.total_in += p - z.next_in_index;
    		z.next_in_index = p;
    		z.avail_in = n;
    		istate.marker = m;

    		// return no joy or set up to restart on a new block
    		if (m != 4) {
    			return Z_DATA_ERROR;
    		}
    		r = z.total_in;
    		w = z.total_out;
    		inflateReset(z);
    		z.total_in = r;
    		z.total_out = w;
    		istate.mode = BLOCKS;
    		return Z_OK;
    	};

    	// Returns true if inflate is currently at the end of a block generated
    	// by Z_SYNC_FLUSH or Z_FULL_FLUSH. This function is used by one PPP
    	// implementation to provide an additional safety check. PPP uses
    	// Z_SYNC_FLUSH
    	// but removes the length bytes of the resulting empty stored block. When
    	// decompressing, PPP checks that at the end of input packet, inflate is
    	// waiting for these length bytes.
    	that.inflateSyncPoint = function (z) {
    		if (!z || !z.istate || !z.istate.blocks)
    			return Z_STREAM_ERROR;
    		return z.istate.blocks.sync_point();
    	};
    }

    // ZStream

    function ZStream() {
    }

    ZStream.prototype = {
    	inflateInit(bits) {
    		const that = this;
    		that.istate = new Inflate();
    		if (!bits)
    			bits = MAX_BITS;
    		return that.istate.inflateInit(that, bits);
    	},

    	inflate(f) {
    		const that = this;
    		if (!that.istate)
    			return Z_STREAM_ERROR;
    		return that.istate.inflate(that, f);
    	},

    	inflateEnd() {
    		const that = this;
    		if (!that.istate)
    			return Z_STREAM_ERROR;
    		const ret = that.istate.inflateEnd(that);
    		that.istate = null;
    		return ret;
    	},

    	inflateSync() {
    		const that = this;
    		if (!that.istate)
    			return Z_STREAM_ERROR;
    		return that.istate.inflateSync(that);
    	},
    	inflateSetDictionary(dictionary, dictLength) {
    		const that = this;
    		if (!that.istate)
    			return Z_STREAM_ERROR;
    		return that.istate.inflateSetDictionary(that, dictionary, dictLength);
    	},
    	read_byte(start) {
    		const that = this;
    		return that.next_in[start];
    	},
    	read_buf(start, size) {
    		const that = this;
    		return that.next_in.subarray(start, start + size);
    	}
    };

    // Inflater

    function ZipInflate(options) {
    	const that = this;
    	const z = new ZStream();
    	const bufsize = options && options.chunkSize ? Math.floor(options.chunkSize * 2) : 128 * 1024;
    	const flush = Z_NO_FLUSH;
    	const buf = new Uint8Array(bufsize);
    	let nomoreinput = false;

    	z.inflateInit();
    	z.next_out = buf;

    	that.append = function (data, onprogress) {
    		const buffers = [];
    		let err, array, lastIndex = 0, bufferIndex = 0, bufferSize = 0;
    		if (data.length === 0)
    			return;
    		z.next_in_index = 0;
    		z.next_in = data;
    		z.avail_in = data.length;
    		do {
    			z.next_out_index = 0;
    			z.avail_out = bufsize;
    			if ((z.avail_in === 0) && (!nomoreinput)) { // if buffer is empty and more input is available, refill it
    				z.next_in_index = 0;
    				nomoreinput = true;
    			}
    			err = z.inflate(flush);
    			if (nomoreinput && (err === Z_BUF_ERROR)) {
    				if (z.avail_in !== 0)
    					throw new Error("inflating: bad input");
    			} else if (err !== Z_OK && err !== Z_STREAM_END)
    				throw new Error("inflating: " + z.msg);
    			if ((nomoreinput || err === Z_STREAM_END) && (z.avail_in === data.length))
    				throw new Error("inflating: bad input");
    			if (z.next_out_index)
    				if (z.next_out_index === bufsize)
    					buffers.push(new Uint8Array(buf));
    				else
    					buffers.push(buf.subarray(0, z.next_out_index));
    			bufferSize += z.next_out_index;
    			if (onprogress && z.next_in_index > 0 && z.next_in_index != lastIndex) {
    				onprogress(z.next_in_index);
    				lastIndex = z.next_in_index;
    			}
    		} while (z.avail_in > 0 || z.avail_out === 0);
    		if (buffers.length > 1) {
    			array = new Uint8Array(bufferSize);
    			buffers.forEach(function (chunk) {
    				array.set(chunk, bufferIndex);
    				bufferIndex += chunk.length;
    			});
    		} else {
    			array = buffers[0] ? new Uint8Array(buffers[0]) : new Uint8Array();
    		}
    		return array;
    	};
    	that.flush = function () {
    		z.inflateEnd();
    	};
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const MAX_32_BITS = 0xffffffff;
    const MAX_16_BITS = 0xffff;
    const COMPRESSION_METHOD_DEFLATE = 0x08;
    const COMPRESSION_METHOD_STORE = 0x00;
    const COMPRESSION_METHOD_AES = 0x63;

    const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
    const SPLIT_ZIP_FILE_SIGNATURE = 0x08074b50;
    const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
    const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
    const ZIP64_END_OF_CENTRAL_DIR_SIGNATURE = 0x06064b50;
    const ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE = 0x07064b50;
    const END_OF_CENTRAL_DIR_LENGTH = 22;
    const ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH = 20;
    const ZIP64_END_OF_CENTRAL_DIR_LENGTH = 56;

    const EXTRAFIELD_TYPE_ZIP64 = 0x0001;
    const EXTRAFIELD_TYPE_AES = 0x9901;
    const EXTRAFIELD_TYPE_NTFS = 0x000a;
    const EXTRAFIELD_TYPE_NTFS_TAG1 = 0x0001;
    const EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP = 0x5455;
    const EXTRAFIELD_TYPE_UNICODE_PATH = 0x7075;
    const EXTRAFIELD_TYPE_UNICODE_COMMENT = 0x6375;
    const EXTRAFIELD_TYPE_USDZ = 0x1986;

    const BITFLAG_ENCRYPTED = 0x01;
    const BITFLAG_LEVEL = 0x06;
    const BITFLAG_DATA_DESCRIPTOR = 0x0008;
    const BITFLAG_LANG_ENCODING_FLAG = 0x0800;
    const FILE_ATTR_MSDOS_DIR_MASK = 0x10;

    const DIRECTORY_SIGNATURE = "/";

    const UNDEFINED_VALUE = undefined;
    const UNDEFINED_TYPE = "undefined";
    const FUNCTION_TYPE = "function";

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    class StreamAdapter {

    	constructor(Codec) {
    		return class extends TransformStream {
    			constructor(_format, options) {
    				const codec = new Codec(options);
    				super({
    					transform(chunk, controller) {
    						controller.enqueue(codec.append(chunk));
    					},
    					flush(controller) {
    						const chunk = codec.flush();
    						if (chunk) {
    							controller.enqueue(chunk);
    						}
    					}
    				});
    			}
    		};
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const MINIMUM_CHUNK_SIZE = 64;
    let maxWorkers = 2;
    try {
    	if (typeof navigator != UNDEFINED_TYPE && navigator.hardwareConcurrency) {
    		maxWorkers = navigator.hardwareConcurrency;
    	}
    } catch (_error) {
    	// ignored
    }
    const DEFAULT_CONFIGURATION = {
    	chunkSize: 512 * 1024,
    	maxWorkers,
    	terminateWorkerTimeout: 5000,
    	useWebWorkers: true,
    	useCompressionStream: true,
    	workerScripts: UNDEFINED_VALUE,
    	CompressionStreamNative: typeof CompressionStream != UNDEFINED_TYPE && CompressionStream,
    	DecompressionStreamNative: typeof DecompressionStream != UNDEFINED_TYPE && DecompressionStream
    };

    const config = Object.assign({}, DEFAULT_CONFIGURATION);

    function getConfiguration() {
    	return config;
    }

    function getChunkSize(config) {
    	return Math.max(config.chunkSize, MINIMUM_CHUNK_SIZE);
    }

    function configure(configuration) {
    	const {
    		baseURL,
    		chunkSize,
    		maxWorkers,
    		terminateWorkerTimeout,
    		useCompressionStream,
    		useWebWorkers,
    		Deflate,
    		Inflate,
    		CompressionStream,
    		DecompressionStream,
    		workerScripts
    	} = configuration;
    	setIfDefined("baseURL", baseURL);
    	setIfDefined("chunkSize", chunkSize);
    	setIfDefined("maxWorkers", maxWorkers);
    	setIfDefined("terminateWorkerTimeout", terminateWorkerTimeout);
    	setIfDefined("useCompressionStream", useCompressionStream);
    	setIfDefined("useWebWorkers", useWebWorkers);
    	if (Deflate) {
    		config.CompressionStream = new StreamAdapter(Deflate);
    	}
    	if (Inflate) {
    		config.DecompressionStream = new StreamAdapter(Inflate);
    	}
    	setIfDefined("CompressionStream", CompressionStream);
    	setIfDefined("DecompressionStream", DecompressionStream);
    	if (workerScripts !== UNDEFINED_VALUE) {
    		const { deflate, inflate } = workerScripts;
    		if (deflate || inflate) {
    			if (!config.workerScripts) {
    				config.workerScripts = {};
    			}
    		}
    		if (deflate) {
    			if (!Array.isArray(deflate)) {
    				throw new Error("workerScripts.deflate must be an array");
    			}
    			config.workerScripts.deflate = deflate;
    		}
    		if (inflate) {
    			if (!Array.isArray(inflate)) {
    				throw new Error("workerScripts.inflate must be an array");
    			}
    			config.workerScripts.inflate = inflate;
    		}
    	}
    }

    function setIfDefined(propertyName, propertyValue) {
    	if (propertyValue !== UNDEFINED_VALUE) {
    		config[propertyName] = propertyValue;
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const table$1 = {
    	"application": {
    		"andrew-inset": "ez",
    		"annodex": "anx",
    		"atom+xml": "atom",
    		"atomcat+xml": "atomcat",
    		"atomserv+xml": "atomsrv",
    		"bbolin": "lin",
    		"cu-seeme": "cu",
    		"davmount+xml": "davmount",
    		"dsptype": "tsp",
    		"ecmascript": [
    			"es",
    			"ecma"
    		],
    		"futuresplash": "spl",
    		"hta": "hta",
    		"java-archive": "jar",
    		"java-serialized-object": "ser",
    		"java-vm": "class",
    		"m3g": "m3g",
    		"mac-binhex40": "hqx",
    		"mathematica": [
    			"nb",
    			"ma",
    			"mb"
    		],
    		"msaccess": "mdb",
    		"msword": [
    			"doc",
    			"dot",
    			"wiz"
    		],
    		"mxf": "mxf",
    		"oda": "oda",
    		"ogg": "ogx",
    		"pdf": "pdf",
    		"pgp-keys": "key",
    		"pgp-signature": [
    			"asc",
    			"sig"
    		],
    		"pics-rules": "prf",
    		"postscript": [
    			"ps",
    			"ai",
    			"eps",
    			"epsi",
    			"epsf",
    			"eps2",
    			"eps3"
    		],
    		"rar": "rar",
    		"rdf+xml": "rdf",
    		"rss+xml": "rss",
    		"rtf": "rtf",
    		"xhtml+xml": [
    			"xhtml",
    			"xht"
    		],
    		"xml": [
    			"xml",
    			"xsl",
    			"xsd",
    			"xpdl"
    		],
    		"xspf+xml": "xspf",
    		"zip": "zip",
    		"vnd.android.package-archive": "apk",
    		"vnd.cinderella": "cdy",
    		"vnd.google-earth.kml+xml": "kml",
    		"vnd.google-earth.kmz": "kmz",
    		"vnd.mozilla.xul+xml": "xul",
    		"vnd.ms-excel": [
    			"xls",
    			"xlb",
    			"xlt",
    			"xlm",
    			"xla",
    			"xlc",
    			"xlw"
    		],
    		"vnd.ms-pki.seccat": "cat",
    		"vnd.ms-pki.stl": "stl",
    		"vnd.ms-powerpoint": [
    			"ppt",
    			"pps",
    			"pot",
    			"ppa",
    			"pwz"
    		],
    		"vnd.oasis.opendocument.chart": "odc",
    		"vnd.oasis.opendocument.database": "odb",
    		"vnd.oasis.opendocument.formula": "odf",
    		"vnd.oasis.opendocument.graphics": "odg",
    		"vnd.oasis.opendocument.graphics-template": "otg",
    		"vnd.oasis.opendocument.image": "odi",
    		"vnd.oasis.opendocument.presentation": "odp",
    		"vnd.oasis.opendocument.presentation-template": "otp",
    		"vnd.oasis.opendocument.spreadsheet": "ods",
    		"vnd.oasis.opendocument.spreadsheet-template": "ots",
    		"vnd.oasis.opendocument.text": "odt",
    		"vnd.oasis.opendocument.text-master": [
    			"odm",
    			"otm"
    		],
    		"vnd.oasis.opendocument.text-template": "ott",
    		"vnd.oasis.opendocument.text-web": "oth",
    		"vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    		"vnd.openxmlformats-officedocument.spreadsheetml.template": "xltx",
    		"vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    		"vnd.openxmlformats-officedocument.presentationml.slideshow": "ppsx",
    		"vnd.openxmlformats-officedocument.presentationml.template": "potx",
    		"vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    		"vnd.openxmlformats-officedocument.wordprocessingml.template": "dotx",
    		"vnd.smaf": "mmf",
    		"vnd.stardivision.calc": "sdc",
    		"vnd.stardivision.chart": "sds",
    		"vnd.stardivision.draw": "sda",
    		"vnd.stardivision.impress": "sdd",
    		"vnd.stardivision.math": [
    			"sdf",
    			"smf"
    		],
    		"vnd.stardivision.writer": [
    			"sdw",
    			"vor"
    		],
    		"vnd.stardivision.writer-global": "sgl",
    		"vnd.sun.xml.calc": "sxc",
    		"vnd.sun.xml.calc.template": "stc",
    		"vnd.sun.xml.draw": "sxd",
    		"vnd.sun.xml.draw.template": "std",
    		"vnd.sun.xml.impress": "sxi",
    		"vnd.sun.xml.impress.template": "sti",
    		"vnd.sun.xml.math": "sxm",
    		"vnd.sun.xml.writer": "sxw",
    		"vnd.sun.xml.writer.global": "sxg",
    		"vnd.sun.xml.writer.template": "stw",
    		"vnd.symbian.install": [
    			"sis",
    			"sisx"
    		],
    		"vnd.visio": [
    			"vsd",
    			"vst",
    			"vss",
    			"vsw",
    			"vsdx",
    			"vssx",
    			"vstx",
    			"vssm",
    			"vstm"
    		],
    		"vnd.wap.wbxml": "wbxml",
    		"vnd.wap.wmlc": "wmlc",
    		"vnd.wap.wmlscriptc": "wmlsc",
    		"vnd.wordperfect": "wpd",
    		"vnd.wordperfect5.1": "wp5",
    		"x-123": "wk",
    		"x-7z-compressed": "7z",
    		"x-abiword": "abw",
    		"x-apple-diskimage": "dmg",
    		"x-bcpio": "bcpio",
    		"x-bittorrent": "torrent",
    		"x-cbr": [
    			"cbr",
    			"cba",
    			"cbt",
    			"cb7"
    		],
    		"x-cbz": "cbz",
    		"x-cdf": [
    			"cdf",
    			"cda"
    		],
    		"x-cdlink": "vcd",
    		"x-chess-pgn": "pgn",
    		"x-cpio": "cpio",
    		"x-csh": "csh",
    		"x-director": [
    			"dir",
    			"dxr",
    			"cst",
    			"cct",
    			"cxt",
    			"w3d",
    			"fgd",
    			"swa"
    		],
    		"x-dms": "dms",
    		"x-doom": "wad",
    		"x-dvi": "dvi",
    		"x-httpd-eruby": "rhtml",
    		"x-font": "pcf.Z",
    		"x-freemind": "mm",
    		"x-gnumeric": "gnumeric",
    		"x-go-sgf": "sgf",
    		"x-graphing-calculator": "gcf",
    		"x-gtar": [
    			"gtar",
    			"taz"
    		],
    		"x-hdf": "hdf",
    		"x-httpd-php": [
    			"phtml",
    			"pht",
    			"php"
    		],
    		"x-httpd-php-source": "phps",
    		"x-httpd-php3": "php3",
    		"x-httpd-php3-preprocessed": "php3p",
    		"x-httpd-php4": "php4",
    		"x-httpd-php5": "php5",
    		"x-ica": "ica",
    		"x-info": "info",
    		"x-internet-signup": [
    			"ins",
    			"isp"
    		],
    		"x-iphone": "iii",
    		"x-iso9660-image": "iso",
    		"x-java-jnlp-file": "jnlp",
    		"x-jmol": "jmz",
    		"x-killustrator": "kil",
    		"x-latex": "latex",
    		"x-lyx": "lyx",
    		"x-lzx": "lzx",
    		"x-maker": [
    			"frm",
    			"fb",
    			"fbdoc"
    		],
    		"x-ms-wmd": "wmd",
    		"x-msdos-program": [
    			"com",
    			"exe",
    			"bat",
    			"dll"
    		],
    		"x-netcdf": [
    			"nc"
    		],
    		"x-ns-proxy-autoconfig": [
    			"pac",
    			"dat"
    		],
    		"x-nwc": "nwc",
    		"x-object": "o",
    		"x-oz-application": "oza",
    		"x-pkcs7-certreqresp": "p7r",
    		"x-python-code": [
    			"pyc",
    			"pyo"
    		],
    		"x-qgis": [
    			"qgs",
    			"shp",
    			"shx"
    		],
    		"x-quicktimeplayer": "qtl",
    		"x-redhat-package-manager": [
    			"rpm",
    			"rpa"
    		],
    		"x-ruby": "rb",
    		"x-sh": "sh",
    		"x-shar": "shar",
    		"x-shockwave-flash": [
    			"swf",
    			"swfl"
    		],
    		"x-silverlight": "scr",
    		"x-stuffit": "sit",
    		"x-sv4cpio": "sv4cpio",
    		"x-sv4crc": "sv4crc",
    		"x-tar": "tar",
    		"x-tex-gf": "gf",
    		"x-tex-pk": "pk",
    		"x-texinfo": [
    			"texinfo",
    			"texi"
    		],
    		"x-trash": [
    			"~",
    			"%",
    			"bak",
    			"old",
    			"sik"
    		],
    		"x-ustar": "ustar",
    		"x-wais-source": "src",
    		"x-wingz": "wz",
    		"x-x509-ca-cert": [
    			"crt",
    			"der",
    			"cer"
    		],
    		"x-xcf": "xcf",
    		"x-xfig": "fig",
    		"x-xpinstall": "xpi",
    		"applixware": "aw",
    		"atomsvc+xml": "atomsvc",
    		"ccxml+xml": "ccxml",
    		"cdmi-capability": "cdmia",
    		"cdmi-container": "cdmic",
    		"cdmi-domain": "cdmid",
    		"cdmi-object": "cdmio",
    		"cdmi-queue": "cdmiq",
    		"docbook+xml": "dbk",
    		"dssc+der": "dssc",
    		"dssc+xml": "xdssc",
    		"emma+xml": "emma",
    		"epub+zip": "epub",
    		"exi": "exi",
    		"font-tdpfr": "pfr",
    		"gml+xml": "gml",
    		"gpx+xml": "gpx",
    		"gxf": "gxf",
    		"hyperstudio": "stk",
    		"inkml+xml": [
    			"ink",
    			"inkml"
    		],
    		"ipfix": "ipfix",
    		"jsonml+json": "jsonml",
    		"lost+xml": "lostxml",
    		"mads+xml": "mads",
    		"marc": "mrc",
    		"marcxml+xml": "mrcx",
    		"mathml+xml": [
    			"mathml",
    			"mml"
    		],
    		"mbox": "mbox",
    		"mediaservercontrol+xml": "mscml",
    		"metalink+xml": "metalink",
    		"metalink4+xml": "meta4",
    		"mets+xml": "mets",
    		"mods+xml": "mods",
    		"mp21": [
    			"m21",
    			"mp21"
    		],
    		"mp4": "mp4s",
    		"oebps-package+xml": "opf",
    		"omdoc+xml": "omdoc",
    		"onenote": [
    			"onetoc",
    			"onetoc2",
    			"onetmp",
    			"onepkg"
    		],
    		"oxps": "oxps",
    		"patch-ops-error+xml": "xer",
    		"pgp-encrypted": "pgp",
    		"pkcs10": "p10",
    		"pkcs7-mime": [
    			"p7m",
    			"p7c"
    		],
    		"pkcs7-signature": "p7s",
    		"pkcs8": "p8",
    		"pkix-attr-cert": "ac",
    		"pkix-crl": "crl",
    		"pkix-pkipath": "pkipath",
    		"pkixcmp": "pki",
    		"pls+xml": "pls",
    		"prs.cww": "cww",
    		"pskc+xml": "pskcxml",
    		"reginfo+xml": "rif",
    		"relax-ng-compact-syntax": "rnc",
    		"resource-lists+xml": "rl",
    		"resource-lists-diff+xml": "rld",
    		"rls-services+xml": "rs",
    		"rpki-ghostbusters": "gbr",
    		"rpki-manifest": "mft",
    		"rpki-roa": "roa",
    		"rsd+xml": "rsd",
    		"sbml+xml": "sbml",
    		"scvp-cv-request": "scq",
    		"scvp-cv-response": "scs",
    		"scvp-vp-request": "spq",
    		"scvp-vp-response": "spp",
    		"sdp": "sdp",
    		"set-payment-initiation": "setpay",
    		"set-registration-initiation": "setreg",
    		"shf+xml": "shf",
    		"sparql-query": "rq",
    		"sparql-results+xml": "srx",
    		"srgs": "gram",
    		"srgs+xml": "grxml",
    		"sru+xml": "sru",
    		"ssdl+xml": "ssdl",
    		"ssml+xml": "ssml",
    		"tei+xml": [
    			"tei",
    			"teicorpus"
    		],
    		"thraud+xml": "tfi",
    		"timestamped-data": "tsd",
    		"vnd.3gpp.pic-bw-large": "plb",
    		"vnd.3gpp.pic-bw-small": "psb",
    		"vnd.3gpp.pic-bw-var": "pvb",
    		"vnd.3gpp2.tcap": "tcap",
    		"vnd.3m.post-it-notes": "pwn",
    		"vnd.accpac.simply.aso": "aso",
    		"vnd.accpac.simply.imp": "imp",
    		"vnd.acucobol": "acu",
    		"vnd.acucorp": [
    			"atc",
    			"acutc"
    		],
    		"vnd.adobe.air-application-installer-package+zip": "air",
    		"vnd.adobe.formscentral.fcdt": "fcdt",
    		"vnd.adobe.fxp": [
    			"fxp",
    			"fxpl"
    		],
    		"vnd.adobe.xdp+xml": "xdp",
    		"vnd.adobe.xfdf": "xfdf",
    		"vnd.ahead.space": "ahead",
    		"vnd.airzip.filesecure.azf": "azf",
    		"vnd.airzip.filesecure.azs": "azs",
    		"vnd.amazon.ebook": "azw",
    		"vnd.americandynamics.acc": "acc",
    		"vnd.amiga.ami": "ami",
    		"vnd.anser-web-certificate-issue-initiation": "cii",
    		"vnd.anser-web-funds-transfer-initiation": "fti",
    		"vnd.antix.game-component": "atx",
    		"vnd.apple.installer+xml": "mpkg",
    		"vnd.apple.mpegurl": "m3u8",
    		"vnd.aristanetworks.swi": "swi",
    		"vnd.astraea-software.iota": "iota",
    		"vnd.audiograph": "aep",
    		"vnd.blueice.multipass": "mpm",
    		"vnd.bmi": "bmi",
    		"vnd.businessobjects": "rep",
    		"vnd.chemdraw+xml": "cdxml",
    		"vnd.chipnuts.karaoke-mmd": "mmd",
    		"vnd.claymore": "cla",
    		"vnd.cloanto.rp9": "rp9",
    		"vnd.clonk.c4group": [
    			"c4g",
    			"c4d",
    			"c4f",
    			"c4p",
    			"c4u"
    		],
    		"vnd.cluetrust.cartomobile-config": "c11amc",
    		"vnd.cluetrust.cartomobile-config-pkg": "c11amz",
    		"vnd.commonspace": "csp",
    		"vnd.contact.cmsg": "cdbcmsg",
    		"vnd.cosmocaller": "cmc",
    		"vnd.crick.clicker": "clkx",
    		"vnd.crick.clicker.keyboard": "clkk",
    		"vnd.crick.clicker.palette": "clkp",
    		"vnd.crick.clicker.template": "clkt",
    		"vnd.crick.clicker.wordbank": "clkw",
    		"vnd.criticaltools.wbs+xml": "wbs",
    		"vnd.ctc-posml": "pml",
    		"vnd.cups-ppd": "ppd",
    		"vnd.curl.car": "car",
    		"vnd.curl.pcurl": "pcurl",
    		"vnd.dart": "dart",
    		"vnd.data-vision.rdz": "rdz",
    		"vnd.dece.data": [
    			"uvf",
    			"uvvf",
    			"uvd",
    			"uvvd"
    		],
    		"vnd.dece.ttml+xml": [
    			"uvt",
    			"uvvt"
    		],
    		"vnd.dece.unspecified": [
    			"uvx",
    			"uvvx"
    		],
    		"vnd.dece.zip": [
    			"uvz",
    			"uvvz"
    		],
    		"vnd.denovo.fcselayout-link": "fe_launch",
    		"vnd.dna": "dna",
    		"vnd.dolby.mlp": "mlp",
    		"vnd.dpgraph": "dpg",
    		"vnd.dreamfactory": "dfac",
    		"vnd.ds-keypoint": "kpxx",
    		"vnd.dvb.ait": "ait",
    		"vnd.dvb.service": "svc",
    		"vnd.dynageo": "geo",
    		"vnd.ecowin.chart": "mag",
    		"vnd.enliven": "nml",
    		"vnd.epson.esf": "esf",
    		"vnd.epson.msf": "msf",
    		"vnd.epson.quickanime": "qam",
    		"vnd.epson.salt": "slt",
    		"vnd.epson.ssf": "ssf",
    		"vnd.eszigno3+xml": [
    			"es3",
    			"et3"
    		],
    		"vnd.ezpix-album": "ez2",
    		"vnd.ezpix-package": "ez3",
    		"vnd.fdf": "fdf",
    		"vnd.fdsn.mseed": "mseed",
    		"vnd.fdsn.seed": [
    			"seed",
    			"dataless"
    		],
    		"vnd.flographit": "gph",
    		"vnd.fluxtime.clip": "ftc",
    		"vnd.framemaker": [
    			"fm",
    			"frame",
    			"maker",
    			"book"
    		],
    		"vnd.frogans.fnc": "fnc",
    		"vnd.frogans.ltf": "ltf",
    		"vnd.fsc.weblaunch": "fsc",
    		"vnd.fujitsu.oasys": "oas",
    		"vnd.fujitsu.oasys2": "oa2",
    		"vnd.fujitsu.oasys3": "oa3",
    		"vnd.fujitsu.oasysgp": "fg5",
    		"vnd.fujitsu.oasysprs": "bh2",
    		"vnd.fujixerox.ddd": "ddd",
    		"vnd.fujixerox.docuworks": "xdw",
    		"vnd.fujixerox.docuworks.binder": "xbd",
    		"vnd.fuzzysheet": "fzs",
    		"vnd.genomatix.tuxedo": "txd",
    		"vnd.geogebra.file": "ggb",
    		"vnd.geogebra.tool": "ggt",
    		"vnd.geometry-explorer": [
    			"gex",
    			"gre"
    		],
    		"vnd.geonext": "gxt",
    		"vnd.geoplan": "g2w",
    		"vnd.geospace": "g3w",
    		"vnd.gmx": "gmx",
    		"vnd.grafeq": [
    			"gqf",
    			"gqs"
    		],
    		"vnd.groove-account": "gac",
    		"vnd.groove-help": "ghf",
    		"vnd.groove-identity-message": "gim",
    		"vnd.groove-injector": "grv",
    		"vnd.groove-tool-message": "gtm",
    		"vnd.groove-tool-template": "tpl",
    		"vnd.groove-vcard": "vcg",
    		"vnd.hal+xml": "hal",
    		"vnd.handheld-entertainment+xml": "zmm",
    		"vnd.hbci": "hbci",
    		"vnd.hhe.lesson-player": "les",
    		"vnd.hp-hpgl": "hpgl",
    		"vnd.hp-hpid": "hpid",
    		"vnd.hp-hps": "hps",
    		"vnd.hp-jlyt": "jlt",
    		"vnd.hp-pcl": "pcl",
    		"vnd.hp-pclxl": "pclxl",
    		"vnd.hydrostatix.sof-data": "sfd-hdstx",
    		"vnd.ibm.minipay": "mpy",
    		"vnd.ibm.modcap": [
    			"afp",
    			"listafp",
    			"list3820"
    		],
    		"vnd.ibm.rights-management": "irm",
    		"vnd.ibm.secure-container": "sc",
    		"vnd.iccprofile": [
    			"icc",
    			"icm"
    		],
    		"vnd.igloader": "igl",
    		"vnd.immervision-ivp": "ivp",
    		"vnd.immervision-ivu": "ivu",
    		"vnd.insors.igm": "igm",
    		"vnd.intercon.formnet": [
    			"xpw",
    			"xpx"
    		],
    		"vnd.intergeo": "i2g",
    		"vnd.intu.qbo": "qbo",
    		"vnd.intu.qfx": "qfx",
    		"vnd.ipunplugged.rcprofile": "rcprofile",
    		"vnd.irepository.package+xml": "irp",
    		"vnd.is-xpr": "xpr",
    		"vnd.isac.fcs": "fcs",
    		"vnd.jam": "jam",
    		"vnd.jcp.javame.midlet-rms": "rms",
    		"vnd.jisp": "jisp",
    		"vnd.joost.joda-archive": "joda",
    		"vnd.kahootz": [
    			"ktz",
    			"ktr"
    		],
    		"vnd.kde.karbon": "karbon",
    		"vnd.kde.kchart": "chrt",
    		"vnd.kde.kformula": "kfo",
    		"vnd.kde.kivio": "flw",
    		"vnd.kde.kontour": "kon",
    		"vnd.kde.kpresenter": [
    			"kpr",
    			"kpt"
    		],
    		"vnd.kde.kspread": "ksp",
    		"vnd.kde.kword": [
    			"kwd",
    			"kwt"
    		],
    		"vnd.kenameaapp": "htke",
    		"vnd.kidspiration": "kia",
    		"vnd.kinar": [
    			"kne",
    			"knp"
    		],
    		"vnd.koan": [
    			"skp",
    			"skd",
    			"skt",
    			"skm"
    		],
    		"vnd.kodak-descriptor": "sse",
    		"vnd.las.las+xml": "lasxml",
    		"vnd.llamagraphics.life-balance.desktop": "lbd",
    		"vnd.llamagraphics.life-balance.exchange+xml": "lbe",
    		"vnd.lotus-1-2-3": "123",
    		"vnd.lotus-approach": "apr",
    		"vnd.lotus-freelance": "pre",
    		"vnd.lotus-notes": "nsf",
    		"vnd.lotus-organizer": "org",
    		"vnd.lotus-screencam": "scm",
    		"vnd.lotus-wordpro": "lwp",
    		"vnd.macports.portpkg": "portpkg",
    		"vnd.mcd": "mcd",
    		"vnd.medcalcdata": "mc1",
    		"vnd.mediastation.cdkey": "cdkey",
    		"vnd.mfer": "mwf",
    		"vnd.mfmp": "mfm",
    		"vnd.micrografx.flo": "flo",
    		"vnd.micrografx.igx": "igx",
    		"vnd.mif": "mif",
    		"vnd.mobius.daf": "daf",
    		"vnd.mobius.dis": "dis",
    		"vnd.mobius.mbk": "mbk",
    		"vnd.mobius.mqy": "mqy",
    		"vnd.mobius.msl": "msl",
    		"vnd.mobius.plc": "plc",
    		"vnd.mobius.txf": "txf",
    		"vnd.mophun.application": "mpn",
    		"vnd.mophun.certificate": "mpc",
    		"vnd.ms-artgalry": "cil",
    		"vnd.ms-cab-compressed": "cab",
    		"vnd.ms-excel.addin.macroenabled.12": "xlam",
    		"vnd.ms-excel.sheet.binary.macroenabled.12": "xlsb",
    		"vnd.ms-excel.sheet.macroenabled.12": "xlsm",
    		"vnd.ms-excel.template.macroenabled.12": "xltm",
    		"vnd.ms-fontobject": "eot",
    		"vnd.ms-htmlhelp": "chm",
    		"vnd.ms-ims": "ims",
    		"vnd.ms-lrm": "lrm",
    		"vnd.ms-officetheme": "thmx",
    		"vnd.ms-powerpoint.addin.macroenabled.12": "ppam",
    		"vnd.ms-powerpoint.presentation.macroenabled.12": "pptm",
    		"vnd.ms-powerpoint.slide.macroenabled.12": "sldm",
    		"vnd.ms-powerpoint.slideshow.macroenabled.12": "ppsm",
    		"vnd.ms-powerpoint.template.macroenabled.12": "potm",
    		"vnd.ms-project": [
    			"mpp",
    			"mpt"
    		],
    		"vnd.ms-word.document.macroenabled.12": "docm",
    		"vnd.ms-word.template.macroenabled.12": "dotm",
    		"vnd.ms-works": [
    			"wps",
    			"wks",
    			"wcm",
    			"wdb"
    		],
    		"vnd.ms-wpl": "wpl",
    		"vnd.ms-xpsdocument": "xps",
    		"vnd.mseq": "mseq",
    		"vnd.musician": "mus",
    		"vnd.muvee.style": "msty",
    		"vnd.mynfc": "taglet",
    		"vnd.neurolanguage.nlu": "nlu",
    		"vnd.nitf": [
    			"ntf",
    			"nitf"
    		],
    		"vnd.noblenet-directory": "nnd",
    		"vnd.noblenet-sealer": "nns",
    		"vnd.noblenet-web": "nnw",
    		"vnd.nokia.n-gage.data": "ngdat",
    		"vnd.nokia.n-gage.symbian.install": "n-gage",
    		"vnd.nokia.radio-preset": "rpst",
    		"vnd.nokia.radio-presets": "rpss",
    		"vnd.novadigm.edm": "edm",
    		"vnd.novadigm.edx": "edx",
    		"vnd.novadigm.ext": "ext",
    		"vnd.oasis.opendocument.chart-template": "otc",
    		"vnd.oasis.opendocument.formula-template": "odft",
    		"vnd.oasis.opendocument.image-template": "oti",
    		"vnd.olpc-sugar": "xo",
    		"vnd.oma.dd2+xml": "dd2",
    		"vnd.openofficeorg.extension": "oxt",
    		"vnd.openxmlformats-officedocument.presentationml.slide": "sldx",
    		"vnd.osgeo.mapguide.package": "mgp",
    		"vnd.osgi.dp": "dp",
    		"vnd.osgi.subsystem": "esa",
    		"vnd.palm": [
    			"pdb",
    			"pqa",
    			"oprc"
    		],
    		"vnd.pawaafile": "paw",
    		"vnd.pg.format": "str",
    		"vnd.pg.osasli": "ei6",
    		"vnd.picsel": "efif",
    		"vnd.pmi.widget": "wg",
    		"vnd.pocketlearn": "plf",
    		"vnd.powerbuilder6": "pbd",
    		"vnd.previewsystems.box": "box",
    		"vnd.proteus.magazine": "mgz",
    		"vnd.publishare-delta-tree": "qps",
    		"vnd.pvi.ptid1": "ptid",
    		"vnd.quark.quarkxpress": [
    			"qxd",
    			"qxt",
    			"qwd",
    			"qwt",
    			"qxl",
    			"qxb"
    		],
    		"vnd.realvnc.bed": "bed",
    		"vnd.recordare.musicxml": "mxl",
    		"vnd.recordare.musicxml+xml": "musicxml",
    		"vnd.rig.cryptonote": "cryptonote",
    		"vnd.rn-realmedia": "rm",
    		"vnd.rn-realmedia-vbr": "rmvb",
    		"vnd.route66.link66+xml": "link66",
    		"vnd.sailingtracker.track": "st",
    		"vnd.seemail": "see",
    		"vnd.sema": "sema",
    		"vnd.semd": "semd",
    		"vnd.semf": "semf",
    		"vnd.shana.informed.formdata": "ifm",
    		"vnd.shana.informed.formtemplate": "itp",
    		"vnd.shana.informed.interchange": "iif",
    		"vnd.shana.informed.package": "ipk",
    		"vnd.simtech-mindmapper": [
    			"twd",
    			"twds"
    		],
    		"vnd.smart.teacher": "teacher",
    		"vnd.solent.sdkm+xml": [
    			"sdkm",
    			"sdkd"
    		],
    		"vnd.spotfire.dxp": "dxp",
    		"vnd.spotfire.sfs": "sfs",
    		"vnd.stepmania.package": "smzip",
    		"vnd.stepmania.stepchart": "sm",
    		"vnd.sus-calendar": [
    			"sus",
    			"susp"
    		],
    		"vnd.svd": "svd",
    		"vnd.syncml+xml": "xsm",
    		"vnd.syncml.dm+wbxml": "bdm",
    		"vnd.syncml.dm+xml": "xdm",
    		"vnd.tao.intent-module-archive": "tao",
    		"vnd.tcpdump.pcap": [
    			"pcap",
    			"cap",
    			"dmp"
    		],
    		"vnd.tmobile-livetv": "tmo",
    		"vnd.trid.tpt": "tpt",
    		"vnd.triscape.mxs": "mxs",
    		"vnd.trueapp": "tra",
    		"vnd.ufdl": [
    			"ufd",
    			"ufdl"
    		],
    		"vnd.uiq.theme": "utz",
    		"vnd.umajin": "umj",
    		"vnd.unity": "unityweb",
    		"vnd.uoml+xml": "uoml",
    		"vnd.vcx": "vcx",
    		"vnd.visionary": "vis",
    		"vnd.vsf": "vsf",
    		"vnd.webturbo": "wtb",
    		"vnd.wolfram.player": "nbp",
    		"vnd.wqd": "wqd",
    		"vnd.wt.stf": "stf",
    		"vnd.xara": "xar",
    		"vnd.xfdl": "xfdl",
    		"vnd.yamaha.hv-dic": "hvd",
    		"vnd.yamaha.hv-script": "hvs",
    		"vnd.yamaha.hv-voice": "hvp",
    		"vnd.yamaha.openscoreformat": "osf",
    		"vnd.yamaha.openscoreformat.osfpvg+xml": "osfpvg",
    		"vnd.yamaha.smaf-audio": "saf",
    		"vnd.yamaha.smaf-phrase": "spf",
    		"vnd.yellowriver-custom-menu": "cmp",
    		"vnd.zul": [
    			"zir",
    			"zirz"
    		],
    		"vnd.zzazz.deck+xml": "zaz",
    		"voicexml+xml": "vxml",
    		"widget": "wgt",
    		"winhlp": "hlp",
    		"wsdl+xml": "wsdl",
    		"wspolicy+xml": "wspolicy",
    		"x-ace-compressed": "ace",
    		"x-authorware-bin": [
    			"aab",
    			"x32",
    			"u32",
    			"vox"
    		],
    		"x-authorware-map": "aam",
    		"x-authorware-seg": "aas",
    		"x-blorb": [
    			"blb",
    			"blorb"
    		],
    		"x-bzip": "bz",
    		"x-bzip2": [
    			"bz2",
    			"boz"
    		],
    		"x-cfs-compressed": "cfs",
    		"x-chat": "chat",
    		"x-conference": "nsc",
    		"x-dgc-compressed": "dgc",
    		"x-dtbncx+xml": "ncx",
    		"x-dtbook+xml": "dtb",
    		"x-dtbresource+xml": "res",
    		"x-eva": "eva",
    		"x-font-bdf": "bdf",
    		"x-font-ghostscript": "gsf",
    		"x-font-linux-psf": "psf",
    		"x-font-pcf": "pcf",
    		"x-font-snf": "snf",
    		"x-font-ttf": [
    			"ttf",
    			"ttc"
    		],
    		"x-font-type1": [
    			"pfa",
    			"pfb",
    			"pfm",
    			"afm"
    		],
    		"x-freearc": "arc",
    		"x-gca-compressed": "gca",
    		"x-glulx": "ulx",
    		"x-gramps-xml": "gramps",
    		"x-install-instructions": "install",
    		"x-lzh-compressed": [
    			"lzh",
    			"lha"
    		],
    		"x-mie": "mie",
    		"x-mobipocket-ebook": [
    			"prc",
    			"mobi"
    		],
    		"x-ms-application": "application",
    		"x-ms-shortcut": "lnk",
    		"x-ms-xbap": "xbap",
    		"x-msbinder": "obd",
    		"x-mscardfile": "crd",
    		"x-msclip": "clp",
    		"application/x-ms-installer": "msi",
    		"x-msmediaview": [
    			"mvb",
    			"m13",
    			"m14"
    		],
    		"x-msmetafile": [
    			"wmf",
    			"wmz",
    			"emf",
    			"emz"
    		],
    		"x-msmoney": "mny",
    		"x-mspublisher": "pub",
    		"x-msschedule": "scd",
    		"x-msterminal": "trm",
    		"x-mswrite": "wri",
    		"x-nzb": "nzb",
    		"x-pkcs12": [
    			"p12",
    			"pfx"
    		],
    		"x-pkcs7-certificates": [
    			"p7b",
    			"spc"
    		],
    		"x-research-info-systems": "ris",
    		"x-silverlight-app": "xap",
    		"x-sql": "sql",
    		"x-stuffitx": "sitx",
    		"x-subrip": "srt",
    		"x-t3vm-image": "t3",
    		"x-tex-tfm": "tfm",
    		"x-tgif": "obj",
    		"x-xliff+xml": "xlf",
    		"x-xz": "xz",
    		"x-zmachine": [
    			"z1",
    			"z2",
    			"z3",
    			"z4",
    			"z5",
    			"z6",
    			"z7",
    			"z8"
    		],
    		"xaml+xml": "xaml",
    		"xcap-diff+xml": "xdf",
    		"xenc+xml": "xenc",
    		"xml-dtd": "dtd",
    		"xop+xml": "xop",
    		"xproc+xml": "xpl",
    		"xslt+xml": "xslt",
    		"xv+xml": [
    			"mxml",
    			"xhvml",
    			"xvml",
    			"xvm"
    		],
    		"yang": "yang",
    		"yin+xml": "yin",
    		"envoy": "evy",
    		"fractals": "fif",
    		"internet-property-stream": "acx",
    		"olescript": "axs",
    		"vnd.ms-outlook": "msg",
    		"vnd.ms-pkicertstore": "sst",
    		"x-compress": "z",
    		"x-perfmon": [
    			"pma",
    			"pmc",
    			"pmr",
    			"pmw"
    		],
    		"ynd.ms-pkipko": "pko",
    		"gzip": [
    			"gz",
    			"tgz"
    		],
    		"smil+xml": [
    			"smi",
    			"smil"
    		],
    		"vnd.debian.binary-package": [
    			"deb",
    			"udeb"
    		],
    		"vnd.hzn-3d-crossword": "x3d",
    		"vnd.sqlite3": [
    			"db",
    			"sqlite",
    			"sqlite3",
    			"db-wal",
    			"sqlite-wal",
    			"db-shm",
    			"sqlite-shm"
    		],
    		"vnd.wap.sic": "sic",
    		"vnd.wap.slc": "slc",
    		"x-krita": [
    			"kra",
    			"krz"
    		],
    		"x-perl": [
    			"pm",
    			"pl"
    		],
    		"yaml": [
    			"yaml",
    			"yml"
    		]
    	},
    	"audio": {
    		"amr": "amr",
    		"amr-wb": "awb",
    		"annodex": "axa",
    		"basic": [
    			"au",
    			"snd"
    		],
    		"flac": "flac",
    		"midi": [
    			"mid",
    			"midi",
    			"kar",
    			"rmi"
    		],
    		"mpeg": [
    			"mpga",
    			"mpega",
    			"mp3",
    			"m4a",
    			"mp2a",
    			"m2a",
    			"m3a"
    		],
    		"mpegurl": "m3u",
    		"ogg": [
    			"oga",
    			"ogg",
    			"spx"
    		],
    		"prs.sid": "sid",
    		"x-aiff": "aifc",
    		"x-gsm": "gsm",
    		"x-ms-wma": "wma",
    		"x-ms-wax": "wax",
    		"x-pn-realaudio": "ram",
    		"x-realaudio": "ra",
    		"x-sd2": "sd2",
    		"adpcm": "adp",
    		"mp4": "mp4a",
    		"s3m": "s3m",
    		"silk": "sil",
    		"vnd.dece.audio": [
    			"uva",
    			"uvva"
    		],
    		"vnd.digital-winds": "eol",
    		"vnd.dra": "dra",
    		"vnd.dts": "dts",
    		"vnd.dts.hd": "dtshd",
    		"vnd.lucent.voice": "lvp",
    		"vnd.ms-playready.media.pya": "pya",
    		"vnd.nuera.ecelp4800": "ecelp4800",
    		"vnd.nuera.ecelp7470": "ecelp7470",
    		"vnd.nuera.ecelp9600": "ecelp9600",
    		"vnd.rip": "rip",
    		"webm": "weba",
    		"x-caf": "caf",
    		"x-matroska": "mka",
    		"x-pn-realaudio-plugin": "rmp",
    		"xm": "xm",
    		"aac": "aac",
    		"aiff": [
    			"aiff",
    			"aif",
    			"aff"
    		],
    		"opus": "opus",
    		"wav": "wav"
    	},
    	"chemical": {
    		"x-alchemy": "alc",
    		"x-cache": [
    			"cac",
    			"cache"
    		],
    		"x-cache-csf": "csf",
    		"x-cactvs-binary": [
    			"cbin",
    			"cascii",
    			"ctab"
    		],
    		"x-cdx": "cdx",
    		"x-chem3d": "c3d",
    		"x-cif": "cif",
    		"x-cmdf": "cmdf",
    		"x-cml": "cml",
    		"x-compass": "cpa",
    		"x-crossfire": "bsd",
    		"x-csml": [
    			"csml",
    			"csm"
    		],
    		"x-ctx": "ctx",
    		"x-cxf": [
    			"cxf",
    			"cef"
    		],
    		"x-embl-dl-nucleotide": [
    			"emb",
    			"embl"
    		],
    		"x-gamess-input": [
    			"inp",
    			"gam",
    			"gamin"
    		],
    		"x-gaussian-checkpoint": [
    			"fch",
    			"fchk"
    		],
    		"x-gaussian-cube": "cub",
    		"x-gaussian-input": [
    			"gau",
    			"gjc",
    			"gjf"
    		],
    		"x-gaussian-log": "gal",
    		"x-gcg8-sequence": "gcg",
    		"x-genbank": "gen",
    		"x-hin": "hin",
    		"x-isostar": [
    			"istr",
    			"ist"
    		],
    		"x-jcamp-dx": [
    			"jdx",
    			"dx"
    		],
    		"x-kinemage": "kin",
    		"x-macmolecule": "mcm",
    		"x-macromodel-input": "mmod",
    		"x-mdl-molfile": "mol",
    		"x-mdl-rdfile": "rd",
    		"x-mdl-rxnfile": "rxn",
    		"x-mdl-sdfile": "sd",
    		"x-mdl-tgf": "tgf",
    		"x-mmcif": "mcif",
    		"x-mol2": "mol2",
    		"x-molconn-Z": "b",
    		"x-mopac-graph": "gpt",
    		"x-mopac-input": [
    			"mop",
    			"mopcrt",
    			"zmt"
    		],
    		"x-mopac-out": "moo",
    		"x-ncbi-asn1": "asn",
    		"x-ncbi-asn1-ascii": [
    			"prt",
    			"ent"
    		],
    		"x-ncbi-asn1-binary": "val",
    		"x-rosdal": "ros",
    		"x-swissprot": "sw",
    		"x-vamas-iso14976": "vms",
    		"x-vmd": "vmd",
    		"x-xtel": "xtel",
    		"x-xyz": "xyz"
    	},
    	"font": {
    		"otf": "otf",
    		"woff": "woff",
    		"woff2": "woff2"
    	},
    	"image": {
    		"gif": "gif",
    		"ief": "ief",
    		"jpeg": [
    			"jpeg",
    			"jpg",
    			"jpe",
    			"jfif",
    			"jfif-tbnl",
    			"jif"
    		],
    		"pcx": "pcx",
    		"png": "png",
    		"svg+xml": [
    			"svg",
    			"svgz"
    		],
    		"tiff": [
    			"tiff",
    			"tif"
    		],
    		"vnd.djvu": [
    			"djvu",
    			"djv"
    		],
    		"vnd.wap.wbmp": "wbmp",
    		"x-canon-cr2": "cr2",
    		"x-canon-crw": "crw",
    		"x-cmu-raster": "ras",
    		"x-coreldraw": "cdr",
    		"x-coreldrawpattern": "pat",
    		"x-coreldrawtemplate": "cdt",
    		"x-corelphotopaint": "cpt",
    		"x-epson-erf": "erf",
    		"x-icon": "ico",
    		"x-jg": "art",
    		"x-jng": "jng",
    		"x-nikon-nef": "nef",
    		"x-olympus-orf": "orf",
    		"x-portable-anymap": "pnm",
    		"x-portable-bitmap": "pbm",
    		"x-portable-graymap": "pgm",
    		"x-portable-pixmap": "ppm",
    		"x-rgb": "rgb",
    		"x-xbitmap": "xbm",
    		"x-xpixmap": "xpm",
    		"x-xwindowdump": "xwd",
    		"bmp": "bmp",
    		"cgm": "cgm",
    		"g3fax": "g3",
    		"ktx": "ktx",
    		"prs.btif": "btif",
    		"sgi": "sgi",
    		"vnd.dece.graphic": [
    			"uvi",
    			"uvvi",
    			"uvg",
    			"uvvg"
    		],
    		"vnd.dwg": "dwg",
    		"vnd.dxf": "dxf",
    		"vnd.fastbidsheet": "fbs",
    		"vnd.fpx": "fpx",
    		"vnd.fst": "fst",
    		"vnd.fujixerox.edmics-mmr": "mmr",
    		"vnd.fujixerox.edmics-rlc": "rlc",
    		"vnd.ms-modi": "mdi",
    		"vnd.ms-photo": "wdp",
    		"vnd.net-fpx": "npx",
    		"vnd.xiff": "xif",
    		"webp": "webp",
    		"x-3ds": "3ds",
    		"x-cmx": "cmx",
    		"x-freehand": [
    			"fh",
    			"fhc",
    			"fh4",
    			"fh5",
    			"fh7"
    		],
    		"x-pict": [
    			"pic",
    			"pct"
    		],
    		"x-tga": "tga",
    		"cis-cod": "cod",
    		"avif": "avifs",
    		"heic": [
    			"heif",
    			"heic"
    		],
    		"pjpeg": [
    			"pjpg"
    		],
    		"vnd.adobe.photoshop": "psd",
    		"x-adobe-dng": "dng",
    		"x-fuji-raf": "raf",
    		"x-icns": "icns",
    		"x-kodak-dcr": "dcr",
    		"x-kodak-k25": "k25",
    		"x-kodak-kdc": "kdc",
    		"x-minolta-mrw": "mrw",
    		"x-panasonic-raw": [
    			"raw",
    			"rw2",
    			"rwl"
    		],
    		"x-pentax-pef": [
    			"pef",
    			"ptx"
    		],
    		"x-sigma-x3f": "x3f",
    		"x-sony-arw": "arw",
    		"x-sony-sr2": "sr2",
    		"x-sony-srf": "srf"
    	},
    	"message": {
    		"rfc822": [
    			"eml",
    			"mime",
    			"mht",
    			"mhtml",
    			"nws"
    		]
    	},
    	"model": {
    		"iges": [
    			"igs",
    			"iges"
    		],
    		"mesh": [
    			"msh",
    			"mesh",
    			"silo"
    		],
    		"vrml": [
    			"wrl",
    			"vrml"
    		],
    		"x3d+vrml": [
    			"x3dv",
    			"x3dvz"
    		],
    		"x3d+xml": "x3dz",
    		"x3d+binary": [
    			"x3db",
    			"x3dbz"
    		],
    		"vnd.collada+xml": "dae",
    		"vnd.dwf": "dwf",
    		"vnd.gdl": "gdl",
    		"vnd.gtw": "gtw",
    		"vnd.mts": "mts",
    		"vnd.usdz+zip": "usdz",
    		"vnd.vtu": "vtu"
    	},
    	"text": {
    		"cache-manifest": [
    			"manifest",
    			"appcache"
    		],
    		"calendar": [
    			"ics",
    			"icz",
    			"ifb"
    		],
    		"css": "css",
    		"csv": "csv",
    		"h323": "323",
    		"html": [
    			"html",
    			"htm",
    			"shtml",
    			"stm"
    		],
    		"iuls": "uls",
    		"plain": [
    			"txt",
    			"text",
    			"brf",
    			"conf",
    			"def",
    			"list",
    			"log",
    			"in",
    			"bas",
    			"diff",
    			"ksh"
    		],
    		"richtext": "rtx",
    		"scriptlet": [
    			"sct",
    			"wsc"
    		],
    		"texmacs": "tm",
    		"tab-separated-values": "tsv",
    		"vnd.sun.j2me.app-descriptor": "jad",
    		"vnd.wap.wml": "wml",
    		"vnd.wap.wmlscript": "wmls",
    		"x-bibtex": "bib",
    		"x-boo": "boo",
    		"x-c++hdr": [
    			"h++",
    			"hpp",
    			"hxx",
    			"hh"
    		],
    		"x-c++src": [
    			"c++",
    			"cpp",
    			"cxx",
    			"cc"
    		],
    		"x-component": "htc",
    		"x-dsrc": "d",
    		"x-diff": "patch",
    		"x-haskell": "hs",
    		"x-java": "java",
    		"x-literate-haskell": "lhs",
    		"x-moc": "moc",
    		"x-pascal": [
    			"p",
    			"pas",
    			"pp",
    			"inc"
    		],
    		"x-pcs-gcd": "gcd",
    		"x-python": "py",
    		"x-scala": "scala",
    		"x-setext": "etx",
    		"x-tcl": [
    			"tcl",
    			"tk"
    		],
    		"x-tex": [
    			"tex",
    			"ltx",
    			"sty",
    			"cls"
    		],
    		"x-vcalendar": "vcs",
    		"x-vcard": "vcf",
    		"n3": "n3",
    		"prs.lines.tag": "dsc",
    		"sgml": [
    			"sgml",
    			"sgm"
    		],
    		"troff": [
    			"t",
    			"tr",
    			"roff",
    			"man",
    			"me",
    			"ms"
    		],
    		"turtle": "ttl",
    		"uri-list": [
    			"uri",
    			"uris",
    			"urls"
    		],
    		"vcard": "vcard",
    		"vnd.curl": "curl",
    		"vnd.curl.dcurl": "dcurl",
    		"vnd.curl.scurl": "scurl",
    		"vnd.curl.mcurl": "mcurl",
    		"vnd.dvb.subtitle": "sub",
    		"vnd.fly": "fly",
    		"vnd.fmi.flexstor": "flx",
    		"vnd.graphviz": "gv",
    		"vnd.in3d.3dml": "3dml",
    		"vnd.in3d.spot": "spot",
    		"x-asm": [
    			"s",
    			"asm"
    		],
    		"x-c": [
    			"c",
    			"h",
    			"dic"
    		],
    		"x-fortran": [
    			"f",
    			"for",
    			"f77",
    			"f90"
    		],
    		"x-opml": "opml",
    		"x-nfo": "nfo",
    		"x-sfv": "sfv",
    		"x-uuencode": "uu",
    		"webviewhtml": "htt",
    		"javascript": "js",
    		"json": "json",
    		"markdown": [
    			"md",
    			"markdown",
    			"mdown",
    			"markdn"
    		],
    		"vnd.wap.si": "si",
    		"vnd.wap.sl": "sl"
    	},
    	"video": {
    		"avif": "avif",
    		"3gpp": "3gp",
    		"annodex": "axv",
    		"dl": "dl",
    		"dv": [
    			"dif",
    			"dv"
    		],
    		"fli": "fli",
    		"gl": "gl",
    		"mpeg": [
    			"mpeg",
    			"mpg",
    			"mpe",
    			"m1v",
    			"m2v",
    			"mp2",
    			"mpa",
    			"mpv2"
    		],
    		"mp4": [
    			"mp4",
    			"mp4v",
    			"mpg4"
    		],
    		"quicktime": [
    			"qt",
    			"mov"
    		],
    		"ogg": "ogv",
    		"vnd.mpegurl": [
    			"mxu",
    			"m4u"
    		],
    		"x-flv": "flv",
    		"x-la-asf": [
    			"lsf",
    			"lsx"
    		],
    		"x-mng": "mng",
    		"x-ms-asf": [
    			"asf",
    			"asx",
    			"asr"
    		],
    		"x-ms-wm": "wm",
    		"x-ms-wmv": "wmv",
    		"x-ms-wmx": "wmx",
    		"x-ms-wvx": "wvx",
    		"x-msvideo": "avi",
    		"x-sgi-movie": "movie",
    		"x-matroska": [
    			"mpv",
    			"mkv",
    			"mk3d",
    			"mks"
    		],
    		"3gpp2": "3g2",
    		"h261": "h261",
    		"h263": "h263",
    		"h264": "h264",
    		"jpeg": "jpgv",
    		"jpm": [
    			"jpm",
    			"jpgm"
    		],
    		"mj2": [
    			"mj2",
    			"mjp2"
    		],
    		"vnd.dece.hd": [
    			"uvh",
    			"uvvh"
    		],
    		"vnd.dece.mobile": [
    			"uvm",
    			"uvvm"
    		],
    		"vnd.dece.pd": [
    			"uvp",
    			"uvvp"
    		],
    		"vnd.dece.sd": [
    			"uvs",
    			"uvvs"
    		],
    		"vnd.dece.video": [
    			"uvv",
    			"uvvv"
    		],
    		"vnd.dvb.file": "dvb",
    		"vnd.fvt": "fvt",
    		"vnd.ms-playready.media.pyv": "pyv",
    		"vnd.uvvu.mp4": [
    			"uvu",
    			"uvvu"
    		],
    		"vnd.vivo": "viv",
    		"webm": "webm",
    		"x-f4v": "f4v",
    		"x-m4v": "m4v",
    		"x-ms-vob": "vob",
    		"x-smv": "smv",
    		"mp2t": "ts"
    	},
    	"x-conference": {
    		"x-cooltalk": "ice"
    	},
    	"x-world": {
    		"x-vrml": [
    			"vrm",
    			"flr",
    			"wrz",
    			"xaf",
    			"xof"
    		]
    	}
    };

    (() => {
    	const mimeTypes = {};
    	for (const type of Object.keys(table$1)) {
    		for (const subtype of Object.keys(table$1[type])) {
    			const value = table$1[type][subtype];
    			if (typeof value == "string") {
    				mimeTypes[value] = type + "/" + subtype;
    			} else {
    				for (let indexMimeType = 0; indexMimeType < value.length; indexMimeType++) {
    					mimeTypes[value[indexMimeType]] = type + "/" + subtype;
    				}
    			}
    		}
    	}
    	return mimeTypes;
    })();

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const table = [];
    for (let i = 0; i < 256; i++) {
    	let t = i;
    	for (let j = 0; j < 8; j++) {
    		if (t & 1) {
    			t = (t >>> 1) ^ 0xEDB88320;
    		} else {
    			t = t >>> 1;
    		}
    	}
    	table[i] = t;
    }

    class Crc32 {

    	constructor(crc) {
    		this.crc = crc || -1;
    	}

    	append(data) {
    		let crc = this.crc | 0;
    		for (let offset = 0, length = data.length | 0; offset < length; offset++) {
    			crc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF];
    		}
    		this.crc = crc;
    	}

    	get() {
    		return ~this.crc;
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    class Crc32Stream extends TransformStream {

    	constructor() {
    		let stream;
    		const crc32 = new Crc32();
    		super({
    			transform(chunk, controller) {
    				crc32.append(chunk);
    				controller.enqueue(chunk);
    			},
    			flush() {
    				const value = new Uint8Array(4);
    				const dataView = new DataView(value.buffer);
    				dataView.setUint32(0, crc32.get());
    				stream.value = value;
    			}
    		});
    		stream = this;
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    function encodeText(value) {
    	if (typeof TextEncoder == UNDEFINED_TYPE) {
    		value = unescape(encodeURIComponent(value));
    		const result = new Uint8Array(value.length);
    		for (let i = 0; i < result.length; i++) {
    			result[i] = value.charCodeAt(i);
    		}
    		return result;
    	} else {
    		return new TextEncoder().encode(value);
    	}
    }

    // Derived from https://github.com/xqdoo00o/jszip/blob/master/lib/sjcl.js and https://github.com/bitwiseshiftleft/sjcl

    // deno-lint-ignore-file no-this-alias

    /*
     * SJCL is open. You can use, modify and redistribute it under a BSD
     * license or under the GNU GPL, version 2.0.
     */

    /** @fileOverview Javascript cryptography implementation.
     *
     * Crush to remove comments, shorten variable names and
     * generally reduce transmission size.
     *
     * @author Emily Stark
     * @author Mike Hamburg
     * @author Dan Boneh
     */

    /*jslint indent: 2, bitwise: false, nomen: false, plusplus: false, white: false, regexp: false */

    /** @fileOverview Arrays of bits, encoded as arrays of Numbers.
     *
     * @author Emily Stark
     * @author Mike Hamburg
     * @author Dan Boneh
     */

    /**
     * Arrays of bits, encoded as arrays of Numbers.
     * @namespace
     * @description
     * <p>
     * These objects are the currency accepted by SJCL's crypto functions.
     * </p>
     *
     * <p>
     * Most of our crypto primitives operate on arrays of 4-byte words internally,
     * but many of them can take arguments that are not a multiple of 4 bytes.
     * This library encodes arrays of bits (whose size need not be a multiple of 8
     * bits) as arrays of 32-bit words.  The bits are packed, big-endian, into an
     * array of words, 32 bits at a time.  Since the words are double-precision
     * floating point numbers, they fit some extra data.  We use this (in a private,
     * possibly-changing manner) to encode the number of bits actually  present
     * in the last word of the array.
     * </p>
     *
     * <p>
     * Because bitwise ops clear this out-of-band data, these arrays can be passed
     * to ciphers like AES which want arrays of words.
     * </p>
     */
    const bitArray = {
    	/**
    	 * Concatenate two bit arrays.
    	 * @param {bitArray} a1 The first array.
    	 * @param {bitArray} a2 The second array.
    	 * @return {bitArray} The concatenation of a1 and a2.
    	 */
    	concat(a1, a2) {
    		if (a1.length === 0 || a2.length === 0) {
    			return a1.concat(a2);
    		}

    		const last = a1[a1.length - 1], shift = bitArray.getPartial(last);
    		if (shift === 32) {
    			return a1.concat(a2);
    		} else {
    			return bitArray._shiftRight(a2, shift, last | 0, a1.slice(0, a1.length - 1));
    		}
    	},

    	/**
    	 * Find the length of an array of bits.
    	 * @param {bitArray} a The array.
    	 * @return {Number} The length of a, in bits.
    	 */
    	bitLength(a) {
    		const l = a.length;
    		if (l === 0) {
    			return 0;
    		}
    		const x = a[l - 1];
    		return (l - 1) * 32 + bitArray.getPartial(x);
    	},

    	/**
    	 * Truncate an array.
    	 * @param {bitArray} a The array.
    	 * @param {Number} len The length to truncate to, in bits.
    	 * @return {bitArray} A new array, truncated to len bits.
    	 */
    	clamp(a, len) {
    		if (a.length * 32 < len) {
    			return a;
    		}
    		a = a.slice(0, Math.ceil(len / 32));
    		const l = a.length;
    		len = len & 31;
    		if (l > 0 && len) {
    			a[l - 1] = bitArray.partial(len, a[l - 1] & 0x80000000 >> (len - 1), 1);
    		}
    		return a;
    	},

    	/**
    	 * Make a partial word for a bit array.
    	 * @param {Number} len The number of bits in the word.
    	 * @param {Number} x The bits.
    	 * @param {Number} [_end=0] Pass 1 if x has already been shifted to the high side.
    	 * @return {Number} The partial word.
    	 */
    	partial(len, x, _end) {
    		if (len === 32) {
    			return x;
    		}
    		return (_end ? x | 0 : x << (32 - len)) + len * 0x10000000000;
    	},

    	/**
    	 * Get the number of bits used by a partial word.
    	 * @param {Number} x The partial word.
    	 * @return {Number} The number of bits used by the partial word.
    	 */
    	getPartial(x) {
    		return Math.round(x / 0x10000000000) || 32;
    	},

    	/** Shift an array right.
    	 * @param {bitArray} a The array to shift.
    	 * @param {Number} shift The number of bits to shift.
    	 * @param {Number} [carry=0] A byte to carry in
    	 * @param {bitArray} [out=[]] An array to prepend to the output.
    	 * @private
    	 */
    	_shiftRight(a, shift, carry, out) {
    		if (out === undefined) {
    			out = [];
    		}

    		for (; shift >= 32; shift -= 32) {
    			out.push(carry);
    			carry = 0;
    		}
    		if (shift === 0) {
    			return out.concat(a);
    		}

    		for (let i = 0; i < a.length; i++) {
    			out.push(carry | a[i] >>> shift);
    			carry = a[i] << (32 - shift);
    		}
    		const last2 = a.length ? a[a.length - 1] : 0;
    		const shift2 = bitArray.getPartial(last2);
    		out.push(bitArray.partial(shift + shift2 & 31, (shift + shift2 > 32) ? carry : out.pop(), 1));
    		return out;
    	}
    };

    /** @fileOverview Bit array codec implementations.
     *
     * @author Emily Stark
     * @author Mike Hamburg
     * @author Dan Boneh
     */

    /**
     * Arrays of bytes
     * @namespace
     */
    const codec = {
    	bytes: {
    		/** Convert from a bitArray to an array of bytes. */
    		fromBits(arr) {
    			const bl = bitArray.bitLength(arr);
    			const byteLength = bl / 8;
    			const out = new Uint8Array(byteLength);
    			let tmp;
    			for (let i = 0; i < byteLength; i++) {
    				if ((i & 3) === 0) {
    					tmp = arr[i / 4];
    				}
    				out[i] = tmp >>> 24;
    				tmp <<= 8;
    			}
    			return out;
    		},
    		/** Convert from an array of bytes to a bitArray. */
    		toBits(bytes) {
    			const out = [];
    			let i;
    			let tmp = 0;
    			for (i = 0; i < bytes.length; i++) {
    				tmp = tmp << 8 | bytes[i];
    				if ((i & 3) === 3) {
    					out.push(tmp);
    					tmp = 0;
    				}
    			}
    			if (i & 3) {
    				out.push(bitArray.partial(8 * (i & 3), tmp));
    			}
    			return out;
    		}
    	}
    };

    const hash = {};

    /**
     * Context for a SHA-1 operation in progress.
     * @constructor
     */
    hash.sha1 = class {
    	constructor(hash) {
    		const sha1 = this;
    		/**
    		 * The hash's block size, in bits.
    		 * @constant
    		 */
    		sha1.blockSize = 512;
    		/**
    		 * The SHA-1 initialization vector.
    		 * @private
    		 */
    		sha1._init = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    		/**
    		 * The SHA-1 hash key.
    		 * @private
    		 */
    		sha1._key = [0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xCA62C1D6];
    		if (hash) {
    			sha1._h = hash._h.slice(0);
    			sha1._buffer = hash._buffer.slice(0);
    			sha1._length = hash._length;
    		} else {
    			sha1.reset();
    		}
    	}

    	/**
    	 * Reset the hash state.
    	 * @return this
    	 */
    	reset() {
    		const sha1 = this;
    		sha1._h = sha1._init.slice(0);
    		sha1._buffer = [];
    		sha1._length = 0;
    		return sha1;
    	}

    	/**
    	 * Input several words to the hash.
    	 * @param {bitArray|String} data the data to hash.
    	 * @return this
    	 */
    	update(data) {
    		const sha1 = this;
    		if (typeof data === "string") {
    			data = codec.utf8String.toBits(data);
    		}
    		const b = sha1._buffer = bitArray.concat(sha1._buffer, data);
    		const ol = sha1._length;
    		const nl = sha1._length = ol + bitArray.bitLength(data);
    		if (nl > 9007199254740991) {
    			throw new Error("Cannot hash more than 2^53 - 1 bits");
    		}
    		const c = new Uint32Array(b);
    		let j = 0;
    		for (let i = sha1.blockSize + ol - ((sha1.blockSize + ol) & (sha1.blockSize - 1)); i <= nl;
    			i += sha1.blockSize) {
    			sha1._block(c.subarray(16 * j, 16 * (j + 1)));
    			j += 1;
    		}
    		b.splice(0, 16 * j);
    		return sha1;
    	}

    	/**
    	 * Complete hashing and output the hash value.
    	 * @return {bitArray} The hash value, an array of 5 big-endian words. TODO
    	 */
    	finalize() {
    		const sha1 = this;
    		let b = sha1._buffer;
    		const h = sha1._h;

    		// Round out and push the buffer
    		b = bitArray.concat(b, [bitArray.partial(1, 1)]);
    		// Round out the buffer to a multiple of 16 words, less the 2 length words.
    		for (let i = b.length + 2; i & 15; i++) {
    			b.push(0);
    		}

    		// append the length
    		b.push(Math.floor(sha1._length / 0x100000000));
    		b.push(sha1._length | 0);

    		while (b.length) {
    			sha1._block(b.splice(0, 16));
    		}

    		sha1.reset();
    		return h;
    	}

    	/**
    	 * The SHA-1 logical functions f(0), f(1), ..., f(79).
    	 * @private
    	 */
    	_f(t, b, c, d) {
    		if (t <= 19) {
    			return (b & c) | (~b & d);
    		} else if (t <= 39) {
    			return b ^ c ^ d;
    		} else if (t <= 59) {
    			return (b & c) | (b & d) | (c & d);
    		} else if (t <= 79) {
    			return b ^ c ^ d;
    		}
    	}

    	/**
    	 * Circular left-shift operator.
    	 * @private
    	 */
    	_S(n, x) {
    		return (x << n) | (x >>> 32 - n);
    	}

    	/**
    	 * Perform one cycle of SHA-1.
    	 * @param {Uint32Array|bitArray} words one block of words.
    	 * @private
    	 */
    	_block(words) {
    		const sha1 = this;
    		const h = sha1._h;
    		// When words is passed to _block, it has 16 elements. SHA1 _block
    		// function extends words with new elements (at the end there are 80 elements). 
    		// The problem is that if we use Uint32Array instead of Array, 
    		// the length of Uint32Array cannot be changed. Thus, we replace words with a 
    		// normal Array here.
    		const w = Array(80); // do not use Uint32Array here as the instantiation is slower
    		for (let j = 0; j < 16; j++) {
    			w[j] = words[j];
    		}

    		let a = h[0];
    		let b = h[1];
    		let c = h[2];
    		let d = h[3];
    		let e = h[4];

    		for (let t = 0; t <= 79; t++) {
    			if (t >= 16) {
    				w[t] = sha1._S(1, w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]);
    			}
    			const tmp = (sha1._S(5, a) + sha1._f(t, b, c, d) + e + w[t] +
    				sha1._key[Math.floor(t / 20)]) | 0;
    			e = d;
    			d = c;
    			c = sha1._S(30, b);
    			b = a;
    			a = tmp;
    		}

    		h[0] = (h[0] + a) | 0;
    		h[1] = (h[1] + b) | 0;
    		h[2] = (h[2] + c) | 0;
    		h[3] = (h[3] + d) | 0;
    		h[4] = (h[4] + e) | 0;
    	}
    };

    /** @fileOverview Low-level AES implementation.
     *
     * This file contains a low-level implementation of AES, optimized for
     * size and for efficiency on several browsers.  It is based on
     * OpenSSL's aes_core.c, a public-domain implementation by Vincent
     * Rijmen, Antoon Bosselaers and Paulo Barreto.
     *
     * An older version of this implementation is available in the public
     * domain, but this one is (c) Emily Stark, Mike Hamburg, Dan Boneh,
     * Stanford University 2008-2010 and BSD-licensed for liability
     * reasons.
     *
     * @author Emily Stark
     * @author Mike Hamburg
     * @author Dan Boneh
     */

    const cipher = {};

    /**
     * Schedule out an AES key for both encryption and decryption.  This
     * is a low-level class.  Use a cipher mode to do bulk encryption.
     *
     * @constructor
     * @param {Array} key The key as an array of 4, 6 or 8 words.
     */
    cipher.aes = class {
    	constructor(key) {
    		/**
    		 * The expanded S-box and inverse S-box tables.  These will be computed
    		 * on the client so that we don't have to send them down the wire.
    		 *
    		 * There are two tables, _tables[0] is for encryption and
    		 * _tables[1] is for decryption.
    		 *
    		 * The first 4 sub-tables are the expanded S-box with MixColumns.  The
    		 * last (_tables[01][4]) is the S-box itself.
    		 *
    		 * @private
    		 */
    		const aes = this;
    		aes._tables = [[[], [], [], [], []], [[], [], [], [], []]];

    		if (!aes._tables[0][0][0]) {
    			aes._precompute();
    		}

    		const sbox = aes._tables[0][4];
    		const decTable = aes._tables[1];
    		const keyLen = key.length;

    		let i, encKey, decKey, rcon = 1;

    		if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
    			throw new Error("invalid aes key size");
    		}

    		aes._key = [encKey = key.slice(0), decKey = []];

    		// schedule encryption keys
    		for (i = keyLen; i < 4 * keyLen + 28; i++) {
    			let tmp = encKey[i - 1];

    			// apply sbox
    			if (i % keyLen === 0 || (keyLen === 8 && i % keyLen === 4)) {
    				tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];

    				// shift rows and add rcon
    				if (i % keyLen === 0) {
    					tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
    					rcon = rcon << 1 ^ (rcon >> 7) * 283;
    				}
    			}

    			encKey[i] = encKey[i - keyLen] ^ tmp;
    		}

    		// schedule decryption keys
    		for (let j = 0; i; j++, i--) {
    			const tmp = encKey[j & 3 ? i : i - 4];
    			if (i <= 4 || j < 4) {
    				decKey[j] = tmp;
    			} else {
    				decKey[j] = decTable[0][sbox[tmp >>> 24]] ^
    					decTable[1][sbox[tmp >> 16 & 255]] ^
    					decTable[2][sbox[tmp >> 8 & 255]] ^
    					decTable[3][sbox[tmp & 255]];
    			}
    		}
    	}
    	// public
    	/* Something like this might appear here eventually
    	name: "AES",
    	blockSize: 4,
    	keySizes: [4,6,8],
    	*/

    	/**
    	 * Encrypt an array of 4 big-endian words.
    	 * @param {Array} data The plaintext.
    	 * @return {Array} The ciphertext.
    	 */
    	encrypt(data) {
    		return this._crypt(data, 0);
    	}

    	/**
    	 * Decrypt an array of 4 big-endian words.
    	 * @param {Array} data The ciphertext.
    	 * @return {Array} The plaintext.
    	 */
    	decrypt(data) {
    		return this._crypt(data, 1);
    	}

    	/**
    	 * Expand the S-box tables.
    	 *
    	 * @private
    	 */
    	_precompute() {
    		const encTable = this._tables[0];
    		const decTable = this._tables[1];
    		const sbox = encTable[4];
    		const sboxInv = decTable[4];
    		const d = [];
    		const th = [];
    		let xInv, x2, x4, x8;

    		// Compute double and third tables
    		for (let i = 0; i < 256; i++) {
    			th[(d[i] = i << 1 ^ (i >> 7) * 283) ^ i] = i;
    		}

    		for (let x = xInv = 0; !sbox[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
    			// Compute sbox
    			let s = xInv ^ xInv << 1 ^ xInv << 2 ^ xInv << 3 ^ xInv << 4;
    			s = s >> 8 ^ s & 255 ^ 99;
    			sbox[x] = s;
    			sboxInv[s] = x;

    			// Compute MixColumns
    			x8 = d[x4 = d[x2 = d[x]]];
    			let tDec = x8 * 0x1010101 ^ x4 * 0x10001 ^ x2 * 0x101 ^ x * 0x1010100;
    			let tEnc = d[s] * 0x101 ^ s * 0x1010100;

    			for (let i = 0; i < 4; i++) {
    				encTable[i][x] = tEnc = tEnc << 24 ^ tEnc >>> 8;
    				decTable[i][s] = tDec = tDec << 24 ^ tDec >>> 8;
    			}
    		}

    		// Compactify.  Considerable speedup on Firefox.
    		for (let i = 0; i < 5; i++) {
    			encTable[i] = encTable[i].slice(0);
    			decTable[i] = decTable[i].slice(0);
    		}
    	}

    	/**
    	 * Encryption and decryption core.
    	 * @param {Array} input Four words to be encrypted or decrypted.
    	 * @param dir The direction, 0 for encrypt and 1 for decrypt.
    	 * @return {Array} The four encrypted or decrypted words.
    	 * @private
    	 */
    	_crypt(input, dir) {
    		if (input.length !== 4) {
    			throw new Error("invalid aes block size");
    		}

    		const key = this._key[dir];

    		const nInnerRounds = key.length / 4 - 2;
    		const out = [0, 0, 0, 0];
    		const table = this._tables[dir];

    		// load up the tables
    		const t0 = table[0];
    		const t1 = table[1];
    		const t2 = table[2];
    		const t3 = table[3];
    		const sbox = table[4];

    		// state variables a,b,c,d are loaded with pre-whitened data
    		let a = input[0] ^ key[0];
    		let b = input[dir ? 3 : 1] ^ key[1];
    		let c = input[2] ^ key[2];
    		let d = input[dir ? 1 : 3] ^ key[3];
    		let kIndex = 4;
    		let a2, b2, c2;

    		// Inner rounds.  Cribbed from OpenSSL.
    		for (let i = 0; i < nInnerRounds; i++) {
    			a2 = t0[a >>> 24] ^ t1[b >> 16 & 255] ^ t2[c >> 8 & 255] ^ t3[d & 255] ^ key[kIndex];
    			b2 = t0[b >>> 24] ^ t1[c >> 16 & 255] ^ t2[d >> 8 & 255] ^ t3[a & 255] ^ key[kIndex + 1];
    			c2 = t0[c >>> 24] ^ t1[d >> 16 & 255] ^ t2[a >> 8 & 255] ^ t3[b & 255] ^ key[kIndex + 2];
    			d = t0[d >>> 24] ^ t1[a >> 16 & 255] ^ t2[b >> 8 & 255] ^ t3[c & 255] ^ key[kIndex + 3];
    			kIndex += 4;
    			a = a2; b = b2; c = c2;
    		}

    		// Last round.
    		for (let i = 0; i < 4; i++) {
    			out[dir ? 3 & -i : i] =
    				sbox[a >>> 24] << 24 ^
    				sbox[b >> 16 & 255] << 16 ^
    				sbox[c >> 8 & 255] << 8 ^
    				sbox[d & 255] ^
    				key[kIndex++];
    			a2 = a; a = b; b = c; c = d; d = a2;
    		}

    		return out;
    	}
    };

    /**
     * Random values
     * @namespace
     */
    const random = {
    	/** 
    	 * Generate random words with pure js, cryptographically not as strong & safe as native implementation.
    	 * @param {TypedArray} typedArray The array to fill.
    	 * @return {TypedArray} The random values.
    	 */
    	getRandomValues(typedArray) {
    		const words = new Uint32Array(typedArray.buffer);
    		const r = (m_w) => {
    			let m_z = 0x3ade68b1;
    			const mask = 0xffffffff;
    			return function () {
    				m_z = (0x9069 * (m_z & 0xFFFF) + (m_z >> 0x10)) & mask;
    				m_w = (0x4650 * (m_w & 0xFFFF) + (m_w >> 0x10)) & mask;
    				const result = ((((m_z << 0x10) + m_w) & mask) / 0x100000000) + .5;
    				return result * (Math.random() > .5 ? 1 : -1);
    			};
    		};
    		for (let i = 0, rcache; i < typedArray.length; i += 4) {
    			const _r = r((rcache || Math.random()) * 0x100000000);
    			rcache = _r() * 0x3ade67b7;
    			words[i / 4] = (_r() * 0x100000000) | 0;
    		}
    		return typedArray;
    	}
    };

    /** @fileOverview CTR mode implementation.
     *
     * Special thanks to Roy Nicholson for pointing out a bug in our
     * implementation.
     *
     * @author Emily Stark
     * @author Mike Hamburg
     * @author Dan Boneh
     */

    /** Brian Gladman's CTR Mode.
    * @constructor
    * @param {Object} _prf The aes instance to generate key.
    * @param {bitArray} _iv The iv for ctr mode, it must be 128 bits.
    */

    const mode = {};

    /**
     * Brian Gladman's CTR Mode.
     * @namespace
     */
    mode.ctrGladman = class {
    	constructor(prf, iv) {
    		this._prf = prf;
    		this._initIv = iv;
    		this._iv = iv;
    	}

    	reset() {
    		this._iv = this._initIv;
    	}

    	/** Input some data to calculate.
    	 * @param {bitArray} data the data to process, it must be intergral multiple of 128 bits unless it's the last.
    	 */
    	update(data) {
    		return this.calculate(this._prf, data, this._iv);
    	}

    	incWord(word) {
    		if (((word >> 24) & 0xff) === 0xff) { //overflow
    			let b1 = (word >> 16) & 0xff;
    			let b2 = (word >> 8) & 0xff;
    			let b3 = word & 0xff;

    			if (b1 === 0xff) { // overflow b1   
    				b1 = 0;
    				if (b2 === 0xff) {
    					b2 = 0;
    					if (b3 === 0xff) {
    						b3 = 0;
    					} else {
    						++b3;
    					}
    				} else {
    					++b2;
    				}
    			} else {
    				++b1;
    			}

    			word = 0;
    			word += (b1 << 16);
    			word += (b2 << 8);
    			word += b3;
    		} else {
    			word += (0x01 << 24);
    		}
    		return word;
    	}

    	incCounter(counter) {
    		if ((counter[0] = this.incWord(counter[0])) === 0) {
    			// encr_data in fileenc.c from  Dr Brian Gladman's counts only with DWORD j < 8
    			counter[1] = this.incWord(counter[1]);
    		}
    	}

    	calculate(prf, data, iv) {
    		let l;
    		if (!(l = data.length)) {
    			return [];
    		}
    		const bl = bitArray.bitLength(data);
    		for (let i = 0; i < l; i += 4) {
    			this.incCounter(iv);
    			const e = prf.encrypt(iv);
    			data[i] ^= e[0];
    			data[i + 1] ^= e[1];
    			data[i + 2] ^= e[2];
    			data[i + 3] ^= e[3];
    		}
    		return bitArray.clamp(data, bl);
    	}
    };

    const misc = {
    	importKey(password) {
    		return new misc.hmacSha1(codec.bytes.toBits(password));
    	},
    	pbkdf2(prf, salt, count, length) {
    		count = count || 10000;
    		if (length < 0 || count < 0) {
    			throw new Error("invalid params to pbkdf2");
    		}
    		const byteLength = ((length >> 5) + 1) << 2;
    		let u, ui, i, j, k;
    		const arrayBuffer = new ArrayBuffer(byteLength);
    		const out = new DataView(arrayBuffer);
    		let outLength = 0;
    		const b = bitArray;
    		salt = codec.bytes.toBits(salt);
    		for (k = 1; outLength < (byteLength || 1); k++) {
    			u = ui = prf.encrypt(b.concat(salt, [k]));
    			for (i = 1; i < count; i++) {
    				ui = prf.encrypt(ui);
    				for (j = 0; j < ui.length; j++) {
    					u[j] ^= ui[j];
    				}
    			}
    			for (i = 0; outLength < (byteLength || 1) && i < u.length; i++) {
    				out.setInt32(outLength, u[i]);
    				outLength += 4;
    			}
    		}
    		return arrayBuffer.slice(0, length / 8);
    	}
    };

    /** @fileOverview HMAC implementation.
     *
     * @author Emily Stark
     * @author Mike Hamburg
     * @author Dan Boneh
     */

    /** HMAC with the specified hash function.
     * @constructor
     * @param {bitArray} key the key for HMAC.
     * @param {Object} [Hash=hash.sha1] The hash function to use.
     */
    misc.hmacSha1 = class {

    	constructor(key) {
    		const hmac = this;
    		const Hash = hmac._hash = hash.sha1;
    		const exKey = [[], []];
    		hmac._baseHash = [new Hash(), new Hash()];
    		const bs = hmac._baseHash[0].blockSize / 32;

    		if (key.length > bs) {
    			key = new Hash().update(key).finalize();
    		}

    		for (let i = 0; i < bs; i++) {
    			exKey[0][i] = key[i] ^ 0x36363636;
    			exKey[1][i] = key[i] ^ 0x5C5C5C5C;
    		}

    		hmac._baseHash[0].update(exKey[0]);
    		hmac._baseHash[1].update(exKey[1]);
    		hmac._resultHash = new Hash(hmac._baseHash[0]);
    	}
    	reset() {
    		const hmac = this;
    		hmac._resultHash = new hmac._hash(hmac._baseHash[0]);
    		hmac._updated = false;
    	}

    	update(data) {
    		const hmac = this;
    		hmac._updated = true;
    		hmac._resultHash.update(data);
    	}

    	digest() {
    		const hmac = this;
    		const w = hmac._resultHash.finalize();
    		const result = new (hmac._hash)(hmac._baseHash[1]).update(w).finalize();

    		hmac.reset();

    		return result;
    	}

    	encrypt(data) {
    		if (!this._updated) {
    			this.update(data);
    			return this.digest(data);
    		} else {
    			throw new Error("encrypt on already updated hmac called!");
    		}
    	}
    };

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const GET_RANDOM_VALUES_SUPPORTED = typeof crypto != UNDEFINED_TYPE && typeof crypto.getRandomValues == FUNCTION_TYPE;

    const ERR_INVALID_PASSWORD = "Invalid password";
    const ERR_INVALID_SIGNATURE = "Invalid signature";
    const ERR_ABORT_CHECK_PASSWORD = "zipjs-abort-check-password";

    function getRandomValues(array) {
    	if (GET_RANDOM_VALUES_SUPPORTED) {
    		return crypto.getRandomValues(array);
    	} else {
    		return random.getRandomValues(array);
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const BLOCK_LENGTH = 16;
    const RAW_FORMAT = "raw";
    const PBKDF2_ALGORITHM = { name: "PBKDF2" };
    const HASH_ALGORITHM = { name: "HMAC" };
    const HASH_FUNCTION = "SHA-1";
    const BASE_KEY_ALGORITHM = Object.assign({ hash: HASH_ALGORITHM }, PBKDF2_ALGORITHM);
    const DERIVED_BITS_ALGORITHM = Object.assign({ iterations: 1000, hash: { name: HASH_FUNCTION } }, PBKDF2_ALGORITHM);
    const DERIVED_BITS_USAGE = ["deriveBits"];
    const SALT_LENGTH = [8, 12, 16];
    const KEY_LENGTH = [16, 24, 32];
    const SIGNATURE_LENGTH = 10;
    const COUNTER_DEFAULT_VALUE = [0, 0, 0, 0];
    // deno-lint-ignore valid-typeof
    const CRYPTO_API_SUPPORTED = typeof crypto != UNDEFINED_TYPE;
    const subtle = CRYPTO_API_SUPPORTED && crypto.subtle;
    const SUBTLE_API_SUPPORTED = CRYPTO_API_SUPPORTED && typeof subtle != UNDEFINED_TYPE;
    const codecBytes = codec.bytes;
    const Aes = cipher.aes;
    const CtrGladman = mode.ctrGladman;
    const HmacSha1 = misc.hmacSha1;

    let IMPORT_KEY_SUPPORTED = CRYPTO_API_SUPPORTED && SUBTLE_API_SUPPORTED && typeof subtle.importKey == FUNCTION_TYPE;
    let DERIVE_BITS_SUPPORTED = CRYPTO_API_SUPPORTED && SUBTLE_API_SUPPORTED && typeof subtle.deriveBits == FUNCTION_TYPE;

    class AESDecryptionStream extends TransformStream {

    	constructor({ password, rawPassword, signed, encryptionStrength, checkPasswordOnly }) {
    		super({
    			start() {
    				Object.assign(this, {
    					ready: new Promise(resolve => this.resolveReady = resolve),
    					password: encodePassword(password, rawPassword),
    					signed,
    					strength: encryptionStrength - 1,
    					pending: new Uint8Array()
    				});
    			},
    			async transform(chunk, controller) {
    				const aesCrypto = this;
    				const {
    					password,
    					strength,
    					resolveReady,
    					ready
    				} = aesCrypto;
    				if (password) {
    					await createDecryptionKeys(aesCrypto, strength, password, subarray(chunk, 0, SALT_LENGTH[strength] + 2));
    					chunk = subarray(chunk, SALT_LENGTH[strength] + 2);
    					if (checkPasswordOnly) {
    						controller.error(new Error(ERR_ABORT_CHECK_PASSWORD));
    					} else {
    						resolveReady();
    					}
    				} else {
    					await ready;
    				}
    				const output = new Uint8Array(chunk.length - SIGNATURE_LENGTH - ((chunk.length - SIGNATURE_LENGTH) % BLOCK_LENGTH));
    				controller.enqueue(append(aesCrypto, chunk, output, 0, SIGNATURE_LENGTH, true));
    			},
    			async flush(controller) {
    				const {
    					signed,
    					ctr,
    					hmac,
    					pending,
    					ready
    				} = this;
    				if (hmac && ctr) {
    					await ready;
    					const chunkToDecrypt = subarray(pending, 0, pending.length - SIGNATURE_LENGTH);
    					const originalSignature = subarray(pending, pending.length - SIGNATURE_LENGTH);
    					let decryptedChunkArray = new Uint8Array();
    					if (chunkToDecrypt.length) {
    						const encryptedChunk = toBits(codecBytes, chunkToDecrypt);
    						hmac.update(encryptedChunk);
    						const decryptedChunk = ctr.update(encryptedChunk);
    						decryptedChunkArray = fromBits(codecBytes, decryptedChunk);
    					}
    					if (signed) {
    						const signature = subarray(fromBits(codecBytes, hmac.digest()), 0, SIGNATURE_LENGTH);
    						for (let indexSignature = 0; indexSignature < SIGNATURE_LENGTH; indexSignature++) {
    							if (signature[indexSignature] != originalSignature[indexSignature]) {
    								throw new Error(ERR_INVALID_SIGNATURE);
    							}
    						}
    					}
    					controller.enqueue(decryptedChunkArray);
    				}
    			}
    		});
    	}
    }

    class AESEncryptionStream extends TransformStream {

    	constructor({ password, rawPassword, encryptionStrength }) {
    		// deno-lint-ignore prefer-const
    		let stream;
    		super({
    			start() {
    				Object.assign(this, {
    					ready: new Promise(resolve => this.resolveReady = resolve),
    					password: encodePassword(password, rawPassword),
    					strength: encryptionStrength - 1,
    					pending: new Uint8Array()
    				});
    			},
    			async transform(chunk, controller) {
    				const aesCrypto = this;
    				const {
    					password,
    					strength,
    					resolveReady,
    					ready
    				} = aesCrypto;
    				let preamble = new Uint8Array();
    				if (password) {
    					preamble = await createEncryptionKeys(aesCrypto, strength, password);
    					resolveReady();
    				} else {
    					await ready;
    				}
    				const output = new Uint8Array(preamble.length + chunk.length - (chunk.length % BLOCK_LENGTH));
    				output.set(preamble, 0);
    				controller.enqueue(append(aesCrypto, chunk, output, preamble.length, 0));
    			},
    			async flush(controller) {
    				const {
    					ctr,
    					hmac,
    					pending,
    					ready
    				} = this;
    				if (hmac && ctr) {
    					await ready;
    					let encryptedChunkArray = new Uint8Array();
    					if (pending.length) {
    						const encryptedChunk = ctr.update(toBits(codecBytes, pending));
    						hmac.update(encryptedChunk);
    						encryptedChunkArray = fromBits(codecBytes, encryptedChunk);
    					}
    					stream.signature = fromBits(codecBytes, hmac.digest()).slice(0, SIGNATURE_LENGTH);
    					controller.enqueue(concat(encryptedChunkArray, stream.signature));
    				}
    			}
    		});
    		stream = this;
    	}
    }

    function append(aesCrypto, input, output, paddingStart, paddingEnd, verifySignature) {
    	const {
    		ctr,
    		hmac,
    		pending
    	} = aesCrypto;
    	const inputLength = input.length - paddingEnd;
    	if (pending.length) {
    		input = concat(pending, input);
    		output = expand(output, inputLength - (inputLength % BLOCK_LENGTH));
    	}
    	let offset;
    	for (offset = 0; offset <= inputLength - BLOCK_LENGTH; offset += BLOCK_LENGTH) {
    		const inputChunk = toBits(codecBytes, subarray(input, offset, offset + BLOCK_LENGTH));
    		if (verifySignature) {
    			hmac.update(inputChunk);
    		}
    		const outputChunk = ctr.update(inputChunk);
    		if (!verifySignature) {
    			hmac.update(outputChunk);
    		}
    		output.set(fromBits(codecBytes, outputChunk), offset + paddingStart);
    	}
    	aesCrypto.pending = subarray(input, offset);
    	return output;
    }

    async function createDecryptionKeys(decrypt, strength, password, preamble) {
    	const passwordVerificationKey = await createKeys$1(decrypt, strength, password, subarray(preamble, 0, SALT_LENGTH[strength]));
    	const passwordVerification = subarray(preamble, SALT_LENGTH[strength]);
    	if (passwordVerificationKey[0] != passwordVerification[0] || passwordVerificationKey[1] != passwordVerification[1]) {
    		throw new Error(ERR_INVALID_PASSWORD);
    	}
    }

    async function createEncryptionKeys(encrypt, strength, password) {
    	const salt = getRandomValues(new Uint8Array(SALT_LENGTH[strength]));
    	const passwordVerification = await createKeys$1(encrypt, strength, password, salt);
    	return concat(salt, passwordVerification);
    }

    async function createKeys$1(aesCrypto, strength, password, salt) {
    	aesCrypto.password = null;
    	const baseKey = await importKey(RAW_FORMAT, password, BASE_KEY_ALGORITHM, false, DERIVED_BITS_USAGE);
    	const derivedBits = await deriveBits(Object.assign({ salt }, DERIVED_BITS_ALGORITHM), baseKey, 8 * ((KEY_LENGTH[strength] * 2) + 2));
    	const compositeKey = new Uint8Array(derivedBits);
    	const key = toBits(codecBytes, subarray(compositeKey, 0, KEY_LENGTH[strength]));
    	const authentication = toBits(codecBytes, subarray(compositeKey, KEY_LENGTH[strength], KEY_LENGTH[strength] * 2));
    	const passwordVerification = subarray(compositeKey, KEY_LENGTH[strength] * 2);
    	Object.assign(aesCrypto, {
    		keys: {
    			key,
    			authentication,
    			passwordVerification
    		},
    		ctr: new CtrGladman(new Aes(key), Array.from(COUNTER_DEFAULT_VALUE)),
    		hmac: new HmacSha1(authentication)
    	});
    	return passwordVerification;
    }

    async function importKey(format, password, algorithm, extractable, keyUsages) {
    	if (IMPORT_KEY_SUPPORTED) {
    		try {
    			return await subtle.importKey(format, password, algorithm, extractable, keyUsages);
    		} catch (_error) {
    			IMPORT_KEY_SUPPORTED = false;
    			return misc.importKey(password);
    		}
    	} else {
    		return misc.importKey(password);
    	}
    }

    async function deriveBits(algorithm, baseKey, length) {
    	if (DERIVE_BITS_SUPPORTED) {
    		try {
    			return await subtle.deriveBits(algorithm, baseKey, length);
    		} catch (_error) {
    			DERIVE_BITS_SUPPORTED = false;
    			return misc.pbkdf2(baseKey, algorithm.salt, DERIVED_BITS_ALGORITHM.iterations, length);
    		}
    	} else {
    		return misc.pbkdf2(baseKey, algorithm.salt, DERIVED_BITS_ALGORITHM.iterations, length);
    	}
    }

    function encodePassword(password, rawPassword) {
    	if (rawPassword === UNDEFINED_VALUE) {
    		return encodeText(password);
    	} else {
    		return rawPassword;
    	}
    }

    function concat(leftArray, rightArray) {
    	let array = leftArray;
    	if (leftArray.length + rightArray.length) {
    		array = new Uint8Array(leftArray.length + rightArray.length);
    		array.set(leftArray, 0);
    		array.set(rightArray, leftArray.length);
    	}
    	return array;
    }

    function expand(inputArray, length) {
    	if (length && length > inputArray.length) {
    		const array = inputArray;
    		inputArray = new Uint8Array(length);
    		inputArray.set(array, 0);
    	}
    	return inputArray;
    }

    function subarray(array, begin, end) {
    	return array.subarray(begin, end);
    }

    function fromBits(codecBytes, chunk) {
    	return codecBytes.fromBits(chunk);
    }
    function toBits(codecBytes, chunk) {
    	return codecBytes.toBits(chunk);
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const HEADER_LENGTH = 12;

    class ZipCryptoDecryptionStream extends TransformStream {

    	constructor({ password, passwordVerification, checkPasswordOnly }) {
    		super({
    			start() {
    				Object.assign(this, {
    					password,
    					passwordVerification
    				});
    				createKeys(this, password);
    			},
    			transform(chunk, controller) {
    				const zipCrypto = this;
    				if (zipCrypto.password) {
    					const decryptedHeader = decrypt(zipCrypto, chunk.subarray(0, HEADER_LENGTH));
    					zipCrypto.password = null;
    					if (decryptedHeader[HEADER_LENGTH - 1] != zipCrypto.passwordVerification) {
    						throw new Error(ERR_INVALID_PASSWORD);
    					}
    					chunk = chunk.subarray(HEADER_LENGTH);
    				}
    				if (checkPasswordOnly) {
    					controller.error(new Error(ERR_ABORT_CHECK_PASSWORD));
    				} else {
    					controller.enqueue(decrypt(zipCrypto, chunk));
    				}
    			}
    		});
    	}
    }

    class ZipCryptoEncryptionStream extends TransformStream {

    	constructor({ password, passwordVerification }) {
    		super({
    			start() {
    				Object.assign(this, {
    					password,
    					passwordVerification
    				});
    				createKeys(this, password);
    			},
    			transform(chunk, controller) {
    				const zipCrypto = this;
    				let output;
    				let offset;
    				if (zipCrypto.password) {
    					zipCrypto.password = null;
    					const header = getRandomValues(new Uint8Array(HEADER_LENGTH));
    					header[HEADER_LENGTH - 1] = zipCrypto.passwordVerification;
    					output = new Uint8Array(chunk.length + header.length);
    					output.set(encrypt(zipCrypto, header), 0);
    					offset = HEADER_LENGTH;
    				} else {
    					output = new Uint8Array(chunk.length);
    					offset = 0;
    				}
    				output.set(encrypt(zipCrypto, chunk), offset);
    				controller.enqueue(output);
    			}
    		});
    	}
    }

    function decrypt(target, input) {
    	const output = new Uint8Array(input.length);
    	for (let index = 0; index < input.length; index++) {
    		output[index] = getByte(target) ^ input[index];
    		updateKeys(target, output[index]);
    	}
    	return output;
    }

    function encrypt(target, input) {
    	const output = new Uint8Array(input.length);
    	for (let index = 0; index < input.length; index++) {
    		output[index] = getByte(target) ^ input[index];
    		updateKeys(target, input[index]);
    	}
    	return output;
    }

    function createKeys(target, password) {
    	const keys = [0x12345678, 0x23456789, 0x34567890];
    	Object.assign(target, {
    		keys,
    		crcKey0: new Crc32(keys[0]),
    		crcKey2: new Crc32(keys[2]),
    	});
    	for (let index = 0; index < password.length; index++) {
    		updateKeys(target, password.charCodeAt(index));
    	}
    }

    function updateKeys(target, byte) {
    	let [key0, key1, key2] = target.keys;
    	target.crcKey0.append([byte]);
    	key0 = ~target.crcKey0.get();
    	key1 = getInt32(Math.imul(getInt32(key1 + getInt8(key0)), 134775813) + 1);
    	target.crcKey2.append([key1 >>> 24]);
    	key2 = ~target.crcKey2.get();
    	target.keys = [key0, key1, key2];
    }

    function getByte(target) {
    	const temp = target.keys[2] | 2;
    	return getInt8(Math.imul(temp, (temp ^ 1)) >>> 8);
    }

    function getInt8(number) {
    	return number & 0xFF;
    }

    function getInt32(number) {
    	return number & 0xFFFFFFFF;
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const COMPRESSION_FORMAT = "deflate-raw";

    class DeflateStream extends TransformStream {

    	constructor(options, { chunkSize, CompressionStream, CompressionStreamNative }) {
    		super({});
    		const { compressed, encrypted, useCompressionStream, zipCrypto, signed, level } = options;
    		const stream = this;
    		let crc32Stream, encryptionStream;
    		let readable = filterEmptyChunks(super.readable);
    		if ((!encrypted || zipCrypto) && signed) {
    			crc32Stream = new Crc32Stream();
    			readable = pipeThrough(readable, crc32Stream);
    		}
    		if (compressed) {
    			readable = pipeThroughCommpressionStream(readable, useCompressionStream, { level, chunkSize }, CompressionStreamNative, CompressionStream);
    		}
    		if (encrypted) {
    			if (zipCrypto) {
    				readable = pipeThrough(readable, new ZipCryptoEncryptionStream(options));
    			} else {
    				encryptionStream = new AESEncryptionStream(options);
    				readable = pipeThrough(readable, encryptionStream);
    			}
    		}
    		setReadable(stream, readable, () => {
    			let signature;
    			if (encrypted && !zipCrypto) {
    				signature = encryptionStream.signature;
    			}
    			if ((!encrypted || zipCrypto) && signed) {
    				signature = new DataView(crc32Stream.value.buffer).getUint32(0);
    			}
    			stream.signature = signature;
    		});
    	}
    }

    class InflateStream extends TransformStream {

    	constructor(options, { chunkSize, DecompressionStream, DecompressionStreamNative }) {
    		super({});
    		const { zipCrypto, encrypted, signed, signature, compressed, useCompressionStream } = options;
    		let crc32Stream, decryptionStream;
    		let readable = filterEmptyChunks(super.readable);
    		if (encrypted) {
    			if (zipCrypto) {
    				readable = pipeThrough(readable, new ZipCryptoDecryptionStream(options));
    			} else {
    				decryptionStream = new AESDecryptionStream(options);
    				readable = pipeThrough(readable, decryptionStream);
    			}
    		}
    		if (compressed) {
    			readable = pipeThroughCommpressionStream(readable, useCompressionStream, { chunkSize }, DecompressionStreamNative, DecompressionStream);
    		}
    		if ((!encrypted || zipCrypto) && signed) {
    			crc32Stream = new Crc32Stream();
    			readable = pipeThrough(readable, crc32Stream);
    		}
    		setReadable(this, readable, () => {
    			if ((!encrypted || zipCrypto) && signed) {
    				const dataViewSignature = new DataView(crc32Stream.value.buffer);
    				if (signature != dataViewSignature.getUint32(0, false)) {
    					throw new Error(ERR_INVALID_SIGNATURE);
    				}
    			}
    		});
    	}
    }

    function filterEmptyChunks(readable) {
    	return pipeThrough(readable, new TransformStream({
    		transform(chunk, controller) {
    			if (chunk && chunk.length) {
    				controller.enqueue(chunk);
    			}
    		}
    	}));
    }

    function setReadable(stream, readable, flush) {
    	readable = pipeThrough(readable, new TransformStream({ flush }));
    	Object.defineProperty(stream, "readable", {
    		get() {
    			return readable;
    		}
    	});
    }

    function pipeThroughCommpressionStream(readable, useCompressionStream, options, CodecStreamNative, CodecStream) {
    	try {
    		const CompressionStream = useCompressionStream && CodecStreamNative ? CodecStreamNative : CodecStream;
    		readable = pipeThrough(readable, new CompressionStream(COMPRESSION_FORMAT, options));
    	} catch (error) {
    		if (useCompressionStream) {
    			try {
    				readable = pipeThrough(readable, new CodecStream(COMPRESSION_FORMAT, options));
    			} catch (error) {
    				return readable;
    			}
    		} else {
    			return readable;
    		}
    	}
    	return readable;
    }

    function pipeThrough(readable, transformStream) {
    	return readable.pipeThrough(transformStream);
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const MESSAGE_EVENT_TYPE = "message";
    const MESSAGE_START = "start";
    const MESSAGE_PULL = "pull";
    const MESSAGE_DATA = "data";
    const MESSAGE_ACK_DATA = "ack";
    const MESSAGE_CLOSE = "close";
    const CODEC_DEFLATE = "deflate";
    const CODEC_INFLATE = "inflate";

    class CodecStream extends TransformStream {

    	constructor(options, config) {
    		super({});
    		const codec = this;
    		const { codecType } = options;
    		let Stream;
    		if (codecType.startsWith(CODEC_DEFLATE)) {
    			Stream = DeflateStream;
    		} else if (codecType.startsWith(CODEC_INFLATE)) {
    			Stream = InflateStream;
    		}
    		let outputSize = 0;
    		let inputSize = 0;
    		const stream = new Stream(options, config);
    		const readable = super.readable;
    		const inputSizeStream = new TransformStream({
    			transform(chunk, controller) {
    				if (chunk && chunk.length) {
    					inputSize += chunk.length;
    					controller.enqueue(chunk);
    				}
    			},
    			flush() {
    				Object.assign(codec, {
    					inputSize
    				});
    			}
    		});
    		const outputSizeStream = new TransformStream({
    			transform(chunk, controller) {
    				if (chunk && chunk.length) {
    					outputSize += chunk.length;
    					controller.enqueue(chunk);
    				}
    			},
    			flush() {
    				const { signature } = stream;
    				Object.assign(codec, {
    					signature,
    					outputSize,
    					inputSize
    				});
    			}
    		});
    		Object.defineProperty(codec, "readable", {
    			get() {
    				return readable.pipeThrough(inputSizeStream).pipeThrough(stream).pipeThrough(outputSizeStream);
    			}
    		});
    	}
    }

    class ChunkStream extends TransformStream {

    	constructor(chunkSize) {
    		let pendingChunk;
    		super({
    			transform,
    			flush(controller) {
    				if (pendingChunk && pendingChunk.length) {
    					controller.enqueue(pendingChunk);
    				}
    			}
    		});

    		function transform(chunk, controller) {
    			if (pendingChunk) {
    				const newChunk = new Uint8Array(pendingChunk.length + chunk.length);
    				newChunk.set(pendingChunk);
    				newChunk.set(chunk, pendingChunk.length);
    				chunk = newChunk;
    				pendingChunk = null;
    			}
    			if (chunk.length > chunkSize) {
    				controller.enqueue(chunk.slice(0, chunkSize));
    				transform(chunk.slice(chunkSize), controller);
    			} else {
    				pendingChunk = chunk;
    			}
    		}
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    // deno-lint-ignore valid-typeof
    let WEB_WORKERS_SUPPORTED = typeof Worker != UNDEFINED_TYPE;

    class CodecWorker {

    	constructor(workerData, { readable, writable }, { options, config, streamOptions, useWebWorkers, transferStreams, scripts }, onTaskFinished) {
    		const { signal } = streamOptions;
    		Object.assign(workerData, {
    			busy: true,
    			readable: readable
    				.pipeThrough(new ChunkStream(config.chunkSize))
    				.pipeThrough(new ProgressWatcherStream(readable, streamOptions), { signal }),
    			writable,
    			options: Object.assign({}, options),
    			scripts,
    			transferStreams,
    			terminate() {
    				return new Promise(resolve => {
    					const { worker, busy } = workerData;
    					if (worker) {
    						if (busy) {
    							workerData.resolveTerminated = resolve;
    						} else {
    							worker.terminate();
    							resolve();
    						}
    						workerData.interface = null;
    					} else {
    						resolve();
    					}
    				});
    			},
    			onTaskFinished() {
    				const { resolveTerminated } = workerData;
    				if (resolveTerminated) {
    					workerData.resolveTerminated = null;
    					workerData.terminated = true;
    					workerData.worker.terminate();
    					resolveTerminated();
    				}
    				workerData.busy = false;
    				onTaskFinished(workerData);
    			}
    		});
    		return (useWebWorkers && WEB_WORKERS_SUPPORTED ? createWebWorkerInterface : createWorkerInterface)(workerData, config);
    	}
    }

    class ProgressWatcherStream extends TransformStream {

    	constructor(readableSource, { onstart, onprogress, size, onend }) {
    		let chunkOffset = 0;
    		super({
    			async start() {
    				if (onstart) {
    					await callHandler(onstart, size);
    				}
    			},
    			async transform(chunk, controller) {
    				chunkOffset += chunk.length;
    				if (onprogress) {
    					await callHandler(onprogress, chunkOffset, size);
    				}
    				controller.enqueue(chunk);
    			},
    			async flush() {
    				readableSource.size = chunkOffset;
    				if (onend) {
    					await callHandler(onend, chunkOffset);
    				}
    			}
    		});
    	}
    }

    async function callHandler(handler, ...parameters) {
    	try {
    		await handler(...parameters);
    	} catch (_error) {
    		// ignored
    	}
    }

    function createWorkerInterface(workerData, config) {
    	return {
    		run: () => runWorker$1(workerData, config)
    	};
    }

    function createWebWorkerInterface(workerData, config) {
    	const { baseURL, chunkSize } = config;
    	if (!workerData.interface) {
    		let worker;
    		try {
    			worker = getWebWorker(workerData.scripts[0], baseURL, workerData);
    		} catch (error) {
    			WEB_WORKERS_SUPPORTED = false;
    			return createWorkerInterface(workerData, config);
    		}
    		Object.assign(workerData, {
    			worker,
    			interface: {
    				run: () => runWebWorker(workerData, { chunkSize })
    			}
    		});
    	}
    	return workerData.interface;
    }

    async function runWorker$1({ options, readable, writable, onTaskFinished }, config) {
    	try {
    		const codecStream = new CodecStream(options, config);
    		await readable.pipeThrough(codecStream).pipeTo(writable, { preventClose: true, preventAbort: true });
    		const {
    			signature,
    			inputSize,
    			outputSize
    		} = codecStream;
    		return {
    			signature,
    			inputSize,
    			outputSize
    		};
    	} finally {
    		onTaskFinished();
    	}
    }

    async function runWebWorker(workerData, config) {
    	let resolveResult, rejectResult;
    	const result = new Promise((resolve, reject) => {
    		resolveResult = resolve;
    		rejectResult = reject;
    	});
    	Object.assign(workerData, {
    		reader: null,
    		writer: null,
    		resolveResult,
    		rejectResult,
    		result
    	});
    	const { readable, options, scripts } = workerData;
    	const { writable, closed } = watchClosedStream(workerData.writable);
    	const streamsTransferred = sendMessage({
    		type: MESSAGE_START,
    		scripts: scripts.slice(1),
    		options,
    		config,
    		readable,
    		writable
    	}, workerData);
    	if (!streamsTransferred) {
    		Object.assign(workerData, {
    			reader: readable.getReader(),
    			writer: writable.getWriter()
    		});
    	}
    	const resultValue = await result;
    	if (!streamsTransferred) {
    		await writable.getWriter().close();
    	}
    	await closed;
    	return resultValue;
    }

    function watchClosedStream(writableSource) {
    	let resolveStreamClosed;
    	const closed = new Promise(resolve => resolveStreamClosed = resolve);
    	const writable = new WritableStream({
    		async write(chunk) {
    			const writer = writableSource.getWriter();
    			await writer.ready;
    			await writer.write(chunk);
    			writer.releaseLock();
    		},
    		close() {
    			resolveStreamClosed();
    		},
    		abort(reason) {
    			const writer = writableSource.getWriter();
    			return writer.abort(reason);
    		}
    	});
    	return { writable, closed };
    }

    let classicWorkersSupported = true;
    let transferStreamsSupported = true;

    function getWebWorker(url, baseURL, workerData) {
    	const workerOptions = { type: "module" };
    	let scriptUrl, worker;
    	// deno-lint-ignore valid-typeof
    	if (typeof url == FUNCTION_TYPE) {
    		url = url();
    	}
    	try {
    		scriptUrl = new URL(url, baseURL);
    	} catch (_error) {
    		scriptUrl = url;
    	}
    	if (classicWorkersSupported) {
    		try {
    			worker = new Worker(scriptUrl);
    		} catch (_error) {
    			classicWorkersSupported = false;
    			worker = new Worker(scriptUrl, workerOptions);
    		}
    	} else {
    		worker = new Worker(scriptUrl, workerOptions);
    	}
    	worker.addEventListener(MESSAGE_EVENT_TYPE, event => onMessage(event, workerData));
    	return worker;
    }

    function sendMessage(message, { worker, writer, onTaskFinished, transferStreams }) {
    	try {
    		let { value, readable, writable } = message;
    		const transferables = [];
    		if (value) {
    			if (value.byteLength < value.buffer.byteLength) {
    				message.value = value.buffer.slice(0, value.byteLength);
    			}
    			else {
    				message.value = value.buffer;
    			}
    			transferables.push(message.value);
    		}
    		if (transferStreams && transferStreamsSupported) {
    			if (readable) {
    				transferables.push(readable);
    			}
    			if (writable) {
    				transferables.push(writable);
    			}
    		} else {
    			message.readable = message.writable = null;
    		}
    		if (transferables.length) {
    			try {
    				worker.postMessage(message, transferables);
    				return true;
    			} catch (_error) {
    				transferStreamsSupported = false;
    				message.readable = message.writable = null;
    				worker.postMessage(message);
    			}
    		} else {
    			worker.postMessage(message);
    		}
    	} catch (error) {
    		if (writer) {
    			writer.releaseLock();
    		}
    		onTaskFinished();
    		throw error;
    	}
    }

    async function onMessage({ data }, workerData) {
    	const { type, value, messageId, result, error } = data;
    	const { reader, writer, resolveResult, rejectResult, onTaskFinished } = workerData;
    	try {
    		if (error) {
    			const { message, stack, code, name } = error;
    			const responseError = new Error(message);
    			Object.assign(responseError, { stack, code, name });
    			close(responseError);
    		} else {
    			if (type == MESSAGE_PULL) {
    				const { value, done } = await reader.read();
    				sendMessage({ type: MESSAGE_DATA, value, done, messageId }, workerData);
    			}
    			if (type == MESSAGE_DATA) {
    				await writer.ready;
    				await writer.write(new Uint8Array(value));
    				sendMessage({ type: MESSAGE_ACK_DATA, messageId }, workerData);
    			}
    			if (type == MESSAGE_CLOSE) {
    				close(null, result);
    			}
    		}
    	} catch (error) {
    		sendMessage({ type: MESSAGE_CLOSE, messageId }, workerData);
    		close(error);
    	}

    	function close(error, result) {
    		if (error) {
    			rejectResult(error);
    		} else {
    			resolveResult(result);
    		}
    		if (writer) {
    			writer.releaseLock();
    		}
    		onTaskFinished();
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    let pool = [];
    const pendingRequests = [];

    let indexWorker = 0;

    async function runWorker(stream, workerOptions) {
    	const { options, config } = workerOptions;
    	const { transferStreams, useWebWorkers, useCompressionStream, codecType, compressed, signed, encrypted } = options;
    	const { workerScripts, maxWorkers } = config;
    	workerOptions.transferStreams = transferStreams || transferStreams === UNDEFINED_VALUE;
    	const streamCopy = !compressed && !signed && !encrypted && !workerOptions.transferStreams;
    	workerOptions.useWebWorkers = !streamCopy && (useWebWorkers || (useWebWorkers === UNDEFINED_VALUE && config.useWebWorkers));
    	workerOptions.scripts = workerOptions.useWebWorkers && workerScripts ? workerScripts[codecType] : [];
    	options.useCompressionStream = useCompressionStream || (useCompressionStream === UNDEFINED_VALUE && config.useCompressionStream);
    	return (await getWorker()).run();

    	async function getWorker() {
    		const workerData = pool.find(workerData => !workerData.busy);
    		if (workerData) {
    			clearTerminateTimeout(workerData);
    			return new CodecWorker(workerData, stream, workerOptions, onTaskFinished);
    		} else if (pool.length < maxWorkers) {
    			const workerData = { indexWorker };
    			indexWorker++;
    			pool.push(workerData);
    			return new CodecWorker(workerData, stream, workerOptions, onTaskFinished);
    		} else {
    			return new Promise(resolve => pendingRequests.push({ resolve, stream, workerOptions }));
    		}
    	}

    	function onTaskFinished(workerData) {
    		if (pendingRequests.length) {
    			const [{ resolve, stream, workerOptions }] = pendingRequests.splice(0, 1);
    			resolve(new CodecWorker(workerData, stream, workerOptions, onTaskFinished));
    		} else if (workerData.worker) {
    			clearTerminateTimeout(workerData);
    			terminateWorker(workerData, workerOptions);
    		} else {
    			pool = pool.filter(data => data != workerData);
    		}
    	}
    }

    function terminateWorker(workerData, workerOptions) {
    	const { config } = workerOptions;
    	const { terminateWorkerTimeout } = config;
    	if (Number.isFinite(terminateWorkerTimeout) && terminateWorkerTimeout >= 0) {
    		if (workerData.terminated) {
    			workerData.terminated = false;
    		} else {
    			workerData.terminateTimeout = setTimeout(async () => {
    				pool = pool.filter(data => data != workerData);
    				try {
    					await workerData.terminate();
    				} catch (_error) {
    					// ignored
    				}
    			}, terminateWorkerTimeout);
    		}
    	}
    }

    function clearTerminateTimeout(workerData) {
    	const { terminateTimeout } = workerData;
    	if (terminateTimeout) {
    		clearTimeout(terminateTimeout);
    		workerData.terminateTimeout = null;
    	}
    }

    function e(e){const t=()=>URL.createObjectURL(new Blob(['const{Array:e,Object:t,Number:n,Math:r,Error:s,Uint8Array:i,Uint16Array:o,Uint32Array:c,Int32Array:f,Map:a,DataView:l,Promise:u,TextEncoder:w,crypto:h,postMessage:d,TransformStream:p,ReadableStream:y,WritableStream:m,CompressionStream:b,DecompressionStream:g}=self,k=void 0,v="undefined",S="function";class z{constructor(e){return class extends p{constructor(t,n){const r=new e(n);super({transform(e,t){t.enqueue(r.append(e))},flush(e){const t=r.flush();t&&e.enqueue(t)}})}}}}const C=[];for(let e=0;256>e;e++){let t=e;for(let e=0;8>e;e++)1&t?t=t>>>1^3988292384:t>>>=1;C[e]=t}class x{constructor(e){this.t=e||-1}append(e){let t=0|this.t;for(let n=0,r=0|e.length;r>n;n++)t=t>>>8^C[255&(t^e[n])];this.t=t}get(){return~this.t}}class A extends p{constructor(){let e;const t=new x;super({transform(e,n){t.append(e),n.enqueue(e)},flush(){const n=new i(4);new l(n.buffer).setUint32(0,t.get()),e.value=n}}),e=this}}const _={concat(e,t){if(0===e.length||0===t.length)return e.concat(t);const n=e[e.length-1],r=_.i(n);return 32===r?e.concat(t):_.o(t,r,0|n,e.slice(0,e.length-1))},l(e){const t=e.length;if(0===t)return 0;const n=e[t-1];return 32*(t-1)+_.i(n)},u(e,t){if(32*e.length<t)return e;const n=(e=e.slice(0,r.ceil(t/32))).length;return t&=31,n>0&&t&&(e[n-1]=_.h(t,e[n-1]&2147483648>>t-1,1)),e},h:(e,t,n)=>32===e?t:(n?0|t:t<<32-e)+1099511627776*e,i:e=>r.round(e/1099511627776)||32,o(e,t,n,r){for(void 0===r&&(r=[]);t>=32;t-=32)r.push(n),n=0;if(0===t)return r.concat(e);for(let s=0;s<e.length;s++)r.push(n|e[s]>>>t),n=e[s]<<32-t;const s=e.length?e[e.length-1]:0,i=_.i(s);return r.push(_.h(t+i&31,t+i>32?n:r.pop(),1)),r}},I={p:{m(e){const t=_.l(e)/8,n=new i(t);let r;for(let s=0;t>s;s++)0==(3&s)&&(r=e[s/4]),n[s]=r>>>24,r<<=8;return n},g(e){const t=[];let n,r=0;for(n=0;n<e.length;n++)r=r<<8|e[n],3==(3&n)&&(t.push(r),r=0);return 3&n&&t.push(_.h(8*(3&n),r)),t}}},P=class{constructor(e){const t=this;t.blockSize=512,t.k=[1732584193,4023233417,2562383102,271733878,3285377520],t.v=[1518500249,1859775393,2400959708,3395469782],e?(t.S=e.S.slice(0),t.C=e.C.slice(0),t.A=e.A):t.reset()}reset(){const e=this;return e.S=e.k.slice(0),e.C=[],e.A=0,e}update(e){const t=this;"string"==typeof e&&(e=I._.g(e));const n=t.C=_.concat(t.C,e),r=t.A,i=t.A=r+_.l(e);if(i>9007199254740991)throw new s("Cannot hash more than 2^53 - 1 bits");const o=new c(n);let f=0;for(let e=t.blockSize+r-(t.blockSize+r&t.blockSize-1);i>=e;e+=t.blockSize)t.I(o.subarray(16*f,16*(f+1))),f+=1;return n.splice(0,16*f),t}P(){const e=this;let t=e.C;const n=e.S;t=_.concat(t,[_.h(1,1)]);for(let e=t.length+2;15&e;e++)t.push(0);for(t.push(r.floor(e.A/4294967296)),t.push(0|e.A);t.length;)e.I(t.splice(0,16));return e.reset(),n}D(e,t,n,r){return e>19?e>39?e>59?e>79?void 0:t^n^r:t&n|t&r|n&r:t^n^r:t&n|~t&r}V(e,t){return t<<e|t>>>32-e}I(t){const n=this,s=n.S,i=e(80);for(let e=0;16>e;e++)i[e]=t[e];let o=s[0],c=s[1],f=s[2],a=s[3],l=s[4];for(let e=0;79>=e;e++){16>e||(i[e]=n.V(1,i[e-3]^i[e-8]^i[e-14]^i[e-16]));const t=n.V(5,o)+n.D(e,c,f,a)+l+i[e]+n.v[r.floor(e/20)]|0;l=a,a=f,f=n.V(30,c),c=o,o=t}s[0]=s[0]+o|0,s[1]=s[1]+c|0,s[2]=s[2]+f|0,s[3]=s[3]+a|0,s[4]=s[4]+l|0}},D={getRandomValues(e){const t=new c(e.buffer),n=e=>{let t=987654321;const n=4294967295;return()=>(t=36969*(65535&t)+(t>>16)&n,(((t<<16)+(e=18e3*(65535&e)+(e>>16)&n)&n)/4294967296+.5)*(r.random()>.5?1:-1))};for(let s,i=0;i<e.length;i+=4){const e=n(4294967296*(s||r.random()));s=987654071*e(),t[i/4]=4294967296*e()|0}return e}},V={importKey:e=>new V.R(I.p.g(e)),B(e,t,n,r){if(n=n||1e4,0>r||0>n)throw new s("invalid params to pbkdf2");const i=1+(r>>5)<<2;let o,c,f,a,u;const w=new ArrayBuffer(i),h=new l(w);let d=0;const p=_;for(t=I.p.g(t),u=1;(i||1)>d;u++){for(o=c=e.encrypt(p.concat(t,[u])),f=1;n>f;f++)for(c=e.encrypt(c),a=0;a<c.length;a++)o[a]^=c[a];for(f=0;(i||1)>d&&f<o.length;f++)h.setInt32(d,o[f]),d+=4}return w.slice(0,r/8)},R:class{constructor(e){const t=this,n=t.M=P,r=[[],[]];t.U=[new n,new n];const s=t.U[0].blockSize/32;e.length>s&&(e=(new n).update(e).P());for(let t=0;s>t;t++)r[0][t]=909522486^e[t],r[1][t]=1549556828^e[t];t.U[0].update(r[0]),t.U[1].update(r[1]),t.K=new n(t.U[0])}reset(){const e=this;e.K=new e.M(e.U[0]),e.N=!1}update(e){this.N=!0,this.K.update(e)}digest(){const e=this,t=e.K.P(),n=new e.M(e.U[1]).update(t).P();return e.reset(),n}encrypt(e){if(this.N)throw new s("encrypt on already updated hmac called!");return this.update(e),this.digest(e)}}},R=typeof h!=v&&typeof h.getRandomValues==S,B="Invalid password",E="Invalid signature",M="zipjs-abort-check-password";function U(e){return R?h.getRandomValues(e):D.getRandomValues(e)}const K=16,N={name:"PBKDF2"},O=t.assign({hash:{name:"HMAC"}},N),T=t.assign({iterations:1e3,hash:{name:"SHA-1"}},N),W=["deriveBits"],j=[8,12,16],H=[16,24,32],L=10,F=[0,0,0,0],q=typeof h!=v,G=q&&h.subtle,J=q&&typeof G!=v,Q=I.p,X=class{constructor(e){const t=this;t.O=[[[],[],[],[],[]],[[],[],[],[],[]]],t.O[0][0][0]||t.T();const n=t.O[0][4],r=t.O[1],i=e.length;let o,c,f,a=1;if(4!==i&&6!==i&&8!==i)throw new s("invalid aes key size");for(t.v=[c=e.slice(0),f=[]],o=i;4*i+28>o;o++){let e=c[o-1];(o%i==0||8===i&&o%i==4)&&(e=n[e>>>24]<<24^n[e>>16&255]<<16^n[e>>8&255]<<8^n[255&e],o%i==0&&(e=e<<8^e>>>24^a<<24,a=a<<1^283*(a>>7))),c[o]=c[o-i]^e}for(let e=0;o;e++,o--){const t=c[3&e?o:o-4];f[e]=4>=o||4>e?t:r[0][n[t>>>24]]^r[1][n[t>>16&255]]^r[2][n[t>>8&255]]^r[3][n[255&t]]}}encrypt(e){return this.W(e,0)}decrypt(e){return this.W(e,1)}T(){const e=this.O[0],t=this.O[1],n=e[4],r=t[4],s=[],i=[];let o,c,f,a;for(let e=0;256>e;e++)i[(s[e]=e<<1^283*(e>>7))^e]=e;for(let l=o=0;!n[l];l^=c||1,o=i[o]||1){let i=o^o<<1^o<<2^o<<3^o<<4;i=i>>8^255&i^99,n[l]=i,r[i]=l,a=s[f=s[c=s[l]]];let u=16843009*a^65537*f^257*c^16843008*l,w=257*s[i]^16843008*i;for(let n=0;4>n;n++)e[n][l]=w=w<<24^w>>>8,t[n][i]=u=u<<24^u>>>8}for(let n=0;5>n;n++)e[n]=e[n].slice(0),t[n]=t[n].slice(0)}W(e,t){if(4!==e.length)throw new s("invalid aes block size");const n=this.v[t],r=n.length/4-2,i=[0,0,0,0],o=this.O[t],c=o[0],f=o[1],a=o[2],l=o[3],u=o[4];let w,h,d,p=e[0]^n[0],y=e[t?3:1]^n[1],m=e[2]^n[2],b=e[t?1:3]^n[3],g=4;for(let e=0;r>e;e++)w=c[p>>>24]^f[y>>16&255]^a[m>>8&255]^l[255&b]^n[g],h=c[y>>>24]^f[m>>16&255]^a[b>>8&255]^l[255&p]^n[g+1],d=c[m>>>24]^f[b>>16&255]^a[p>>8&255]^l[255&y]^n[g+2],b=c[b>>>24]^f[p>>16&255]^a[y>>8&255]^l[255&m]^n[g+3],g+=4,p=w,y=h,m=d;for(let e=0;4>e;e++)i[t?3&-e:e]=u[p>>>24]<<24^u[y>>16&255]<<16^u[m>>8&255]<<8^u[255&b]^n[g++],w=p,p=y,y=m,m=b,b=w;return i}},Y=class{constructor(e,t){this.j=e,this.H=t,this.L=t}reset(){this.L=this.H}update(e){return this.F(this.j,e,this.L)}q(e){if(255==(e>>24&255)){let t=e>>16&255,n=e>>8&255,r=255&e;255===t?(t=0,255===n?(n=0,255===r?r=0:++r):++n):++t,e=0,e+=t<<16,e+=n<<8,e+=r}else e+=1<<24;return e}G(e){0===(e[0]=this.q(e[0]))&&(e[1]=this.q(e[1]))}F(e,t,n){let r;if(!(r=t.length))return[];const s=_.l(t);for(let s=0;r>s;s+=4){this.G(n);const r=e.encrypt(n);t[s]^=r[0],t[s+1]^=r[1],t[s+2]^=r[2],t[s+3]^=r[3]}return _.u(t,s)}},Z=V.R;let $=q&&J&&typeof G.importKey==S,ee=q&&J&&typeof G.deriveBits==S;class te extends p{constructor({password:e,rawPassword:n,signed:r,encryptionStrength:o,checkPasswordOnly:c}){super({start(){t.assign(this,{ready:new u((e=>this.J=e)),password:ie(e,n),signed:r,X:o-1,pending:new i})},async transform(e,t){const n=this,{password:r,X:o,J:f,ready:a}=n;r?(await(async(e,t,n,r)=>{const i=await se(e,t,n,ce(r,0,j[t])),o=ce(r,j[t]);if(i[0]!=o[0]||i[1]!=o[1])throw new s(B)})(n,o,r,ce(e,0,j[o]+2)),e=ce(e,j[o]+2),c?t.error(new s(M)):f()):await a;const l=new i(e.length-L-(e.length-L)%K);t.enqueue(re(n,e,l,0,L,!0))},async flush(e){const{signed:t,Y:n,Z:r,pending:o,ready:c}=this;if(r&&n){await c;const f=ce(o,0,o.length-L),a=ce(o,o.length-L);let l=new i;if(f.length){const e=ae(Q,f);r.update(e);const t=n.update(e);l=fe(Q,t)}if(t){const e=ce(fe(Q,r.digest()),0,L);for(let t=0;L>t;t++)if(e[t]!=a[t])throw new s(E)}e.enqueue(l)}}})}}class ne extends p{constructor({password:e,rawPassword:n,encryptionStrength:r}){let s;super({start(){t.assign(this,{ready:new u((e=>this.J=e)),password:ie(e,n),X:r-1,pending:new i})},async transform(e,t){const n=this,{password:r,X:s,J:o,ready:c}=n;let f=new i;r?(f=await(async(e,t,n)=>{const r=U(new i(j[t]));return oe(r,await se(e,t,n,r))})(n,s,r),o()):await c;const a=new i(f.length+e.length-e.length%K);a.set(f,0),t.enqueue(re(n,e,a,f.length,0))},async flush(e){const{Y:t,Z:n,pending:r,ready:o}=this;if(n&&t){await o;let c=new i;if(r.length){const e=t.update(ae(Q,r));n.update(e),c=fe(Q,e)}s.signature=fe(Q,n.digest()).slice(0,L),e.enqueue(oe(c,s.signature))}}}),s=this}}function re(e,t,n,r,s,o){const{Y:c,Z:f,pending:a}=e,l=t.length-s;let u;for(a.length&&(t=oe(a,t),n=((e,t)=>{if(t&&t>e.length){const n=e;(e=new i(t)).set(n,0)}return e})(n,l-l%K)),u=0;l-K>=u;u+=K){const e=ae(Q,ce(t,u,u+K));o&&f.update(e);const s=c.update(e);o||f.update(s),n.set(fe(Q,s),u+r)}return e.pending=ce(t,u),n}async function se(n,r,s,o){n.password=null;const c=await(async(e,t,n,r,s)=>{if(!$)return V.importKey(t);try{return await G.importKey("raw",t,n,!1,s)}catch(e){return $=!1,V.importKey(t)}})(0,s,O,0,W),f=await(async(e,t,n)=>{if(!ee)return V.B(t,e.salt,T.iterations,n);try{return await G.deriveBits(e,t,n)}catch(r){return ee=!1,V.B(t,e.salt,T.iterations,n)}})(t.assign({salt:o},T),c,8*(2*H[r]+2)),a=new i(f),l=ae(Q,ce(a,0,H[r])),u=ae(Q,ce(a,H[r],2*H[r])),w=ce(a,2*H[r]);return t.assign(n,{keys:{key:l,$:u,passwordVerification:w},Y:new Y(new X(l),e.from(F)),Z:new Z(u)}),w}function ie(e,t){return t===k?(e=>{if(typeof w==v){const t=new i((e=unescape(encodeURIComponent(e))).length);for(let n=0;n<t.length;n++)t[n]=e.charCodeAt(n);return t}return(new w).encode(e)})(e):t}function oe(e,t){let n=e;return e.length+t.length&&(n=new i(e.length+t.length),n.set(e,0),n.set(t,e.length)),n}function ce(e,t,n){return e.subarray(t,n)}function fe(e,t){return e.m(t)}function ae(e,t){return e.g(t)}class le extends p{constructor({password:e,passwordVerification:n,checkPasswordOnly:r}){super({start(){t.assign(this,{password:e,passwordVerification:n}),de(this,e)},transform(e,t){const n=this;if(n.password){const t=we(n,e.subarray(0,12));if(n.password=null,t[11]!=n.passwordVerification)throw new s(B);e=e.subarray(12)}r?t.error(new s(M)):t.enqueue(we(n,e))}})}}class ue extends p{constructor({password:e,passwordVerification:n}){super({start(){t.assign(this,{password:e,passwordVerification:n}),de(this,e)},transform(e,t){const n=this;let r,s;if(n.password){n.password=null;const t=U(new i(12));t[11]=n.passwordVerification,r=new i(e.length+t.length),r.set(he(n,t),0),s=12}else r=new i(e.length),s=0;r.set(he(n,e),s),t.enqueue(r)}})}}function we(e,t){const n=new i(t.length);for(let r=0;r<t.length;r++)n[r]=ye(e)^t[r],pe(e,n[r]);return n}function he(e,t){const n=new i(t.length);for(let r=0;r<t.length;r++)n[r]=ye(e)^t[r],pe(e,t[r]);return n}function de(e,n){const r=[305419896,591751049,878082192];t.assign(e,{keys:r,ee:new x(r[0]),te:new x(r[2])});for(let t=0;t<n.length;t++)pe(e,n.charCodeAt(t))}function pe(e,t){let[n,s,i]=e.keys;e.ee.append([t]),n=~e.ee.get(),s=be(r.imul(be(s+me(n)),134775813)+1),e.te.append([s>>>24]),i=~e.te.get(),e.keys=[n,s,i]}function ye(e){const t=2|e.keys[2];return me(r.imul(t,1^t)>>>8)}function me(e){return 255&e}function be(e){return 4294967295&e}const ge="deflate-raw";class ke extends p{constructor(e,{chunkSize:t,CompressionStream:n,CompressionStreamNative:r}){super({});const{compressed:s,encrypted:i,useCompressionStream:o,zipCrypto:c,signed:f,level:a}=e,u=this;let w,h,d=Se(super.readable);i&&!c||!f||(w=new A,d=xe(d,w)),s&&(d=Ce(d,o,{level:a,chunkSize:t},r,n)),i&&(c?d=xe(d,new ue(e)):(h=new ne(e),d=xe(d,h))),ze(u,d,(()=>{let e;i&&!c&&(e=h.signature),i&&!c||!f||(e=new l(w.value.buffer).getUint32(0)),u.signature=e}))}}class ve extends p{constructor(e,{chunkSize:t,DecompressionStream:n,DecompressionStreamNative:r}){super({});const{zipCrypto:i,encrypted:o,signed:c,signature:f,compressed:a,useCompressionStream:u}=e;let w,h,d=Se(super.readable);o&&(i?d=xe(d,new le(e)):(h=new te(e),d=xe(d,h))),a&&(d=Ce(d,u,{chunkSize:t},r,n)),o&&!i||!c||(w=new A,d=xe(d,w)),ze(this,d,(()=>{if((!o||i)&&c){const e=new l(w.value.buffer);if(f!=e.getUint32(0,!1))throw new s(E)}}))}}function Se(e){return xe(e,new p({transform(e,t){e&&e.length&&t.enqueue(e)}}))}function ze(e,n,r){n=xe(n,new p({flush:r})),t.defineProperty(e,"readable",{get:()=>n})}function Ce(e,t,n,r,s){try{e=xe(e,new(t&&r?r:s)(ge,n))}catch(r){if(!t)return e;try{e=xe(e,new s(ge,n))}catch(t){return e}}return e}function xe(e,t){return e.pipeThrough(t)}const Ae="data",_e="close";class Ie extends p{constructor(e,n){super({});const r=this,{codecType:s}=e;let i;s.startsWith("deflate")?i=ke:s.startsWith("inflate")&&(i=ve);let o=0,c=0;const f=new i(e,n),a=super.readable,l=new p({transform(e,t){e&&e.length&&(c+=e.length,t.enqueue(e))},flush(){t.assign(r,{inputSize:c})}}),u=new p({transform(e,t){e&&e.length&&(o+=e.length,t.enqueue(e))},flush(){const{signature:e}=f;t.assign(r,{signature:e,outputSize:o,inputSize:c})}});t.defineProperty(r,"readable",{get:()=>a.pipeThrough(l).pipeThrough(f).pipeThrough(u)})}}class Pe extends p{constructor(e){let t;super({transform:function n(r,s){if(t){const e=new i(t.length+r.length);e.set(t),e.set(r,t.length),r=e,t=null}r.length>e?(s.enqueue(r.slice(0,e)),n(r.slice(e),s)):t=r},flush(e){t&&t.length&&e.enqueue(t)}})}}const De=new a,Ve=new a;let Re,Be=0,Ee=!0;async function Me(e){try{const{options:t,scripts:r,config:s}=e;if(r&&r.length)try{Ee?importScripts.apply(k,r):await Ue(r)}catch(e){Ee=!1,await Ue(r)}self.initCodec&&self.initCodec(),s.CompressionStreamNative=self.CompressionStream,s.DecompressionStreamNative=self.DecompressionStream,self.Deflate&&(s.CompressionStream=new z(self.Deflate)),self.Inflate&&(s.DecompressionStream=new z(self.Inflate));const i={highWaterMark:1},o=e.readable||new y({async pull(e){const t=new u((e=>De.set(Be,e)));Ke({type:"pull",messageId:Be}),Be=(Be+1)%n.MAX_SAFE_INTEGER;const{value:r,done:s}=await t;e.enqueue(r),s&&e.close()}},i),c=e.writable||new m({async write(e){let t;const r=new u((e=>t=e));Ve.set(Be,t),Ke({type:Ae,value:e,messageId:Be}),Be=(Be+1)%n.MAX_SAFE_INTEGER,await r}},i),f=new Ie(t,s);Re=new AbortController;const{signal:a}=Re;await o.pipeThrough(f).pipeThrough(new Pe(s.chunkSize)).pipeTo(c,{signal:a,preventClose:!0,preventAbort:!0}),await c.getWriter().close();const{signature:l,inputSize:w,outputSize:h}=f;Ke({type:_e,result:{signature:l,inputSize:w,outputSize:h}})}catch(e){Ne(e)}}async function Ue(e){for(const t of e)await import(t)}function Ke(e){let{value:t}=e;if(t)if(t.length)try{t=new i(t),e.value=t.buffer,d(e,[e.value])}catch(t){d(e)}else d(e);else d(e)}function Ne(e=new s("Unknown error")){const{message:t,stack:n,code:r,name:i}=e;d({error:{message:t,stack:n,code:r,name:i}})}addEventListener("message",(({data:e})=>{const{type:t,messageId:n,value:r,done:s}=e;try{if("start"==t&&Me(e),t==Ae){const e=De.get(n);De.delete(n),e({value:new i(r),done:s})}if("ack"==t){const e=Ve.get(n);Ve.delete(n),e()}t==_e&&Re.abort()}catch(e){Ne(e)}}));const Oe=-2;function Te(t){return We(t.map((([t,n])=>new e(t).fill(n,0,t))))}function We(t){return t.reduce(((t,n)=>t.concat(e.isArray(n)?We(n):n)),[])}const je=[0,1,2,3].concat(...Te([[2,4],[2,5],[4,6],[4,7],[8,8],[8,9],[16,10],[16,11],[32,12],[32,13],[64,14],[64,15],[2,0],[1,16],[1,17],[2,18],[2,19],[4,20],[4,21],[8,22],[8,23],[16,24],[16,25],[32,26],[32,27],[64,28],[64,29]]));function He(){const e=this;function t(e,t){let n=0;do{n|=1&e,e>>>=1,n<<=1}while(--t>0);return n>>>1}e.ne=n=>{const s=e.re,i=e.ie.se,o=e.ie.oe;let c,f,a,l=-1;for(n.ce=0,n.fe=573,c=0;o>c;c++)0!==s[2*c]?(n.ae[++n.ce]=l=c,n.le[c]=0):s[2*c+1]=0;for(;2>n.ce;)a=n.ae[++n.ce]=2>l?++l:0,s[2*a]=1,n.le[a]=0,n.ue--,i&&(n.we-=i[2*a+1]);for(e.he=l,c=r.floor(n.ce/2);c>=1;c--)n.de(s,c);a=o;do{c=n.ae[1],n.ae[1]=n.ae[n.ce--],n.de(s,1),f=n.ae[1],n.ae[--n.fe]=c,n.ae[--n.fe]=f,s[2*a]=s[2*c]+s[2*f],n.le[a]=r.max(n.le[c],n.le[f])+1,s[2*c+1]=s[2*f+1]=a,n.ae[1]=a++,n.de(s,1)}while(n.ce>=2);n.ae[--n.fe]=n.ae[1],(t=>{const n=e.re,r=e.ie.se,s=e.ie.pe,i=e.ie.ye,o=e.ie.me;let c,f,a,l,u,w,h=0;for(l=0;15>=l;l++)t.be[l]=0;for(n[2*t.ae[t.fe]+1]=0,c=t.fe+1;573>c;c++)f=t.ae[c],l=n[2*n[2*f+1]+1]+1,l>o&&(l=o,h++),n[2*f+1]=l,f>e.he||(t.be[l]++,u=0,i>f||(u=s[f-i]),w=n[2*f],t.ue+=w*(l+u),r&&(t.we+=w*(r[2*f+1]+u)));if(0!==h){do{for(l=o-1;0===t.be[l];)l--;t.be[l]--,t.be[l+1]+=2,t.be[o]--,h-=2}while(h>0);for(l=o;0!==l;l--)for(f=t.be[l];0!==f;)a=t.ae[--c],a>e.he||(n[2*a+1]!=l&&(t.ue+=(l-n[2*a+1])*n[2*a],n[2*a+1]=l),f--)}})(n),((e,n,r)=>{const s=[];let i,o,c,f=0;for(i=1;15>=i;i++)s[i]=f=f+r[i-1]<<1;for(o=0;n>=o;o++)c=e[2*o+1],0!==c&&(e[2*o]=t(s[c]++,c))})(s,e.he,n.be)}}function Le(e,t,n,r,s){const i=this;i.se=e,i.pe=t,i.ye=n,i.oe=r,i.me=s}He.ge=[0,1,2,3,4,5,6,7].concat(...Te([[2,8],[2,9],[2,10],[2,11],[4,12],[4,13],[4,14],[4,15],[8,16],[8,17],[8,18],[8,19],[16,20],[16,21],[16,22],[16,23],[32,24],[32,25],[32,26],[31,27],[1,28]])),He.ke=[0,1,2,3,4,5,6,7,8,10,12,14,16,20,24,28,32,40,48,56,64,80,96,112,128,160,192,224,0],He.ve=[0,1,2,3,4,6,8,12,16,24,32,48,64,96,128,192,256,384,512,768,1024,1536,2048,3072,4096,6144,8192,12288,16384,24576],He.Se=e=>256>e?je[e]:je[256+(e>>>7)],He.ze=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],He.Ce=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],He.xe=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],He.Ae=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];const Fe=Te([[144,8],[112,9],[24,7],[8,8]]);Le._e=We([12,140,76,204,44,172,108,236,28,156,92,220,60,188,124,252,2,130,66,194,34,162,98,226,18,146,82,210,50,178,114,242,10,138,74,202,42,170,106,234,26,154,90,218,58,186,122,250,6,134,70,198,38,166,102,230,22,150,86,214,54,182,118,246,14,142,78,206,46,174,110,238,30,158,94,222,62,190,126,254,1,129,65,193,33,161,97,225,17,145,81,209,49,177,113,241,9,137,73,201,41,169,105,233,25,153,89,217,57,185,121,249,5,133,69,197,37,165,101,229,21,149,85,213,53,181,117,245,13,141,77,205,45,173,109,237,29,157,93,221,61,189,125,253,19,275,147,403,83,339,211,467,51,307,179,435,115,371,243,499,11,267,139,395,75,331,203,459,43,299,171,427,107,363,235,491,27,283,155,411,91,347,219,475,59,315,187,443,123,379,251,507,7,263,135,391,71,327,199,455,39,295,167,423,103,359,231,487,23,279,151,407,87,343,215,471,55,311,183,439,119,375,247,503,15,271,143,399,79,335,207,463,47,303,175,431,111,367,239,495,31,287,159,415,95,351,223,479,63,319,191,447,127,383,255,511,0,64,32,96,16,80,48,112,8,72,40,104,24,88,56,120,4,68,36,100,20,84,52,116,3,131,67,195,35,163,99,227].map(((e,t)=>[e,Fe[t]])));const qe=Te([[30,5]]);function Ge(e,t,n,r,s){const i=this;i.Ie=e,i.Pe=t,i.De=n,i.Ve=r,i.Re=s}Le.Be=We([0,16,8,24,4,20,12,28,2,18,10,26,6,22,14,30,1,17,9,25,5,21,13,29,3,19,11,27,7,23].map(((e,t)=>[e,qe[t]]))),Le.Ee=new Le(Le._e,He.ze,257,286,15),Le.Me=new Le(Le.Be,He.Ce,0,30,15),Le.Ue=new Le(null,He.xe,0,19,7);const Je=[new Ge(0,0,0,0,0),new Ge(4,4,8,4,1),new Ge(4,5,16,8,1),new Ge(4,6,32,32,1),new Ge(4,4,16,16,2),new Ge(8,16,32,32,2),new Ge(8,16,128,128,2),new Ge(8,32,128,256,2),new Ge(32,128,258,1024,2),new Ge(32,258,258,4096,2)],Qe=["need dictionary","stream end","","","stream error","data error","","buffer error","",""],Xe=113,Ye=666,Ze=262;function $e(e,t,n,r){const s=e[2*t],i=e[2*n];return i>s||s==i&&r[t]<=r[n]}function et(){const e=this;let t,n,s,c,f,a,l,u,w,h,d,p,y,m,b,g,k,v,S,z,C,x,A,_,I,P,D,V,R,B,E,M,U;const K=new He,N=new He,O=new He;let T,W,j,H,L,F;function q(){let t;for(t=0;286>t;t++)E[2*t]=0;for(t=0;30>t;t++)M[2*t]=0;for(t=0;19>t;t++)U[2*t]=0;E[512]=1,e.ue=e.we=0,W=j=0}function G(e,t){let n,r=-1,s=e[1],i=0,o=7,c=4;0===s&&(o=138,c=3),e[2*(t+1)+1]=65535;for(let f=0;t>=f;f++)n=s,s=e[2*(f+1)+1],++i<o&&n==s||(c>i?U[2*n]+=i:0!==n?(n!=r&&U[2*n]++,U[32]++):i>10?U[36]++:U[34]++,i=0,r=n,0===s?(o=138,c=3):n==s?(o=6,c=3):(o=7,c=4))}function J(t){e.Ke[e.pending++]=t}function Q(e){J(255&e),J(e>>>8&255)}function X(e,t){let n;const r=t;F>16-r?(n=e,L|=n<<F&65535,Q(L),L=n>>>16-F,F+=r-16):(L|=e<<F&65535,F+=r)}function Y(e,t){const n=2*e;X(65535&t[n],65535&t[n+1])}function Z(e,t){let n,r,s=-1,i=e[1],o=0,c=7,f=4;for(0===i&&(c=138,f=3),n=0;t>=n;n++)if(r=i,i=e[2*(n+1)+1],++o>=c||r!=i){if(f>o)do{Y(r,U)}while(0!=--o);else 0!==r?(r!=s&&(Y(r,U),o--),Y(16,U),X(o-3,2)):o>10?(Y(18,U),X(o-11,7)):(Y(17,U),X(o-3,3));o=0,s=r,0===i?(c=138,f=3):r==i?(c=6,f=3):(c=7,f=4)}}function $(){16==F?(Q(L),L=0,F=0):8>F||(J(255&L),L>>>=8,F-=8)}function ee(t,n){let s,i,o;if(e.Ne[W]=t,e.Oe[W]=255&n,W++,0===t?E[2*n]++:(j++,t--,E[2*(He.ge[n]+256+1)]++,M[2*He.Se(t)]++),0==(8191&W)&&D>2){for(s=8*W,i=C-k,o=0;30>o;o++)s+=M[2*o]*(5+He.Ce[o]);if(s>>>=3,j<r.floor(W/2)&&s<r.floor(i/2))return!0}return W==T-1}function te(t,n){let r,s,i,o,c=0;if(0!==W)do{r=e.Ne[c],s=e.Oe[c],c++,0===r?Y(s,t):(i=He.ge[s],Y(i+256+1,t),o=He.ze[i],0!==o&&(s-=He.ke[i],X(s,o)),r--,i=He.Se(r),Y(i,n),o=He.Ce[i],0!==o&&(r-=He.ve[i],X(r,o)))}while(W>c);Y(256,t),H=t[513]}function ne(){F>8?Q(L):F>0&&J(255&L),L=0,F=0}function re(t,n,r){X(0+(r?1:0),3),((t,n)=>{ne(),H=8,Q(n),Q(~n),e.Ke.set(u.subarray(t,t+n),e.pending),e.pending+=n})(t,n)}function se(n){((t,n,r)=>{let s,i,o=0;D>0?(K.ne(e),N.ne(e),o=(()=>{let t;for(G(E,K.he),G(M,N.he),O.ne(e),t=18;t>=3&&0===U[2*He.Ae[t]+1];t--);return e.ue+=14+3*(t+1),t})(),s=e.ue+3+7>>>3,i=e.we+3+7>>>3,i>s||(s=i)):s=i=n+5,n+4>s||-1==t?i==s?(X(2+(r?1:0),3),te(Le._e,Le.Be)):(X(4+(r?1:0),3),((e,t,n)=>{let r;for(X(e-257,5),X(t-1,5),X(n-4,4),r=0;n>r;r++)X(U[2*He.Ae[r]+1],3);Z(E,e-1),Z(M,t-1)})(K.he+1,N.he+1,o+1),te(E,M)):re(t,n,r),q(),r&&ne()})(0>k?-1:k,C-k,n),k=C,t.Te()}function ie(){let e,n,r,s;do{if(s=w-A-C,0===s&&0===C&&0===A)s=f;else if(-1==s)s--;else if(C>=f+f-Ze){u.set(u.subarray(f,f+f),0),x-=f,C-=f,k-=f,e=y,r=e;do{n=65535&d[--r],d[r]=f>n?0:n-f}while(0!=--e);e=f,r=e;do{n=65535&h[--r],h[r]=f>n?0:n-f}while(0!=--e);s+=f}if(0===t.We)return;e=t.je(u,C+A,s),A+=e,3>A||(p=255&u[C],p=(p<<g^255&u[C+1])&b)}while(Ze>A&&0!==t.We)}function oe(e){let t,n,r=I,s=C,i=_;const o=C>f-Ze?C-(f-Ze):0;let c=B;const a=l,w=C+258;let d=u[s+i-1],p=u[s+i];R>_||(r>>=2),c>A&&(c=A);do{if(t=e,u[t+i]==p&&u[t+i-1]==d&&u[t]==u[s]&&u[++t]==u[s+1]){s+=2,t++;do{}while(u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&u[++s]==u[++t]&&w>s);if(n=258-(w-s),s=w-258,n>i){if(x=e,i=n,n>=c)break;d=u[s+i-1],p=u[s+i]}}}while((e=65535&h[e&a])>o&&0!=--r);return i>A?A:i}e.le=[],e.be=[],e.ae=[],E=[],M=[],U=[],e.de=(t,n)=>{const r=e.ae,s=r[n];let i=n<<1;for(;i<=e.ce&&(i<e.ce&&$e(t,r[i+1],r[i],e.le)&&i++,!$e(t,s,r[i],e.le));)r[n]=r[i],n=i,i<<=1;r[n]=s},e.He=(t,S,x,W,j,G)=>(W||(W=8),j||(j=8),G||(G=0),t.Le=null,-1==S&&(S=6),1>j||j>9||8!=W||9>x||x>15||0>S||S>9||0>G||G>2?Oe:(t.Fe=e,a=x,f=1<<a,l=f-1,m=j+7,y=1<<m,b=y-1,g=r.floor((m+3-1)/3),u=new i(2*f),h=[],d=[],T=1<<j+6,e.Ke=new i(4*T),s=4*T,e.Ne=new o(T),e.Oe=new i(T),D=S,V=G,(t=>(t.qe=t.Ge=0,t.Le=null,e.pending=0,e.Je=0,n=Xe,c=0,K.re=E,K.ie=Le.Ee,N.re=M,N.ie=Le.Me,O.re=U,O.ie=Le.Ue,L=0,F=0,H=8,q(),(()=>{w=2*f,d[y-1]=0;for(let e=0;y-1>e;e++)d[e]=0;P=Je[D].Pe,R=Je[D].Ie,B=Je[D].De,I=Je[D].Ve,C=0,k=0,A=0,v=_=2,z=0,p=0})(),0))(t))),e.Qe=()=>42!=n&&n!=Xe&&n!=Ye?Oe:(e.Oe=null,e.Ne=null,e.Ke=null,d=null,h=null,u=null,e.Fe=null,n==Xe?-3:0),e.Xe=(e,t,n)=>{let r=0;return-1==t&&(t=6),0>t||t>9||0>n||n>2?Oe:(Je[D].Re!=Je[t].Re&&0!==e.qe&&(r=e.Ye(1)),D!=t&&(D=t,P=Je[D].Pe,R=Je[D].Ie,B=Je[D].De,I=Je[D].Ve),V=n,r)},e.Ze=(e,t,r)=>{let s,i=r,o=0;if(!t||42!=n)return Oe;if(3>i)return 0;for(i>f-Ze&&(i=f-Ze,o=r-i),u.set(t.subarray(o,o+i),0),C=i,k=i,p=255&u[0],p=(p<<g^255&u[1])&b,s=0;i-3>=s;s++)p=(p<<g^255&u[s+2])&b,h[s&l]=d[p],d[p]=s;return 0},e.Ye=(r,i)=>{let o,w,m,I,R;if(i>4||0>i)return Oe;if(!r.$e||!r.et&&0!==r.We||n==Ye&&4!=i)return r.Le=Qe[4],Oe;if(0===r.tt)return r.Le=Qe[7],-5;var B;if(t=r,I=c,c=i,42==n&&(w=8+(a-8<<4)<<8,m=(D-1&255)>>1,m>3&&(m=3),w|=m<<6,0!==C&&(w|=32),w+=31-w%31,n=Xe,J((B=w)>>8&255),J(255&B)),0!==e.pending){if(t.Te(),0===t.tt)return c=-1,0}else if(0===t.We&&I>=i&&4!=i)return t.Le=Qe[7],-5;if(n==Ye&&0!==t.We)return r.Le=Qe[7],-5;if(0!==t.We||0!==A||0!=i&&n!=Ye){switch(R=-1,Je[D].Re){case 0:R=(e=>{let n,r=65535;for(r>s-5&&(r=s-5);;){if(1>=A){if(ie(),0===A&&0==e)return 0;if(0===A)break}if(C+=A,A=0,n=k+r,(0===C||C>=n)&&(A=C-n,C=n,se(!1),0===t.tt))return 0;if(C-k>=f-Ze&&(se(!1),0===t.tt))return 0}return se(4==e),0===t.tt?4==e?2:0:4==e?3:1})(i);break;case 1:R=(e=>{let n,r=0;for(;;){if(Ze>A){if(ie(),Ze>A&&0==e)return 0;if(0===A)break}if(3>A||(p=(p<<g^255&u[C+2])&b,r=65535&d[p],h[C&l]=d[p],d[p]=C),0===r||(C-r&65535)>f-Ze||2!=V&&(v=oe(r)),3>v)n=ee(0,255&u[C]),A--,C++;else if(n=ee(C-x,v-3),A-=v,v>P||3>A)C+=v,v=0,p=255&u[C],p=(p<<g^255&u[C+1])&b;else{v--;do{C++,p=(p<<g^255&u[C+2])&b,r=65535&d[p],h[C&l]=d[p],d[p]=C}while(0!=--v);C++}if(n&&(se(!1),0===t.tt))return 0}return se(4==e),0===t.tt?4==e?2:0:4==e?3:1})(i);break;case 2:R=(e=>{let n,r,s=0;for(;;){if(Ze>A){if(ie(),Ze>A&&0==e)return 0;if(0===A)break}if(3>A||(p=(p<<g^255&u[C+2])&b,s=65535&d[p],h[C&l]=d[p],d[p]=C),_=v,S=x,v=2,0!==s&&P>_&&f-Ze>=(C-s&65535)&&(2!=V&&(v=oe(s)),5>=v&&(1==V||3==v&&C-x>4096)&&(v=2)),3>_||v>_)if(0!==z){if(n=ee(0,255&u[C-1]),n&&se(!1),C++,A--,0===t.tt)return 0}else z=1,C++,A--;else{r=C+A-3,n=ee(C-1-S,_-3),A-=_-1,_-=2;do{++C>r||(p=(p<<g^255&u[C+2])&b,s=65535&d[p],h[C&l]=d[p],d[p]=C)}while(0!=--_);if(z=0,v=2,C++,n&&(se(!1),0===t.tt))return 0}}return 0!==z&&(n=ee(0,255&u[C-1]),z=0),se(4==e),0===t.tt?4==e?2:0:4==e?3:1})(i)}if(2!=R&&3!=R||(n=Ye),0==R||2==R)return 0===t.tt&&(c=-1),0;if(1==R){if(1==i)X(2,3),Y(256,Le._e),$(),9>1+H+10-F&&(X(2,3),Y(256,Le._e),$()),H=7;else if(re(0,0,!1),3==i)for(o=0;y>o;o++)d[o]=0;if(t.Te(),0===t.tt)return c=-1,0}}return 4!=i?0:1}}function tt(){const e=this;e.nt=0,e.rt=0,e.We=0,e.qe=0,e.tt=0,e.Ge=0}function nt(e){const t=new tt,n=(o=e&&e.chunkSize?e.chunkSize:65536)+5*(r.floor(o/16383)+1);var o;const c=new i(n);let f=e?e.level:-1;void 0===f&&(f=-1),t.He(f),t.$e=c,this.append=(e,r)=>{let o,f,a=0,l=0,u=0;const w=[];if(e.length){t.nt=0,t.et=e,t.We=e.length;do{if(t.rt=0,t.tt=n,o=t.Ye(0),0!=o)throw new s("deflating: "+t.Le);t.rt&&(t.rt==n?w.push(new i(c)):w.push(c.subarray(0,t.rt))),u+=t.rt,r&&t.nt>0&&t.nt!=a&&(r(t.nt),a=t.nt)}while(t.We>0||0===t.tt);return w.length>1?(f=new i(u),w.forEach((e=>{f.set(e,l),l+=e.length}))):f=w[0]?new i(w[0]):new i,f}},this.flush=()=>{let e,r,o=0,f=0;const a=[];do{if(t.rt=0,t.tt=n,e=t.Ye(4),1!=e&&0!=e)throw new s("deflating: "+t.Le);n-t.tt>0&&a.push(c.slice(0,t.rt)),f+=t.rt}while(t.We>0||0===t.tt);return t.Qe(),r=new i(f),a.forEach((e=>{r.set(e,o),o+=e.length})),r}}tt.prototype={He(e,t){const n=this;return n.Fe=new et,t||(t=15),n.Fe.He(n,e,t)},Ye(e){const t=this;return t.Fe?t.Fe.Ye(t,e):Oe},Qe(){const e=this;if(!e.Fe)return Oe;const t=e.Fe.Qe();return e.Fe=null,t},Xe(e,t){const n=this;return n.Fe?n.Fe.Xe(n,e,t):Oe},Ze(e,t){const n=this;return n.Fe?n.Fe.Ze(n,e,t):Oe},je(e,t,n){const r=this;let s=r.We;return s>n&&(s=n),0===s?0:(r.We-=s,e.set(r.et.subarray(r.nt,r.nt+s),t),r.nt+=s,r.qe+=s,s)},Te(){const e=this;let t=e.Fe.pending;t>e.tt&&(t=e.tt),0!==t&&(e.$e.set(e.Fe.Ke.subarray(e.Fe.Je,e.Fe.Je+t),e.rt),e.rt+=t,e.Fe.Je+=t,e.Ge+=t,e.tt-=t,e.Fe.pending-=t,0===e.Fe.pending&&(e.Fe.Je=0))}};const rt=-2,st=-3,it=-5,ot=[0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535],ct=[96,7,256,0,8,80,0,8,16,84,8,115,82,7,31,0,8,112,0,8,48,0,9,192,80,7,10,0,8,96,0,8,32,0,9,160,0,8,0,0,8,128,0,8,64,0,9,224,80,7,6,0,8,88,0,8,24,0,9,144,83,7,59,0,8,120,0,8,56,0,9,208,81,7,17,0,8,104,0,8,40,0,9,176,0,8,8,0,8,136,0,8,72,0,9,240,80,7,4,0,8,84,0,8,20,85,8,227,83,7,43,0,8,116,0,8,52,0,9,200,81,7,13,0,8,100,0,8,36,0,9,168,0,8,4,0,8,132,0,8,68,0,9,232,80,7,8,0,8,92,0,8,28,0,9,152,84,7,83,0,8,124,0,8,60,0,9,216,82,7,23,0,8,108,0,8,44,0,9,184,0,8,12,0,8,140,0,8,76,0,9,248,80,7,3,0,8,82,0,8,18,85,8,163,83,7,35,0,8,114,0,8,50,0,9,196,81,7,11,0,8,98,0,8,34,0,9,164,0,8,2,0,8,130,0,8,66,0,9,228,80,7,7,0,8,90,0,8,26,0,9,148,84,7,67,0,8,122,0,8,58,0,9,212,82,7,19,0,8,106,0,8,42,0,9,180,0,8,10,0,8,138,0,8,74,0,9,244,80,7,5,0,8,86,0,8,22,192,8,0,83,7,51,0,8,118,0,8,54,0,9,204,81,7,15,0,8,102,0,8,38,0,9,172,0,8,6,0,8,134,0,8,70,0,9,236,80,7,9,0,8,94,0,8,30,0,9,156,84,7,99,0,8,126,0,8,62,0,9,220,82,7,27,0,8,110,0,8,46,0,9,188,0,8,14,0,8,142,0,8,78,0,9,252,96,7,256,0,8,81,0,8,17,85,8,131,82,7,31,0,8,113,0,8,49,0,9,194,80,7,10,0,8,97,0,8,33,0,9,162,0,8,1,0,8,129,0,8,65,0,9,226,80,7,6,0,8,89,0,8,25,0,9,146,83,7,59,0,8,121,0,8,57,0,9,210,81,7,17,0,8,105,0,8,41,0,9,178,0,8,9,0,8,137,0,8,73,0,9,242,80,7,4,0,8,85,0,8,21,80,8,258,83,7,43,0,8,117,0,8,53,0,9,202,81,7,13,0,8,101,0,8,37,0,9,170,0,8,5,0,8,133,0,8,69,0,9,234,80,7,8,0,8,93,0,8,29,0,9,154,84,7,83,0,8,125,0,8,61,0,9,218,82,7,23,0,8,109,0,8,45,0,9,186,0,8,13,0,8,141,0,8,77,0,9,250,80,7,3,0,8,83,0,8,19,85,8,195,83,7,35,0,8,115,0,8,51,0,9,198,81,7,11,0,8,99,0,8,35,0,9,166,0,8,3,0,8,131,0,8,67,0,9,230,80,7,7,0,8,91,0,8,27,0,9,150,84,7,67,0,8,123,0,8,59,0,9,214,82,7,19,0,8,107,0,8,43,0,9,182,0,8,11,0,8,139,0,8,75,0,9,246,80,7,5,0,8,87,0,8,23,192,8,0,83,7,51,0,8,119,0,8,55,0,9,206,81,7,15,0,8,103,0,8,39,0,9,174,0,8,7,0,8,135,0,8,71,0,9,238,80,7,9,0,8,95,0,8,31,0,9,158,84,7,99,0,8,127,0,8,63,0,9,222,82,7,27,0,8,111,0,8,47,0,9,190,0,8,15,0,8,143,0,8,79,0,9,254,96,7,256,0,8,80,0,8,16,84,8,115,82,7,31,0,8,112,0,8,48,0,9,193,80,7,10,0,8,96,0,8,32,0,9,161,0,8,0,0,8,128,0,8,64,0,9,225,80,7,6,0,8,88,0,8,24,0,9,145,83,7,59,0,8,120,0,8,56,0,9,209,81,7,17,0,8,104,0,8,40,0,9,177,0,8,8,0,8,136,0,8,72,0,9,241,80,7,4,0,8,84,0,8,20,85,8,227,83,7,43,0,8,116,0,8,52,0,9,201,81,7,13,0,8,100,0,8,36,0,9,169,0,8,4,0,8,132,0,8,68,0,9,233,80,7,8,0,8,92,0,8,28,0,9,153,84,7,83,0,8,124,0,8,60,0,9,217,82,7,23,0,8,108,0,8,44,0,9,185,0,8,12,0,8,140,0,8,76,0,9,249,80,7,3,0,8,82,0,8,18,85,8,163,83,7,35,0,8,114,0,8,50,0,9,197,81,7,11,0,8,98,0,8,34,0,9,165,0,8,2,0,8,130,0,8,66,0,9,229,80,7,7,0,8,90,0,8,26,0,9,149,84,7,67,0,8,122,0,8,58,0,9,213,82,7,19,0,8,106,0,8,42,0,9,181,0,8,10,0,8,138,0,8,74,0,9,245,80,7,5,0,8,86,0,8,22,192,8,0,83,7,51,0,8,118,0,8,54,0,9,205,81,7,15,0,8,102,0,8,38,0,9,173,0,8,6,0,8,134,0,8,70,0,9,237,80,7,9,0,8,94,0,8,30,0,9,157,84,7,99,0,8,126,0,8,62,0,9,221,82,7,27,0,8,110,0,8,46,0,9,189,0,8,14,0,8,142,0,8,78,0,9,253,96,7,256,0,8,81,0,8,17,85,8,131,82,7,31,0,8,113,0,8,49,0,9,195,80,7,10,0,8,97,0,8,33,0,9,163,0,8,1,0,8,129,0,8,65,0,9,227,80,7,6,0,8,89,0,8,25,0,9,147,83,7,59,0,8,121,0,8,57,0,9,211,81,7,17,0,8,105,0,8,41,0,9,179,0,8,9,0,8,137,0,8,73,0,9,243,80,7,4,0,8,85,0,8,21,80,8,258,83,7,43,0,8,117,0,8,53,0,9,203,81,7,13,0,8,101,0,8,37,0,9,171,0,8,5,0,8,133,0,8,69,0,9,235,80,7,8,0,8,93,0,8,29,0,9,155,84,7,83,0,8,125,0,8,61,0,9,219,82,7,23,0,8,109,0,8,45,0,9,187,0,8,13,0,8,141,0,8,77,0,9,251,80,7,3,0,8,83,0,8,19,85,8,195,83,7,35,0,8,115,0,8,51,0,9,199,81,7,11,0,8,99,0,8,35,0,9,167,0,8,3,0,8,131,0,8,67,0,9,231,80,7,7,0,8,91,0,8,27,0,9,151,84,7,67,0,8,123,0,8,59,0,9,215,82,7,19,0,8,107,0,8,43,0,9,183,0,8,11,0,8,139,0,8,75,0,9,247,80,7,5,0,8,87,0,8,23,192,8,0,83,7,51,0,8,119,0,8,55,0,9,207,81,7,15,0,8,103,0,8,39,0,9,175,0,8,7,0,8,135,0,8,71,0,9,239,80,7,9,0,8,95,0,8,31,0,9,159,84,7,99,0,8,127,0,8,63,0,9,223,82,7,27,0,8,111,0,8,47,0,9,191,0,8,15,0,8,143,0,8,79,0,9,255],ft=[80,5,1,87,5,257,83,5,17,91,5,4097,81,5,5,89,5,1025,85,5,65,93,5,16385,80,5,3,88,5,513,84,5,33,92,5,8193,82,5,9,90,5,2049,86,5,129,192,5,24577,80,5,2,87,5,385,83,5,25,91,5,6145,81,5,7,89,5,1537,85,5,97,93,5,24577,80,5,4,88,5,769,84,5,49,92,5,12289,82,5,13,90,5,3073,86,5,193,192,5,24577],at=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],lt=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,112,112],ut=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],wt=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];function ht(){let e,t,n,r,s,i;function o(e,t,o,c,f,a,l,u,w,h,d){let p,y,m,b,g,k,v,S,z,C,x,A,_,I,P;C=0,g=o;do{n[e[t+C]]++,C++,g--}while(0!==g);if(n[0]==o)return l[0]=-1,u[0]=0,0;for(S=u[0],k=1;15>=k&&0===n[k];k++);for(v=k,k>S&&(S=k),g=15;0!==g&&0===n[g];g--);for(m=g,S>g&&(S=g),u[0]=S,I=1<<k;g>k;k++,I<<=1)if(0>(I-=n[k]))return st;if(0>(I-=n[g]))return st;for(n[g]+=I,i[1]=k=0,C=1,_=2;0!=--g;)i[_]=k+=n[C],_++,C++;g=0,C=0;do{0!==(k=e[t+C])&&(d[i[k]++]=g),C++}while(++g<o);for(o=i[m],i[0]=g=0,C=0,b=-1,A=-S,s[0]=0,x=0,P=0;m>=v;v++)for(p=n[v];0!=p--;){for(;v>A+S;){if(b++,A+=S,P=m-A,P=P>S?S:P,(y=1<<(k=v-A))>p+1&&(y-=p+1,_=v,P>k))for(;++k<P&&(y<<=1)>n[++_];)y-=n[_];if(P=1<<k,h[0]+P>1440)return st;s[b]=x=h[0],h[0]+=P,0!==b?(i[b]=g,r[0]=k,r[1]=S,k=g>>>A-S,r[2]=x-s[b-1]-k,w.set(r,3*(s[b-1]+k))):l[0]=x}for(r[1]=v-A,o>C?d[C]<c?(r[0]=256>d[C]?0:96,r[2]=d[C++]):(r[0]=a[d[C]-c]+16+64,r[2]=f[d[C++]-c]):r[0]=192,y=1<<v-A,k=g>>>A;P>k;k+=y)w.set(r,3*(x+k));for(k=1<<v-1;0!=(g&k);k>>>=1)g^=k;for(g^=k,z=(1<<A)-1;(g&z)!=i[b];)b--,A-=S,z=(1<<A)-1}return 0!==I&&1!=m?it:0}function c(o){let c;for(e||(e=[],t=[],n=new f(16),r=[],s=new f(15),i=new f(16)),t.length<o&&(t=[]),c=0;o>c;c++)t[c]=0;for(c=0;16>c;c++)n[c]=0;for(c=0;3>c;c++)r[c]=0;s.set(n.subarray(0,15),0),i.set(n.subarray(0,16),0)}this.st=(n,r,s,i,f)=>{let a;return c(19),e[0]=0,a=o(n,0,19,19,null,null,s,r,i,e,t),a==st?f.Le="oversubscribed dynamic bit lengths tree":a!=it&&0!==r[0]||(f.Le="incomplete dynamic bit lengths tree",a=st),a},this.it=(n,r,s,i,f,a,l,u,w)=>{let h;return c(288),e[0]=0,h=o(s,0,n,257,at,lt,a,i,u,e,t),0!=h||0===i[0]?(h==st?w.Le="oversubscribed literal/length tree":-4!=h&&(w.Le="incomplete literal/length tree",h=st),h):(c(288),h=o(s,n,r,0,ut,wt,l,f,u,e,t),0!=h||0===f[0]&&n>257?(h==st?w.Le="oversubscribed distance tree":h==it?(w.Le="incomplete distance tree",h=st):-4!=h&&(w.Le="empty distance tree with lengths",h=st),h):0)}}function dt(){const e=this;let t,n,r,s,i=0,o=0,c=0,f=0,a=0,l=0,u=0,w=0,h=0,d=0;function p(e,t,n,r,s,i,o,c){let f,a,l,u,w,h,d,p,y,m,b,g,k,v,S,z;d=c.nt,p=c.We,w=o.ot,h=o.ct,y=o.write,m=y<o.read?o.read-y-1:o.end-y,b=ot[e],g=ot[t];do{for(;20>h;)p--,w|=(255&c.ft(d++))<<h,h+=8;if(f=w&b,a=n,l=r,z=3*(l+f),0!==(u=a[z]))for(;;){if(w>>=a[z+1],h-=a[z+1],0!=(16&u)){for(u&=15,k=a[z+2]+(w&ot[u]),w>>=u,h-=u;15>h;)p--,w|=(255&c.ft(d++))<<h,h+=8;for(f=w&g,a=s,l=i,z=3*(l+f),u=a[z];;){if(w>>=a[z+1],h-=a[z+1],0!=(16&u)){for(u&=15;u>h;)p--,w|=(255&c.ft(d++))<<h,h+=8;if(v=a[z+2]+(w&ot[u]),w>>=u,h-=u,m-=k,v>y){S=y-v;do{S+=o.end}while(0>S);if(u=o.end-S,k>u){if(k-=u,y-S>0&&u>y-S)do{o.lt[y++]=o.lt[S++]}while(0!=--u);else o.lt.set(o.lt.subarray(S,S+u),y),y+=u,S+=u,u=0;S=0}}else S=y-v,y-S>0&&2>y-S?(o.lt[y++]=o.lt[S++],o.lt[y++]=o.lt[S++],k-=2):(o.lt.set(o.lt.subarray(S,S+2),y),y+=2,S+=2,k-=2);if(y-S>0&&k>y-S)do{o.lt[y++]=o.lt[S++]}while(0!=--k);else o.lt.set(o.lt.subarray(S,S+k),y),y+=k,S+=k,k=0;break}if(0!=(64&u))return c.Le="invalid distance code",k=c.We-p,k=k>h>>3?h>>3:k,p+=k,d-=k,h-=k<<3,o.ot=w,o.ct=h,c.We=p,c.qe+=d-c.nt,c.nt=d,o.write=y,st;f+=a[z+2],f+=w&ot[u],z=3*(l+f),u=a[z]}break}if(0!=(64&u))return 0!=(32&u)?(k=c.We-p,k=k>h>>3?h>>3:k,p+=k,d-=k,h-=k<<3,o.ot=w,o.ct=h,c.We=p,c.qe+=d-c.nt,c.nt=d,o.write=y,1):(c.Le="invalid literal/length code",k=c.We-p,k=k>h>>3?h>>3:k,p+=k,d-=k,h-=k<<3,o.ot=w,o.ct=h,c.We=p,c.qe+=d-c.nt,c.nt=d,o.write=y,st);if(f+=a[z+2],f+=w&ot[u],z=3*(l+f),0===(u=a[z])){w>>=a[z+1],h-=a[z+1],o.lt[y++]=a[z+2],m--;break}}else w>>=a[z+1],h-=a[z+1],o.lt[y++]=a[z+2],m--}while(m>=258&&p>=10);return k=c.We-p,k=k>h>>3?h>>3:k,p+=k,d-=k,h-=k<<3,o.ot=w,o.ct=h,c.We=p,c.qe+=d-c.nt,c.nt=d,o.write=y,0}e.init=(e,i,o,c,f,a)=>{t=0,u=e,w=i,r=o,h=c,s=f,d=a,n=null},e.ut=(e,y,m)=>{let b,g,k,v,S,z,C,x=0,A=0,_=0;for(_=y.nt,v=y.We,x=e.ot,A=e.ct,S=e.write,z=S<e.read?e.read-S-1:e.end-S;;)switch(t){case 0:if(z>=258&&v>=10&&(e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,m=p(u,w,r,h,s,d,e,y),_=y.nt,v=y.We,x=e.ot,A=e.ct,S=e.write,z=S<e.read?e.read-S-1:e.end-S,0!=m)){t=1==m?7:9;break}c=u,n=r,o=h,t=1;case 1:for(b=c;b>A;){if(0===v)return e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);m=0,v--,x|=(255&y.ft(_++))<<A,A+=8}if(g=3*(o+(x&ot[b])),x>>>=n[g+1],A-=n[g+1],k=n[g],0===k){f=n[g+2],t=6;break}if(0!=(16&k)){a=15&k,i=n[g+2],t=2;break}if(0==(64&k)){c=k,o=g/3+n[g+2];break}if(0!=(32&k)){t=7;break}return t=9,y.Le="invalid literal/length code",m=st,e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);case 2:for(b=a;b>A;){if(0===v)return e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);m=0,v--,x|=(255&y.ft(_++))<<A,A+=8}i+=x&ot[b],x>>=b,A-=b,c=w,n=s,o=d,t=3;case 3:for(b=c;b>A;){if(0===v)return e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);m=0,v--,x|=(255&y.ft(_++))<<A,A+=8}if(g=3*(o+(x&ot[b])),x>>=n[g+1],A-=n[g+1],k=n[g],0!=(16&k)){a=15&k,l=n[g+2],t=4;break}if(0==(64&k)){c=k,o=g/3+n[g+2];break}return t=9,y.Le="invalid distance code",m=st,e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);case 4:for(b=a;b>A;){if(0===v)return e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);m=0,v--,x|=(255&y.ft(_++))<<A,A+=8}l+=x&ot[b],x>>=b,A-=b,t=5;case 5:for(C=S-l;0>C;)C+=e.end;for(;0!==i;){if(0===z&&(S==e.end&&0!==e.read&&(S=0,z=S<e.read?e.read-S-1:e.end-S),0===z&&(e.write=S,m=e.wt(y,m),S=e.write,z=S<e.read?e.read-S-1:e.end-S,S==e.end&&0!==e.read&&(S=0,z=S<e.read?e.read-S-1:e.end-S),0===z)))return e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);e.lt[S++]=e.lt[C++],z--,C==e.end&&(C=0),i--}t=0;break;case 6:if(0===z&&(S==e.end&&0!==e.read&&(S=0,z=S<e.read?e.read-S-1:e.end-S),0===z&&(e.write=S,m=e.wt(y,m),S=e.write,z=S<e.read?e.read-S-1:e.end-S,S==e.end&&0!==e.read&&(S=0,z=S<e.read?e.read-S-1:e.end-S),0===z)))return e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);m=0,e.lt[S++]=f,z--,t=0;break;case 7:if(A>7&&(A-=8,v++,_--),e.write=S,m=e.wt(y,m),S=e.write,z=S<e.read?e.read-S-1:e.end-S,e.read!=e.write)return e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);t=8;case 8:return m=1,e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);case 9:return m=st,e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m);default:return m=rt,e.ot=x,e.ct=A,y.We=v,y.qe+=_-y.nt,y.nt=_,e.write=S,e.wt(y,m)}},e.ht=()=>{}}ht.dt=(e,t,n,r)=>(e[0]=9,t[0]=5,n[0]=ct,r[0]=ft,0);const pt=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];function yt(e,t){const n=this;let r,s=0,o=0,c=0,a=0;const l=[0],u=[0],w=new dt;let h=0,d=new f(4320);const p=new ht;n.ct=0,n.ot=0,n.lt=new i(t),n.end=t,n.read=0,n.write=0,n.reset=(e,t)=>{t&&(t[0]=0),6==s&&w.ht(e),s=0,n.ct=0,n.ot=0,n.read=n.write=0},n.reset(e,null),n.wt=(e,t)=>{let r,s,i;return s=e.rt,i=n.read,r=(i>n.write?n.end:n.write)-i,r>e.tt&&(r=e.tt),0!==r&&t==it&&(t=0),e.tt-=r,e.Ge+=r,e.$e.set(n.lt.subarray(i,i+r),s),s+=r,i+=r,i==n.end&&(i=0,n.write==n.end&&(n.write=0),r=n.write-i,r>e.tt&&(r=e.tt),0!==r&&t==it&&(t=0),e.tt-=r,e.Ge+=r,e.$e.set(n.lt.subarray(i,i+r),s),s+=r,i+=r),e.rt=s,n.read=i,t},n.ut=(e,t)=>{let i,f,y,m,b,g,k,v;for(m=e.nt,b=e.We,f=n.ot,y=n.ct,g=n.write,k=g<n.read?n.read-g-1:n.end-g;;){let S,z,C,x,A,_,I,P;switch(s){case 0:for(;3>y;){if(0===b)return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);t=0,b--,f|=(255&e.ft(m++))<<y,y+=8}switch(i=7&f,h=1&i,i>>>1){case 0:f>>>=3,y-=3,i=7&y,f>>>=i,y-=i,s=1;break;case 1:S=[],z=[],C=[[]],x=[[]],ht.dt(S,z,C,x),w.init(S[0],z[0],C[0],0,x[0],0),f>>>=3,y-=3,s=6;break;case 2:f>>>=3,y-=3,s=3;break;case 3:return f>>>=3,y-=3,s=9,e.Le="invalid block type",t=st,n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t)}break;case 1:for(;32>y;){if(0===b)return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);t=0,b--,f|=(255&e.ft(m++))<<y,y+=8}if((~f>>>16&65535)!=(65535&f))return s=9,e.Le="invalid stored block lengths",t=st,n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);o=65535&f,f=y=0,s=0!==o?2:0!==h?7:0;break;case 2:if(0===b)return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);if(0===k&&(g==n.end&&0!==n.read&&(g=0,k=g<n.read?n.read-g-1:n.end-g),0===k&&(n.write=g,t=n.wt(e,t),g=n.write,k=g<n.read?n.read-g-1:n.end-g,g==n.end&&0!==n.read&&(g=0,k=g<n.read?n.read-g-1:n.end-g),0===k)))return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);if(t=0,i=o,i>b&&(i=b),i>k&&(i=k),n.lt.set(e.je(m,i),g),m+=i,b-=i,g+=i,k-=i,0!=(o-=i))break;s=0!==h?7:0;break;case 3:for(;14>y;){if(0===b)return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);t=0,b--,f|=(255&e.ft(m++))<<y,y+=8}if(c=i=16383&f,(31&i)>29||(i>>5&31)>29)return s=9,e.Le="too many length or distance symbols",t=st,n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);if(i=258+(31&i)+(i>>5&31),!r||r.length<i)r=[];else for(v=0;i>v;v++)r[v]=0;f>>>=14,y-=14,a=0,s=4;case 4:for(;4+(c>>>10)>a;){for(;3>y;){if(0===b)return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);t=0,b--,f|=(255&e.ft(m++))<<y,y+=8}r[pt[a++]]=7&f,f>>>=3,y-=3}for(;19>a;)r[pt[a++]]=0;if(l[0]=7,i=p.st(r,l,u,d,e),0!=i)return(t=i)==st&&(r=null,s=9),n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);a=0,s=5;case 5:for(;i=c,258+(31&i)+(i>>5&31)>a;){let o,w;for(i=l[0];i>y;){if(0===b)return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);t=0,b--,f|=(255&e.ft(m++))<<y,y+=8}if(i=d[3*(u[0]+(f&ot[i]))+1],w=d[3*(u[0]+(f&ot[i]))+2],16>w)f>>>=i,y-=i,r[a++]=w;else{for(v=18==w?7:w-14,o=18==w?11:3;i+v>y;){if(0===b)return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);t=0,b--,f|=(255&e.ft(m++))<<y,y+=8}if(f>>>=i,y-=i,o+=f&ot[v],f>>>=v,y-=v,v=a,i=c,v+o>258+(31&i)+(i>>5&31)||16==w&&1>v)return r=null,s=9,e.Le="invalid bit length repeat",t=st,n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);w=16==w?r[v-1]:0;do{r[v++]=w}while(0!=--o);a=v}}if(u[0]=-1,A=[],_=[],I=[],P=[],A[0]=9,_[0]=6,i=c,i=p.it(257+(31&i),1+(i>>5&31),r,A,_,I,P,d,e),0!=i)return i==st&&(r=null,s=9),t=i,n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);w.init(A[0],_[0],d,I[0],d,P[0]),s=6;case 6:if(n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,1!=(t=w.ut(n,e,t)))return n.wt(e,t);if(t=0,w.ht(e),m=e.nt,b=e.We,f=n.ot,y=n.ct,g=n.write,k=g<n.read?n.read-g-1:n.end-g,0===h){s=0;break}s=7;case 7:if(n.write=g,t=n.wt(e,t),g=n.write,k=g<n.read?n.read-g-1:n.end-g,n.read!=n.write)return n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);s=8;case 8:return t=1,n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);case 9:return t=st,n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t);default:return t=rt,n.ot=f,n.ct=y,e.We=b,e.qe+=m-e.nt,e.nt=m,n.write=g,n.wt(e,t)}}},n.ht=e=>{n.reset(e,null),n.lt=null,d=null},n.yt=(e,t,r)=>{n.lt.set(e.subarray(t,t+r),0),n.read=n.write=r},n.bt=()=>1==s?1:0}const mt=13,bt=[0,0,255,255];function gt(){const e=this;function t(e){return e&&e.gt?(e.qe=e.Ge=0,e.Le=null,e.gt.mode=7,e.gt.kt.reset(e,null),0):rt}e.mode=0,e.method=0,e.vt=[0],e.St=0,e.marker=0,e.zt=0,e.Ct=t=>(e.kt&&e.kt.ht(t),e.kt=null,0),e.xt=(n,r)=>(n.Le=null,e.kt=null,8>r||r>15?(e.Ct(n),rt):(e.zt=r,n.gt.kt=new yt(n,1<<r),t(n),0)),e.At=(e,t)=>{let n,r;if(!e||!e.gt||!e.et)return rt;const s=e.gt;for(t=4==t?it:0,n=it;;)switch(s.mode){case 0:if(0===e.We)return n;if(n=t,e.We--,e.qe++,8!=(15&(s.method=e.ft(e.nt++)))){s.mode=mt,e.Le="unknown compression method",s.marker=5;break}if(8+(s.method>>4)>s.zt){s.mode=mt,e.Le="invalid win size",s.marker=5;break}s.mode=1;case 1:if(0===e.We)return n;if(n=t,e.We--,e.qe++,r=255&e.ft(e.nt++),((s.method<<8)+r)%31!=0){s.mode=mt,e.Le="incorrect header check",s.marker=5;break}if(0==(32&r)){s.mode=7;break}s.mode=2;case 2:if(0===e.We)return n;n=t,e.We--,e.qe++,s.St=(255&e.ft(e.nt++))<<24&4278190080,s.mode=3;case 3:if(0===e.We)return n;n=t,e.We--,e.qe++,s.St+=(255&e.ft(e.nt++))<<16&16711680,s.mode=4;case 4:if(0===e.We)return n;n=t,e.We--,e.qe++,s.St+=(255&e.ft(e.nt++))<<8&65280,s.mode=5;case 5:return 0===e.We?n:(n=t,e.We--,e.qe++,s.St+=255&e.ft(e.nt++),s.mode=6,2);case 6:return s.mode=mt,e.Le="need dictionary",s.marker=0,rt;case 7:if(n=s.kt.ut(e,n),n==st){s.mode=mt,s.marker=0;break}if(0==n&&(n=t),1!=n)return n;n=t,s.kt.reset(e,s.vt),s.mode=12;case 12:return e.We=0,1;case mt:return st;default:return rt}},e._t=(e,t,n)=>{let r=0,s=n;if(!e||!e.gt||6!=e.gt.mode)return rt;const i=e.gt;return s<1<<i.zt||(s=(1<<i.zt)-1,r=n-s),i.kt.yt(t,r,s),i.mode=7,0},e.It=e=>{let n,r,s,i,o;if(!e||!e.gt)return rt;const c=e.gt;if(c.mode!=mt&&(c.mode=mt,c.marker=0),0===(n=e.We))return it;for(r=e.nt,s=c.marker;0!==n&&4>s;)e.ft(r)==bt[s]?s++:s=0!==e.ft(r)?0:4-s,r++,n--;return e.qe+=r-e.nt,e.nt=r,e.We=n,c.marker=s,4!=s?st:(i=e.qe,o=e.Ge,t(e),e.qe=i,e.Ge=o,c.mode=7,0)},e.Pt=e=>e&&e.gt&&e.gt.kt?e.gt.kt.bt():rt}function kt(){}function vt(e){const t=new kt,n=e&&e.chunkSize?r.floor(2*e.chunkSize):131072,o=new i(n);let c=!1;t.xt(),t.$e=o,this.append=(e,r)=>{const f=[];let a,l,u=0,w=0,h=0;if(0!==e.length){t.nt=0,t.et=e,t.We=e.length;do{if(t.rt=0,t.tt=n,0!==t.We||c||(t.nt=0,c=!0),a=t.At(0),c&&a===it){if(0!==t.We)throw new s("inflating: bad input")}else if(0!==a&&1!==a)throw new s("inflating: "+t.Le);if((c||1===a)&&t.We===e.length)throw new s("inflating: bad input");t.rt&&(t.rt===n?f.push(new i(o)):f.push(o.subarray(0,t.rt))),h+=t.rt,r&&t.nt>0&&t.nt!=u&&(r(t.nt),u=t.nt)}while(t.We>0||0===t.tt);return f.length>1?(l=new i(h),f.forEach((e=>{l.set(e,w),w+=e.length}))):l=f[0]?new i(f[0]):new i,l}},this.flush=()=>{t.Ct()}}kt.prototype={xt(e){const t=this;return t.gt=new gt,e||(e=15),t.gt.xt(t,e)},At(e){const t=this;return t.gt?t.gt.At(t,e):rt},Ct(){const e=this;if(!e.gt)return rt;const t=e.gt.Ct(e);return e.gt=null,t},It(){const e=this;return e.gt?e.gt.It(e):rt},_t(e,t){const n=this;return n.gt?n.gt._t(n,e,t):rt},ft(e){return this.et[e]},je(e,t){return this.et.subarray(e,e+t)}},self.initCodec=()=>{self.Deflate=nt,self.Inflate=vt};\n'],{type:"text/javascript"}));e({workerScripts:{inflate:[t],deflate:[t]}});}
    const ERR_ITERATOR_COMPLETED_TOO_SOON = "Writer iterator completed too soon";
    const HTTP_HEADER_CONTENT_TYPE = "Content-Type";
    const DEFAULT_CHUNK_SIZE = 64 * 1024;

    const PROPERTY_NAME_WRITABLE = "writable";

    class Stream {

    	constructor() {
    		this.size = 0;
    	}

    	init() {
    		this.initialized = true;
    	}
    }

    class Reader extends Stream {

    	get readable() {
    		const reader = this;
    		const { chunkSize = DEFAULT_CHUNK_SIZE } = reader;
    		const readable = new ReadableStream({
    			start() {
    				this.chunkOffset = 0;
    			},
    			async pull(controller) {
    				const { offset = 0, size, diskNumberStart } = readable;
    				const { chunkOffset } = this;
    				controller.enqueue(await readUint8Array(reader, offset + chunkOffset, Math.min(chunkSize, size - chunkOffset), diskNumberStart));
    				if (chunkOffset + chunkSize > size) {
    					controller.close();
    				} else {
    					this.chunkOffset += chunkSize;
    				}
    			}
    		});
    		return readable;
    	}
    }

    class BlobReader extends Reader {

    	constructor(blob) {
    		super();
    		Object.assign(this, {
    			blob,
    			size: blob.size
    		});
    	}

    	async readUint8Array(offset, length) {
    		const reader = this;
    		const offsetEnd = offset + length;
    		const blob = offset || offsetEnd < reader.size ? reader.blob.slice(offset, offsetEnd) : reader.blob;
    		let arrayBuffer = await blob.arrayBuffer();
    		if (arrayBuffer.byteLength > length) {
    			arrayBuffer = arrayBuffer.slice(offset, offsetEnd);
    		}
    		return new Uint8Array(arrayBuffer);
    	}
    }

    class BlobWriter extends Stream {

    	constructor(contentType) {
    		super();
    		const writer = this;
    		const transformStream = new TransformStream();
    		const headers = [];
    		if (contentType) {
    			headers.push([HTTP_HEADER_CONTENT_TYPE, contentType]);
    		}
    		Object.defineProperty(writer, PROPERTY_NAME_WRITABLE, {
    			get() {
    				return transformStream.writable;
    			}
    		});
    		writer.blob = new Response(transformStream.readable, { headers }).blob();
    	}

    	getData() {
    		return this.blob;
    	}
    }

    class TextWriter extends BlobWriter {

    	constructor(encoding) {
    		super(encoding);
    		Object.assign(this, {
    			encoding,
    			utf8: !encoding || encoding.toLowerCase() == "utf-8"
    		});
    	}

    	async getData() {
    		const {
    			encoding,
    			utf8
    		} = this;
    		const blob = await super.getData();
    		if (blob.text && utf8) {
    			return blob.text();
    		} else {
    			const reader = new FileReader();
    			return new Promise((resolve, reject) => {
    				Object.assign(reader, {
    					onload: ({ target }) => resolve(target.result),
    					onerror: () => reject(reader.error)
    				});
    				reader.readAsText(blob, encoding);
    			});
    		}
    	}
    }

    class SplitDataReader extends Reader {

    	constructor(readers) {
    		super();
    		this.readers = readers;
    	}

    	async init() {
    		const reader = this;
    		const { readers } = reader;
    		reader.lastDiskNumber = 0;
    		reader.lastDiskOffset = 0;
    		await Promise.all(readers.map(async (diskReader, indexDiskReader) => {
    			await diskReader.init();
    			if (indexDiskReader != readers.length - 1) {
    				reader.lastDiskOffset += diskReader.size;
    			}
    			reader.size += diskReader.size;
    		}));
    		super.init();
    	}

    	async readUint8Array(offset, length, diskNumber = 0) {
    		const reader = this;
    		const { readers } = this;
    		let result;
    		let currentDiskNumber = diskNumber;
    		if (currentDiskNumber == -1) {
    			currentDiskNumber = readers.length - 1;
    		}
    		let currentReaderOffset = offset;
    		while (currentReaderOffset >= readers[currentDiskNumber].size) {
    			currentReaderOffset -= readers[currentDiskNumber].size;
    			currentDiskNumber++;
    		}
    		const currentReader = readers[currentDiskNumber];
    		const currentReaderSize = currentReader.size;
    		if (currentReaderOffset + length <= currentReaderSize) {
    			result = await readUint8Array(currentReader, currentReaderOffset, length);
    		} else {
    			const chunkLength = currentReaderSize - currentReaderOffset;
    			result = new Uint8Array(length);
    			result.set(await readUint8Array(currentReader, currentReaderOffset, chunkLength));
    			result.set(await reader.readUint8Array(offset + chunkLength, length - chunkLength, diskNumber), chunkLength);
    		}
    		reader.lastDiskNumber = Math.max(currentDiskNumber, reader.lastDiskNumber);
    		return result;
    	}
    }

    class SplitDataWriter extends Stream {

    	constructor(writerGenerator, maxSize = 4294967295) {
    		super();
    		const writer = this;
    		Object.assign(writer, {
    			diskNumber: 0,
    			diskOffset: 0,
    			size: 0,
    			maxSize,
    			availableSize: maxSize
    		});
    		let diskSourceWriter, diskWritable, diskWriter;
    		const writable = new WritableStream({
    			async write(chunk) {
    				const { availableSize } = writer;
    				if (!diskWriter) {
    					const { value, done } = await writerGenerator.next();
    					if (done && !value) {
    						throw new Error(ERR_ITERATOR_COMPLETED_TOO_SOON);
    					} else {
    						diskSourceWriter = value;
    						diskSourceWriter.size = 0;
    						if (diskSourceWriter.maxSize) {
    							writer.maxSize = diskSourceWriter.maxSize;
    						}
    						writer.availableSize = writer.maxSize;
    						await initStream(diskSourceWriter);
    						diskWritable = value.writable;
    						diskWriter = diskWritable.getWriter();
    					}
    					await this.write(chunk);
    				} else if (chunk.length >= availableSize) {
    					await writeChunk(chunk.slice(0, availableSize));
    					await closeDisk();
    					writer.diskOffset += diskSourceWriter.size;
    					writer.diskNumber++;
    					diskWriter = null;
    					await this.write(chunk.slice(availableSize));
    				} else {
    					await writeChunk(chunk);
    				}
    			},
    			async close() {
    				await diskWriter.ready;
    				await closeDisk();
    			}
    		});
    		Object.defineProperty(writer, PROPERTY_NAME_WRITABLE, {
    			get() {
    				return writable;
    			}
    		});

    		async function writeChunk(chunk) {
    			const chunkLength = chunk.length;
    			if (chunkLength) {
    				await diskWriter.ready;
    				await diskWriter.write(chunk);
    				diskSourceWriter.size += chunkLength;
    				writer.size += chunkLength;
    				writer.availableSize -= chunkLength;
    			}
    		}

    		async function closeDisk() {
    			diskWritable.size = diskSourceWriter.size;
    			await diskWriter.close();
    		}
    	}
    }

    async function initStream(stream, initSize) {
    	if (stream.init && !stream.initialized) {
    		await stream.init(initSize);
    	} else {
    		return Promise.resolve();
    	}
    }

    function initReader(reader) {
    	if (Array.isArray(reader)) {
    		reader = new SplitDataReader(reader);
    	}
    	if (reader instanceof ReadableStream) {
    		reader = {
    			readable: reader
    		};
    	}
    	return reader;
    }

    function initWriter(writer) {
    	if (writer.writable === UNDEFINED_VALUE && typeof writer.next == FUNCTION_TYPE) {
    		writer = new SplitDataWriter(writer);
    	}
    	if (writer instanceof WritableStream) {
    		writer = {
    			writable: writer
    		};
    	}
    	const { writable } = writer;
    	if (writable.size === UNDEFINED_VALUE) {
    		writable.size = 0;
    	}
    	if (!(writer instanceof SplitDataWriter)) {
    		Object.assign(writer, {
    			diskNumber: 0,
    			diskOffset: 0,
    			availableSize: Infinity,
    			maxSize: Infinity
    		});
    	}
    	return writer;
    }

    function readUint8Array(reader, offset, size, diskNumber) {
    	return reader.readUint8Array(offset, size, diskNumber);
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    /* global TextDecoder */

    const CP437 = "\0☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ".split("");
    const VALID_CP437 = CP437.length == 256;

    function decodeCP437(stringValue) {
    	if (VALID_CP437) {
    		let result = "";
    		for (let indexCharacter = 0; indexCharacter < stringValue.length; indexCharacter++) {
    			result += CP437[stringValue[indexCharacter]];
    		}
    		return result;
    	} else {
    		return new TextDecoder().decode(stringValue);
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    function decodeText(value, encoding) {
    	if (encoding && encoding.trim().toLowerCase() == "cp437") {
    		return decodeCP437(value);
    	} else {
    		return new TextDecoder(encoding).decode(value);
    	}
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright 
     notice, this list of conditions and the following disclaimer in 
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const PROPERTY_NAME_FILENAME = "filename";
    const PROPERTY_NAME_RAW_FILENAME = "rawFilename";
    const PROPERTY_NAME_COMMENT = "comment";
    const PROPERTY_NAME_RAW_COMMENT = "rawComment";
    const PROPERTY_NAME_UNCOMPPRESSED_SIZE = "uncompressedSize";
    const PROPERTY_NAME_COMPPRESSED_SIZE = "compressedSize";
    const PROPERTY_NAME_OFFSET = "offset";
    const PROPERTY_NAME_DISK_NUMBER_START = "diskNumberStart";
    const PROPERTY_NAME_LAST_MODIFICATION_DATE = "lastModDate";
    const PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE = "rawLastModDate";
    const PROPERTY_NAME_LAST_ACCESS_DATE = "lastAccessDate";
    const PROPERTY_NAME_RAW_LAST_ACCESS_DATE = "rawLastAccessDate";
    const PROPERTY_NAME_CREATION_DATE = "creationDate";
    const PROPERTY_NAME_RAW_CREATION_DATE = "rawCreationDate";
    const PROPERTY_NAME_INTERNAL_FILE_ATTRIBUTE = "internalFileAttribute";
    const PROPERTY_NAME_EXTERNAL_FILE_ATTRIBUTE = "externalFileAttribute";
    const PROPERTY_NAME_MS_DOS_COMPATIBLE = "msDosCompatible";
    const PROPERTY_NAME_ZIP64 = "zip64";

    const PROPERTY_NAMES = [
    	PROPERTY_NAME_FILENAME, PROPERTY_NAME_RAW_FILENAME, PROPERTY_NAME_COMPPRESSED_SIZE, PROPERTY_NAME_UNCOMPPRESSED_SIZE,
    	PROPERTY_NAME_LAST_MODIFICATION_DATE, PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE, PROPERTY_NAME_COMMENT, PROPERTY_NAME_RAW_COMMENT,
    	PROPERTY_NAME_LAST_ACCESS_DATE, PROPERTY_NAME_CREATION_DATE, PROPERTY_NAME_OFFSET, PROPERTY_NAME_DISK_NUMBER_START,
    	PROPERTY_NAME_DISK_NUMBER_START, PROPERTY_NAME_INTERNAL_FILE_ATTRIBUTE, PROPERTY_NAME_EXTERNAL_FILE_ATTRIBUTE,
    	PROPERTY_NAME_MS_DOS_COMPATIBLE, PROPERTY_NAME_ZIP64,
    	"directory", "bitFlag", "encrypted", "signature", "filenameUTF8", "commentUTF8", "compressionMethod", "version", "versionMadeBy",
    	"extraField", "rawExtraField", "extraFieldZip64", "extraFieldUnicodePath", "extraFieldUnicodeComment", "extraFieldAES", "extraFieldNTFS",
    	"extraFieldExtendedTimestamp"];

    class Entry {

    	constructor(data) {
    		PROPERTY_NAMES.forEach(name => this[name] = data[name]);
    	}

    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright
     notice, this list of conditions and the following disclaimer in
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    const ERR_BAD_FORMAT = "File format is not recognized";
    const ERR_EOCDR_NOT_FOUND = "End of central directory not found";
    const ERR_EOCDR_ZIP64_NOT_FOUND = "End of Zip64 central directory not found";
    const ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND = "End of Zip64 central directory locator not found";
    const ERR_CENTRAL_DIRECTORY_NOT_FOUND = "Central directory header not found";
    const ERR_LOCAL_FILE_HEADER_NOT_FOUND = "Local file header not found";
    const ERR_EXTRAFIELD_ZIP64_NOT_FOUND = "Zip64 extra field not found";
    const ERR_ENCRYPTED = "File contains encrypted entry";
    const ERR_UNSUPPORTED_ENCRYPTION = "Encryption method not supported";
    const ERR_UNSUPPORTED_COMPRESSION = "Compression method not supported";
    const ERR_SPLIT_ZIP_FILE = "Split zip file";
    const CHARSET_UTF8 = "utf-8";
    const CHARSET_CP437 = "cp437";
    const ZIP64_PROPERTIES = [
    	[PROPERTY_NAME_UNCOMPPRESSED_SIZE, MAX_32_BITS],
    	[PROPERTY_NAME_COMPPRESSED_SIZE, MAX_32_BITS],
    	[PROPERTY_NAME_OFFSET, MAX_32_BITS],
    	[PROPERTY_NAME_DISK_NUMBER_START, MAX_16_BITS]
    ];
    const ZIP64_EXTRACTION = {
    	[MAX_16_BITS]: {
    		getValue: getUint32,
    		bytes: 4
    	},
    	[MAX_32_BITS]: {
    		getValue: getBigUint64,
    		bytes: 8
    	}
    };

    class ZipReader {

    	constructor(reader, options = {}) {
    		Object.assign(this, {
    			reader: initReader(reader),
    			options,
    			config: getConfiguration()
    		});
    	}

    	async* getEntriesGenerator(options = {}) {
    		const zipReader = this;
    		let { reader } = zipReader;
    		const { config } = zipReader;
    		await initStream(reader);
    		if (reader.size === UNDEFINED_VALUE || !reader.readUint8Array) {
    			reader = new BlobReader(await new Response(reader.readable).blob());
    			await initStream(reader);
    		}
    		if (reader.size < END_OF_CENTRAL_DIR_LENGTH) {
    			throw new Error(ERR_BAD_FORMAT);
    		}
    		reader.chunkSize = getChunkSize(config);
    		const endOfDirectoryInfo = await seekSignature(reader, END_OF_CENTRAL_DIR_SIGNATURE, reader.size, END_OF_CENTRAL_DIR_LENGTH, MAX_16_BITS * 16);
    		if (!endOfDirectoryInfo) {
    			const signatureArray = await readUint8Array(reader, 0, 4);
    			const signatureView = getDataView$1(signatureArray);
    			if (getUint32(signatureView) == SPLIT_ZIP_FILE_SIGNATURE) {
    				throw new Error(ERR_SPLIT_ZIP_FILE);
    			} else {
    				throw new Error(ERR_EOCDR_NOT_FOUND);
    			}
    		}
    		const endOfDirectoryView = getDataView$1(endOfDirectoryInfo);
    		let directoryDataLength = getUint32(endOfDirectoryView, 12);
    		let directoryDataOffset = getUint32(endOfDirectoryView, 16);
    		const commentOffset = endOfDirectoryInfo.offset;
    		const commentLength = getUint16(endOfDirectoryView, 20);
    		const appendedDataOffset = commentOffset + END_OF_CENTRAL_DIR_LENGTH + commentLength;
    		let lastDiskNumber = getUint16(endOfDirectoryView, 4);
    		const expectedLastDiskNumber = reader.lastDiskNumber || 0;
    		let diskNumber = getUint16(endOfDirectoryView, 6);
    		let filesLength = getUint16(endOfDirectoryView, 8);
    		let prependedDataLength = 0;
    		let startOffset = 0;
    		if (directoryDataOffset == MAX_32_BITS || directoryDataLength == MAX_32_BITS || filesLength == MAX_16_BITS || diskNumber == MAX_16_BITS) {
    			const endOfDirectoryLocatorArray = await readUint8Array(reader, endOfDirectoryInfo.offset - ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH, ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH);
    			const endOfDirectoryLocatorView = getDataView$1(endOfDirectoryLocatorArray);
    			if (getUint32(endOfDirectoryLocatorView, 0) != ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE) {
    				throw new Error(ERR_EOCDR_ZIP64_NOT_FOUND);
    			}
    			directoryDataOffset = getBigUint64(endOfDirectoryLocatorView, 8);
    			let endOfDirectoryArray = await readUint8Array(reader, directoryDataOffset, ZIP64_END_OF_CENTRAL_DIR_LENGTH, -1);
    			let endOfDirectoryView = getDataView$1(endOfDirectoryArray);
    			const expectedDirectoryDataOffset = endOfDirectoryInfo.offset - ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH - ZIP64_END_OF_CENTRAL_DIR_LENGTH;
    			if (getUint32(endOfDirectoryView, 0) != ZIP64_END_OF_CENTRAL_DIR_SIGNATURE && directoryDataOffset != expectedDirectoryDataOffset) {
    				const originalDirectoryDataOffset = directoryDataOffset;
    				directoryDataOffset = expectedDirectoryDataOffset;
    				prependedDataLength = directoryDataOffset - originalDirectoryDataOffset;
    				endOfDirectoryArray = await readUint8Array(reader, directoryDataOffset, ZIP64_END_OF_CENTRAL_DIR_LENGTH, -1);
    				endOfDirectoryView = getDataView$1(endOfDirectoryArray);
    			}
    			if (getUint32(endOfDirectoryView, 0) != ZIP64_END_OF_CENTRAL_DIR_SIGNATURE) {
    				throw new Error(ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND);
    			}
    			if (lastDiskNumber == MAX_16_BITS) {
    				lastDiskNumber = getUint32(endOfDirectoryView, 16);
    			}
    			if (diskNumber == MAX_16_BITS) {
    				diskNumber = getUint32(endOfDirectoryView, 20);
    			}
    			if (filesLength == MAX_16_BITS) {
    				filesLength = getBigUint64(endOfDirectoryView, 32);
    			}
    			if (directoryDataLength == MAX_32_BITS) {
    				directoryDataLength = getBigUint64(endOfDirectoryView, 40);
    			}
    			directoryDataOffset -= directoryDataLength;
    		}
    		if (directoryDataOffset >= reader.size) {
    			prependedDataLength = reader.size - directoryDataOffset - directoryDataLength - END_OF_CENTRAL_DIR_LENGTH;
    			directoryDataOffset = reader.size - directoryDataLength - END_OF_CENTRAL_DIR_LENGTH;
    		}
    		if (expectedLastDiskNumber != lastDiskNumber) {
    			throw new Error(ERR_SPLIT_ZIP_FILE);
    		}
    		if (directoryDataOffset < 0) {
    			throw new Error(ERR_BAD_FORMAT);
    		}
    		let offset = 0;
    		let directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
    		let directoryView = getDataView$1(directoryArray);
    		if (directoryDataLength) {
    			const expectedDirectoryDataOffset = endOfDirectoryInfo.offset - directoryDataLength;
    			if (getUint32(directoryView, offset) != CENTRAL_FILE_HEADER_SIGNATURE && directoryDataOffset != expectedDirectoryDataOffset) {
    				const originalDirectoryDataOffset = directoryDataOffset;
    				directoryDataOffset = expectedDirectoryDataOffset;
    				prependedDataLength += directoryDataOffset - originalDirectoryDataOffset;
    				directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
    				directoryView = getDataView$1(directoryArray);
    			}
    		}
    		const expectedDirectoryDataLength = endOfDirectoryInfo.offset - directoryDataOffset - (reader.lastDiskOffset || 0);
    		if (directoryDataLength != expectedDirectoryDataLength && expectedDirectoryDataLength >= 0) {
    			directoryDataLength = expectedDirectoryDataLength;
    			directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
    			directoryView = getDataView$1(directoryArray);
    		}
    		if (directoryDataOffset < 0 || directoryDataOffset >= reader.size) {
    			throw new Error(ERR_BAD_FORMAT);
    		}
    		const filenameEncoding = getOptionValue$1(zipReader, options, "filenameEncoding");
    		const commentEncoding = getOptionValue$1(zipReader, options, "commentEncoding");
    		for (let indexFile = 0; indexFile < filesLength; indexFile++) {
    			const fileEntry = new ZipEntry$1(reader, config, zipReader.options);
    			if (getUint32(directoryView, offset) != CENTRAL_FILE_HEADER_SIGNATURE) {
    				throw new Error(ERR_CENTRAL_DIRECTORY_NOT_FOUND);
    			}
    			readCommonHeader(fileEntry, directoryView, offset + 6);
    			const languageEncodingFlag = Boolean(fileEntry.bitFlag.languageEncodingFlag);
    			const filenameOffset = offset + 46;
    			const extraFieldOffset = filenameOffset + fileEntry.filenameLength;
    			const commentOffset = extraFieldOffset + fileEntry.extraFieldLength;
    			const versionMadeBy = getUint16(directoryView, offset + 4);
    			const msDosCompatible = (versionMadeBy & 0) == 0;
    			const rawFilename = directoryArray.subarray(filenameOffset, extraFieldOffset);
    			const commentLength = getUint16(directoryView, offset + 32);
    			const endOffset = commentOffset + commentLength;
    			const rawComment = directoryArray.subarray(commentOffset, endOffset);
    			const filenameUTF8 = languageEncodingFlag;
    			const commentUTF8 = languageEncodingFlag;
    			const directory = msDosCompatible && ((getUint8(directoryView, offset + 38) & FILE_ATTR_MSDOS_DIR_MASK) == FILE_ATTR_MSDOS_DIR_MASK);
    			const offsetFileEntry = getUint32(directoryView, offset + 42) + prependedDataLength;
    			Object.assign(fileEntry, {
    				versionMadeBy,
    				msDosCompatible,
    				compressedSize: 0,
    				uncompressedSize: 0,
    				commentLength,
    				directory,
    				offset: offsetFileEntry,
    				diskNumberStart: getUint16(directoryView, offset + 34),
    				internalFileAttribute: getUint16(directoryView, offset + 36),
    				externalFileAttribute: getUint32(directoryView, offset + 38),
    				rawFilename,
    				filenameUTF8,
    				commentUTF8,
    				rawExtraField: directoryArray.subarray(extraFieldOffset, commentOffset)
    			});
    			const [filename, comment] = await Promise.all([
    				decodeText(rawFilename, filenameUTF8 ? CHARSET_UTF8 : filenameEncoding || CHARSET_CP437),
    				decodeText(rawComment, commentUTF8 ? CHARSET_UTF8 : commentEncoding || CHARSET_CP437)
    			]);
    			Object.assign(fileEntry, {
    				rawComment,
    				filename,
    				comment,
    				directory: directory || filename.endsWith(DIRECTORY_SIGNATURE)
    			});
    			startOffset = Math.max(offsetFileEntry, startOffset);
    			await readCommonFooter(fileEntry, fileEntry, directoryView, offset + 6);
    			const entry = new Entry(fileEntry);
    			entry.getData = (writer, options) => fileEntry.getData(writer, entry, options);
    			offset = endOffset;
    			const { onprogress } = options;
    			if (onprogress) {
    				try {
    					await onprogress(indexFile + 1, filesLength, new Entry(fileEntry));
    				} catch (_error) {
    					// ignored
    				}
    			}
    			yield entry;
    		}
    		const extractPrependedData = getOptionValue$1(zipReader, options, "extractPrependedData");
    		const extractAppendedData = getOptionValue$1(zipReader, options, "extractAppendedData");
    		if (extractPrependedData) {
    			zipReader.prependedData = startOffset > 0 ? await readUint8Array(reader, 0, startOffset) : new Uint8Array();
    		}
    		zipReader.comment = commentLength ? await readUint8Array(reader, commentOffset + END_OF_CENTRAL_DIR_LENGTH, commentLength) : new Uint8Array();
    		if (extractAppendedData) {
    			zipReader.appendedData = appendedDataOffset < reader.size ? await readUint8Array(reader, appendedDataOffset, reader.size - appendedDataOffset) : new Uint8Array();
    		}
    		return true;
    	}

    	async getEntries(options = {}) {
    		const entries = [];
    		for await (const entry of this.getEntriesGenerator(options)) {
    			entries.push(entry);
    		}
    		return entries;
    	}

    	async close() {
    	}
    }

    let ZipEntry$1 = class ZipEntry {

    	constructor(reader, config, options) {
    		Object.assign(this, {
    			reader,
    			config,
    			options
    		});
    	}

    	async getData(writer, fileEntry, options = {}) {
    		const zipEntry = this;
    		const {
    			reader,
    			offset,
    			diskNumberStart,
    			extraFieldAES,
    			compressionMethod,
    			config,
    			bitFlag,
    			signature,
    			rawLastModDate,
    			uncompressedSize,
    			compressedSize
    		} = zipEntry;
    		const localDirectory = fileEntry.localDirectory = {};
    		const dataArray = await readUint8Array(reader, offset, 30, diskNumberStart);
    		const dataView = getDataView$1(dataArray);
    		let password = getOptionValue$1(zipEntry, options, "password");
    		let rawPassword = getOptionValue$1(zipEntry, options, "rawPassword");
    		password = password && password.length && password;
    		rawPassword = rawPassword && rawPassword.length && rawPassword;
    		if (extraFieldAES) {
    			if (extraFieldAES.originalCompressionMethod != COMPRESSION_METHOD_AES) {
    				throw new Error(ERR_UNSUPPORTED_COMPRESSION);
    			}
    		}
    		if (compressionMethod != COMPRESSION_METHOD_STORE && compressionMethod != COMPRESSION_METHOD_DEFLATE) {
    			throw new Error(ERR_UNSUPPORTED_COMPRESSION);
    		}
    		if (getUint32(dataView, 0) != LOCAL_FILE_HEADER_SIGNATURE) {
    			throw new Error(ERR_LOCAL_FILE_HEADER_NOT_FOUND);
    		}
    		readCommonHeader(localDirectory, dataView, 4);
    		localDirectory.rawExtraField = localDirectory.extraFieldLength ?
    			await readUint8Array(reader, offset + 30 + localDirectory.filenameLength, localDirectory.extraFieldLength, diskNumberStart) :
    			new Uint8Array();
    		await readCommonFooter(zipEntry, localDirectory, dataView, 4, true);
    		Object.assign(fileEntry, {
    			lastAccessDate: localDirectory.lastAccessDate,
    			creationDate: localDirectory.creationDate
    		});
    		const encrypted = zipEntry.encrypted && localDirectory.encrypted;
    		const zipCrypto = encrypted && !extraFieldAES;
    		if (encrypted) {
    			if (!zipCrypto && extraFieldAES.strength === UNDEFINED_VALUE) {
    				throw new Error(ERR_UNSUPPORTED_ENCRYPTION);
    			} else if (!password && !rawPassword) {
    				throw new Error(ERR_ENCRYPTED);
    			}
    		}
    		const dataOffset = offset + 30 + localDirectory.filenameLength + localDirectory.extraFieldLength;
    		const size = compressedSize;
    		const readable = reader.readable;
    		Object.assign(readable, {
    			diskNumberStart,
    			offset: dataOffset,
    			size
    		});
    		const signal = getOptionValue$1(zipEntry, options, "signal");
    		const checkPasswordOnly = getOptionValue$1(zipEntry, options, "checkPasswordOnly");
    		if (checkPasswordOnly) {
    			writer = new WritableStream();
    		}
    		writer = initWriter(writer);
    		await initStream(writer, uncompressedSize);
    		const { writable } = writer;
    		const { onstart, onprogress, onend } = options;
    		const workerOptions = {
    			options: {
    				codecType: CODEC_INFLATE,
    				password,
    				rawPassword,
    				zipCrypto,
    				encryptionStrength: extraFieldAES && extraFieldAES.strength,
    				signed: getOptionValue$1(zipEntry, options, "checkSignature"),
    				passwordVerification: zipCrypto && (bitFlag.dataDescriptor ? ((rawLastModDate >>> 8) & 0xFF) : ((signature >>> 24) & 0xFF)),
    				signature,
    				compressed: compressionMethod != 0,
    				encrypted,
    				useWebWorkers: getOptionValue$1(zipEntry, options, "useWebWorkers"),
    				useCompressionStream: getOptionValue$1(zipEntry, options, "useCompressionStream"),
    				transferStreams: getOptionValue$1(zipEntry, options, "transferStreams"),
    				checkPasswordOnly
    			},
    			config,
    			streamOptions: { signal, size, onstart, onprogress, onend }
    		};
    		let outputSize = 0;
    		try {
    			({ outputSize } = (await runWorker({ readable, writable }, workerOptions)));
    		} catch (error) {
    			if (!checkPasswordOnly || error.message != ERR_ABORT_CHECK_PASSWORD) {
    				throw error;
    			}
    		} finally {
    			const preventClose = getOptionValue$1(zipEntry, options, "preventClose");
    			writable.size += outputSize;
    			if (!preventClose && !writable.locked) {
    				await writable.getWriter().close();
    			}
    		}
    		return checkPasswordOnly ? UNDEFINED_VALUE : writer.getData ? writer.getData() : writable;
    	}
    };

    function readCommonHeader(directory, dataView, offset) {
    	const rawBitFlag = directory.rawBitFlag = getUint16(dataView, offset + 2);
    	const encrypted = (rawBitFlag & BITFLAG_ENCRYPTED) == BITFLAG_ENCRYPTED;
    	const rawLastModDate = getUint32(dataView, offset + 6);
    	Object.assign(directory, {
    		encrypted,
    		version: getUint16(dataView, offset),
    		bitFlag: {
    			level: (rawBitFlag & BITFLAG_LEVEL) >> 1,
    			dataDescriptor: (rawBitFlag & BITFLAG_DATA_DESCRIPTOR) == BITFLAG_DATA_DESCRIPTOR,
    			languageEncodingFlag: (rawBitFlag & BITFLAG_LANG_ENCODING_FLAG) == BITFLAG_LANG_ENCODING_FLAG
    		},
    		rawLastModDate,
    		lastModDate: getDate(rawLastModDate),
    		filenameLength: getUint16(dataView, offset + 22),
    		extraFieldLength: getUint16(dataView, offset + 24)
    	});
    }

    async function readCommonFooter(fileEntry, directory, dataView, offset, localDirectory) {
    	const { rawExtraField } = directory;
    	const extraField = directory.extraField = new Map();
    	const rawExtraFieldView = getDataView$1(new Uint8Array(rawExtraField));
    	let offsetExtraField = 0;
    	try {
    		while (offsetExtraField < rawExtraField.length) {
    			const type = getUint16(rawExtraFieldView, offsetExtraField);
    			const size = getUint16(rawExtraFieldView, offsetExtraField + 2);
    			extraField.set(type, {
    				type,
    				data: rawExtraField.slice(offsetExtraField + 4, offsetExtraField + 4 + size)
    			});
    			offsetExtraField += 4 + size;
    		}
    	} catch (_error) {
    		// ignored
    	}
    	const compressionMethod = getUint16(dataView, offset + 4);
    	Object.assign(directory, {
    		signature: getUint32(dataView, offset + 10),
    		uncompressedSize: getUint32(dataView, offset + 18),
    		compressedSize: getUint32(dataView, offset + 14)
    	});
    	const extraFieldZip64 = extraField.get(EXTRAFIELD_TYPE_ZIP64);
    	if (extraFieldZip64) {
    		readExtraFieldZip64(extraFieldZip64, directory);
    		directory.extraFieldZip64 = extraFieldZip64;
    	}
    	const extraFieldUnicodePath = extraField.get(EXTRAFIELD_TYPE_UNICODE_PATH);
    	if (extraFieldUnicodePath) {
    		await readExtraFieldUnicode(extraFieldUnicodePath, PROPERTY_NAME_FILENAME, PROPERTY_NAME_RAW_FILENAME, directory, fileEntry);
    		directory.extraFieldUnicodePath = extraFieldUnicodePath;
    	}
    	const extraFieldUnicodeComment = extraField.get(EXTRAFIELD_TYPE_UNICODE_COMMENT);
    	if (extraFieldUnicodeComment) {
    		await readExtraFieldUnicode(extraFieldUnicodeComment, PROPERTY_NAME_COMMENT, PROPERTY_NAME_RAW_COMMENT, directory, fileEntry);
    		directory.extraFieldUnicodeComment = extraFieldUnicodeComment;
    	}
    	const extraFieldAES = extraField.get(EXTRAFIELD_TYPE_AES);
    	if (extraFieldAES) {
    		readExtraFieldAES(extraFieldAES, directory, compressionMethod);
    		directory.extraFieldAES = extraFieldAES;
    	} else {
    		directory.compressionMethod = compressionMethod;
    	}
    	const extraFieldNTFS = extraField.get(EXTRAFIELD_TYPE_NTFS);
    	if (extraFieldNTFS) {
    		readExtraFieldNTFS(extraFieldNTFS, directory);
    		directory.extraFieldNTFS = extraFieldNTFS;
    	}
    	const extraFieldExtendedTimestamp = extraField.get(EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP);
    	if (extraFieldExtendedTimestamp) {
    		readExtraFieldExtendedTimestamp(extraFieldExtendedTimestamp, directory, localDirectory);
    		directory.extraFieldExtendedTimestamp = extraFieldExtendedTimestamp;
    	}
    	const extraFieldUSDZ = extraField.get(EXTRAFIELD_TYPE_USDZ);
    	if (extraFieldUSDZ) {
    		directory.extraFieldUSDZ = extraFieldUSDZ;
    	}
    }

    function readExtraFieldZip64(extraFieldZip64, directory) {
    	directory.zip64 = true;
    	const extraFieldView = getDataView$1(extraFieldZip64.data);
    	const missingProperties = ZIP64_PROPERTIES.filter(([propertyName, max]) => directory[propertyName] == max);
    	for (let indexMissingProperty = 0, offset = 0; indexMissingProperty < missingProperties.length; indexMissingProperty++) {
    		const [propertyName, max] = missingProperties[indexMissingProperty];
    		if (directory[propertyName] == max) {
    			const extraction = ZIP64_EXTRACTION[max];
    			directory[propertyName] = extraFieldZip64[propertyName] = extraction.getValue(extraFieldView, offset);
    			offset += extraction.bytes;
    		} else if (extraFieldZip64[propertyName]) {
    			throw new Error(ERR_EXTRAFIELD_ZIP64_NOT_FOUND);
    		}
    	}
    }

    async function readExtraFieldUnicode(extraFieldUnicode, propertyName, rawPropertyName, directory, fileEntry) {
    	const extraFieldView = getDataView$1(extraFieldUnicode.data);
    	const crc32 = new Crc32();
    	crc32.append(fileEntry[rawPropertyName]);
    	const dataViewSignature = getDataView$1(new Uint8Array(4));
    	dataViewSignature.setUint32(0, crc32.get(), true);
    	const signature = getUint32(extraFieldView, 1);
    	Object.assign(extraFieldUnicode, {
    		version: getUint8(extraFieldView, 0),
    		[propertyName]: decodeText(extraFieldUnicode.data.subarray(5)),
    		valid: !fileEntry.bitFlag.languageEncodingFlag && signature == getUint32(dataViewSignature, 0)
    	});
    	if (extraFieldUnicode.valid) {
    		directory[propertyName] = extraFieldUnicode[propertyName];
    		directory[propertyName + "UTF8"] = true;
    	}
    }

    function readExtraFieldAES(extraFieldAES, directory, compressionMethod) {
    	const extraFieldView = getDataView$1(extraFieldAES.data);
    	const strength = getUint8(extraFieldView, 4);
    	Object.assign(extraFieldAES, {
    		vendorVersion: getUint8(extraFieldView, 0),
    		vendorId: getUint8(extraFieldView, 2),
    		strength,
    		originalCompressionMethod: compressionMethod,
    		compressionMethod: getUint16(extraFieldView, 5)
    	});
    	directory.compressionMethod = extraFieldAES.compressionMethod;
    }

    function readExtraFieldNTFS(extraFieldNTFS, directory) {
    	const extraFieldView = getDataView$1(extraFieldNTFS.data);
    	let offsetExtraField = 4;
    	let tag1Data;
    	try {
    		while (offsetExtraField < extraFieldNTFS.data.length && !tag1Data) {
    			const tagValue = getUint16(extraFieldView, offsetExtraField);
    			const attributeSize = getUint16(extraFieldView, offsetExtraField + 2);
    			if (tagValue == EXTRAFIELD_TYPE_NTFS_TAG1) {
    				tag1Data = extraFieldNTFS.data.slice(offsetExtraField + 4, offsetExtraField + 4 + attributeSize);
    			}
    			offsetExtraField += 4 + attributeSize;
    		}
    	} catch (_error) {
    		// ignored
    	}
    	try {
    		if (tag1Data && tag1Data.length == 24) {
    			const tag1View = getDataView$1(tag1Data);
    			const rawLastModDate = tag1View.getBigUint64(0, true);
    			const rawLastAccessDate = tag1View.getBigUint64(8, true);
    			const rawCreationDate = tag1View.getBigUint64(16, true);
    			Object.assign(extraFieldNTFS, {
    				rawLastModDate,
    				rawLastAccessDate,
    				rawCreationDate
    			});
    			const lastModDate = getDateNTFS(rawLastModDate);
    			const lastAccessDate = getDateNTFS(rawLastAccessDate);
    			const creationDate = getDateNTFS(rawCreationDate);
    			const extraFieldData = { lastModDate, lastAccessDate, creationDate };
    			Object.assign(extraFieldNTFS, extraFieldData);
    			Object.assign(directory, extraFieldData);
    		}
    	} catch (_error) {
    		// ignored
    	}
    }

    function readExtraFieldExtendedTimestamp(extraFieldExtendedTimestamp, directory, localDirectory) {
    	const extraFieldView = getDataView$1(extraFieldExtendedTimestamp.data);
    	const flags = getUint8(extraFieldView, 0);
    	const timeProperties = [];
    	const timeRawProperties = [];
    	if (localDirectory) {
    		if ((flags & 0x1) == 0x1) {
    			timeProperties.push(PROPERTY_NAME_LAST_MODIFICATION_DATE);
    			timeRawProperties.push(PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE);
    		}
    		if ((flags & 0x2) == 0x2) {
    			timeProperties.push(PROPERTY_NAME_LAST_ACCESS_DATE);
    			timeRawProperties.push(PROPERTY_NAME_RAW_LAST_ACCESS_DATE);
    		}
    		if ((flags & 0x4) == 0x4) {
    			timeProperties.push(PROPERTY_NAME_CREATION_DATE);
    			timeRawProperties.push(PROPERTY_NAME_RAW_CREATION_DATE);
    		}
    	} else if (extraFieldExtendedTimestamp.data.length >= 5) {
    		timeProperties.push(PROPERTY_NAME_LAST_MODIFICATION_DATE);
    		timeRawProperties.push(PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE);
    	}
    	let offset = 1;
    	timeProperties.forEach((propertyName, indexProperty) => {
    		if (extraFieldExtendedTimestamp.data.length >= offset + 4) {
    			const time = getUint32(extraFieldView, offset);
    			directory[propertyName] = extraFieldExtendedTimestamp[propertyName] = new Date(time * 1000);
    			const rawPropertyName = timeRawProperties[indexProperty];
    			extraFieldExtendedTimestamp[rawPropertyName] = time;
    		}
    		offset += 4;
    	});
    }

    async function seekSignature(reader, signature, startOffset, minimumBytes, maximumLength) {
    	const signatureArray = new Uint8Array(4);
    	const signatureView = getDataView$1(signatureArray);
    	setUint32$1(signatureView, 0, signature);
    	const maximumBytes = minimumBytes + maximumLength;
    	return (await seek(minimumBytes)) || await seek(Math.min(maximumBytes, startOffset));

    	async function seek(length) {
    		const offset = startOffset - length;
    		const bytes = await readUint8Array(reader, offset, length);
    		for (let indexByte = bytes.length - minimumBytes; indexByte >= 0; indexByte--) {
    			if (bytes[indexByte] == signatureArray[0] && bytes[indexByte + 1] == signatureArray[1] &&
    				bytes[indexByte + 2] == signatureArray[2] && bytes[indexByte + 3] == signatureArray[3]) {
    				return {
    					offset: offset + indexByte,
    					buffer: bytes.slice(indexByte, indexByte + minimumBytes).buffer
    				};
    			}
    		}
    	}
    }

    function getOptionValue$1(zipReader, options, name) {
    	return options[name] === UNDEFINED_VALUE ? zipReader.options[name] : options[name];
    }

    function getDate(timeRaw) {
    	const date = (timeRaw & 0xffff0000) >> 16, time = timeRaw & 0x0000ffff;
    	try {
    		return new Date(1980 + ((date & 0xFE00) >> 9), ((date & 0x01E0) >> 5) - 1, date & 0x001F, (time & 0xF800) >> 11, (time & 0x07E0) >> 5, (time & 0x001F) * 2, 0);
    	} catch (_error) {
    		// ignored
    	}
    }

    function getDateNTFS(timeRaw) {
    	return new Date((Number((timeRaw / BigInt(10000)) - BigInt(11644473600000))));
    }

    function getUint8(view, offset) {
    	return view.getUint8(offset);
    }

    function getUint16(view, offset) {
    	return view.getUint16(offset, true);
    }

    function getUint32(view, offset) {
    	return view.getUint32(offset, true);
    }

    function getBigUint64(view, offset) {
    	return Number(view.getBigUint64(offset, true));
    }

    function setUint32$1(view, offset, value) {
    	view.setUint32(offset, value, true);
    }

    function getDataView$1(array) {
    	return new DataView(array.buffer);
    }

    /*
     Copyright (c) 2022 Gildas Lormeau. All rights reserved.

     Redistribution and use in source and binary forms, with or without
     modification, are permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright
     notice, this list of conditions and the following disclaimer in
     the documentation and/or other materials provided with the distribution.

     3. The names of the authors may not be used to endorse or promote products
     derived from this software without specific prior written permission.

     THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
     INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
     FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
     INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
     INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
     LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
     OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
     EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
     */

    let baseURL;
    try {
    	baseURL = (document.currentScript && document.currentScript.src || new URL('main.js', document.baseURI).href);
    } catch (_error) {
    	// ignored
    }
    configure({ baseURL });
    e(configure);

    /// <reference types="./index.d.ts" />

    configure({ Deflate: ZipDeflate, Inflate: ZipInflate });

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
     * @param {Response} response
     * @param {(x: number) => void} progressChangeCB
     * @returns {Promise<Blob>}
     */
    async function getResponseProgress(response, progressChangeCB)
    {
        let reader = response.body.getReader();
        let contentLength = Number(response.headers.get("content-length"));

        let buffer = [];
        let nowIndex = 0;
        while (true)
        {
            let { done, value } = await reader.read();

            if (done)
                break;

            buffer.push(value);
            nowIndex += value.byteLength;
            progressChangeCB(Math.min(0.999, nowIndex / contentLength));
        }

        let data = new Uint8Array(nowIndex);
        nowIndex = 0;
        buffer.forEach(o =>
        {
            data.set(o, nowIndex);
            nowIndex += o.byteLength;
        });

        progressChangeCB(1);

        return new Blob([data]);
    }

    /**
     * @param {string} beatmapUrl
     * @param {(x: number) => void} [progressChangeCB]
     */
    async function loadBeatmapPackage(beatmapUrl, progressChangeCB)
    {
        let response = await fetch(beatmapUrl);
        let zipFileBlob = (progressChangeCB ? await getResponseProgress(response, progressChangeCB) : await response.blob());
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

        // console.log(beatmapFileNameList);
    }

    /**
     * 
     * @param {string} fileName 
     * @param {boolean} justMeta
     */
    async function readBeatmapFile(fileName, justMeta = false)
    {
        let beatmapData = await zipFileMap.get(fileName).readAsText();

        // console.log(beatmapData);

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
                        Number(hitObj[1]);
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
    async function getBeatmapFileName(beatmapIdType, beatmapId)
    {
        if (beatmapIdType == "index")
            return beatmapFileNameList[beatmapId];
        else if (beatmapIdType == "fileName")
            return beatmapId + ".osu";
        else if (beatmapIdType == "rawFileName")
            return String(beatmapId);
        else if (beatmapIdType == "bid")
        {
            for (let fileName of beatmapFileNameList)
            {
                let meta = await readBeatmapFile(fileName, true);
                if (meta.meta.Metadata.BeatmapID == String(beatmapId))
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
    async function playBeatmap(beatmapFileName)
    {
        state.beatmapFileName = beatmapFileName;

        let beatmap = await readBeatmapFile(beatmapFileName);
        let beatmapMeta = beatmap.meta;
        let beatmapHibObjArray = beatmap.hitObj.slice().sort((a, b) => (a.time - b.time));

        let audioFileName = String(beatmapMeta.General.AudioFilename);
        let audio = await readAudioFile(audioFileName);
        state.audio = audio;

        let audioLeadInTime = Number(beatmapMeta.General.AudioLeadIn || 0);

        let audioContext = new AudioContext();
        let audioLatency = Math.round(audioContext.outputLatency * 1000 + (Number.isFinite(storageContext.config.userAudioLatency) ? storageContext.config.userAudioLatency : 0));

        setTimeout(async () =>
        {
            if (audio == state.audio)
            {
                await audio.play();
                correctMatchTime(audioLeadInTime - audioLatency);
            }
        }, 3000 + audioLeadInTime - audioLatency);

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
     * 正向遍历数组
     * 在回调中返回不为false或void的值主动结束遍历
     * 主动结束遍历 返回true
     * 未主动结束遍历完全部内容 返回false
     * @template T
     * @param {ArrayLike<T>} o
     * @param {function(T, number):(boolean | void)} callback
     * @returns {boolean}
     */
    function forEach(o, callback)
    {
        if (!o)
            return false;
        for (let i = 0, Li = o.length; i < Li; i++)
            if (o[i] != undefined && callback(o[i], i))
                return true;
        return false;
    }

    /**
     * 为绑定回收的钩子
     */
    let unboundHook = new Set();

    /**
     * 所有钩子绑定类
     * @typedef { null |
     *  import("./array/ArrayHookBind").ArrayHookBind | 
     *  import("./map/MapHookBind").MapHookBind | 
     *  import("./object/HookBindValue").HookBindValue | 
     *  import("./object/HookBindCallback").HookBindCallback | 
     *  import("./set/SetHookBind").SetHookBind
     * } AllHookBind
     */

    /**
     * 目标钩子 到 绑定销毁此钩子的对象的数量 映射
     * @type {WeakMap<AllHookBind, number>}
     */
    const hookBindDestroyCountMap = new WeakMap();

    /**
     * 记录器

     * 在目标对象销毁时销毁钩子
     * @type {FinalizationRegistry<AllHookBind>}
     */
    const register = new FinalizationRegistry(heldValue =>
    {
        let hookBindDestroyCount = hookBindDestroyCountMap.get(heldValue);

        if (hookBindDestroyCount >= 2)
            hookBindDestroyCountMap.set(heldValue, hookBindDestroyCount - 1);
        else
            heldValue.destroy();
    });

    /**
     * 钩子绑定销毁
     * 用于在目标对象销毁时销毁钩子
     * @param {object} targetObj 
     * @param {AllHookBind} targetHook 
     */
    function hookBindDestroy(targetObj, targetHook)
    {
        let hookBindDestroyCount = hookBindDestroyCountMap.get(targetHook);

        if (hookBindDestroyCount == undefined)
            hookBindDestroyCount = 0;

        hookBindDestroyCountMap.set(targetHook, hookBindDestroyCount + 1);

        register.register(targetObj, targetHook, targetHook);
    }

    /**
     * 释放钩子绑定销毁
     * 解除 用于销毁钩子的对象 对 钩子 的引用
     * 防止手动销毁钩子时内存泄漏
     * @param {AllHookBind} targetHook
     */
    function freeHookBindDestroy(targetHook)
    {
        register.unregister(targetHook);
    }

    /**
     * 钩子绑定到回调类
     */
    class HookBindCallback
    {
        /**
         * 钩子信息
         * @type {import("./HookBindInfo").HookBindInfo}
         */
        #info = null;

        /**
         * 回调函数的弱引用
         * @type {WeakRef<function(any): void>}
         */
        #cbRef = null;
        /**
         * 回调函数
         * 当此钩子绑定自动释放时为null
         * @type {function(any): void}
         */
        #callback = null;

        /**
         * 目标对象引用映射
         * 用于建立目标对象到指定对象的强引用关系
         * @type {WeakMap<object, Set<object>>}
         */
        #targetRefMap = new WeakMap();

        /**
         * @param {import("./HookBindInfo").HookBindInfo} info
         * @param {function(any): void} callback
         */
        constructor(info, callback)
        {
            this.#info = info;
            this.#cbRef = new WeakRef(callback);
            this.#callback = callback;
            info.addHook(this);

            // 添加调试未绑定探针
            unboundHook.add(this);
        }

        /**
         * 触发此钩子
         */
        emit()
        {
            let callback = this.#cbRef.deref();
            if (callback)
            {
                try
                {
                    callback(this.#info.getValue());
                }
                catch (err)
                {
                    console.error(err);
                }
            }
        }

        /**
         * 销毁此钩子
         * 销毁后钩子将不再自动触发
         */
        destroy()
        {
            this.#info.removeHook(this);
            freeHookBindDestroy(this);

            // 移除调试未绑定探针
            unboundHook.delete(this);
        }

        /**
         * 绑定销毁
         * 当目标对象释放时销毁
         * @param {object} targetObj
         * @returns {HookBindCallback} 返回自身
         */
        bindDestroy(targetObj)
        {
            let targetRefSet = this.#targetRefMap.get(targetObj);
            if (targetRefSet == undefined)
            {
                targetRefSet = new Set();
                this.#targetRefMap.set(targetObj, targetRefSet);
            }
            targetRefSet.add(this.#callback);
            this.#callback = null;
            hookBindDestroy(targetObj, this);

            // 移除调试未绑定探针
            unboundHook.delete(this);

            return this;
        }
    }

    /**
     * 钩子绑定到值类
     */
    class HookBindValue
    {
        /**
         * 钩子信息
         * @type {import("./HookBindInfo").HookBindInfo}
         */
        #info = null;

        /**
         * 目标对象
         * @type {WeakRef<object>}
         */
        #targetRef = null;
        /**
         * 目标对象的键
         * @type {string | symbol}
         */
        #targetKey = "";

        /**
         * @param {import("./HookBindInfo").HookBindInfo} info
         * @param {object} targetObj
         * @param {string | symbol} targetKey
         */
        constructor(info, targetObj, targetKey)
        {
            this.#info = info;
            this.#targetRef = new WeakRef(targetObj);
            this.#targetKey = targetKey;
            info.addHook(this);
            hookBindDestroy(targetObj, this);
        }

        /**
         * 触发此钩子
         * 销毁后仍可通过此方法手动触发
         */
        emit()
        {
            let target = this.#targetRef.deref();
            if (target != undefined)
            {
                try
                {
                    target[this.#targetKey] = this.#info.getValue();
                }
                catch (err)
                {
                    console.error(err);
                }
            }
        }

        /**
         * 销毁此钩子
         * 销毁后钩子将不再自动触发
         */
        destroy()
        {
            this.#info.removeHook(this);
            freeHookBindDestroy(this);
        }
    }

    /**
     * 钩子绑定信息
     */
    class HookBindInfo
    {
        /**
         * 代理对象
         * @type {object}
         */
        #proxyObj = null;
        /**
         * 源对象
         * @type {object}
         */
        #srcObj = null;
        /**
         * 需要监听代理对象上的值
         * @type {Array<string | symbol>}
         */
        #keys = [];
        /**
         * 修改指定值时需要触发的钩子
         * 此值为 hookStatus 文件中 proxyMap 的 hookMap 的引用
         * @type {Map<string | symbol, Set<HookBindValue | HookBindCallback>>}
         */
        #hookMap = null;
        /**
         * 值处理函数
         * 若存在此函数则需要调用
         * @type {function(...any): any} 
         */
        #ctFunc = null;

        /**
         * @param {object} proxyObj
         * @param {object} srcObj
         * @param {Array<string | symbol>} keys
         * @param {Map<string | symbol, Set<HookBindValue | HookBindCallback>>} hookMap
         * @param {function(...any): any} ctFunc
         */
        constructor(proxyObj, srcObj, keys, hookMap, ctFunc)
        {
            this.proxyObj = proxyObj;
            this.#srcObj = srcObj;
            this.#keys = keys;
            this.#hookMap = hookMap;
            this.#ctFunc = ctFunc;
        }

        /**
         * 获取此钩子绑定的值
         */
        getValue()
        {
            return (this.#ctFunc ? this.#ctFunc(...this.#keys.map(o => this.#srcObj[o])) : this.#srcObj[this.#keys[0]]);
        }

        /**
         * 添加钩子
         * @package
         * @param {HookBindValue | HookBindCallback} hookObj
         */
        addHook(hookObj)
        {
            this.#keys.forEach(o =>
            {
                let set = this.#hookMap.get(o);
                if (set == undefined)
                {
                    set = new Set();
                    this.#hookMap.set(o, set);
                }
                set.add(hookObj);
            });
        }

        /**
         * 移除钩子
         * @package
         * @param {HookBindValue | HookBindCallback} hookObj
         */
        removeHook(hookObj)
        {
            this.#keys.forEach(o =>
            {
                let set = this.#hookMap.get(o);
                if (set)
                {
                    set.delete(hookObj);
                    if (set.size == 0)
                        this.#hookMap.delete(o);
                }
            });
        }

        /**
         * 绑定到值
         * @template {Object} T
         * @param {T} targetObj
         * @param {(keyof T) | (string & {}) | symbol} targetKey
         * @returns {HookBindValue}
         */
        bindToValue(targetObj, targetKey)
        {
            return new HookBindValue(this, targetObj, (/** @type {string | symbol} */(targetKey)));
        }

        /**
         * 绑定到回调函数
         * @param {function(any): void} callback
         * @returns {HookBindCallback}
         */
        bindToCallback(callback)
        {
            return new HookBindCallback(this, callback);
        }
    }

    /**
     * Comment节点的封装
     * 用于进行节点定位
     * @typedef {import("./NElement").NElement} NElement
     * @typedef {import("./NText").NText} NText
     */
    class NLocate
    {
        /**
         * Comment节点
         * @type {Comment}
         */
        node = null;

        /**
         * @param {Comment} [node]
         */
        constructor(node)
        {
            if (node instanceof Comment)
                this.node = node;
            else
                this.node = new Comment();
        }

        /**
         * 在此节点之前插入节点
         * @param {NElement | NLocate | NText} target
         */
        insBefore(target)
        {
            this.node.before(target.node);
        }

        /**
         * 在此节点之后插入节点
         * @param {NElement | NLocate | NText} target
         */
        insAfter(target)
        {
            this.node.after(target.node);
        }

        /**
         * 使用指定节点替换此节点
         * @param {Array<NElement | NText | NLocate>} elements
         */
        replaceWith(...elements)
        {
            this.node.replaceWith(...(elements.map(o => o.node)));
        }
    }

    /**
     * Text节点的封装
     * 用于进行节点定位
     * @typedef {import("./NElement").NElement} NElement
     * @typedef {import("./NLocate").NLocate} NLocate
     */
    class NText
    {
        /**
         * Text节点
         * @type {Text}
         */
        node = null;

        /**
         * @param {string | Text} text
         */
        constructor(text)
        {
            if (text instanceof Text)
                this.node = text;
            else
            {
                this.node = new Text();
                if (text)
                    this.setText(text);
            }
        }

        /**
         * 设置此文本节点的文本
         * @param {string} text 
         */
        setText(text)
        {
            this.node.data = text;
        }

        /**
         * 在此节点之前插入节点
         * @param {NElement | NLocate | NText} target
         */
        insBefore(target)
        {
            this.node.before(target.node);
        }

        /**
         * 在此节点之后插入节点
         * @param {NElement | NLocate | NText} target
         */
        insAfter(target)
        {
            this.node.after(target.node);
        }

        /**
         * 使用指定节点替换此节点
         * @param {Array<NElement | NText | NLocate>} elements
         */
        replaceWith(...elements)
        {
            this.node.replaceWith(...(elements.map(o => o.node)));
        }
    }

    /**
     * 流水线
     */
    class NAsse
    {
        /**
         * @type {function(import("../node/NElement").NElement): void}
         */
        callback = null;

        /**
         * @param {function(import("../node/NElement").NElement): void} callback
         */
        constructor(callback)
        {
            this.callback = callback;
        }

        /**
         * 将此特征应用于元素
         * @param {import("../node/NElement").NElement} e
         */
        apply(e)
        {
            this.callback(e);
        }
    }

    /**
     * @typedef {(keyof HTMLElement & string) | (string & {})} keyObjectOfHtmlElementAttr
     */
    /**
     * 属性
     * @template {keyObjectOfHtmlElementAttr} T
     */
    class NAttr
    {
        /**
         * @type {T}
         */
        key = null;
        /**
         * 若为函数则应用时调用
         * 若有返回值则赋值到属性
         * @type {string | number | boolean | Function}
         */
        value = null;

        /**
         * @param {T} key
         * @param {string | number | boolean | Function} value
         */
        constructor(key, value)
        {
            this.key = key;
            this.value = value;
        }

        /**
         * 将此特征应用于元素
         * @param {import("../node/NElement").NElement} e
         */
        apply(e)
        {
            if (typeof (this.value) == "function")
            {
                let cbRet = this.value(e);
                if (cbRet != undefined)
                    e.node.setAttribute(this.key, cbRet);
            }
            else
                e.node.setAttribute(this.key, this.value);
        }
    }

    /**
     * 事件
     * @template {keyof HTMLElementEventMap} T
     */
    class NEvent
    {
        /**
         * @type {T}
         */
        eventName = null;
        /**
         * @type {(event: HTMLElementEventMap[T], currentElement: import("../node/NElement").NElement) => void}
         */
        callback = null;

        /**
         * @param {T} key
         * @param {(event: HTMLElementEventMap[T], currentElement: import("../node/NElement").NElement) => void} callback
         */
        constructor(key, callback)
        {
            this.eventName = key;
            this.callback = callback;
        }

        /**
         * 将此特征应用于元素
         * @param {import("../node/NElement").NElement} element
         */
        apply(element)
        {
            element.addEventListener(this.eventName, event =>
            {
                this.callback(event, element);
            });
        }
    }

    /**
     * 快速创建 NEvent 实例
     * @type {{
     *  [x in keyof HTMLElementEventMap]?: (callback: (event: HTMLElementEventMap[x], currentElement: import("../node/NElement").NElement) => void) => NEvent<x>
     * }}
     */
    new Proxy({}, {
        get: (_target, key) =>
        {
            return (/** @type {(event: Event , currentElement: import("../node/NElement").NElement<any>) => void} */ callback) =>
            {
                // @ts-ignore
                return new NEvent(key, callback);
            };
        },
        set: () => false
    });

    /**
     * @typedef {(keyof CSSStyleDeclaration & string) | (string & {})} keyOfStyle
     */
    /**
     * 样式
     * @template {keyOfStyle} T
     */
    class NStyle
    {
        /**
         * @type {T}
         */
        key = null;
        /**
         * @type {string | HookBindInfo}
         */
        value = null;

        /**
         * @param {T} key
         * @param {string | HookBindInfo} value
         */
        constructor(key, value)
        {
            this.key = key;
            this.value = value;
        }

        /**
         * 将此特征应用于元素
         * @param {import("../node/NElement.js").NElement} e
         */
        apply(e)
        {
            e.setStyle(this.key, this.value);
        }
    }

    /**
     * 创建一组NStyle的flat NList
     * @param {{ [x in keyOfStyle]?: string | HookBindInfo }} obj
     */
    function createNStyleList(obj)
    {
        return NList.flat(Object.keys(obj).map(key => new NStyle(key, obj[key])));
    }

    /**
     * 标签名
     * 标签名使用小写字母
     * 不包含此类的特征列表默认为div
     * 一层特征列表只能有唯一tagName (或等价的)
     * @template {keyof HTMLElementTagNameMap} T
     */
    class NTagName
    {
        /**
         * @type {T}
         */
        tagName = null;

        /**
         * @param {T} tagName
         */
        constructor(tagName)
        {
            this.tagName = /** @type {T} */(tagName.toLowerCase());
        }
    }

    /**
     * 快速创建 NTagName 实例
     * @type {{
     *  [x in keyof HTMLElementTagNameMap]?: NTagName<x>
     * }}
     */
    new Proxy({}, {
        get: (_target, key) =>
        {
            // @ts-ignore
            return new NTagName(key);
        },
        set: () => false
    });

    /**
     * 特征列表
     * @typedef {Array<string | HookBindInfo | NTagName | NStyle | NAttr | NEvent | NAsse | NList | NList_list | NElement | NText | NLocate | ((e: NElement) => void)>} NList_list
     * @typedef {NList_list[number]} NList_item
     */
    class NList
    {
        /**
         * @type {NList_list}
         */
        list = null;
        /**
         * 拉平特征
         * (默认)标记为false将作为子元素节点
         * 标记为true将作为上层节点的特征列表
         * @type {boolean}
         */
        flatFlag = false;

        /**
         * @param {NList_list} list
         */
        constructor(list)
        {
            this.list = list;
        }

        /**
         * 为元素应用特征列表
         * @param {NElement<HTMLElement>} element
         */
        apply(element)
        {
            const tagName = element.getTagName();
            this.list.forEach(o =>
            {
                if (o == undefined)
                    return;
                if (typeof (o) == "string") // 内部文本
                {
                    element.addText(o);
                }
                else if (typeof (o) == "function") // 流水线函数
                {
                    o(element);
                }
                else if (typeof (o) == "object")
                {
                    switch (Object.getPrototypeOf(o)?.constructor)
                    {
                        case HookBindInfo: { // 子元素或文本
                            element.addChild(/** @type {HookBindInfo} */(o));
                            break;
                        }

                        case NTagName: { // 标签名
                            if (tagName != (/** @type {NTagName} */(o)).tagName)
                                throw "(NList) The feature tagName does not match the element";
                            break;
                        }

                        case NStyle: // 样式
                        case NAttr: // 元素属性
                        case NEvent: // 事件
                        case NAsse: { // 流水线
                            (/** @type {NStyle | NAttr | NEvent | NAsse} */(o)).apply(element);
                            break;
                        }

                        case NElement: // 子元素
                        case NLocate: // 定位节点
                        case NText: { // 子文本节点
                            element.addChild(/** @type {NElement | NLocate | NText} */(o));
                            break;
                        }

                        case NList: { // 子列表
                            const childList = (/** @type {NList} */(o));
                            if (childList.flatFlag) // 子特征(列表)
                                childList.apply(element);
                            else // 子元素(列表)
                                element.addChild(childList.getElement());
                            break;
                        }

                        case Array: { // 子元素(列表)
                            element.addChild(NList.getElement((/** @type {Array} */(o))));
                            break;
                        }

                        default:
                            throw "(NList) Untractable feature types were found";
                    }
                }
                else
                    throw "(NList) Untractable feature types were found";
            });
        }

        /**
         * 获取列表的标签名
         * @returns {string}
         */
        getTagName()
        {
            let ret = "";
            this.list.forEach(o =>
            {
                let tagName = "";
                if (o instanceof NTagName)
                    tagName = o.tagName;
                else if ((o instanceof NList) && o.flatFlag)
                    tagName = o.getTagName();
                if (tagName)
                {
                    if (!ret)
                        ret = tagName;
                    else if (ret != tagName)
                        throw "(NList) Multiple TagNames exist in a feature list";
                }
            });
            return ret;
        }

        /**
         * 获取(生成)元素
         * @returns {NElement}
         */
        getElement()
        {
            let tagName = this.getTagName();
            if (tagName == "")
                tagName = "div";
            let ele = getNElement(document.createElement(tagName));
            this.apply(ele);
            return ele;
        }

        /**
         * 生成拉平列表
         * @param {NList_list} list
         */
        static flat(list)
        {
            let ret = new NList(list);
            ret.flatFlag = true;
            return ret;
        }

        /**
         * 获取(生成)元素
         * @param {NList_list} list
         */
        static getElement(list)
        {
            return (new NList(list)).getElement();
        }
    }

    /**
     * NElement的symbol
     * 用于将NElement绑定到对应的HTMLElement
     */
    const symbolKey = Symbol("NElement");

    /**
     * dom元素的封装
     * @template {HTMLElement} ElementObjectType
     */
    class NElement
    {
        /**
         * 元素对象
         * @readonly
         * @type {ElementObjectType}
         */
        node = null;
        /**
         * 样式名 到 钩子绑定 映射
         * @private
         * @type {Map<string, HookBindValue | HookBindCallback>}
         */
        styleHooks = new Map();

        /**
         * @private
         * @param {ElementObjectType} elementObj
         */
        constructor(elementObj)
        {
            this.node = elementObj;
        }

        /**
         * @returns {ElementObjectType}
         */
        get element()
        {
            return this.node;
        }

        /**
         * 添加单个子节点
         * @param {NElement | NLocate | NText | Node | string | HookBindInfo} chi
         */
        addChild(chi)
        {
            if (
                chi instanceof NElement ||
                chi instanceof NLocate ||
                chi instanceof NText
            )
                this.node.appendChild(chi.node);
            else if (chi instanceof Node)
                this.node.appendChild(chi);
            else if (typeof (chi) == "string")
                this.addText(chi);
            else if (chi instanceof HookBindInfo)
            {
                /** @type {NElement | NText | NLocate} */
                let currentNode = null;

                let initVal = chi.getValue();
                currentNode = (initVal == null ? new NLocate() : (typeof (initVal) == "string" ? new NText(initVal) : initVal));
                this.node.appendChild(currentNode.node);

                chi.bindToCallback(val =>
                {
                    if (currentNode instanceof NText && typeof (val) == "string")
                    {
                        currentNode.setText(val);
                        return;
                    }
                    else
                    {
                        let newNode = (initVal == null ? new NLocate() : (typeof (initVal) == "string" ? new NText(initVal) : initVal));
                        currentNode.replaceWith(currentNode);
                        currentNode = newNode;
                    }
                }).bindDestroy(this);
            }
            else
                throw "(NElement) Type of child node that cannot be added";
        }

        /**
         * 添加多个子节点
         * @param {Array<Parameters<NElement["addChild"]>[0] | Array<Parameters<NElement["addChild"]>[0]>>} chi
         */
        addChilds(...chi)
        {
            chi.forEach(o =>
            {
                if (Array.isArray(o))
                    o.forEach(s => this.addChild(s));
                else if (typeof (o) == "object")
                    this.addChild(o);
            });
        }

        /**
         * 插入单个子节点(在中间)
         * 如果此节点之前在树中则先移除后加入
         * @param {NElement | NLocate | NText} chi
         * @param {number | NElement | NLocate | NText} pos 添加到的位置 负数从后到前 超过范围添加到最后
         */
        insChild(chi, pos)
        {
            let e = this.node;
            if (typeof (pos) == "number")
            {
                if (pos >= 0 || pos < e.childElementCount)
                {
                    e.insertBefore(chi.node, e.children[pos]);
                }
                else if (pos < 0 || pos >= (-e.childElementCount))
                {
                    e.insertBefore(chi.node, e.children[e.childElementCount + pos]);
                }
                else
                {
                    e.appendChild(chi.node);
                }
            }
            else
                e.insertBefore(chi.node, pos.node);
        }

        /**
         * 查找子节点在当前节点中的位置
         * 从0开始
         * 不是子节点则返回-1
         * @param {NElement} chi
         * @returns {number}
         */
        childInd(chi)
        {
            let ind = -1;
            forEach(this.node.children, (o, i) =>
            {
                if (o == chi.node)
                {
                    ind = i;
                    return true;
                }
            });
            return ind;
        }

        /**
         * 在此节点之前插入节点
         * @param {NElement | NLocate | NText} target
         */
        insBefore(target)
        {
            this.node.before(target.node);
        }

        /**
         * 在此节点之后插入节点
         * @param {NElement | NLocate | NText} target
         */
        insAfter(target)
        {
            this.node.after(target.node);
        }

        /**
         * 移除此节点
         */
        remove()
        {
            this.node.remove();
        }

        /**
         * 移除此节点的子节点
         * @param {number} [begin] 开始删除的子节点下标 缺省则为从0开始
         * @param {number} [end] 结束删除的子节点下标 不包含end 缺省则为到结尾
         */
        removeChilds(begin = 0, end = Infinity)
        {
            let e = this.node;
            if (end > e.childElementCount)
                end = e.childElementCount;
            for (let i = begin; i < end; i++)
                e.children[begin].remove();
        }

        /**
         * 获取子节点列表
         * 返回的列表不会随dom树变化
         * @returns {Array<NElement>}
         */
        getChilds()
        {
            return Array.from(this.node.children).map(o => getNElement(/** @type {HTMLElement} */(o)));
        }

        /**
         * 获取第ind个子节点
         * @param {number} ind
         * @returns {NElement}
         */
        getChild(ind)
        {
            return getNElement(/** @type {HTMLElement} */(this.node.children[ind]));
        }

        /**
         * 使用指定节点替换此节点
         * @param {Array<NElement | NText | NLocate>} elements
         */
        replaceWith(...elements)
        {
            this.node.replaceWith(...(elements.map(o => o.node)));
        }

        /**
         * 修改样式
         * @param {import("../feature/NStyle.js").keyOfStyle} styleName
         * @param {string | number | HookBindInfo} value
         */
        setStyle(styleName, value)
        {
            if (this.styleHooks.has(styleName))
            {
                this.styleHooks.get(styleName)?.destroy();
                this.styleHooks.delete(styleName);
            }

            if (value instanceof HookBindInfo)
            {
                let hookBind = value.bindToValue(this.node.style, styleName);
                this.styleHooks.set(styleName, hookBind);
                hookBind.emit();
            }
            else
                // @ts-expect-error
                this.node.style[styleName] = value;
        }

        /**
         * 获取样式
         * @param {import("../feature/NStyle.js").keyOfStyle} styleName
         * @returns {string | number}
         */
        getStyle(styleName)
        {
            if (typeof (styleName) == "string")
                return this.node.style[styleName];
        }

        /**
         * 修改多个样式
         * @param {{ [x in (import("../feature/NStyle.js").keyOfStyle)]?: string | number | HookBindInfo }} obj
         */
        setStyles(obj)
        {
            forEach(Object.keys(obj), (key) => { this.setStyle(key, obj[key]); });
        }

        /**
         * 修改文本
         * @param {string} text
         */
        setText(text)
        {
            this.node.innerText = text;
        }

        /**
         * 添加文本
         * @param {string} text
         * @returns {Text}
         */
        addText(text)
        {
            return this.node.appendChild(document.createTextNode(text));
        }

        /**
         * 设置HTMLElement属性
         * @param {string} key
         * @param {string} value
         */
        setAttr(key, value)
        {
            this.node.setAttribute(key, value);
        }

        /**
         * 设置多个HTMLElement属性
         * @param {Object<string, string>} obj
         */
        setAttrs(obj)
        {
            forEach(Object.keys(obj), (key) => { this.setAttr(key, obj[key]); });
        }

        /**
         * 设置元素可见性
         * @param {"block" | "inline" | "flex" | "none" | "inline-block" | string} s
         */
        setDisplay(s)
        {
            this.setStyle("display", s);
        }

        /**
         * 添加事件监听器
         * @template {keyof HTMLElementEventMap} K
         * @param {K} eventName
         * @param {function(HTMLElementEventMap[K]): any} callback
         * @param {boolean | AddEventListenerOptions} [options]
         */
        addEventListener(eventName, callback, options)
        {
            this.node.addEventListener(eventName, callback, options);
        }

        /**
         * 移除事件监听器
         * @param {string} eventName
         * @param {function(Event) : void} callback
         * @param {boolean | EventListenerOptions} [options]
         */
        removeEventListener(eventName, callback, options)
        {
            this.node.removeEventListener(eventName, callback, options);
        }

        /**
         * 执行动画
         * @param {Array<Keyframe> | PropertyIndexedKeyframes} keyframes
         * @param {number | KeyframeAnimationOptions} options
         * @returns {Animation}
         */
        animate(keyframes, options)
        {
            return this.node.animate(keyframes, options);
        }

        /**
         * 执行动画并提交
         * 在执行完成动画后将最后的效果提交到style
         * @param {Array<Keyframe> | PropertyIndexedKeyframes} keyframes
         * @param {number | KeyframeAnimationOptions} options
         * @returns {Promise<void>} 动画执行完后返回
         */
        async animateCommit(keyframes, options)
        {
            if (typeof (options) == "number")
                options = {
                    duration: options,
                    fill: "forwards"
                };
            else
                options = Object.assign({ fill: "forwards" }, options);
            if (options.fill != "forwards" && options.fill != "both")
                throw "(NElelemt) animateCommit can only be used when fill forwards or both";
            let animate = this.node.animate(keyframes, options);
            await animate.finished;

            let errorObject = null;
            try
            {
                animate.commitStyles();
            }
            catch (err)
            {
                errorObject = err;
            }
            animate.cancel();
            if (errorObject != null)
            {
                console.error(errorObject);
            }
        }

        /**
         * 流水线
         * @param {function(NElement): void} asseFunc 流水线函数(无视返回值)
         * @returns {NElement} 返回本身
         */
        asse(asseFunc)
        {
            asseFunc(this);
            return this;
        }

        /**
         * 获取标签名
         * 标签名使用小写字母
         * @returns {keyof HTMLElementTagNameMap}
         */
        getTagName()
        {
            return (/** @type {keyof HTMLElementTagNameMap} */(this.node.tagName.toLowerCase()));
        }

        /**
         * 应用NList到元素
         * @param {NList | ConstructorParameters<typeof NList>[0]} list
         * @returns {NElement} 返回被操作的NElement
         */
        applyNList(list)
        {
            let nList = (list instanceof NList ? list : NList.flat(list));
            nList.apply(this);
            return this;
        }

        /**
         * 根据HTMLElement对象获取NElement对象
         * @template {HTMLElement} ElementObjectType
         * @param {ElementObjectType} element
         * @returns {NElement<ElementObjectType>}
         */
        static byElement(element)
        {
            if (element[symbolKey])
                return element[symbolKey];
            else if (element instanceof NElement)
                return element;
            else
                return element[symbolKey] = new NElement(element);
        }
    }


    /**
     * 根据HTMLElement对象获取NElement对象
     * @template {HTMLElement} ElementObjectType
     * @param {ElementObjectType} element
     * @returns {NElement<ElementObjectType>}
     */
    function getNElement(element)
    {
        return NElement.byElement(element);
    }

    /**
     * 键盘对应表
     */
    let keyNameTable = new Map([
        ["~", "`"],
        ["!", "1"],
        ["@", "2"],
        ["#", "3"],
        ["$", "4"],
        ["%", "5"],
        ["^", "6"],
        ["&", "7"],
        ["*", "8"],
        ["(", "9"],
        [")", "0"],
        ["_", "-"],
        ["+", "="],
        ["{", "["],
        ["}", "]"],
        ["|", "\\"],
        ["\"", "\'"],
        [":", ";"],
        ["<", ","],
        [">", "."],
        ["?", "/"]
    ]);
    const capitalA = "A".charCodeAt(0);
    const lowercaseA = "a".charCodeAt(0);
    for (let i = 0; i < 26; i++)
        keyNameTable.set(String.fromCharCode(capitalA + i), String.fromCharCode(lowercaseA + i));

    /**
     * 代理对象 到 钩子映射和源对象 映射
     * 
     * @type {WeakMap<object, {
     *  hookMap: Map<string | symbol, Set<import("./HookBindValue").HookBindValue | import("./HookBindCallback").HookBindCallback>>,
     *  srcObj: object
     * }>}
     */
    const proxyMap = new WeakMap();

    /**
     * 创建对象的代理
     * @template {object} T
     * @param {T} srcObj
     * @returns {T}
     */
    function createHookObj(srcObj)
    {
        if (proxyMap.has(srcObj)) // 已经是代理对象
            throw "Unable to create a proxy for a proxy object";
        /**
         * 修改指定值时需要触发的钩子
         * @type {Map<string | symbol, Set<HookBindValue | HookBindCallback>>}
         */
        const hookMap = new Map();
        const proxyObj = (new Proxy((/** @type {object} */(srcObj)), {
            get: (target, key) => // 取值
            {
                return Reflect.get(target, key);
            },

            set: (target, key, newValue) => // 设置值
            {
                let ret = Reflect.set(target, key, newValue);
                if (ret)
                {
                    let hookSet = hookMap.get(key);
                    if (hookSet) // 若此key上存在钩子集合
                    {
                        hookSet.forEach(o =>
                        {
                            o.emit(); // 触发每个钩子
                        });
                    }
                }
                return ret;
            },

            // TODO 应当当作设置为undefined 并创建专用方法解除绑定钩子
            deleteProperty: (target, key) => // 删除值
            {
                let ret = Reflect.deleteProperty(target, key);
                if (ret)
                {
                    let hookSet = hookMap.get(key);
                    if (hookSet) // 若此key上存在钩子集合
                    {
                        hookSet.forEach(o =>
                        {
                            o.destroy(); // 销毁每个钩子
                        });
                        hookMap.delete(key); // 移除此key上的钩子集合
                    }
                }
                return ret;
            }
        }));
        proxyMap.set(proxyObj, { hookMap, srcObj });
        return proxyObj;
    }

    /**
     * 获取代理对象中指定值的绑定信息
     * @template {Object} T
     * @param {T} proxyObj
     * @param {[(keyof T) | (string & {}) | symbol] | [((keyof T) | (string & {}) | symbol), ...Array<(keyof T) | (string & {}) | symbol>, function(...any): any]} keys
     * @returns {HookBindInfo}
     */
    function bindValue(proxyObj, ...keys)
    {
        const ctFunc = (/** @type {function(...any): any} */(keys.length >= 2 ? keys.pop() : null));
        const proxyMata = proxyMap.get(proxyObj);
        if (proxyMata == undefined)
            throw "bindValue: Values can only be bound from proxy objects";
        return new HookBindInfo(proxyObj, proxyMata.srcObj, (/** @type {Array<string | symbol>}*/(keys)), proxyMata.hookMap, ctFunc);
    }

    /**
     * 异步延迟
     * 将创建一个Promise并在指定延迟时间后解决
     * @param {number} time 单位:毫秒
     * @returns {Promise<void>}
     */
    function delayPromise(time)
    {
        return (new Promise((resolve) =>
        {
            setTimeout(() =>
            {
                resolve();
            }, time);
        }));
    }

    /**
     * 事件处理器
     * 可以定多个事件响应函数
     * @template {*} T
     */
    class EventHandler
    {
        /**
         * 回调列表
         * @type {Array<function(T): void>}
         */
        cbList = [];
        /**
         * 单次回调列表
         * @type {Array<function(T): void>}
         */
        onceCbList = [];
        /**
         * 单次触发Promise复用
         * @type {Promise<T>}
         */
        #oncePromiseReuse = null;

        /**
         * 添加响应函数
         * @param {function(T): void} cb
         */
        add(cb)
        {
            this.cbList.push(cb);
        }

        /**
         * 添加单次响应函数
         * 触发一次事件后将不再响应
         * @param {function(T): void} cb
         */
        addOnce(cb)
        {
            this.onceCbList.push(cb);
        }

        /**
         * 返回一个Primise
         * 下次响应时此primise将解决
         * @returns {Promise<T>}
         */
        oncePromise()
        {
            if (!this.#oncePromiseReuse)
            {
                this.#oncePromiseReuse = new Promise(resolve =>
                {
                    this.addOnce(e => {
                        this.#oncePromiseReuse = null;
                        resolve(e);
                    });
                });
            }
            return this.#oncePromiseReuse;
        }

        /**
         * 移除响应函数
         * @param {function(T): void} cb
         */
        remove(cb)
        {
            let ind = this.cbList.indexOf(cb);
            if (ind > -1)
            {
                this.cbList.splice(ind, 1);
            }
            else
            {
                ind = this.onceCbList.indexOf(cb);
                if (ind > -1)
                {
                    this.onceCbList.splice(ind, 1);
                }
            }
        }

        /**
         * 移除所有响应函数
         */
        removeAll()
        {
            this.cbList = [];
            this.onceCbList = [];
        }

        /**
         * 触发事件
         * @param {T} e
         */
        trigger(e)
        {
            this.cbList.forEach(async (o) => { o(e); });
            this.onceCbList.forEach(async (o) => { o(e); });
            this.onceCbList = [];
        }

        /**
         * 存在监听器
         * @returns {boolean}
         */
        existListener()
        {
            return (this.cbList.length > 0 || this.onceCbList.length > 0);
        }
    }

    /**
     * 36的8次方
     */
    const num_36_pow_8 = 2821109907456;

    /**
     * 生成唯一字符串(qwq-uid)
     * 基于毫秒级时间和随机数
     * 
     * qwq-uid格式
     * 仅由 小写字母 数字 连字符 组成
     * 不以连字符开头或结尾
     * 不存在两个相邻的连字符
     * 即由零或几个连字符分隔的多个字母和数字子串
     * 第一个子串为36进制的毫秒级时间戳
     * 其后的子串为36进制的随机数
     * 
     * 优先安全随机
     * 当安全随机不可用时回退到普通随机(不保证安全性)
     * 
     * @param {number} [randomSection] 随机节数量
     * @returns {string}
     */
    function uniqueIdentifierString$1(randomSection = 2)
    {
        var ret = Math.floor(Date.now()).toString(36);
        if (globalThis?.crypto?.getRandomValues)
        {
            let randomBuffer = crypto.getRandomValues(new Uint8Array(randomSection * 6));
            for (let i = 0; i < randomSection; i++)
            {
                let value = 0;
                for (let j = 0; j < 6; j++)
                    value = (value + randomBuffer[(i * 6) + j]) / 256;
                ret += "-" + Math.floor(Math.random() * num_36_pow_8).toString(36);
            }
        }
        else
        {
            for (let i = 0; i < randomSection; i++)
                ret += "-" + Math.floor(Math.random() * num_36_pow_8).toString(36);
        }
        return ret;
    }

    /**
     * 状态
     */
    class State
    {
        /**
         * 类映射
         * 类名字符串标识 到 类(构造函数)
         * @package
         * @type {Map<string, object>}
         */
        nameToClass = new Map();

        /**
         * 类映射
         * 类(构造函数) 到 类名字符串标识
         * @package
         * @type {Map<object, string>}
         */
        classToName = new Map();

        /**
         * 安全函数映射
         * 安全函数字符串标识 到 函数
         * @package
         * @type {Map<string, function>}
         */
        nameToSafetyFunction = new Map();

        /**
         * 安全函数映射
         * 函数 到 安全函数字符串标识
         * @package
         * @type {Map<function, string>}
         */
        safetyFunctionToName = new Map();

        /**
         * 命名的symbol映射
         * 命名的symbol字符串标识 到 函数
         * @package
         * @type {Map<string, symbol>}
         */
        nameToNamedSymbol = new Map();

        /**
         * 命名的symbol映射
         * 函数 到 命名的symbol字符串标识
         * @package
         * @type {Map<symbol, string>}
         */
        namedSymbolToName = new Map();
    }

    /**
     * 自定义序列化函数
     */
    const serializationFunctionSymbol = Symbol("serialization function");
    /**
     * 自定义反序列化函数
     */
    const deserializationFunctionSymbol = Symbol("deserialization function");

    const textEncoder = new TextEncoder();

    /**
     * JSOBin编码器
     */
    class Encoder
    {
        /**
         * @type {State}
         */
        #state = null;

        /**
         * 缓冲区
         * @type {Uint8Array}
         */
        #buffer = new Uint8Array(128);
        /**
         * 缓冲区结束索引
         * 不包括该值
         * @type {number}
         */
        #endInd = 0;

        /**
         * 引用索引计数
         * @type {number}
         */
        #referenceIndCount = -1;
        /**
         * 引用的值 到 引用索引 映射
         * @type {Map<any, number>}
         */
        #referenceIndMap = new Map();
        /**
         * 允许引用字符串
         * 开启时对于有相同字符串的内容将降低大小
         * @type {boolean}
         */
        #enableReferenceString = false;


        /**
         * @param {State} state
         * @param {boolean} enableReferenceString
         */
        constructor(state, enableReferenceString)
        {
            this.#state = state;
            this.#enableReferenceString = enableReferenceString;
        }

        /**
         * 向缓冲区加入单个值
         * @param {number} c
         */
        push(c)
        {
            if (this.#endInd >= this.#buffer.length)
            {
                let old = this.#buffer;
                this.#buffer = new Uint8Array(this.#buffer.length * 2);
                this.#buffer.set(old);
            }
            this.#buffer[this.#endInd++] = c;
        }

        /**
         * 向缓冲区加入数组
         * @param {Uint8Array} a 
         */
        pushArr(a)
        {
            if (this.#endInd + a.length > this.#buffer.length)
            {
                let old = this.#buffer;
                let newLen = old.length * 2;
                while (this.#endInd + a.length > newLen)
                    newLen *= 2;
                this.#buffer = new Uint8Array(newLen);
                this.#buffer.set(old);
            }
            this.#buffer.set(a, this.#endInd);
            this.#endInd += a.length;
        }

        /**
         * 序列化一个vint
         * @param {number} num
         */
        pushVint(num)
        {
            while (true)
            {
                let c = (num & ((1 << 7) - 1));
                num >>>= 7;
                if (!num)
                {
                    this.push(c | (1 << 7));
                    return;
                }
                this.push(c);
            }
        }

        /**
         * 写入字符串
         * @param {string} str
         */
        pushStr(str)
        {
            let strBin = textEncoder.encode(str);
            this.pushVint(strBin.byteLength);
            this.pushArr(strBin);
        }

        /**
         * 遍历编码
         * @param {object | number | string} now
         */
        traversal(now)
        {
            ++this.#referenceIndCount;
            if (!this.#referenceIndMap.has(now))
                this.#referenceIndMap.set(now, this.#referenceIndCount);
            switch (typeof (now))
            {
                case "number": { // 数值型(整数或小数)
                    if (Number.isInteger(now) && now >= -2147483648 && now <= 2147483647 && !Object.is(now, -0)) // 32位整数
                    {
                        this.push(1);
                        this.pushVint(now);
                    }
                    else // 浮点数
                    {
                        this.push(2);
                        this.pushArr(new Uint8Array(new Float64Array([now]).buffer));
                    }
                    break;
                }

                case "string": { // 字符串
                    let refInd = 0;
                    if (
                        this.#enableReferenceString &&
                        now.length >= 2 &&
                        this.#referenceIndCount > (refInd = this.#referenceIndMap.get(now))
                    ) // 引用字符串
                    {
                        this.push(14);
                        this.pushVint(refInd);
                    }
                    else
                    {
                        this.push(3);
                        this.pushStr(now);
                    }
                    break;
                }

                case "object": { // 对象 数组 类 null
                    if (now == null) // null
                        this.push(11);
                    else if (this.#referenceIndMap.get(now) < this.#referenceIndCount) // 需要引用的对象
                    {
                        this.push(14);
                        this.pushVint(this.#referenceIndMap.get(now));
                    }
                    else if (Array.isArray(now)) // 数组
                    {
                        this.push(5);
                        now.forEach(o =>
                        {
                            this.traversal(o);
                        });
                        this.push(0);
                    }
                    else if (this.#state.classToName.has(Object.getPrototypeOf(now)?.constructor)) // 类(自定义类)
                    {
                        this.push(6);
                        this.pushStr(this.#state.classToName.get(Object.getPrototypeOf(now)?.constructor));
                        let obj = now[serializationFunctionSymbol] ? now[serializationFunctionSymbol].call(now) : now; // 处理自定义序列化函数
                        let keys = Object.getOwnPropertyNames(obj);
                        this.pushVint(keys.length);
                        keys.forEach(key =>
                        {
                            this.pushStr(key);
                            this.traversal(obj[key]);
                        });
                    }
                    else if (builtInClassConstructorMap.has(Object.getPrototypeOf(now)?.constructor)) // js内置类
                    {
                        this.push(15);
                        let classInfo = builtInClassConstructorMap.get(Object.getPrototypeOf(now)?.constructor);
                        this.pushVint(classInfo.typeId);
                        classInfo.encode(this, now);
                    }
                    else // 对象
                    {
                        this.push(4);
                        let keys = Object.keys(now);
                        this.pushVint(keys.length);
                        keys.forEach(key =>
                        {
                            this.pushStr(key);
                            this.traversal(now[key]);
                        });
                    }
                    break;
                }

                case "undefined": { // 未定义(undefined)
                    this.push(7);
                    break;
                }

                case "boolean": { // 布尔值
                    this.push(now ? 9 : 8);
                    break;
                }

                case "bigint": { // bigint类型
                    /** @type {Uint8Array} */
                    let bigintBuf = null;
                    if (now >= 0n) // bigint正数和0
                    {
                        this.push(12);
                        if (now == 0n) // bigint 0
                            bigintBuf = new Uint8Array(0);
                        else // bigint 正数
                            bigintBuf = Encoder.writeBigint(now);
                    }
                    else // bigint负数
                    {
                        this.push(13);
                        bigintBuf = Encoder.writeBigint(-(/** @type {bigint} */(now)));
                    }
                    this.pushVint(bigintBuf.byteLength);
                    this.pushArr(bigintBuf);
                    break;
                }

                case "symbol": { // symbol类型
                    if (this.#referenceIndMap.get(now) < this.#referenceIndCount) // 需要引用的symbol
                    {
                        this.push(14);
                        this.pushVint(this.#referenceIndMap.get(now));
                    }
                    else if (this.#state.namedSymbolToName.has(now)) // 命名的symbol
                    {
                        this.push(18);
                        this.pushStr(this.#state.namedSymbolToName.get(now));
                    }
                    else // 新的symbol
                    {
                        this.push(10);
                        this.pushStr(now.description ? now.description : "");
                    }
                    break;
                }

                case "function": { // 函数
                    if (this.#state.safetyFunctionToName.has(now)) // 安全函数
                    {
                        this.push(17);
                        this.pushStr(this.#state.safetyFunctionToName.get(now));
                    }
                    else
                        this.push(7); // 目前不处理其他函数
                    break;
                }

                default:
                    throw "JSObin(encode): The type of value that cannot be processed.";
            }
        }

        /**
         * 获取最终缓冲区
         * @returns {Uint8Array}
         */
        getFinalBuffer()
        {
            return this.#buffer.slice(0, this.#endInd);
        }

        /**
         * 编码
         * @param {object | number | string} obj
         */
        encode(obj)
        {
            this.traversal(obj);
            return this.getFinalBuffer();
        }

        /**
         * 序列化一个bigint
         * @param {bigint} num 一个正数
         * @returns {Uint8Array}
         */
        static writeBigint(num)
        {
            let buf = [];
            while (true)
            {
                buf.push(Number(num & 255n));
                num >>= 8n;
                if (num == 0n)
                    return new Uint8Array(buf);
            }
        }
    }

    /**
     * js内置类映射
     * 内置类构造函数 到 内置类id和编码处理函数
     * @type {Map<Function, {
     *  typeId: number,
     *  encode: (encoder: Encoder, obj: Object) => void
     * }>}
     */
    const builtInClassConstructorMap = new Map();
    /**
     * js内置类映射
     * 内置类id 到 解码处理函数
     * 解码处理函数需要处理引用索引数组
     * @type {Map<number, (decoder: Decoder) => any>}
     */
    const builtInClassTypeIdMap = new Map();

    ([
        {
            constructor: Map,
            typeId: 1,
            encode: (/** @type {Encoder} */ encoder, /** @type {Map} */ obj) =>
            {
                encoder.pushVint(obj.size);
                obj.forEach((value, key) =>
                {
                    encoder.traversal(key);
                    encoder.traversal(value);
                });
            },
            decode: (/** @type {Decoder} */decoder) =>
            {
                let ret = new Map();
                let childCount = decoder.getVInt();
                if (childCount < 0)
                    throw "JSOBin Decode: Wrong format";
                decoder.referenceIndList.push(ret);
                for (let i = 0; i < childCount; i++)
                {
                    let key = decoder.traversal();
                    ret.set(key, decoder.traversal());
                }
                return ret;
            }
        },
        {
            constructor: Set,
            typeId: 2,
            encode: (/** @type {Encoder} */ encoder, /** @type {Set} */ obj) =>
            {
                obj.forEach(o =>
                {
                    encoder.traversal(o);
                });
                encoder.push(0);
            },
            decode: (/** @type {Decoder} */decoder) =>
            {
                let ret = new Set();
                decoder.referenceIndList.push(ret);
                while (decoder.peekByte() != 0)
                    ret.add(decoder.traversal());
                decoder.index++;
                return ret;
            }
        },
        {
            constructor: ArrayBuffer,
            typeId: 20,
            encode: (/** @type {Encoder} */ encoder, /** @type {ArrayBuffer} */ obj) =>
            {
                encoder.pushVint(obj.byteLength);
                encoder.pushArr(new Uint8Array(obj));
            },
            decode: (/** @type {Decoder} */decoder) =>
            {
                let length = decoder.getVInt();
                let ret = decoder.getArr(length).buffer;
                decoder.referenceIndList.push(ret);
                return ret;
            }
        },
    ]).forEach(o =>
    {
        builtInClassConstructorMap.set(o.constructor, {
            typeId: o.typeId,
            encode: o.encode
        });
        builtInClassTypeIdMap.set(o.typeId, o.decode);
    });

    ([
        {
            constructor: Int8Array,
            typeId: 10,
            byteFactor: 1
        },
        {
            constructor: Uint8Array,
            typeId: 11,
            byteFactor: 1
        },
        {
            constructor: Int16Array,
            typeId: 12,
            byteFactor: 2
        },
        {
            constructor: Uint16Array,
            typeId: 13,
            byteFactor: 2
        },
        {
            constructor: Int32Array,
            typeId: 14,
            byteFactor: 4
        },
        {
            constructor: Uint32Array,
            typeId: 15,
            byteFactor: 4
        },
        {
            constructor: BigInt64Array,
            typeId: 16,
            byteFactor: 8
        },
        {
            constructor: BigUint64Array,
            typeId: 17,
            byteFactor: 8
        },
        {
            constructor: Float32Array,
            typeId: 18,
            byteFactor: 4
        },
        {
            constructor: Float64Array,
            typeId: 19,
            byteFactor: 8
        }
    ]).forEach(o =>
    {
        builtInClassConstructorMap.set(o.constructor, {
            typeId: o.typeId,
            encode: (encoder, /** @type {InstanceType<typeof o.constructor>} */obj) =>
            {
                let buffer = obj.buffer;
                let byteOffset = obj.byteOffset;
                let length = obj.length;
                encoder.pushVint(byteOffset);
                encoder.pushVint(length);
                encoder.traversal(buffer);
            }
        });
        builtInClassTypeIdMap.set(o.typeId, decode =>
        {
            let refInd = decode.referenceIndList.length;
            decode.referenceIndList.push(null);

            let byteOffset = decode.getVInt();
            let length = decode.getVInt();
            if (length < 0 || byteOffset < 0)
                throw "JSOBin Decode: Wrong format";
            let buffer = decode.traversal();
            if (!(buffer instanceof ArrayBuffer) || byteOffset + o.byteFactor * length > buffer.byteLength)
                throw "JSOBin Decode: Wrong format";

            let ret = new o.constructor(buffer, byteOffset, length);
            decode.referenceIndList[refInd] = ret;
            return ret;
        });
    });

    const textDecoder = new TextDecoder("utf-8");

    /**
     * JSOBin解码器
     */
    class Decoder
    {
        /**
         * @type {State}
         */
        #state = null;

        /**
         * 缓冲区
         * @type {Uint8Array}
         */
        buffer = null;
        /**
         * 缓冲区对应的DataView
         * @type {DataView}
         */
        dataView = null;
        /**
         * 当前读取到的位置
         */
        index = 0;

        /**
         * 引用列表
         * 用于记录引用索引对应的内容
         * @type {Array}
         */
        referenceIndList = [];

        /**
         * @param {State} state
         * @param {Uint8Array} buffer
         */
        constructor(state, buffer)
        {
            this.#state = state;
            this.buffer = buffer;
            this.dataView = new DataView(buffer.buffer);
        }

        /**
         * 获取当前位置的byte
         * @returns {number}
         */
        peekByte()
        {
            if (this.index >= this.buffer.length)
                throw "JSOBin Decode: Wrong format";
            return this.buffer[this.index];
        }

        /**
         * 弹出当前位置的byte
         * 将移动索引位置
         * @returns {number}
         */
        popByte()
        {
            if (this.index >= this.buffer.length)
                throw "JSOBin Decode: Wrong format";
            return this.buffer[this.index++];
        }

        /**
         * 获取缓冲区中的一段
         * @param {number} len 
         * @returns {Uint8Array}
         */
        getArr(len)
        {
            if (len < 0 || this.index + len > this.buffer.length)
                throw "JSOBin Decode: Wrong format";
            let slice = this.buffer.slice(this.index, this.index + len);
            this.index += len;
            return slice;
        }

        /**
         * 读一个vint
         * @returns {number}
         */
        getVInt()
        {
            let ret = 0;
            let bitPointer = 0;
            while (!(this.peekByte() & (1 << 7)))
            {
                ret |= this.popByte() << bitPointer;
                bitPointer += 7;
                if (bitPointer > 32) // (bitPointer > 28)
                    throw "JSOBin Decode: Unexpected vint length";
            }
            ret |= (this.popByte() & ((1 << 7) - 1)) << bitPointer;
            return ret;
        }

        /**
        * 获取一个字符串(带有表示长度的vint)
        * @returns {string}
        */
        getStr()
        {
            let len = this.getVInt();
            if (len < 0 || this.index + len > this.buffer.length)
                throw "JSOBin Decode: Wrong format";
            let str = textDecoder.decode(this.buffer.subarray(this.index, this.index + len));
            this.index += len;
            return str;
        }

        /**
         * 遍历解码
         * @returns {any}
         */
        traversal()
        {
            if (this.index >= this.buffer.length)
                throw "JSOBin Decode: Wrong format";
            let typeId = this.popByte();
            switch (typeId)
            {
                case 1: { // 变长型整数
                    let num = this.getVInt();
                    this.referenceIndList.push(num);
                    return num;
                }

                case 2: { // 浮点数
                    let num = this.dataView.getFloat64(this.index, true);
                    this.referenceIndList.push(num);
                    this.index += 8;
                    return num;
                }

                case 3: { // 字符串
                    let str = this.getStr();
                    this.referenceIndList.push(str);
                    return str;
                }

                case 4: { // 对象
                    let ret = {};
                    let childCount = this.getVInt();
                    if (childCount < 0)
                        throw "JSOBin Decode: Wrong format";
                    this.referenceIndList.push(ret);
                    for (let i = 0; i < childCount; i++)
                    {
                        let key = this.getStr();
                        let value = this.traversal();
                        Object.defineProperty(
                            ret,
                            key,
                            {
                                value: value,
                                writable: true,
                                configurable: true,
                                enumerable: true
                            }
                        );
                    }
                    return ret;
                }

                case 5: { // 数组
                    let ret = [];
                    this.referenceIndList.push(ret);
                    while (this.peekByte())
                        ret.push(this.traversal());
                    this.index++;
                    return ret;
                }

                case 6: { // 类
                    let className = this.getStr();
                    let classConstructor = this.#state.nameToClass.get(className);
                    if (classConstructor == undefined)
                        throw `JSOBin Decode: (class) "${className}" is unregistered class in the current context in the parsing jsobin`;
                    if (classConstructor?.[deserializationFunctionSymbol]) // 存在自定义反序列化函数
                    {
                        let dataObj = {};
                        let childCount = this.getVInt();
                        if (childCount < 0)
                            throw "JSOBin Decode: Wrong format";
                        let refInd = this.referenceIndList.length;
                        this.referenceIndList.push(dataObj);
                        for (let i = 0; i < childCount; i++)
                        {
                            let key = this.getStr();
                            let value = this.traversal();
                            Object.defineProperty(
                                dataObj,
                                key,
                                {
                                    value: value,
                                    writable: true,
                                    configurable: true,
                                    enumerable: true
                                }
                            );
                        }
                        let ret = classConstructor[deserializationFunctionSymbol](dataObj);
                        this.referenceIndList[refInd] = ret;
                        return ret;
                    }
                    else // 自定义类默认序列化方案
                    {
                        let ret = Object.create(classConstructor.prototype);
                        let childCount = this.getVInt();
                        if (childCount < 0)
                            throw "JSOBin Decode: Wrong format";
                        this.referenceIndList.push(ret);
                        for (let i = 0; i < childCount; i++)
                        {
                            let key = this.getStr();
                            let value = this.traversal();
                            Object.defineProperty(
                                ret,
                                key,
                                {
                                    value: value,
                                    writable: true,
                                    configurable: true,
                                    enumerable: true
                                }
                            );
                        }
                        return ret;
                    }
                }

                case 7: { // 未定义(undefined)
                    this.referenceIndList.push(undefined);
                    return undefined;
                }

                case 8: { // 布尔值假
                    this.referenceIndList.push(false);
                    return false;
                }

                case 9: { // 布尔值真
                    this.referenceIndList.push(true);
                    return true;
                }

                case 10: { // symbol类型
                    let symbol = Symbol(this.getStr());
                    this.referenceIndList.push(symbol);
                    return symbol;
                }

                case 11: { // 无效对象(null)
                    this.referenceIndList.push(null);
                    return null;
                }

                case 12: { // bigint类型(正数)
                    let len = this.getVInt();
                    let num = this.readBigInt(len);
                    this.referenceIndList.push(num);
                    return num;
                }

                case 13: { // bigint类型(负数)
                    let len = this.getVInt();
                    let num = this.readBigInt(len);
                    this.referenceIndList.push(num);
                    return -num;
                }

                case 14: { // 引用
                    let referenceInd = this.getVInt();
                    if (referenceInd < 0 || referenceInd >= this.referenceIndList.length)
                        throw "JSOBin Decode: Wrong format";
                    let ret = this.referenceIndList[referenceInd];
                    this.referenceIndList.push(ret);
                    return ret;
                }

                case 15: { // js内置类
                    let builtInClassId = this.getVInt();
                    let decodeFunction = builtInClassTypeIdMap.get(builtInClassId);
                    if (decodeFunction)
                        return decodeFunction(this);
                    else
                        throw "JSOBin Decode: Unsupported js built-in class type.";
                }

                case 16: { // 函数 目前不支持
                    throw "JSOBin Decode: Function is not supported in the current version";
                }

                case 17: { // 安全函数
                    let func = this.#state.nameToSafetyFunction.get(this.getStr());
                    if (!func)
                        throw "JSOBin Decode: A non-existent security function was used";
                    this.referenceIndList.push(func);
                    return func;
                }

                case 18: { // 命名的symbol
                    let symbol = this.#state.nameToNamedSymbol.get(this.getStr());
                    if (!symbol)
                        throw "JSOBin Decode: A non-existent named symbol was used";
                    this.referenceIndList.push(symbol);
                    return symbol;
                }

                default:
                    throw "JSOBin Decode: Wrong format";
            }
        }

        /**
         * 解码
         * @returns {object | number | string}
         */
        decode()
        {
            return this.traversal();
        }

        /**
         * 反序列化一个Bigint
         * @param {number} len
         * @returns {bigint} 正数bigint 或 负数bigint的相反数
         */
        readBigInt(len)
        {
            if (len < 0)
                throw "JSOBin Decode: Wrong format";
            let ret = 0n;
            let endPtr = this.index + len - 1;
            if (this.index >= this.buffer.length)
                throw "JSOBin Decode: Wrong format";
            for (let ptr = endPtr; ptr >= this.index; ptr--)
            {
                ret <<= 8n;
                ret += BigInt(this.buffer[ptr]);
            }
            this.index += len;
            return ret;
        }
    }

    /**
     * JSOBin操作上下文
     */
    class JSOBin
    {
        /**
         * @type {State}
         */
        #state = new State();

        /**
         * 添加类到上下文
         * 注册标识符和类(构造器)的相互映射
         * @param {string} identifier 类标识符
         * @param {function} classConstructor 类的构造器
         */
        addClass(identifier, classConstructor)
        {
            this.#state.nameToClass.set(identifier, classConstructor);
            this.#state.classToName.set(classConstructor, identifier);
        }

        /**
         * 添加安全函数到上下文
         * 允许确保安全的函数注册标识符和函数的相互映射
         * @param {string} identifier 安全函数标识符
         * @param {function} safetyFunction 函数
         */
        addSafetyFunction(identifier, safetyFunction)
        {
            this.#state.nameToSafetyFunction.set(identifier, safetyFunction);
            this.#state.safetyFunctionToName.set(safetyFunction, identifier);
        }

        /**
         * 添加命名的symbol
         * 允许确保通过此symbol的标识符和symbol的相互映射
         * @param {string} identifier symbol的名称(标识符)
         * @param {symbol} namedSymbol
         */
        addNamedSymbol(identifier, namedSymbol)
        {
            this.#state.nameToNamedSymbol.set(identifier, namedSymbol);
            this.#state.namedSymbolToName.set(namedSymbol, identifier);
        }

        /**
         * 编码
         * @param {object | number | string} obj
         * @param {{
         *  referenceString?: boolean
         * }} [config]
         * @returns {Uint8Array}
         */
        encode(obj, config = {})
        {
            config = Object.assign({
                referenceString: false
            }, config);
            return (new Encoder(this.#state, config.referenceString)).encode(obj);
        }

        /**
         * 解码
         * @param {Uint8Array} bin
         * @returns {object | number | string}
         */
        decode(bin)
        {
            return (new Decoder(this.#state, bin)).decode();
        }
    }

    /**
     * 传入上下文的函数 被目标暂时holding时 用于储存信息的类
     * 这些对象随时准备被目标调用
     * 
     * 传入上下文的函数 包括 调用目标的函数时传入的函数 被目标调用函数时返回的函数
     * 随目标对函数的释放 同时释放此对象
     */
    class TmpFunctionInfo
    {
        /**
         * 单次调用
         * 表示此函数被调用后就会释放
         * 通常用于resolve和reject
         */
        once = false;

        /**
         * 调用后释放目标对象
         * 通常用于一对resolve与reject相互释放
         * 调用本函数后释放此id的函数 但本函数释放时不会自动释放此函数
         */
        releaseTarget = "";

        /**
         * 转入的函数本身
         * @type {function}
         */
        func = null;

        /**
         * @param {Function} func
         * @param {boolean} once
         * @param {string} releaseTarget
         */
        constructor(func, once, releaseTarget)
        {
            this.func = func;
            this.once = once;
            this.releaseTarget = releaseTarget;
        }
    }

    /**
     * base64字符串转Uint8Array
     * @param {string} base64String
     * @returns {Uint8Array}
     */
    function base64ToUint8Array(base64String)
    {
        let binStr = atob(base64String);
        let length = binStr.length;
        let ret = new Uint8Array(length);
        for (let i = 0; i < length; i++)
            ret[i] = binStr.charCodeAt(i);
        return ret;
    }

    /**
     * Uint8Array转base64字符串
     * @param {Uint8Array} uint8Array
     * @returns {string}
     */
    function uint8ArrayToBase64(uint8Array)
    {
        let length = uint8Array.length;
        let binStr = "";
        for (let i = 0; i < length; i++)
            binStr = binStr + String.fromCharCode(uint8Array[i]);
        let ret = btoa(binStr);
        return ret;
    }

    /**
     * 生成唯一字符串
     * 基于毫秒级时间和随机数
     * 不保证安全性
     * @param {number} [randomSection] 随机节数量
     * @returns {string}
     */
    function uniqueIdentifierString(randomSection = 2)
    {
        var ret = Math.floor(Date.now()).toString(36);
        for (let i = 0; i < randomSection; i++)
            ret += "-" + Math.floor(Math.random() * 1e12).toString(36);
        return ret;
    }

    let jsobContext = new JSOBin();

    /**
     * rco操作上下文
     */
    class RcoContext
    {
        /**
         * 全局命名函数
         * @type {Map<string, function>}
         */
        #globalNamedFunctionMap = new Map();

        /**
         * 运行中传递的函数
         * (对方持有的本地的函数)
         * @type {Map<string, TmpFunctionInfo>}
         */
        #idFunctionMap = new Map();

        /**
         * 持有的对方的函数
         * @type {Map<string, WeakRef<function>>}
         */
        #holdingFunctionMap = new Map();

        /**
         * 输出流
         * @param {string | Uint8Array | object} data
         * @returns {void}
         */
        #outStream = (data) => { throw "RcoCcontext: not bound to an output stream"; };

        /**
         * 输出流类型
         * 0 raw Object
         * 1 jsobin Uint8array
         * 2 base64(jsobin) string
         * @type {0 | 1 | 2}
         */
        #outStreamType = 1;

        /**
         * 回收持有的目标的函数
         * 当不再持有时通知目标进行释放
         * @type {FinalizationRegistry<string>}
         */
        #holdingFunctionRegistry = null;

        constructor()
        {
            this.#holdingFunctionRegistry = new FinalizationRegistry((id) =>
            {
                this.#holdingFunctionMap.delete(id);
                this.#outputPacket([ // 通知目标释放函数
                    2,
                    id
                ]);
            });
        }

        /**
         * 输出数据包
         * @param {Object} data
         */
        #outputPacket(data)
        {
            switch (this.#outStreamType)
            {
                case 0:
                    this.#outStream(data);
                    break;
                case 1:
                    this.#outStream(jsobContext.encode(data));
                    break;
                case 2:
                    this.#outStream(uint8ArrayToBase64(jsobContext.encode(data)));
                    break;
            }
        }

        /**
         * 绑定输出流
         * 会覆盖之前绑定的输出流
         * @param {(data: string | Uint8Array | object) => void} onDataCallback 
         * @param { "jsob" | "jsobin" | "base64" | "raw" } [type]
         */
        bindOutStream(onDataCallback, type = "jsob")
        {
            this.#outStream = onDataCallback;

            if (type == "raw")
                this.#outStreamType = 0;
            else if (type == "jsob" || type == "jsobin")
                this.#outStreamType = 1;
            else if (type == "base64")
                this.#outStreamType = 2;
            else
                throw "RcoCcontext(bindOutStream): Unsupported output stream types";
        }

        /**
         * 添加全局命名函数
         * @param {Object<string, function>} functionMapObj 
         */
        addGlobalNamedFunctions(functionMapObj)
        {
            Object.keys(functionMapObj).forEach(functionName =>
            {
                this.#globalNamedFunctionMap.set(functionName, functionMapObj[functionName]);
            });
        }

        /**
         * 收到数据包
         * @param {object} data
         */
        async #onPacket(data)
        {
            if (Array.isArray(data))
            {
                let type = data[0];
                switch (type)
                {
                    case 0: { // 调用命名函数
                        let func = this.#globalNamedFunctionMap.get(data[1]); // arr[1] 函数名
                        if (func)
                        {
                            let param = (
                                data[3] ? // arr[3] 函数参数中包含的函数对应的id表
                                    this.#injectFunction(data[2], data[3]).result :
                                    data[2] // arr[2] 函数的参数
                            );

                            try
                            {
                                let retValue = await func(...param);
                                if (data[4]) // arr[4] 返回时调用的函数 
                                {
                                    let result = this.#extractFunction(retValue);
                                    this.#outputPacket([
                                        1, // 执行id函数 (resolve函数)
                                        data[4],
                                        [result.result],
                                        (result.fnMap.size > 0 ? result.fnMap : undefined)
                                    ]);
                                }
                            }
                            catch (err)
                            {
                                if (data[5]) // arr[5] 出错时调用的函数
                                    this.#outputPacket([
                                        1, // 执行id函数 (reject函数)
                                        data[5],
                                        [err]
                                    ]);
                            }
                        }
                        else
                        {
                            if (data[5]) // arr[5] 出错时调用的函数
                                this.#outputPacket([
                                    1,
                                    data[5],
                                    ["function does not exist"]
                                ]);
                        }
                        break;
                    }
                    case 1: { // 调用id函数
                        let id = data[1];
                        let funcInfo = this.#idFunctionMap.get(id); // arr[1] 函数id
                        if (funcInfo)
                        {
                            let param = (
                                data[3] ? // arr[3] 函数参数中包含的函数对应的id表
                                    this.#injectFunction(data[2], data[3]).result :
                                    data[2] // arr[2] 函数的参数
                            );

                            let func = funcInfo.func;
                            if (funcInfo.once)
                                this.#idFunctionMap.delete(id);
                            if (funcInfo.releaseTarget)
                                this.#idFunctionMap.delete(funcInfo.releaseTarget);

                            try
                            {
                                let retValue = await func(...param);
                                if (data[4]) // arr[4] 返回时调用的函数 
                                {
                                    let result = this.#extractFunction(retValue);
                                    this.#outputPacket([
                                        1,
                                        data[4],
                                        [result.result],
                                        (result.fnMap.size > 0 ? result.fnMap : undefined)
                                    ]);
                                }
                            }
                            catch (err)
                            {
                                if (data[5]) // arr[5] 出错时调用的函数
                                    this.#outputPacket([
                                        1,
                                        data[5],
                                        [err]
                                    ]);
                            }
                        }
                        else
                        {
                            if (data[5]) // arr[5] 出错时调用的函数
                                this.#outputPacket([
                                    1,
                                    data[5],
                                    ["function does not exist"]
                                ]);
                        }
                        break;
                    }
                    case 2: { // 释放id函数
                        data.slice(1).forEach(id =>
                        {
                            this.#idFunctionMap.delete(id);
                        });
                        break;
                    }
                }
            }
        }

        /**
         * 输入流收到数据应调用
         * @param {string | Uint8Array | object} data 
         */
        onData(data)
        {
            if (typeof (data) == "string")
                this.#onPacket(jsobContext.decode(base64ToUint8Array(data)));
            else if (data instanceof Uint8Array)
                this.#onPacket(jsobContext.decode(data));
            else if (typeof (data) == "object")
                this.#onPacket(data);
            else
                throw "RcoCcontext(onData): Unable to process this data type";
        }

        /**
         * 调用命名函数
         * 
         * @async
         * 
         * @param {string} name
         * @param {Array<any>} param
         */
        callNamedFunction(name, ...param)
        {
            return new Promise((resolve, reject) =>
            {
                let result = this.#extractFunction(param);
                let resolveId = uniqueIdentifierString();
                let rejectId = uniqueIdentifierString();
                this.#idFunctionMap.set(resolveId, new TmpFunctionInfo(resolve, true, rejectId));
                this.#idFunctionMap.set(rejectId, new TmpFunctionInfo(reject, true, resolveId));
                this.#outputPacket([
                    0, // 执行命名函数
                    name,
                    result.result,
                    (result.fnMap.size > 0 ? result.fnMap : undefined),
                    resolveId,
                    rejectId
                ]);
            });
        }

        /**
         * 获取一个代理对象
         * 以函数名为key 返回的函数用于调用命名函数
         * @returns {Object<string, function>}
         */
        getGlobalNamedFunctionProxy()
        {
            return new Proxy({}, {
                set: () => false,
                get: (_target, /** @type {string} */ key) =>
                {
                    return (/** @type {Array<any>} */ ...param) =>
                    {
                        return this.callNamedFunction(key, ...param);
                    };
                }
            });
        }

        /**
         * 将函数注入回对象
         * @param {Object} obj 
         * @param {Map<Object, string>} fnMap 
         */
        #injectFunction(obj, fnMap)
        {
            /**
             * 函数id 到 生成出的函数 映射
             * @type {Map<string, Function>}
             */
            let generatedFunctionMap = new Map();
            fnMap.forEach((id, _functionObj) =>
            {
                if (!generatedFunctionMap.has(id))
                {
                    let generatedFunction = (/** @type {Array<any>} */ ...param) =>
                    {
                        return new Promise((resolve, reject) =>
                        {
                            let result = this.#extractFunction(param);
                            let resolveId = uniqueIdentifierString();
                            let rejectId = uniqueIdentifierString();
                            this.#idFunctionMap.set(resolveId, new TmpFunctionInfo(resolve, true, rejectId));
                            this.#idFunctionMap.set(rejectId, new TmpFunctionInfo(reject, true, resolveId));
                            this.#outputPacket([
                                1, // 执行id函数
                                id,
                                result.result,
                                (result.fnMap.size > 0 ? result.fnMap : undefined),
                                resolveId,
                                rejectId
                            ]);
                        });
                    };
                    generatedFunctionMap.set(id, generatedFunction);

                    this.#holdingFunctionMap.set(id, new WeakRef(generatedFunction));
                    this.#holdingFunctionRegistry.register(generatedFunction, id);
                }
            });

            /**
             * 遍历对象嵌入函数
             * @param {any} now 
             * @returns {any}
             */
            const traversal = (now) =>
            {
                if (typeof (now) == "object")
                {
                    if (fnMap.has(now))
                    {
                        return generatedFunctionMap.get(fnMap.get(now));
                    }
                    else if (Array.isArray(now))
                    {
                        return now.map(traversal);
                    }
                    else
                    {
                        let ret = {};
                        Object.keys(now).forEach(key =>
                        {
                            ret[key] = traversal(now[key]);
                        });
                        return ret;
                    }
                }
                else
                    return now;
            };
            let result = traversal(obj);

            return ({
                result: result
            });
        }

        /**
         * 提取对象中的函数
         * (并生成函数对应表)
         * @param {Object} obj
         */
        #extractFunction(obj)
        {
            let functionMap = new Map();

            /**
             * 遍历对象过滤函数
             * @param {any} now 
             * @returns {any}
             */
            const traversal = (now) =>
            {
                if (typeof (now) == "function")
                {
                    let ret = {};
                    let functionId = uniqueIdentifierString();
                    this.#idFunctionMap.set(functionId, new TmpFunctionInfo(now, false, ""));
                    functionMap.set(ret, functionId);
                    return ret;
                }
                else if (typeof (now) == "object")
                {
                    if (Array.isArray(now))
                    {
                        return now.map(traversal);
                    }
                    else
                    {
                        let ret = {};
                        Object.keys(now).forEach(key =>
                        {
                            ret[key] = traversal(now[key]);
                        });
                        return ret;
                    }
                }
                else
                    return now;
            };
            let result = traversal(obj);

            return ({
                result: result,
                fnMap: functionMap
            });
        }
    }

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

    let joinedEvent = new EventHandler();
    let beatmapChangedEvent = new EventHandler();
    let gameStartEvent = new EventHandler();

    /**
     * @type {Map<string, string>}
     */
    let partyUserMap = new Map();

    /**
     * @type {Set<string>}
     */
    let readyedUserSet = new Set();

    let playTogetherInfo = createHookObj({
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

    async function showWaitingHostPage()
    {
        playTogetherInfo.clientInfo = "正在等待连接至主机...\n如果一直显示此页面则可能主机已离线";
        let ui = NList.getElement([
            createNStyleList({
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
                createNStyleList({
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
                    createNStyleList({
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


    function sendPlayTogetherInvite()
    {
        if (!inviteGameId)
            inviteGameId = uniqueIdentifierString$1();
        let url = "https://qwq0.github.io/osuManiaOnline/";
        // let url = "http://localhost:5510/test/test.html";
        playTogetherService.sendInvite("osu-mania-online", inviteGameId, `${url}?type=playTogether&invite-id=${inviteGameId}`);
        refreshPlayerList();
    }

    function sendStartGameSignal()
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

    function sendReadySignal()
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
    function sendDeciderResult(result)
    {
        playTogetherService.sendSlowPacket(hostUserId, {
            type: "replyDeciderResult",
            result: result
        });
    }

    /**
     * 
     */
    function sendHostDeciderResult()
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

    function sendChangeBeatmapSignal()
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

    /**
     * 加载页
     * @param {string} beatmapUrl
     * @param {{
     *  bid?: string,
     *  bNum?: number
     * }} paramObj
     */
    async function loadAndShowLoadingPage(beatmapUrl, paramObj)
    {
        /**
         * @type {NElement}
         */
        let textElement = null;
        /**
         * @type {(x: number) => void}
         */
        let progressChange = null;
        let ui = NList.getElement([
            createNStyleList({
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
                createNStyleList({
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
                    createNStyleList({
                        width: "200px",
                        height: "10px",
                        backgroundColor: "rgb(160, 160, 160)"
                    }),
                    [
                        createNStyleList({
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
            await loadBeatmapPackage(beatmapUrl, progressChange);
            state.beatmapFileName = (paramObj.bid != undefined ? await getBeatmapFileName("bid", paramObj.bid) : await getBeatmapFileName("index", paramObj.bNum | 0));

            ui.remove();

            showStartPage(state.beatmapFileName);
        }
        catch (err)
        {
            textElement.setText(String(err));
            console.error(err);
        }
    }

    /**
     * 起始页
     * @param {string} beatmapFileName
     */
    async function showStartPage(beatmapFileName)
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
            console.error(err);
        }

        /** @type {NElement} */
        let coverLayer = null;

        let ui = NList.getElement([
            createNStyleList({
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
                createNStyleList({
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
                        createNStyleList({
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
                        `键位数: ${beatmapMeta.columnNumber}`
                    ],

                    [
                        `铺面id: ${beatmapMeta.meta.Metadata.BeatmapSetID} / ${beatmapMeta.meta.Metadata.BeatmapID}`
                    ],
                ] : [
                    [
                        "铺面错误"
                    ],

                    [
                        createNStyleList({
                            fontSize: "0.8em"
                        }),
                        `${errorText}`
                    ],
                ]),

                [
                    "切换铺面: ",
                    [
                        new NTagName("select"),
                        (playTogetherInfo.isClient ? new NAttr("disabled", "true") : undefined),

                        createNStyleList({
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

                (!playTogetherInfo.isClient ? [
                    "切换铺面集: ",
                    [
                        createNStyleList({
                            padding: "5px",
                            paddingLeft: "15px",
                            paddingRight: "15px",
                            backgroundColor: "rgb(220, 220, 240)",
                            border: "1px solid rgb(20, 20, 20)",

                            display: "inline-flex",
                            justifyContent: "center",
                            alignItems: "center",

                            cursor: "default",
                            fontSize: "0.9em"
                        }),

                        "搜索铺面集",
                        new NEvent("click", () =>
                        {
                            ui.remove();
                            showSearchBeatmapPage();
                        })
                    ],
                ] : [
                    "正在派对中游戏"
                ]),

                [
                    createNStyleList({
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
                    createNStyleList({
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

                    (playTogetherInfo.isClient ? "准备" : "开始"),

                    new NEvent("click", async () =>
                    {
                        if (playTogetherInfo.enable)
                        {
                            if (playTogetherInfo.isClient)
                            {
                                coverLayer = NList.getElement([
                                    createNStyleList({
                                        position: "absolute",
                                        left: "0",
                                        top: "0",
                                        width: "100%",
                                        height: "100%",
                                        backgroundColor: "rgba(180, 220, 240, 0.9)",

                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",

                                        fontSize: "20px"
                                    }),

                                    "正在等待主机开始游戏"
                                ]);
                                getNElement(document.body).addChild(coverLayer);

                                sendReadySignal();

                                await gameStartEvent.oncePromise();

                                coverLayer.remove();
                            }
                            else
                                sendStartGameSignal();
                        }
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
                ],

                ...((playTogetherInfo.enable && !playTogetherInfo.isClient) ? [
                    [
                        createNStyleList({
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

                        "发送邀请",
                        new NEvent("click", () =>
                        {
                            sendPlayTogetherInvite();
                        })
                    ],
                    [
                        createNStyleList({
                            whiteSpace: "pre-wrap"
                        }),
                        bindValue(playTogetherInfo, "playerListInfo")
                    ]
                ] : [])
            ]
        ]);

        getNElement(document.body).addChild(ui);

        let nowSid = beatmapMeta.meta.Metadata.BeatmapSetID;
        let nowBid = beatmapMeta.meta.Metadata.BeatmapID;

        let changeBeatmap = () =>
        {
            ui.remove();
            if (coverLayer)
                coverLayer.remove();
            gameStartEvent.removeAll();
            loadAndShowLoadingPage(`https://txy1.sayobot.cn/beatmaps/download/mini/${playTogetherInfo.sid}`, { bid: playTogetherInfo.bid });
        };

        if ((nowSid != playTogetherInfo.sid || nowBid != playTogetherInfo.bid))
        {
            if (playTogetherInfo.isClient)
                changeBeatmap();
            else if (playTogetherInfo.enable)
            {
                playTogetherInfo.sid = nowSid;
                playTogetherInfo.bid = nowBid;
                sendChangeBeatmapSignal();
            }
        }

        beatmapChangedEvent.addOnce(changeBeatmap);
    }

    /**
     * 成绩页
     */
    function showDeciderResultsPage()
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

        let resultInfoList = [
            `Max Combo: ${deciderState.maxCombo} / ${deciderState.noteCount}`,
            `Perfect: ${deciderState.perfect + deciderState.holdEndPerfect} (${deciderState.perfect} + ${deciderState.holdEndPerfect})`,
            `Great: ${deciderState.great + deciderState.holdEndGreat} (${deciderState.great} + ${deciderState.holdEndGreat})`,
            `Good: ${deciderState.good}`,
            `Miss: ${deciderState.miss + deciderState.holdEndMiss} (${deciderState.miss} + ${deciderState.holdEndMiss})`
        ];

        let ui = NList.getElement([
            createNStyleList({
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
                createNStyleList({
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
                    createNStyleList({
                        color: `rgb(${rank.color.r}, ${rank.color.g}, ${rank.color.b})`,
                        textShadow: `2px 2px 4px rgb(255, 255, 255)`,
                        fontSize: "2em"
                    }),
                    rank.rank
                ],

                [
                    `${achievingRate.toFixed(4)}%`
                ],

                ...resultInfoList.map(o => ([
                    o
                ])),

                [
                    createNStyleList({
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
                ],

                (playTogetherInfo.enable ? [
                    createNStyleList({
                        whiteSpace: "pre-wrap"
                    }),
                    bindValue(playTogetherInfo, "replyDeciderResult")
                ] : null)
            ]
        ]);

        getNElement(document.body).addChild(ui);

        if (playTogetherInfo.enable)
        {
            let resultText = ([
                `${rank.rank} ${achievingRate.toFixed(4)}%`,
                `hit: ${deciderState.noteCount - deciderState.miss} / ${deciderState.noteCount}`
            ]).join(" | ");

            if (!playTogetherInfo.isClient)
            {
                playTogetherInfo.hostDeciderResult = resultText;
                sendHostDeciderResult();
            }
            else
                sendDeciderResult(resultText);

        }
    }

    /**
     * 设置页
     */
    async function showOptionPage()
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
            createNStyleList({
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
                createNStyleList({
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

                        createNStyleList({
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

                        createNStyleList({
                            padding: "5px",
                            maxWidth: "300px",
                        }),
                        ele => { audioLatencyInput = ele; }
                    ]
                ],

                [
                    createNStyleList({
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
                    createNStyleList({
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

    /**
     * 铺面搜索页
     */
    function showSearchBeatmapPage()
    {
        /**
         * @param {string} name
         * @param {number} pageIndex
         * @returns {Promise<{
         *  list: Array<{
         *      title: string,
         *      artist: string,
         *      creator: string,
         *      sid: string,
         *      cover: string
         *  }>,
         *  hasNextPage: boolean
         * }>}
         */
        async function getSearchBeatmap(name, pageIndex)
        {
            try
            {
                let response = await fetch(`https://api.sayobot.cn/beatmaplist?0=20&1=${String(pageIndex * 20)}&2=4&3=${encodeURIComponent(name)}&5=8`);
                let result = await response.json();
                return {
                    hasNextPage: result.endid != 0,
                    list: result.data.map((/** @type {any} */ o) =>
                    {
                        return {
                            title: String(o.title),
                            artist: String(o.artist),
                            creator: String(o.creator),
                            sid: String(o.sid),
                            cover: `https://cdn.sayobot.cn:25225/beatmaps/${o.sid}/covers/cover.webp`
                        };
                    })
                };
            }
            catch (err)
            {
                console.log(err);
            }
        }

        /**
         * @type {NElement}
         */
        let beatmapListElement = null;
        /**
         * @type {NElement}
         */
        let pageElement = null;

        let searchName = "";
        let pageIndex = 0;

        async function searchBeatmap()
        {
            let data = await getSearchBeatmap(searchName, pageIndex);
            beatmapListElement.removeChilds();
            if (pageIndex > 0)
                beatmapListElement.addChild(NList.getElement([
                    createNStyleList({
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

                    "上一页",
                    new NEvent("click", () =>
                    {
                        pageIndex--;
                        searchBeatmap();
                    })
                ]));
            data.list.forEach(o =>
            {
                beatmapListElement.addChild(NList.getElement([
                    createNStyleList({
                        border: "1px solid rgb(0, 0, 0)",
                        backgroundColor: "rgba(255, 255, 255, 0.3)"
                    }),

                    [
                        createNStyleList({
                            maxWidth: "100%"
                        }),

                        new NTagName("img"),
                        new NAttr("src", o.cover)
                    ],

                    [
                        `${o.title} - ${o.artist}`
                    ],

                    [
                        `${o.creator}`
                    ],

                    new NEvent("click", () =>
                    {
                        ui.remove();
                        let sid = o.sid;
                        loadAndShowLoadingPage(`https://txy1.sayobot.cn/beatmaps/download/mini/${sid}`, {});
                    })
                ]));
            });
            if (data.hasNextPage)
                beatmapListElement.addChild(NList.getElement([
                    createNStyleList({
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

                    "下一页",
                    new NEvent("click", () =>
                    {
                        pageIndex++;
                        searchBeatmap();
                        pageElement.element.scrollTop = 0;
                    })
                ]));
        }

        let ui = NList.getElement([
            createNStyleList({
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
                createNStyleList({
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

                ele => { pageElement = ele; },

                (state.beatmapFileName ? [
                    createNStyleList({
                        padding: "6px",
                        paddingLeft: "40px",
                        paddingRight: "40px",
                        backgroundColor: "rgb(220, 220, 240)",
                        border: "1px solid rgb(20, 20, 20)",

                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",

                        cursor: "default"
                    }),

                    "返回",
                    new NEvent("click", () =>
                    {
                        ui.remove();
                        showStartPage(state.beatmapFileName);
                    })
                ] : null),

                [
                    "搜索铺面"
                ],

                [
                    new NTagName("input"),
                    new NAttr("type", "text"),

                    createNStyleList({
                        outline: "none",
                        lineHeight: "1.5em"
                    }),

                    new NEvent("keyup", (e, ele) =>
                    {
                        if (e.key == "Enter")
                        {
                            searchName = ele.element.value;
                            pageIndex = 0;
                            searchBeatmap();
                        }
                    })
                ],

                [
                    createNStyleList({
                        display: "flex",
                        flexDirection: "column",
                        gap: "5px"
                    }),
                    ele => { beatmapListElement = ele; }
                ]
            ]
        ]);

        getNElement(document.body).addChild(ui);
    }

    let keyMapList = [
        {}, // 0k
        { // 1k
            " ": 0,
        },
        { // 2k
            "f": 0,
            "j": 1,
        },
        { // 3k
            "f": 0,
            " ": 1,
            "j": 2,
        },
        { // 4k
            "d": 0,
            "f": 1,
            "j": 2,
            "k": 3,
        },
        { // 5k
            "d": 0,
            "f": 1,
            " ": 2,
            "j": 3,
            "k": 4,
        },
        { // 6k
            "s": 0,
            "d": 1,
            "f": 2,
            "j": 3,
            "k": 4,
            "l": 5,
        },
        { // 7k
            "s": 0,
            "d": 1,
            "f": 2,
            " ": 3,
            "j": 4,
            "k": 5,
            "l": 6,
        },
        { // 8k
            "a": 0,
            "s": 1,
            "d": 2,
            "f": 3,
            "j": 4,
            "k": 5,
            "l": 6,
            ";": 7,
        },
        { // 9k
            "a": 0,
            "s": 1,
            "d": 2,
            "f": 3,
            " ": 4,
            "j": 5,
            "k": 6,
            "l": 7,
            ";": 8,
        },
        { // 10k
            "a": 0,
            "s": 1,
            "d": 2,
            "f": 3,
            "v": 4,
            "n": 5,
            "j": 6,
            "k": 7,
            "l": 8,
            ";": 9,
        },
    ];
    let enableInput = false;

    let exitDown = false;
    function exitButtonDown()
    {
        if (!exitDown)
        {
            exitDown = true;
            state.exitButton.activeStartTime = performance.now();
            state.exitButton.alpha = 1;
        }
    }
    function exitButtonUp()
    {
        if (exitDown)
        {
            exitDown = false;
            state.exitButton.activeStartTime = -1;
            state.exitButton.alpha = 0;
        }
    }

    window.addEventListener("keydown", e =>
    {
        if (!enableInput)
            return;
        let column = keyMapList[state.columnNumber][e.key];
        if (column != undefined)
            keydown(column);
        else if (e.key == "Escape" && !exitDown)
            exitButtonDown();
    });
    window.addEventListener("keyup", e =>
    {
        if (!enableInput)
            return;
        let column = keyMapList[state.columnNumber][e.key];
        if (column != undefined)
            keyup(column);
        else if (e.key == "Escape")
            exitButtonUp();
    });

    /**
     * @param {TouchList} touchlist
     */
    function getTouch(touchlist)
    {
        if (state.columnNumber == 0)
            return;
        let keyState = [];
        let keyWidth = canvasElement.clientWidth * state.noteWidthRatio;
        let keyOffset = canvasElement.clientWidth * (1 - state.noteWidthRatio * state.columnNumber) / 2;
        let exitTouching = false;
        Array.from(touchlist).forEach(o =>
        {
            let x = o.clientX;
            let y = o.clientY;

            if (Math.hypot(x - state.exitButton.x, y - state.exitButton.y) <= state.exitButton.radius)
            {
                exitTouching = true;
            }
            else
            {
                let column = Math.floor((x - keyOffset) / keyWidth);
                keyState[column] = true;
            }
        });

        for (let i = 0; i < state.columnNumber; i++)
        {
            if (keyState[i])
                keydown(i);
            else
                keyup(i);
        }

        if (exitTouching)
            exitButtonDown();
        else
            exitButtonUp();
    }

    window.addEventListener("touchstart", e =>
    {
        if (!enableInput)
            return;
        e.preventDefault();
        getTouch(e.touches);
    }, {
        capture: true,
        passive: false
    });
    window.addEventListener("touchmove", e =>
    {
        if (!enableInput)
            return;
        e.preventDefault();
        getTouch(e.touches);
    }, {
        capture: true,
        passive: false
    });
    window.addEventListener("touchend", e =>
    {
        if (!enableInput)
            return;
        e.preventDefault();
        getTouch(e.touches);
    }, {
        capture: true,
        passive: false
    });
    window.addEventListener("touchcancel", e =>
    {
        if (!enableInput)
            return;
        e.preventDefault();
        getTouch(e.touches);
    }, {
        capture: true,
        passive: false
    });


    let lastMouseMoveTime = performance.now();

    let hidedCursor = false;
    function hideCursor()
    {
        let needHideCursor = performance.now() - lastMouseMoveTime > 6 * 1000;

        if (needHideCursor)
        {
            if (!hidedCursor)
            {
                document.body.style.cursor = "none";
                hidedCursor = true;
                state.exitButton.alpha = 0;
            }
        }
        else
        {
            if (hidedCursor)
            {
                document.body.style.cursor = "auto";
                hidedCursor = false;
            }
        }
    }
    function cursorMove()
    {
        lastMouseMoveTime = performance.now();
        if (hidedCursor)
        {
            document.body.style.cursor = "auto";
            hidedCursor = false;
        }
    }
    setInterval(hideCursor, 3 * 1000);
    window.addEventListener("mousemove", e =>
    {
        cursorMove();

        if (state.exitButton.activeStartTime == -1)
        {
            let toExitButtonDistance = Math.max(0, Math.hypot(e.clientX - state.exitButton.x, e.clientY - state.exitButton.y) - state.exitButton.radius);
            if (toExitButtonDistance < 200)
            {
                state.exitButton.alpha = (1 - (toExitButtonDistance / 200)) * 0.5;
            }
            else
            {
                state.exitButton.alpha = 0;
            }
        }
    });
    window.addEventListener("mousedown", e =>
    {
        if (!enableInput)
            return;
        cursorMove();

        if (Math.hypot(e.clientX - state.exitButton.x, e.clientY - state.exitButton.y) <= state.exitButton.radius)
            exitButtonDown();
    });
    window.addEventListener("mouseup", e =>
    {
        if (!enableInput)
            return;
        cursorMove();

        if (exitDown)
            exitButtonUp();
    });

    function inputTick()
    {
        let now = performance.now();

        if (state.exitButton.activeStartTime != -1)
        {
            if (now - state.exitButton.activeStartTime >= state.exitButton.activeDuration)
            {
                state.exitButton.activeStartTime = -1;
                clearState();
                abortDecider();
                showStartPage(state.beatmapFileName);
            }
        }
    }
    setInterval(inputTick, 60);

    /**
     * @param {boolean} enable
     */
    function setInputEnable(enable)
    {
        enableInput = enable;
    }

    (async () =>
    {
        let sid = getUrlSearchParam("sid");

        if (getUrlSearchParam("invite-id"))
        {
            showWaitingHostPage();
        }
        else
        {
            if (sid == undefined)
                showSearchBeatmapPage();
            else
            {
                let bid = getUrlSearchParam("bid");
                let bNum = Number(getUrlSearchParam("b-num"));
                if (!Number.isInteger(bNum))
                    bNum = 0;

                loadAndShowLoadingPage(
                    `https://txy1.sayobot.cn/beatmaps/download/mini/${sid}`,
                    {
                        bid: bid,
                        bNum: bNum
                    }
                );
            }
        }
    })();

})();
