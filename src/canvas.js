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