import { canvasElement } from "./canvas.js";
import { abortDecider, keydown, keyup, refreshDeciderMapNotes } from "./decider.js";
import { showStartPage } from "./page.js";
import { clearState, state } from "./state.js";


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
export function setInputEnable(enable)
{
    enableInput = enable;
}