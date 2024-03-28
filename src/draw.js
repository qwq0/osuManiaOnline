import { canvasContext, canvasElement } from "./canvas.js";


let matchTime = 0;
/**
 * @type {Set<{ column: number, time: number, hold: boolean, endTime: number }>}
 */
let sceneNotes = new Set();
/**
 * @type {Array<{ column: number, time: number, hold: boolean, endTime: number }>}
 */
let mapNotes = [];
let mapNotesPointer = 0;
let noteDuration = 441;

let columnNumber = 4;

/** @type {Array<boolean>} */
let keyState = [];

/** @type {Array<{ fillStyle: string | CanvasGradient, endTime: number, ratio: number }>} */
let keyVisualEffect = [];

let titleText = "";

let lastTime = performance.now();
function draw()
{
    let context = canvasContext;

    let now = performance.now();
    let timeStep = now - lastTime;

    matchTime += timeStep;

    let width = canvasElement.width;
    let height = canvasElement.height;

    let noteWidth = (width >= height ? width / 15 : width / columnNumber);
    let noteHeight = Math.min(width, height) / 55;
    let noteOffset = (width - noteWidth * columnNumber) / 2;

    context.fillStyle = "rgb(0, 0, 0)";
    context.fillRect(0, 0, width, height);


    context.fillStyle = "rgb(15, 15, 15)";
    context.fillRect(noteOffset, 0, noteWidth * columnNumber, height);

    {
        context.save();

        sceneNotes.forEach(o =>
        {
            if (o.endTime < matchTime)
                sceneNotes.delete(o);
        });

        for (let i = mapNotesPointer, length = mapNotes.length; i < length; i++)
        {
            let now = mapNotes[i];
            if (now.time <= matchTime + noteDuration)
            {
                sceneNotes.add(now);
            }
            else
            {
                mapNotesPointer = i;
                break;
            }
        }

        if (sceneNotes.size > 0)
        {
            context.fillStyle = "rgb(255, 255, 255)";
            sceneNotes.forEach(o =>
            {
                let progress = 1 - ((o.time - matchTime) / noteDuration);
                let noteX = noteOffset + o.column * noteWidth + 1;
                let noteY = progress * height - noteHeight;
                let noteW = noteWidth - 2;
                if (o.hold)
                {
                    context.fillStyle = "rgb(170, 212, 215)";

                    let holdProgressDelta = (o.endTime - o.time) / noteDuration;
                    let holdLength = holdProgressDelta * height;

                    context.fillRect(noteX, noteY - holdLength, noteW, noteHeight + holdLength);

                    context.fillStyle = "rgb(210, 170, 170)";
                    context.fillRect(noteX, noteY - holdLength, noteW, noteHeight);

                    context.fillStyle = "rgb(255, 255, 255)";
                    context.fillRect(noteX, noteY, noteW, noteHeight);
                }
                else
                {
                    context.fillStyle = "rgb(255, 255, 255)";
                    context.fillRect(noteX, noteY, noteW, noteHeight);
                }
            });
        }
        else
        {
            let nextNode = mapNotes[mapNotesPointer];
            if (nextNode && nextNode.time > matchTime + 5000)
            {
                context.textBaseline = "middle";
                context.textAlign = "center";
                context.fillStyle = "rgb(255, 255, 255)";
                context.font = "50px sans-serif";
                context.fillText(`${Math.floor((nextNode.time - matchTime - 4000) / 1000)}`, width / 2, height / 2);
            }
        }

        for (let i = 0; i < columnNumber; i++)
        {
            let columnX = noteOffset + i * noteWidth;

            if (keyVisualEffect[i])
            {
                let effect = keyVisualEffect[i];
                if (effect.endTime - matchTime > 0)
                {
                    context.fillStyle = effect.fillStyle;
                    context.globalAlpha = (effect.endTime - matchTime) * effect.ratio;
                    context.fillRect(columnX, height - height * 0.2, noteWidth, height * 0.2);
                    context.globalAlpha = 1;
                }
                else
                {
                    keyVisualEffect[i] = undefined;
                }
            }

            let lineWidth = (keyState[i] ? 7 : 2);
            context.fillStyle = "rgb(200, 200, 200)";
            context.fillRect(columnX, height - noteHeight - lineWidth / 2, noteWidth, lineWidth);
        }

        if (titleText)
        {
            context.textBaseline = "top";
            context.textAlign = "center";
            context.fillStyle = "rgb(255, 255, 255)";
            context.font = "30px sans-serif";
            context.fillText(titleText, width / 2, height * 0.03);
        }

        context.restore();
    }

    lastTime = now;
    requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

/**
 * 
 * @param {typeof mapNotes} notes
 * @param {number} mapColumnNumber
 */
export function setDrawMapNotes(notes, mapColumnNumber)
{
    mapNotes = notes;
    matchTime = -3000;
    columnNumber = mapColumnNumber;
}

/**
 * 
 * @param {number} time
 */
export function correctDrawMatchTime(time)
{
    matchTime = time;
}

/**
 * 
 * @param {number} column
 * @param {boolean} pressing
 */
export function showKeyState(column, pressing)
{
    keyState[column] = pressing;
}

/**
 * @type {Object<string, CanvasGradient>}
 */
let gradientCache = {};
/**
 * @param {number} column
 * @param {{ r: number, g: number, b: number }} color
 */
export function showKeyVisualEffect(column, color)
{
    let colorKey = `${color.r},${color.g},${color.b}`;

    let gradient = gradientCache[colorKey];
    if (!gradient)
    {
        gradient = canvasContext.createLinearGradient(0, canvasElement.height - canvasElement.height * 0.2, 0, canvasElement.height);
        gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.01)`);
        gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
        gradientCache[colorKey] = gradient;
    }

    keyVisualEffect[column] = {
        fillStyle: gradient,
        endTime: matchTime + 300,
        ratio: 1 / 350
    };
}

/**
 * 
 * @param {string} text
 */
export function setTitleText(text)
{
    titleText = text;
}

/**
 * 
 * @param {number} duration
 */
export function setNoteDuration(duration)
{
    noteDuration = duration;
}