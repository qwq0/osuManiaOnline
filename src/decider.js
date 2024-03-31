import { setTitleText, showDecisionText, showKeyState, showKeyVisualEffect } from "./draw.js";
import { state } from "./state.js";



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

    holdEndPerfect: 0,
    holdEndGreat: 0,
    holdEndMiss: 0,

    totalScore: 0,
    score: 0
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

function refreshDecider()
{
    for (let column = 0; column < state.columnNumber; column++)
    {
        for (let i = deciderPointerList[column]; i < deciderQueueList[column].length; i++)
        {
            let nowNote = deciderQueueList[column][i];
            if (nowNote.time + goodTime >= matchTime)
            {
                break;
            }
            else
            {
                showKeyVisualEffect(column, { r: 220, g: 60, b: 60 });
                showDecisionText("Miss", { r: 220, g: 60, b: 60 });
                deciderPointerList[column] = i + 1;
                deciderState.totalScore += perfectScore;
                deciderState.combo = 0;
            }
        }

        let holdEndTime = deciderHoldEndTimeList[column];
        if (holdEndTime != undefined)
        {
            if (holdEndTime + holdEndGreatTime < matchTime)
            {
                showKeyVisualEffect(column, { r: 220, g: 60, b: 60 });
                showDecisionText("Miss", { r: 220, g: 60, b: 60 });
                deciderState.totalScore += holdEndPerfectScore;
                deciderState.combo = 0;
            }
        }
    }
    refreshScoreDisplay();
}

function refreshScoreDisplay()
{
    setTitleText(`${((deciderState.totalScore > 0 ? deciderState.score / deciderState.totalScore : 1) * 100).toFixed(3)}%  ${deciderState.combo} combo`);
}

setInterval(() =>
{
    matchTime = performance.now() - state.matchStartTime;
    refreshDecider();
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
        refreshDecider();

        let nowNote = deciderQueueList[column][deciderPointerList[column]];
        if (nowNote && nowNote.time - goodTime <= matchTime)
        {
            if (Math.abs(nowNote.time - matchTime) <= perfectTime)
            { // perfect
                showKeyVisualEffect(column, { r: 220, g: 220, b: 60 });
                showDecisionText("Perfect", { r: 220, g: 220, b: 60 });
                deciderState.score += perfectScore;

                deciderPointerList[column]++;
                deciderState.totalScore += perfectScore;
                deciderState.combo++;

                if (nowNote.hold)
                    deciderHoldEndTimeList[column] = nowNote.endTime;
            }
            else if (Math.abs(nowNote.time - matchTime) <= greatTime)
            { // great
                showKeyVisualEffect(column, { r: 220, g: 160, b: 160 });
                showDecisionText("Great", { r: 220, g: 160, b: 160 });
                deciderState.score += greatScore;

                deciderPointerList[column]++;
                deciderState.totalScore += perfectScore;
                deciderState.combo++;

                if (nowNote.hold)
                    deciderHoldEndTimeList[column] = nowNote.endTime;
            }
            else if (Math.abs(nowNote.time - matchTime) <= goodTime)
            { // good
                showKeyVisualEffect(column, { r: 60, g: 220, b: 60 });
                showDecisionText("Good", { r: 60, g: 220, b: 60 });
                deciderState.score += goodScore;

                deciderPointerList[column]++;
                deciderState.totalScore += perfectScore;
                deciderState.combo++;

                if (nowNote.hold)
                    deciderHoldEndTimeList[column] = nowNote.endTime;
            }
            else
            { // miss
                showKeyVisualEffect(column, { r: 220, g: 60, b: 60 });
                showDecisionText("Miss", { r: 220, g: 60, b: 60 });
                deciderPointerList[column]++;
                deciderState.totalScore += perfectScore;
                deciderState.combo = 0;
            }
            refreshScoreDisplay();

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
        refreshDecider();

        let holdEndTime = deciderHoldEndTimeList[column];
        if (holdEndTime != undefined)
        {
            if (Math.abs(holdEndTime - matchTime) <= holdEndPerfectTime)
            { // hold end perfect
                showKeyVisualEffect(column, { r: 220, g: 220, b: 60 });
                deciderState.totalScore += holdEndPerfectScore;
                deciderState.score += holdEndPerfectScore;
            }
            else if (Math.abs(holdEndTime - matchTime) <= holdEndGreatTime)
            { // hold end great
                showKeyVisualEffect(column, { r: 220, g: 160, b: 160 });
                deciderState.totalScore += holdEndPerfectScore;
                deciderState.score += holdEndGreatScore;
            }
            else
            { // hold end miss
                showKeyVisualEffect(column, { r: 220, g: 60, b: 60 });
                deciderState.totalScore += holdEndPerfectScore;
                deciderState.combo = 0;
            }
            deciderHoldEndTimeList[column] = undefined;
        }
        refreshScoreDisplay();
    }
}

/**
 * 
 */
export function refreshDeciderMapNotes()
{
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
