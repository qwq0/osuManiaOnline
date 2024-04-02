document.body.style.margin = "0";

export let canvasElement = document.createElement("canvas");
canvasElement.style.position = "absolute";
canvasElement.style.top = "absolute";
canvasElement.style.left = "absolute";
canvasElement.style.height = "100%";
canvasElement.style.width = "100%";
document.body.appendChild(canvasElement);
canvasElement.width = Math.floor(canvasElement.clientWidth * window.devicePixelRatio);
canvasElement.height = Math.floor(canvasElement.clientHeight * window.devicePixelRatio);

export let canvasContext = canvasElement.getContext("2d");

let oldWidth = canvasElement.width;
let oldHeight = canvasElement.height;
function resizeCanvas()
{
    let width = Math.floor(canvasElement.clientWidth * window.devicePixelRatio);
    let height = Math.floor(canvasElement.clientHeight * window.devicePixelRatio);
    if (width != oldWidth || height != oldHeight)
    {
        canvasElement.width = width;
        canvasElement.height = height;

        oldWidth = width;
        oldHeight = height;
    }
}

window.addEventListener("resize", resizeCanvas);
setTimeout(o =>
{
    resizeCanvas();
}, 3 * 1000);