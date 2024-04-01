import { canvasContext, canvasElement } from "./canvas.js";
import { state } from "./state.js";


/**
 * @type {Set<{ column: number, time: number, hold: boolean, endTime: number, judged: boolean, holding: boolean }>}
 */
let sceneNotes = new Set();

let mapNotesPointer = 0;
let noteDuration = 441;


/** @type {Array<boolean>} */
let keyState = [];

/** @type {Array<{ color: { r: number, g: number, b: number }, endTime: number, ratio: number }>} */
let keyVisualEffect = [];

let titleText = "";

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

    let noteWidth = (canvasWidth >= canvasHeight ? canvasWidth / 15 : canvasWidth / state.columnNumber);
    let noteHeight = Math.min(canvasWidth, canvasHeight) / 55;
    let noteOffset = (canvasWidth - noteWidth * state.columnNumber) / 2;

    context.fillStyle = "rgb(0, 0, 0)";
    context.fillRect(0, 0, canvasWidth, canvasHeight);


    context.fillStyle = "rgb(25, 25, 25)";
    context.fillRect(noteOffset, 0, noteWidth * state.columnNumber, canvasHeight);

    {
        context.save();

        let bottomFillHeight = canvasHeight * 0.13;
        let trackHeight = canvasHeight - bottomFillHeight;
        let bottomFillDuration = noteDuration * bottomFillHeight / trackHeight;

        // 移除离开场景的物件
        sceneNotes.forEach(o =>
        {
            if (o.endTime + bottomFillDuration < matchTime)
                sceneNotes.delete(o);
        });

        // 将进入场景的物件添加到场景
        for (let i = mapNotesPointer, length = state.mapNotes.length; i < length; i++)
        {
            let now = state.mapNotes[i];
            if (now.time <= matchTime + noteDuration)
            {
                sceneNotes.add(now);
                mapNotesPointer = i + 1;
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
                let noteX = noteOffset + o.column * noteWidth + 1;
                let noteW = noteWidth - 2;

                if (o.hold)
                {
                    let holdStartY = (o.holding ? trackHeight : progress * trackHeight) - noteHeight;

                    let holdEndProgress = 1 - ((o.endTime - matchTime) / noteDuration);
                    let holdEndY = holdEndProgress * trackHeight - noteHeight;

                    let holdLength = holdStartY - holdEndY;

                    if (holdLength >= 0)
                    {
                        context.fillStyle = "rgb(170, 212, 215)";
                        context.fillRect(noteX, holdEndY, noteW, noteHeight + holdLength);

                        context.fillStyle = "rgb(255, 255, 255)";
                        context.fillRect(noteX, holdStartY, noteW, noteHeight);

                        context.fillStyle = "rgb(210, 170, 170)";
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
        {
            let nextNode = state.mapNotes[mapNotesPointer];
            if (nextNode && nextNode.time > matchTime + 5000)
            {
                context.textBaseline = "middle";
                context.textAlign = "center";
                context.fillStyle = "rgb(255, 255, 255)";
                context.font = "50px sans-serif";
                context.fillText(`${Math.floor((nextNode.time - matchTime - 4000) / 1000)}`, canvasWidth / 2, canvasHeight / 2);
            }
        }

        // 判定线与打击特效
        for (let i = 0; i < state.columnNumber; i++)
        {
            let columnX = noteOffset + i * noteWidth;

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
                    context.fillRect(columnX, trackHeight - effectHeight - noteHeight / 2, noteWidth, effectHeight);
                    context.globalAlpha = 1;
                }
                else
                {
                    keyVisualEffect[i] = undefined;
                }
            }

            // 判定线
            let lineWidth = (keyState[i] ? 7 : 2);
            context.fillStyle = (keyState[i] ? "rgb(230, 230, 230)" : "rgb(200, 200, 200)");
            context.fillRect(columnX, trackHeight - noteHeight / 2 - lineWidth / 2, noteWidth, lineWidth);
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
        if (titleText)
        {
            context.textBaseline = "top";
            context.textAlign = "center";
            context.fillStyle = "rgb(255, 255, 255)";
            context.font = "30px sans-serif";
            context.fillText(titleText, canvasWidth / 2, canvasHeight * 0.03);
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
export function showKeyState(column, pressing)
{
    keyState[column] = pressing;
}

/**
 * @param {number} column
 * @param {{ r: number, g: number, b: number }} color
 */
export function showKeyVisualEffect(column, color)
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
export function showDecisionText(text, color)
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