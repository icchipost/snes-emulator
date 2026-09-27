export function Renderer(tag) {
	this.canvas = document.querySelector(tag);
	this.context = this.canvas.getContext("2d");

	this.width = this.canvas.width;
	this.height = this.canvas.height;

	this.imageData = this.context.createImageData(this.canvas.width, this.canvas.height);

	this.pixelBuffer = new Uint32Array(this.canvas.width * this.canvas.height);
	this.uint32View = new Uint32Array(this.imageData.data.buffer);

	this.draw = function(x, y, r, g, b, a) {
		// if (0) {
		// 	if (((x & 7) === 0) || ((y & 7) === 0)) {
		// 		a -= 32;
		// 	}
		// 	if (((x & 15) === 0) || ((y & 15) === 0)) {
		// 		a -= 32;
		// 	}
		// 	if (((x & 31) === 0) || ((y & 31) === 0)) {
		// 		a -= 32;
		// 	}
		// }

		const color = (a << 24) | (b << 16) | (g << 8) | r;
		const index = y * this.width + x;
		this.pixelBuffer[index] = color;
	}

	this.flip = function() {
		this.uint32View.set(this.pixelBuffer);
		this.context.fillStyle = "black";
		this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.context.putImageData(this.imageData, 0, 0);
	}
}
