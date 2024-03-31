export let state = {
    /**
     * @type {Array<{ column: number, time: number, hold: boolean, endTime: number, judged: boolean, holding: boolean }>}
     */
    mapNotes: [],

    matchStartTime: 0,

    columnNumber: 0
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
