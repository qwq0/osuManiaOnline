export let state = {
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
export function setMapNotes(notes, mapColumnNumber)
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
export function correctMatchTime(time)
{
    state.matchStartTime = performance.now() - time;
}


export function clearState()
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