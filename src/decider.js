import { setTitleText, showDecisionText, showKeyState, showKeyVisualEffect } from "./draw.js";
import { state } from "./state.js";

/**
 * @type {Promise<void>}
 */
let deciderEndPromise = null;
/**
 * @type {() => void}
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

export let deciderState = {
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
            deciderEndCallback();
        deciderEndCallback = null;
        deciderEndPromise = null;
    }
}

function refreshScoreDisplay()
{
    setTitleText(`${((deciderState.totalScore > 0 ? deciderState.score / deciderState.totalScore : 1) * 100).toFixed(3)}%  ${deciderState.combo} combo`);
}

setInterval(() =>
{
    matchTime = performance.now() - state.matchStartTime;
    deciderTick();
}, 40);

/**
 * @param {number} column
 */
export function keydown(column)
{
    if (!keyState[column])
    {
        showKeyState(column, true);
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
export function keyup(column)
{
    if (keyState[column])
    {
        showKeyState(column, false);
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


export function refreshDeciderMapNotes()
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

/**
 * 
 * @returns {Promise<void>}
 */
export function waitForEnd()
{
    if (deciderState.deciderEnded)
        return Promise.resolve();
    if (!deciderEndPromise)
    {
        deciderEndPromise = new Promise(resolve =>
        {
            deciderEndCallback = resolve;
        });
    }
    return deciderEndPromise;
}