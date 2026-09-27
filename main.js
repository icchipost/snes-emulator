import { Snes } from "./module/snes.js"

const snes = new Snes();
snes.reset();

window.snes = snes;

const fileInput = document.querySelector("input[type=file]");
fileInput.addEventListener("change", () => {
	const [file] = fileInput.files;
	if (file) {
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			snes.load(reader.result);
		});
		reader.readAsArrayBuffer(file);
	}
});

document.querySelector("input[id='reset']")
.addEventListener("click", function() {
	snes.reset();
});

document.querySelector("input[id='run']")
.addEventListener("click", function() {
	snes.run();
});

document.querySelector("input[id='pause']")
.addEventListener("click", function() {
	snes.pause();
});


document.getElementById("tilemapBox")
.addEventListener("change", (event) => {
	if (event.target.id === "tilemapOFF") snes.ppu.changeShowTilemapNumber(-1);
	else if (event.target.id === "tilemapBG1") snes.ppu.changeShowTilemapNumber(0);
	else if (event.target.id === "tilemapBG2") snes.ppu.changeShowTilemapNumber(1);
	else if (event.target.id === "tilemapBG3") snes.ppu.changeShowTilemapNumber(2);
	else if (event.target.id === "tilemapBG4") snes.ppu.changeShowTilemapNumber(3);
	else if (event.target.id === "tilemapOBJ") snes.ppu.changeShowTilemapNumber(4);
});
