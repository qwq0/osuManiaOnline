import { canvasElement } from "./canvas.js";
import { keydown, keyup } from "./decider.js";
import { state } from "./state.js";


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

let columnNumber = 0;

window.addEventListener("keydown", e =>
{
    let column = keyMapList[state.columnNumber][e.key];
    if (column != undefined)
        keydown(column);
});

window.addEventListener("keyup", e =>
{
    let column = keyMapList[state.columnNumber][e.key];
    if (column != undefined)
        keyup(column);
});

/**
 * @param {TouchList} touchlist
 */
function getTouch(touchlist)
{
    if (state.columnNumber == 0)
        return;
    let keyState = [];
    let keyWidth = canvasElement.clientWidth / state.columnNumber;
    Array.from(touchlist).forEach(o =>
    {
        let x = o.clientX;
        let y = o.clientY;
        let column = Math.floor(x / keyWidth);
        keyState[column] = true;
    });

    for (let i = 0; i < state.columnNumber; i++)
    {
        if (keyState[i])
            keydown(i);
        else
            keyup(i);
    }
}

window.addEventListener("touchstart", e =>
{
    e.preventDefault();
    getTouch(e.touches);
}, {
    capture: true,
    passive: false
});
window.addEventListener("touchmove", e =>
{
    e.preventDefault();
    getTouch(e.touches);
}, {
    capture: true,
    passive: false
});
window.addEventListener("touchend", e =>
{
    e.preventDefault();
    getTouch(e.touches);
}, {
    capture: true,
    passive: false
});
window.addEventListener("touchcancel", e =>
{
    e.preventDefault();
    getTouch(e.touches);
}, {
    capture: true,
    passive: false
});