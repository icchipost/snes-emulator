
import { logger } from "./logger.js";

export function Controller() {
	//joypad
	this.joypad1 = new Joypad(1);
	this.joypad2 = new Joypad(2);
	this.joypad3 = new Joypad(3);
	this.joypad4 = new Joypad(4);

	//レジスタ
	
	//4200h[0]
	this.joypadEnable = 0;
	
	//4212h[0]
	this.busyFlag = 0;

	this.JOYWR = 0;	//4016h(W)
	this.JOYA = 0;	//4016h(R)
	this.JOYB = 0;	//4017h(R)
	
	this.WRIO = 255;	//4201h(W)
	this.RDIO = 0;	//4213h(R)

	this.JOY1L = 0;	//4218h(R)
	this.JOY1H = 0;	//4219h(R)
	this.JOY2L = 0;	//421Ah(R)
	this.JOY2H = 0;	//421Bh(R)
	this.JOY3L = 0;	//421Ch(R)
	this.JOY3H = 0;	//421Dh(R)
	this.JOY4L = 0;	//421Eh(R)
	this.JOY4H = 0;	//421Fh(R)

	//自動読み取りにかかるサイクル数
	this.waitCycle = 0;

	this.write = function(address, data) {
		switch (address) {
			case 0x4016: {
				//JOYWR
				this.joypad1.latch(data & 1);
				break;
			}
			case 0x4200: {
				this.joypadEnable = data & 1;
				break;
			}
			case 0x4201: {
				this.WRIO = data;
				break;
			}
		}
	}

	this.read = function(address) {
		let res = 0;
		switch (address) {
			case 0x4016: {
				res = this.joypad1.shift() | (this.joypad3.shift() << 1);
				break;
			}
			case 0x4017: {
				res = this.joypad2.shift() | (this.joypad4.shift() << 1);
				break;
			}
			case 0x4212: {
				res = this.busyFlag & 1;
				break;
			}
			case 0x4213: {
				;
				break;
			}
			case 0x4218: { res = this.JOY1L; break; }
			case 0x4219: { res = this.JOY1H; break; }
			case 0x421A: { res = this.JOY2L; break; }
			case 0x421B: { res = this.JOY2H; break; }
			case 0x421C: { res = this.JOY3L; break; }
			case 0x421D: { res = this.JOY3H; break; }
			case 0x421E: { res = this.JOY4L; break; }
			case 0x421F: { res = this.JOY4H; break; }
		}
		return res;
	}

	this.clock = function() {
		if (this.busyFlag) {
			this.waitCycle--;
			if (this.waitCycle === 0) {
				this.busyFlag = 0;

				this.joypad1.latch(0);
				this.joypad1.latch(1);
				this.JOY1H = this.joypad1.read();
				this.JOY1L = this.joypad1.read();
			}
		}
	}

	this.setBusyFlag = function() {
		this.busyFlag = 1;
		//this.waitCycle = 4224;	//master cycle conversion
		this.waitCycle = 1056;	//dot cycle conversion
		//console.log("コントローラのbusyフラグがセットされた");
	}
}

export function Joypad(port) {
	this.port = port;
	this.register = 0;

	this.parallelEnable = 0;
	
	this.latch = function(flag) {
		//Low active
		if (this.parallelEnable === 1 && flag === 0) {
			//serial
			this.register = inputKeyboard;
		}
		this.parallelEnable = flag;
	}

	this.shift = function() {
		if (this.parallelEnable) {
			return inputKeyboard & 1;
		}
		else {
			const res = this.register & 1;
			this.register >>= 1;
			return res;
		}
	}

	this.read = function() {
		// const res = this.register & 0xff;
		// this.register >>= 8;

		let res = 0;
		for (let i = 0; i < 8; i++) {
			res <<= 1;
			res |= this.register & 1;
			this.register >>= 1;
		}
		return res;
	}
}

const keyCode = [
	"KeyB",			//B
	"KeyY",			//Y
	"ShiftLeft",		//select
	"Space",		//start
	"ArrowUp",		//up
	"ArrowDown",	//down
	"ArrowLeft",	//left
	"ArrowRight",	//right
	"KeyA",			//A
	"KeyX",			//X
	"KeyL",			//L
	"KeyR",			//R
	"",
	"",
	"",
	"",
];

let inputKeyboard = 0;
document.addEventListener("keydown", (e) => {
	for (let i = 0; i < 16; i++) {
		if (e.code === keyCode[i]) {
			inputKeyboard |= (1 << i);
		}
	}
});

document.addEventListener("keyup", (e) => {
	for (let i = 0; i < 16; i++) {
		if (e.code === keyCode[i]) {
			inputKeyboard &= ~(1 << i);
		}
	}
});
