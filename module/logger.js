
export class Logger {
	constructor() {
		this.buf = [];
	}

	log(str) {
		this.buf.push(str);
	}

	dump() {
		if (this.buf.length > 0) {
			console.debug(this.buf.join("\n"));
			this.buf = [];
		}
	}
}

export const logger = new Logger();
