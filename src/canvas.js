document.body.style.margin = "0";

export let canvasElement = document.createElement("canvas");
canvasElement.style.position = "absolute";
canvasElement.style.top = "absolute";
canvasElement.style.left = "absolute";
canvasElement.style.height = "100%";
canvasElement.style.width = "100%";
document.body.appendChild(canvasElement);
canvasElement.width = canvasElement.clientWidth;
canvasElement.height = canvasElement.clientHeight;

export let canvasContext = canvasElement.getContext("2d");

let oldWidth = 0;
let oldHeight = 0;
function resizeCanvas()
{
    let width = canvasElement.clientWidth;
    let height = canvasElement.clientHeight;
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