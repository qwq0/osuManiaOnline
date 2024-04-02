import { state } from "./state.js";

document.body.style.margin = "0";

export let canvasElement = document.createElement("canvas");
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
    let width = Math.round(canvasElement.clientWidth * canvasRatio);
    let height = Math.round(canvasElement.clientHeight * canvasRatio);
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

export let canvasContext = canvasElement.getContext("2d");
