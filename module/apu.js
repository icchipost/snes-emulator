
import { logger } from "./logger.js";

export function APU() {
	this.bus = new Bus();

	this.spc700 = new SPC700();
	this.dsp = new DSP();

	this.ram = new Uint8Array(0x1_0000);
	this.rom = new Uint8Array([
		0xCD, 0xEF, 0xBD, 0xE8, 0x00, 0xC6, 0x1D, 0xD0, 0xFC, 0x8F, 0xAA, 0xF4, 0x8F, 0xBB, 0xF5, 0x78,
		0xCC, 0xF4, 0xD0, 0xFB, 0x2F, 0x19, 0xEB, 0xF4, 0xD0, 0xFC, 0x7E, 0xF4, 0xD0, 0x0B, 0xE4, 0xF5,
		0xCB, 0xF4, 0xD7, 0x00, 0xFC, 0xD0, 0xF3, 0xAB, 0x01, 0x10, 0xEF, 0x7E, 0xF4, 0x10, 0xEB, 0xBA,
		0xF6, 0xDA, 0x00, 0xBA, 0xF4, 0xC4, 0xF4, 0xDD, 0x5D, 0xD0, 0xDB, 0x1F, 0x00, 0x00, 0xC0, 0xFF,
	]);

	this.powerup = function() {
		if (audioContext.state === "suspended") {
			audioContext.resume(); 
		}
	}
	
	this.reset = function() {
		this.bus.reset(this.spc700, this.dsp, this.ram, this.rom);
		
		this.spc700.reset(this.bus);
		this.dsp.reset(this.bus);

		for (let i = 0; i < 0x1_0000; i++) {
			this.ram[i] = 0;
		}
	}

	this.spc700ClockCounter = 0;
	this.dspClockCounter = 0;

	this.clock = function(cycle, debug = 0) {
		this.spc700ClockCounter += 24576000 / 21477270 / 24;
		if (this.spc700ClockCounter >= 1) {
			this.spc700ClockCounter -= 1;
			this.spc700.clock(debug);

			this.dspClockCounter++;
			if (this.dspClockCounter >= 320) {
				this.dspClockCounter = 0;
				this.dsp.clock();
			}
		}
	}

	this.readRegister = function(address) {
		let res = 0;
		address &= 0x2143;
		switch (address) {
			case 0x2140:
			case 0x2141:
			case 0x2142:
			case 0x2143: {
				//spc700のportWから読み込み
				res = this.spc700.readPortW(address - 0x2140);
				break;
			}

			default: {
				//logger.log("未実装");
				break;
			}
		}

		return res;
	}

	this.writeRegister = function(address, data) {
		address &= 0x2143;
		switch (address) {
			case 0x2140:
			case 0x2141:
			case 0x2142:
			case 0x2143: {
				//spc700のportRに書き込み
				this.spc700.writePortR(address - 0x2140, data);
				break;
			}

			default: {
				//logger.log("未実装");
				break;
			}
		}
		
		//logger.log(`APU write: address=${address.toString(16)}, data=${data.toString(16)}`);
	}
}

function Bus() {
	this.spc700;
	this.dsp;
	this.ram;
	this.rom;

	this.reset = function(spc700, dsp, ram, rom) {
		this.spc700 = spc700;
		this.dsp = dsp;
		this.ram = ram;
		this.rom = rom;
	}

	this.read = function(addr, IPLROMEnable = 1) {
		let res = 0;

		if (addr <= 0x00EF) {
			//ram
			res = this.ram[addr];
		}
		else if (addr <= 0x00FF) {
			//spc700 register
			const isRegisterAddr = (addr === 0x00F2);
			const isRegisterData = (addr === 0x00F3);
			if (isRegisterAddr) {
				res = this.dsp.readDSPADDR();
			}
			else if (isRegisterData) {
				res = this.dsp.readDSPDATA();
			}
			else {
				// const offset = addr - 0x00F0;
				// tres = his.spc700.readRegister(offset);
			}
		}
		else if (addr <= 0xFFBF) {
			//ram
			res = this.ram[addr];
		}
		else if (addr <= 0xFFFF) {
			if (IPLROMEnable) {
				//rom
				const offset = addr - 0xFFC0;
				res = this.rom[offset];
			}
			else {
				//ram
				res = this.ram[addr];
			}
		}
		else {
			//logger.log("無効なアドレス");
		}

		return res;
	}

	this.write = function(addr, data, writeEnable = 1) {

		if (addr <= 0x00EF) {
			//ram
			if (writeEnable) {
				this.ram[addr] = data;
			}
		}
		else if (addr <= 0x00FF) {
			//spc700 register
			const isRegisterAddr = (addr === 0x00F2);
			const isRegisterData = (addr === 0x00F3);
			if (isRegisterAddr) {
				this.dsp.writeDSPADDR(data);
			}
			else if (isRegisterData) {
				this.dsp.writeDSPDATA(data);
			}
			else {
				// const offset = addr - 0x00F0;
				// this.spc700.writeRegister(offset, data);
				//logger.log("無効なアドレス");
			}
		}
		else if (addr <= 0xFFBF) {
			if (writeEnable) {
				this.ram[addr] = data;
			}
		}
		else if (addr <= 0xFFFF) {
			if (writeEnable) {
				this.ram[addr] = data;
			}
		}
		else {
			//logger.log("無効なアドレス");
		}

	}
}

function SPC700() {

	const REG_TEST = 0x0;
	const REG_CONTROL = 0x1;
	const REG_DSPADDR = 0x2;
	const REG_DSPDATA = 0x3;
	const REG_CPUIO0 = 0x4;
	const REG_CPUIO1 = 0x5;
	const REG_CPUIO2 = 0x6;
	const REG_CPUIO3 = 0x7;
	const REG_T0TARGET = 0xA;
	const REG_T1TARGET = 0xB;
	const REG_T2TARGET = 0xC;
	const REG_T0OUT = 0xD;
	const REG_T1OUT = 0xE;
	const REG_T2OUT = 0xF;

	//register
	this.regPC;
	this.regA;
	this.regX;
	this.regY;
	this.regSP;

	//flag
	this.flagC;	//bit0
	this.flagZ;	//bit1
	this.flagI;	//bit2
	this.flagH;	//bit3
	this.flagB; //bit4
	this.flagP;	//bit5
	this.flagV;	//bit6
	this.flagN;	//bit7

	//register
	this.functionRegister = new Uint8Array(16);
	this.portR = [0, 0, 0, 0];	//scpu -> spc700
	this.portW = [0, 0, 0, 0];	//scpu <- spc700

	this.bus;

	//memory
	//this.ram = new Array(65536);

	//ldx, txs, lda, sta, dex, bne, mov

	this.waitCycle;

	this.reset = function(bus) {
		this.bus = bus;

		// for (let i = 0; i < 0x10000; i++) {
		// 	this.ram[i] = 0;
		// }

		this.functionRegister[REG_TEST] = 0x0A;
		this.functionRegister[REG_CONTROL] = 0xB0;

		this.regPC = 0xFFC0;
		this.regA = 0;
		this.regX = 0;
		this.regY = 0;
		this.regSP = 0;
		
		this.flagC = 0;
		this.flagZ = 0;
		this.flagI = 0;
		this.flagH = 0;
		this.flagB = 0;
		this.flagP = 0;
		this.flagV = 0;
		this.flagN = 0;

		for (let i = 0; i < 3; i++) {
			this.prescalerCounter[i] = 0;
			this.intervalCounter[i] = 0;
		}

		this.waitCycle = 0;
	}

	this.breakPoint = 0;
	this.clock = function(debug) {
		this.updateTimer();

		if (this.waitCycle === 0) {
			const pc = this.regPC;

			const opcode = this.fetch();
			const operand = this.decode(opcode);

			//if (opcode === 0x1F) debug = 1;
			//if (mnemonicTable[opcode] === "SBC") debug = 1;

			this.exec(opcode, operand, debug);
			this.waitCycle = instCycleTable[opcode];
		}
		--this.waitCycle;

		//debug
		//if (debug) this.waitCycle = 0;
	}

	this.prescalerCounter = new Array(3);
	this.intervalCounter = new Array(3);
	this.updateTimer = function() {
		const enableTimer0 = this.functionRegister[REG_CONTROL] & 1;
		const enableTimer1 = (this.functionRegister[REG_CONTROL] >> 1) & 1;
		const enableTimer2 = (this.functionRegister[REG_CONTROL] >> 2) & 1;

		if (enableTimer0) {
			this.prescalerCounter[0]++;
			if (this.prescalerCounter[0] === 128) {
				this.prescalerCounter[0] = 0;
				this.intervalCounter[0]++;

				//logger.log(`this.intervalCounter[0] = ${this.intervalCounter[0]}/${this.functionRegister[REG_T0TARGET]}`);

				if (this.intervalCounter[0] === this.functionRegister[REG_T0TARGET]) {
					this.intervalCounter[0] = 0;
					this.functionRegister[REG_T0OUT]++;
					this.functionRegister[REG_T0OUT] &= 15;

					//logger.log(`this.functionRegister[REG_T0OUT] = ${this.functionRegister[REG_T0OUT]}`);
				}
			}
		}

		if (enableTimer1) {
			this.prescalerCounter[1]++;

			//logger.log(`this.prescalerCounter[1] = ${this.prescalerCounter[1]}`);

			if (this.prescalerCounter[1] === 128) {
				this.prescalerCounter[1] = 0;
				this.intervalCounter[1]++;

				//logger.log(`this.intervalCounter[1] = ${this.intervalCounter[1]}`);

				if (this.intervalCounter[1] === this.functionRegister[REG_T1TARGET]) {
					this.intervalCounter[1] = 0;
					this.functionRegister[REG_T1OUT]++;
					this.functionRegister[REG_T1OUT] &= 15;

					//logger.log(`this.functionRegister[REG_T1OUT] = ${this.functionRegister[REG_T1OUT]}`);
				}
			}
		}
		
		if (enableTimer2) {
			this.prescalerCounter[2]++;
			if (this.prescalerCounter[2] === 16) {
				this.prescalerCounter[2] = 0;
				this.intervalCounter[2]++;

				//logger.log(`this.intervalCounter[2] = ${this.intervalCounter[2]}`);

				if (this.intervalCounter[2] === this.functionRegister[REG_T2TARGET]) {
					this.intervalCounter[2] = 0;
					this.functionRegister[REG_T2OUT]++;
					this.functionRegister[REG_T2OUT] &= 15;

					//ogger.log(`this.functionRegister[REG_T2OUT] = ${this.functionRegister[REG_T2OUT]}`);
				}
			}
		}
	}

	this.fetch = function() {
		const res = this.read(this.regPC);
		this.regPC = (this.regPC + 1) & 0xFFFF;
		return res;
	}

	this.decode = function(opcode) {
		const mode = addressingModeTable[opcode];
		const instLength = instLengthTable[opcode];

		const op = [];
		let read = undefined;
		let write = undefined;

		//opcodeを含めた命令長なので、instLength-1回オペランドをフェッチする
		for (let i = 0; i < instLength - 1; i++) {
			op.push(this.fetch());
		}
		
		switch (mode) {
			case "a": {
				//absolute
				const addr = (op[1] << 8) | op[0];
				read = () => this.read(addr);
				write = (data) => this.write(addr, data);
				break;
			}
			case "m.b": {
				//absolute boolean bit
				const addr = ((op[1] << 8) | op[0]) & 0x1FFF;

				//op[1]の上位3bitで対象bitを指定
				const sel = (op[1] >> 5) & 7;

				read = () => (this.read(addr) >> sel) & 1;
				write = (bit) => {
					const mask = ~(1 << sel);
					let data = this.read(addr);
					data = (data & mask) | (bit << sel);
					this.write(addr, data);
				}
				break;
			}
			case "(a,X)": {
				//absollute x-indexed indirect
				//jmp
				const addrLo = (((op[1] << 8) | op[0]) + this.regX) & 0xFFFF;
				const addrHi = (addrLo + 1) & 0xFFFF;
				read = () => (this.read(addrHi) << 8) | this.read(addrLo);
				break;
			}
			case "A": {
				//accumulator
				break;
			}
			case "d": {
				//direct page
				const addrLo = op[0] + this.flagP * 256;
				const addrHi = (op[0] + 1) & 0xFF + this.flagP * 256;
				read = (w = 0) => {
					if (w) {
						return [this.read(addrLo), this.read(addrHi)];
					}
					else {
						return this.read(addrLo);
					}
				}
				write = (data, w = 0) => {
					if (w) {
						this.write(addrLo, data[0]);
						this.write(addrHi, data[1]);
					}
					else {
						this.write(addrLo, data);
					}
				}
				break;
			}
			case "d.b":
			case "d.b,r": {
				//direct page bit (relative)
				//d.b:set1, clr1
				//d.b, r:bbs, bbc
				const addr = op[0] + this.flagP * 256;

				//opcodeの上位3bitで対象bitを指定
				const sel = (opcode >> 5) & 7;

				read = () => (this.read(addr) >> sel) & 1;
				write = (bit) => {
					const mask = ~(1 << sel);
					const data = (this.read(addr) & mask) | (bit << sel);
					this.write(addr, data);
				}
				break;
			}
			case "dd,ds": {
				const addrSrc = op[0] + this.flagP * 256;
				const addrDst = op[1] + this.flagP * 256;
				read = () => [this.read(addrDst), this.read(addrSrc)];
				write = (data) => this.write(addrDst, data);
				break;
			}
			case "#": {
				read = () => op[0];
				break;
			}
			case "d,#": {
				const addr = op[1] + this.flagP * 256;
				read = () => [this.read(addr), op[0]];
				write = (data) => this.write(addr, data);
				break;
			}
			case "imp": {
				break;
			}
			case "(X)": {
				read = () => this.read(this.regX);
				write = (data) => this.write(this.regX, data);
				break;
			}
			case "(X)+": {
				read = () => {
					const res = this.read(this.regX++);
					this.regX &= 0xFF;
					return res;
				}
				write = (data) => {
					this.write(this.regX++, data);
					this.regX &= 0xFF;
				}
				break;
			}
			case "(X),(Y)": {
				read = () => [this.read(this.regX), this.read(this.regY)];
				write = (data) => this.write(this.regX, data);
				break;
			}
			case "(d),Y": {
				const addrLo = op[0] + this.flagP * 256;
				const addrHi = (op[0] + 1) & 0xFF + this.flagP * 256;
				const addr = (((this.read(addrHi) << 8) | this.read(addrLo)) + this.regY) & 0xFFFF;
				read = () => this.read(addr);
				write = (data) => this.write(addr, data);
				break;
			}
			case "r": {
				//relative
				break;
			}
			case "a,X": {
				const addr = (((op[1] << 8) | op[0]) + this.regX) & 0xFFFF;
				read = () => this.read(addr);
				write = (data) => this.write(addr, data);
				break;
			}
			case "d,X": {
				const addr = ((op[0] + this.regX) & 0xFF) + this.flagP * 256;
				read = () => this.read(addr);
				write = (data) => this.write(addr, data);
				break;
			}
			case "(d,X)": {
				const addrLo = (op[0] + this.regX) & 0xFF + this.flagP * 256;
				const addrHi = (op[0] + this.regX + 1) & 0xFF + this.flagP * 256;
				const addr = ((this.read(addrHi) << 8) | this.read(addrLo)) & 0xFFFF;
				read = () => this.read(addr);
				write = (data) => this.write(addr, data);
				break;
			}
			case "a,Y": {
				const addr = (((op[1] << 8) | op[0]) + this.regY) & 0xFFFF;
				read = () => this.read(addr);
				write = (data) => this.write(addr, data);
				break;
			}
			case "d,Y": {
				const addr = ((op[0] + this.regY) & 0xFF) + this.flagP * 256;
				read = () => this.read(addr);
				write = (data) => this.write(addr, data);
				break;
			}
		}

		return {
			operand: op,
			read: read,
			write: write,
		};
	}

	this.exec = function(opcode, operand, debug = 0) {
		instHandler[opcode](opcode, operand);

		if (debug) {
			const mnemonic = mnemonicTable[opcode];
			const mode = addressingModeTable[opcode];

			//logger.log("----- SPC700 log -----");

			let log = "";
			log += `spc700 [${(this.regPC-instLengthTable[opcode]).toString(16).padStart(4, 0)}] `;
			log += `${opcode.toString(16).padStart(2, 0)} `;
			log += `${mnemonic} `;
			if (operand.operand[0] === undefined) log += `   `;
			else log += `${operand.operand[0].toString(16).padStart(2, 0)} `;
			if (operand.operand[1] === undefined) log += `   `;
			else log += `${operand.operand[1].toString(16).padStart(2, 0)} `;
			log += `mode:${mode}`;
			//console.log(log);
			logger.log(log);

			log = "";
			log += `PC:${this.regPC.toString(16).padStart(4, 0)} `;
			log += `A:${this.regA.toString(16).padStart(2, 0)} `;
			log += `X:${this.regX.toString(16).padStart(2, 0)} `;
			log += `Y:${this.regY.toString(16).padStart(2, 0)} `;
			log += `SP:${this.regSP.toString(16).padStart(2, 0)} `;
			log += `PSW:${this.getRegPSW().toString(16).padStart(2, 0)} `;
			//console.log(log);
			//logger.log(log);

			log = "";
			log += `N:${this.flagN} `;
			log += `V:${this.flagV} `;
			log += `P:${this.flagP} `;
			log += `H:${this.flagH} `;
			log += `Z:${this.flagZ} `;
			log += `C:${this.flagC} `;
			//console.log(log);
			//logger.log(log);

			log = "";
			for (let i = 0; i < 4; i++) {
				log += `Port${i}R=${this.portR[i].toString(16).padStart(2, 0)}\t`;
			}
			logger.log(log);

			log = "";
			for (let i = 0; i < 4; i++) {
				log += `Port${i}W=${this.portW[i].toString(16).padStart(2, 0)}\t`;
			}
			logger.log(log);



		}
	}

	const MASK_FLAG_NZ = 0x82;
	const MASK_FLAG_NZC = 0x83;
	const MASK_FLAG_NVHZC = 0xCB;

	this.LDA = function(opcode, operand) {
		const data = operand.read();
		this.regA = data;
		this.setNZ(this.regA);
	}
	this.LDX = function(opcode, operand) {
		const data = operand.read();
		this.regX = data;
		this.setNZ(this.regX);
	}
	this.LDY = function(opcode, operand) {
		const data = operand.read();
		this.regY = data;
		this.setNZ(this.regY);
	}
	this.STA = function(opcode, operand) {
		operand.write(this.regA);
	}
	this.STX = function(opcode, operand) {
		operand.write(this.regX);
	}
	this.STY = function(opcode, operand) {
		operand.write(this.regY);
	}
	this.TXA = function(opcode, operand) {
		this.regA = this.regX;
		this.setNZ(this.regA);
	}
	this.TYA = function(opcode, operand) {
		this.regA = this.regY;
		this.setNZ(this.regA);
	}
	this.TAX = function(opcode, operand) {
		this.regX = this.regA;
		this.setNZ(this.regX);
	}
	this.TAY = function(opcode, operand) {
		this.regY = this.regA;
		this.setNZ(this.regY);
	}
	this.TSX = function(opcode, operand) {
		this.regX = this.regSP;
		this.setNZ(this.regX);
	}
	this.TXS = function(opcode, operand) {
		this.regSP = this.regX;
	}
	this.MOV = function(opcode, operand) {
		//"d,#", "dd,ds"
		const data = operand.read();
		operand.write(data[1]);
	}
	this.ADC = function(opcode, operand) {
		if (opcode === 0x99 || opcode === 0x89 || opcode == 0x98) {
			const data = operand.read();
			operand.write(this.adder(data[0], data[1], this.flagC, MASK_FLAG_NVHZC));
		}
		else {
			const data = operand.read();
			this.regA = this.adder(this.regA, data, this.flagC, MASK_FLAG_NVHZC);
		}
	}
	this.SBC = function(opcode, operand) {
		if (opcode === 0xB9 || opcode === 0xA9 || opcode == 0xB8) {
			const data = operand.read();
			operand.write(this.adder(data[0], ~data[1], this.flagC, MASK_FLAG_NVHZC));
		}
		else {
			const data = operand.read();
			this.regA = this.adder(this.regA, ~data, this.flagC, MASK_FLAG_NVHZC);
		}
	}
	this.CMP = function(opcode, operand) {
		if (opcode === 0x79 || opcode === 0x69 || opcode == 0x78) {
			const data = operand.read();
			this.adder(data[0], -data[1], 0, MASK_FLAG_NZC);
		}
		else {
			const data = operand.read();
			this.adder(this.regA, -data, 0, MASK_FLAG_NZC);
		}
	}
	this.CPX = function(opcode, operand) {
		const data = operand.read();
		this.adder(this.regX, -data, 0, MASK_FLAG_NZC);
	}
	this.CPY = function(opcode, operand) {
		const data = operand.read();
		this.adder(this.regY, -data, 0, MASK_FLAG_NZC);
	}
	this.AND = function(opcode, operand) {
		if (opcode === 0x39 || opcode === 0x29 || opcode == 0x38) {
			const data = operand.read();
			data[0] = data[0] & data[1];
			operand.write(data[0]);
			this.setNZ(data[0]);
		}
		else {
			const data = operand.read();
			this.regA = this.regA & data;
			this.setNZ(this.regA);
		}
	}
	this.ORA = function(opcode, operand) {
		if (opcode === 0x19 || opcode === 0x09 || opcode == 0x18) {
			const data = operand.read();
			data[0] = data[0] | data[1];
			operand.write(data[0]);
			this.setNZ(data[0]);
		}
		else {
			const data = operand.read();
			this.regA = this.regA | data;
			this.setNZ(this.regA);
		}
	}
	this.EOR = function(opcode, operand) {
		if (opcode === 0x59 || opcode === 0x49 || opcode == 0x58) {
			const data = operand.read();
			data[0] = data[0] ^ data[1];
			operand.write(data[0]);
			this.setNZ(data[0]);
		}
		else {
			const data = operand.read();
			this.regA = this.regA ^ data;
			this.setNZ(this.regA);
		}
	}
	this.INC = function(opcode, operand) {
		if (opcode === 0xBC) {
			this.regA = this.adder(this.regA, 1, 0, MASK_FLAG_NZ);
		}
		else {
			operand.write(this.adder(operand.read(), 1, 0, MASK_FLAG_NZ));
		}
	}
	this.INX = function(opcode, operand) {
		this.regX = this.adder(this.regX, 1, 0, MASK_FLAG_NZ);
	}
	this.INY = function(opcode, operand) {
		this.regY = this.adder(this.regY, 1, 0, MASK_FLAG_NZ);
	}
	this.DEC = function(opcode, operand) {
		if (opcode === 0x9C) {
			this.regA = this.adder(this.regA, -1, 0, MASK_FLAG_NZ);
		}
		else {
			operand.write(this.adder(operand.read(), -1, 0, MASK_FLAG_NZ));
		}
	}
	this.DEX = function(opcode, operand) {
		this.regX = this.adder(this.regX, -1, 0, MASK_FLAG_NZ);
	}
	this.DEY = function(opcode, operand) {
		this.regY = this.adder(this.regY, -1, 0, MASK_FLAG_NZ);
	}
	this.ASL = function(opcode, operand) {
		if (opcode === 0x1C) {
			this.flagC = (this.regA >> 7) & 1;
			this.regA = (this.regA << 1) & 0xFF;
			this.setNZ(this.regA);
		}
		else {
			let data = operand.read();
			this.flagC = (data >> 7) & 1;
			data = (data << 1) & 0xFF;
			operand.write(data);
			this.setNZ(data);
		}
	}
	this.LSR = function(opcode, operand) {
		if (opcode === 0x5C) {
			this.flagC = this.regA & 1;
			this.regA = (this.regA >> 1) & 0xFF;
			this.setNZ(this.regA);
		}
		else {
			let data = operand.read();
			this.flagC = data & 1;
			data = (data >> 1) & 0xFF;
			operand.write(data);
			this.setNZ(data);
		}
	}
	this.ROL = function(opcode, operand) {
		const flagC = this.flagC;
		if (opcode === 0x3C) {
			this.flagC = (this.regA >> 7) & 1;
			this.regA = ((this.regA << 1) | flagC) & 0xFF;
			this.setNZ(this.regA);
		}
		else {
			let data = operand.read();
			this.flagC = (data >> 7) & 1;
			data = ((data << 1) | (flagC)) & 0xFF;
			operand.write(data);
			this.setNZ(data);
		}
	}
	this.ROR = function(opcode, operand) {
		const flagC = this.flagC;
		if (opcode === 0x7C) {
			this.flagC = this.regA & 1;
			this.regA = ((this.regA >> 1) | (flagC << 7)) & 0xFF;
			this.setNZ(this.regA);
		}
		else {
			let data = operand.read();
			this.flagC = data & 1;
			data = ((data >> 1) | (flagC << 7)) & 0xFF;
			operand.write(data);
			this.setNZ(data);
		}
	}
	this.XCN = function(opcode, operand) {
		const lo = this.regA & 15;
		const hi = (this.regA >> 4) & 15;
		this.regA = (lo << 4) | hi;
		this.setNZ(this.regA);
	}
	this.LDW = function(opcode, operand) {
		[this.regA, this.regY] = operand.read(1);
		const regYA = (this.regY << 8) | this.regA;
		this.flagN = (regYA >> 15) & 1;
		this.flagZ = (regYA === 0) ? 1 : 0;
	}
	this.STW = function(opcode, operand) {
		operand.write([this.regA, this.regY], 1);
	}
	this.INW = function(opcode, operand) {
		let [lo, hi] = operand.read(1);
		let data = (hi << 8) | lo;
		let new_data = this.adder(data, 1, 0, MASK_FLAG_NZ, 1);
		lo = new_data & 0xFF;
		hi = (new_data >> 8) & 0xFF;
		operand.write([lo, hi], 1);
	}
	this.DEW = function(opcode, operand) {
		let [lo, hi] = operand.read(1);
		let data = (hi << 8) | lo;
		data = this.adder(data, -1, 0, MASK_FLAG_NZ, 1);
		lo = data & 0xFF;
		hi = (data >> 8) & 0xFF;
		operand.write([lo, hi], 1);
	}
	this.ADW = function(opcode, operand) {
		const [lo, hi] = operand.read(1);
		let regYA = (this.regY << 8) | this.regA;
		const data = (hi << 8) | lo;
		regYA = this.adder(regYA, data, 0, MASK_FLAG_NVHZC, 1);
		this.regA = regYA & 0xFF;
		this.regY = (regYA >> 8) & 0xFF;
	}
	this.SBW = function(opcode, operand) {
		const [lo, hi] = operand.read(1);
		let regYA = (this.regY << 8) | this.regA;
		const data = (hi << 8) | lo;
		regYA = this.adder(regYA, ~data, 1, MASK_FLAG_NVHZC, 1);
		this.regA = regYA & 0xFF;
		this.regY = (regYA >> 8) & 0xFF;
	}
	this.CPW = function(opcode, operand) {
		const [lo, hi] = operand.read(1);
		let regYA = (this.regY << 8) | this.regA;
		const data = (hi << 8) | lo;
		this.adder(regYA, -data, 0, MASK_FLAG_NZC, 1);

		const op = operand.operand;
	}
	this.MUL = function(opcode, operand) {
		const res = (this.regA * this.regY) & 0xFFFF;
		this.regA = res & 0xFF;
		this.regY = (res >> 8) & 0xFF;
		this.flagN = (res >> 15) & 1;
		this.flagZ = (this.regY === 0) ? 1 : 0;
	}
	this.DIV = function(opcode, operand) {
		//https://github.com/yupferris/TasmShiz/blob/master/spc700.txt
		let ya = (this.regY << 8) | this.regA;
		let x = this.regX;

		this.flagH = ((this.regY & 15) >= (this.regX & 15))  ? 1 : 0;

		if (x === 0 || ((ya / x) | 0) > 0x200) {	
			x <<= 9;
			for (let i = 0; i < 9; i++) {
				ya = ((ya << 1) & 0x1FFFF) | ((ya >> 16) & 1);
				if (ya >= x) ya = ya ^ 1;
				if (ya & 1) ya -= x;
			}
			this.regY = (ya >> 9) & 0xFF;
			this.regA = ya & 0xFF;
			this.flagV = (ya >> 8) & 1;
		}
		else {
			this.regY = ya % x;
			this.regA = (ya / x) | 0;
			this.flagV = (this.regA >= 0xFF) ? 1 : 0;
		}

		this.flagN = (this.regA >> 7) & 1;
		this.flagZ = (this.regA === 0) ? 1 : 0;
	}
	this.DAA = function(opcode, operand) {
		//https://sneslab.net/wiki/DAA_(SPC700)
		if (this.flagC || (this.regA > 0x99)) {
			this.regA += 0x60;
			this.flagC = 1;
		}
		if (this.flagH || ((this.regA & 15) > 9)) {
			this.regA += 0x6;
		}
		this.regA &= 0xFF;
		this.flagN = (this.regA >> 7) & 1;
		this.flagZ = (this.regA === 0) ? 1 : 0;
	}
	this.DAS = function(opcode, operand) {
		//https://sneslab.net/wiki/DAS_(SPC700)
		if (!this.flagC || this.regA > 0x99) {
			this.regA -= 0x60;
			this.flagC = 0;
		}
		if (!this.flagH || (this.regA & 15) > 0x9) {
			this.regA -= 0x6;
		}
		this.regA &= 0xFF;
		this.flagN = (this.regA >> 7) & 1;
		this.flagZ = (this.regA === 0) ? 1 : 0;
	}
	this.BRA = function(opcode, operand) {
		let rel = operand.operand.at(-1);
		if (rel > 127) rel -= 256;
		this.regPC += rel;
	}
	this.BEQ = function(opcode, operand) {
		if (this.flagZ === 1) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BNE = function(opcode, operand) {
		if (this.flagZ === 0) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BCS = function(opcode, operand) {
		if (this.flagC === 1) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BCC = function(opcode, operand) {
		if (this.flagC === 0) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BVS = function(opcode, operand) {
		if (this.flagV === 1) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BVC = function(opcode, operand) {
		if (this.flagV === 0) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BMI = function(opcode, operand) {
		if (this.flagN === 1) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BPL = function(opcode, operand) {
		if (this.flagN === 0) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BBS = function(opcode, operand) {
		if (operand.read() === 1) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.BBC = function(opcode, operand) {
		if (operand.read() === 0) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.CBNE = function(opcode, operand) {
		if (operand.read() !== this.regA) {
			this.BRA(opcode, operand);
			this.waitCycle += 2;
		}
	}
	this.DBNZ = function(opcode, operand) {
		if (opcode === 0x6E) {
			//memory(dp)
			let data = (operand.read() - 1) & 0xFF;
			if (data > 0) {
				this.BRA(opcode, operand);
				this.waitCycle += 2;
			}
			operand.write(data);
		}
		else {
			//y-register
			this.regY = (this.regY - 1) & 0xFF;
			if (this.regY !== 0) {
				this.BRA(opcode, operand);
				this.waitCycle += 2;
			}
		}
	}
	this.JMP = function(opcode, operand) {
		if (opcode === 0x5F) {
			const op = operand.operand;
			this.regPC = (op[1] << 8) | op[0];
		}
		else {
			this.regPC = operand.read();
		}
	}
	this.JSR = function(opcode, operand) {
		//call
		const pcl = this.regPC & 0xFF;
		const pch = (this.regPC >> 8) & 0xFF;
		this.push(pch);
		this.push(pcl);

		const op = operand.operand;
		this.regPC = (op[1] << 8) | op[0];
		//this.regPC = operand.read();
	}
	this.JSP = function(opcode, operand) {
		//pcall
		const pcl = this.regPC & 0xFF;
		const pch = (this.regPC >> 8) & 0xFF;
		this.push(pch);
		this.push(pcl);
		this.regPC = 0xFF00 | operand.operand[0];
	}
	this.JST = function(opcode, operand) {
		//tcall
		let pcl = this.regPC & 0xFF;
		let pch = (this.regPC >> 8) & 0xFF;
		this.push(pch);
		this.push(pcl);

		pcl = 0xFFDE - ((opcode >> 4) & 15) * 2;
		pch = pcl + 1;
		this.regPC = (this.read(pch) << 8) | this.read(pcl);
	}
	this.BRK = function(opcode, operand) {
		const pcl = this.regPC & 0xFF;
		const pch = (this.regPC >> 8) & 0xFF;
		this.push(pch);
		this.push(pcl);
		this.push(this.getRegPSW());
		this.flagB = 1;
		this.flagI = 0;
		this.regPC = (this.read(0xFFDF) << 8) | this.read(0xFFDE);
	}
	this.RTS = function(opcode, operand) {
		const pcl = this.pop();
		const pch = this.pop();
		this.regPC = (pch << 8) | pcl;
	}
	this.RTI = function(opcode, operand) {
		this.setRegPSW(this.pop());
		const pcl = this.pop();
		const pch = this.pop();
		this.regPC = (pch << 8) | pcl;
	}
	this.PHA = function(opcode, operand) {
		this.push(this.regA);
	}
	this.PHX = function(opcode, operand) {
		this.push(this.regX);
	}
	this.PHY = function(opcode, operand) {
		this.push(this.regY);
	}
	this.PHP = function(opcode, operand) {
		this.push(this.getRegPSW());
	}
	this.PLA = function(opcode, operand) {
		this.regA = this.pop();
	}
	this.PLX = function(opcode, operand) {
		this.regX = this.pop();
	}
	this.PLY = function(opcode, operand) {
		this.regY = this.pop();
	}
	this.PLP = function(opcode, operand) {
		this.setRegPSW(this.pop());
	}
	this.SET1 = function(opcode, operand) {
		operand.write(1);
	}
	this.CLR1 = function(opcode, operand) {
		operand.write(0);
	}
	this.TSB = function(opcode, operand) {
		const data = operand.read();
		operand.write(this.regA | data);
		this.flagN = ((this.regA - data) >> 7) & 1;
		this.flagZ = ((this.regA - data) === 0) ? 1 : 0;
	}
	this.TRB = function(opcode, operand) {
		const data = operand.read();
		operand.write(~this.regA & data);
		this.flagN = ((this.regA - data) >> 7) & 1;
		this.flagZ = ((this.regA - data) === 0) ? 1 : 0;
	}
	this.ANDC = function(opcode, operand) {
		let bit = operand.read();
		if ((opcode >> 5) & 1) bit = 1 - bit;
		this.flagC &= bit;
	}
	this.ORC = function(opcode, operand) {
		let bit = operand.read();
		if ((opcode >> 5) & 1) bit = 1 - bit;
		this.flagC |= bit;
	}
	this.EORC = function(opcode, operand) {
		this.flagC ^= operand.read();
	}
	this.NOT = function(opcode, operand) {
		operand.write(1 - operand.read());
	}
	this.LDC = function(opcode, operand) {
		this.flagC = operand.read();
	}
	this.STC = function(opcode, operand) {
		operand.write(this.flagC);
	}
	this.CLC = function(opcode, operand) {
		this.flagC = 0;
	}
	this.SEC = function(opcode, operand) {
		this.flagC = 1;
	}
	this.NOTC = function(opcode, operand) {
		this.flagC = 1 - this.flagC;
	}
	this.CLV = function(opcode, operand) {
		this.flagV = 0;
		this.flagH = 0;
	}
	this.CLP = function(opcode, operand) {
		this.flagP = 0;
	}
	this.SEP = function(opcode, operand) {
		this.flagP = 1;
	}
	this.CLI = function(opcode, operand) {
		this.flagI = 0;
	}
	this.SEI = function(opcode, operand) {
		this.flagI = 1;
	}
	this.NOP = function(opcode, operand) {
		;
	}
	this.WAI = function(opcode, operand) {
		console.error("WAIはサポートされていない命令です");
	}
	this.STP = function(opcode, operand) {
		console.error("STPはサポートされていない命令です");
	}

	this.adder = function(a, b, c, flag, w = 0) {
		let cin = c, s = 0, cout = 0;
		const msb = w ? 15 : 7;
		for (let i = 0; i <= msb; i++) {
			const ai = (a >> i) & 1;
			const bi = (b >> i) & 1;
			const si = ai ^ bi ^ cin;
			s |= si << i;
			cin = (ai & bi) | ((ai ^ bi) & cin);
			cout |= cin << i;
		}

		if ((flag >> 7) & 1) this.flagN = (s >> (msb)) & 1;
		if ((flag >> 6) & 1) this.flagV = ((cout >> (msb - 1)) & 1) ^ cin;
		if ((flag >> 3) & 1) this.flagH = (cout >> (msb - 4)) & 1;
		if ((flag >> 1) & 1) this.flagZ = (s === 0) ? 1 : 0;
		if (flag & 1) this.flagC = (cout >> (msb)) & 1;
		
		return s;
	}

	
	this.pop = function() {
		this.regSP = (this.regSP + 1) & 0xFF;
		return this.read(this.regSP + 0x100);
	}
	this.push = function(data) {
		this.write(this.regSP + 0x100, data);
		this.regSP = (this.regSP - 1) & 0xFF;
	}

	this.setNZ = function(data) {
		this.flagN = (data >> 7) & 1;
		this.flagZ = (data === 0) ? 1 : 0;
	}

	this.read = function(addr) {
		let res = 0;
		if (addr <= 0x00EF) {
			//ram(zero page)
			//res = this.ram[addr];
			res = this.bus.read(addr);
		}
		else if (addr <= 0x00FF) {
			//register
			
			const offset = addr - 0xF0;
			switch (offset) {
				case REG_DSPADDR: {
					//res = this.functionRegister[offset];
					res = this.bus.read(addr);

					break;
				}
				case REG_DSPDATA: {
					//res = this.functionRegister[offset];
					res = this.bus.read(addr);

					break;
				}
				case REG_CPUIO0:
				case REG_CPUIO1:
				case REG_CPUIO2:
				case REG_CPUIO3: {
					res = this.portR[offset - 0x04];
					//logger.log(`SPC700 read: address=${(offset-0xF4).toString(16)}, data=${res.toString(16)}`);

					break;
				}
				case REG_T0OUT: 
				case REG_T1OUT: 
				case REG_T2OUT: {
					res = this.functionRegister[offset];
					this.functionRegister[offset] = 0;

					//logger.log(`SPC700 read: address=${(offset-0xF0).toString(16)}, data=${res.toString(16)}`);

					break;
				}
				default: {
					res = this.functionRegister[offset];
					break;
				}
			}

			//logger.log(`SPC700 read  $${offset.toString(16).padStart(2,0)} = $${res.toString(16).padStart(2,0)}`)

		}
		else if (addr <= 0xFFBF) {
			//ram
			//res = this.ram[addr];
			res = this.bus.read(addr);
		}
		else if (addr <= 0xFFFF) {
			//rom
			const IPLROMEnable = (this.functionRegister[REG_CONTROL] >> 7) & 1;
			res = this.bus.read(addr, IPLROMEnable);
		}
		return res;
	}

	this.write = function(addr, data) {
		if (addr <= 0x00EF) {
			const writeEnable = (this.functionRegister[REG_TEST] >> 1) & 1;
			this.bus.write(addr, data, writeEnable);
		}
		else if (addr <= 0x00FF) {
			//register

			const offset = addr - 0xF0;
			switch (offset) {
				case REG_TEST: {
					this.functionRegister[offset] = data;

					//logger.log(`SPC700 TEST Register = ${data.toString(16).padStart(2, 0)}`);

					break;
				}
				case REG_CONTROL: {
					
					const clearT0RisingEdge = !(this.functionRegister[offset] & 1) && (data & 1);
					const clearT1RisingEdge = !((this.functionRegister[offset] >> 1) & 1) && ((data >> 1) & 1);
					const clearT2RisingEdge = !((this.functionRegister[offset] >> 2) & 1) && ((data >> 2) & 1);
					if (clearT0RisingEdge) {
						this.intervalCounter[0] = 0;
						this.functionRegister[REG_T0OUT] = 0;
					}
					if (clearT1RisingEdge) {
						this.intervalCounter[1] = 0;
						this.functionRegister[REG_T1OUT] = 0;
					}
					if (clearT2RisingEdge) {
						this.intervalCounter[2] = 0;
						this.functionRegister[REG_T2OUT] = 0;
					}

					const clearCPUIOReadPorts01 = (data >> 4) & 1;
					const clearCPUIOReadPorts23 = (data >> 5) & 1;
					if (clearCPUIOReadPorts01) {
						this.portR[0] = 0;
						this.portR[1] = 0;
					}
					if (clearCPUIOReadPorts23) {
						this.portR[2] = 0;
						this.portR[3] = 0;
					}

					//logger.log(`SPC700 write: address=${addr.toString(16)}, data=${data.toString(16)}`);

					this.functionRegister[offset] = data;
					break;
				}
				case REG_DSPADDR: {
					//this.functionRegister[offset] = data;
					this.bus.write(addr, data);

					break;
				}
				case REG_DSPDATA: {
					//this.functionRegister[offset] = data;
					this.bus.write(addr, data);

					break;
				}
				case REG_CPUIO0:
				case REG_CPUIO1:
				case REG_CPUIO2:
				case REG_CPUIO3: {
					this.portW[offset - 0x04] = data;

					//logger.log(`SPC700 write: address=${(addr-0xF4).toString(16)}, data=${data.toString(16)}`);

					break;
				}
				case REG_T0TARGET:
				case REG_T1TARGET: 
				case REG_T2TARGET: {
					this.functionRegister[offset] = data;
					break;
				}
				default: {
					this.functionRegister[offset] = data;
					break;
				}
			}

			//logger.log(`SPC700 write $${addr.toString(16).padStart(2,0)} = $${data.toString(16).padStart(2,0)}`)

		}
		else if (addr <= 0xFFBF) {
			const writeEnable = (this.functionRegister[REG_TEST] >> 1) & 1;
			this.bus.write(addr, data, writeEnable);
		}
		else if (addr <= 0xFFFF) {
			//rom
			const writeEnable = (this.functionRegister[REG_TEST] >> 1) & 1;
			const enableIPLROM = (this.functionRegister[REG_CONTROL] >> 7) & 1;
			this.bus.write(addr, data, writeEnable);
		}
	}

	//scpu -> spc700
	this.readPortW = function(n) {
		const data = this.portW[n];
		//logger.log(`scpu <- port${n}W[${data.toString(16).padStart(2, 0)}] <- spc700`);
		return this.portW[n];
	}
	this.writePortR = function(n, data) {
		this.portR[n] = data;
		//logger.log(`scpu -> port${n}R[${data.toString(16).padStart(2, 0)}] -> spc700`);
	}

	this.getRegPSW = function() {
		let res = 0;
		res |= this.flagC;
		res |= this.flagZ << 1;
		res |= this.flagI << 2;
		res |= this.flagH << 3;
		res |= this.flagB << 4;
		res |= this.flagP << 5;
		res |= this.flagV << 6;
		res |= this.flagN << 7;
		return res;
	}

	this.setRegPSW = function(data) {
		this.flagN = (data >> 7) & 1;
		this.flagV = (data >> 6) & 1;
		this.flagP = (data >> 5) & 1;
		this.flagB = (data >> 4) & 1;
		this.flagH = (data >> 3) & 1;
		this.flagI = (data >> 2) & 1;
		this.flagZ = (data >> 1) & 1;
		this.flagC = data & 1;
	}

	const mnemonicTable =  [
		"NOP",	"JST0",	"SET1",	"BBS",	"ORA",	"ORA",	"ORA",	"ORA",	"ORA",	"ORA",	"ORC",	"ASL",	"ASL",	"PHP",	"TSB",	"BRK",
		"BPL",	"JST1",	"CLR1",	"BBC",	"ORA",	"ORA",	"ORA",	"ORA",	"ORA",	"ORA",	"DEW",	"ASL",	"ASL",	"DEX",	"CPX",	"JMP",
		"CLP",	"JST2",	"SET1",	"BBS",	"AND",	"AND",	"AND",	"AND",	"AND",	"AND",	"ORC",	"ROL",	"ROL",	"PHA",	"CBNE",	"BRA",
		"BMI",	"JST3",	"CLR1",	"BBC",	"AND",	"AND",	"AND",	"AND",	"AND",	"AND",	"INW",	"ROL",	"ROL",	"INX",	"CPX",	"JSR",
		"SEP",	"JST4",	"SET1",	"BBS",	"EOR",	"EOR",	"EOR",	"EOR",	"EOR",	"EOR",	"ANDC",	"LSR",	"LSR",	"PHX",	"TRB",	"JSP",
		"BVC",	"JST5",	"CLR1",	"BBC",	"EOR",	"EOR",	"EOR",	"EOR",	"EOR",	"EOR",	"CPW",	"LSR",	"LSR",	"TAX",	"CPY",	"JMP",
		"CLC",	"JST6",	"SET1",	"BBS",	"CMP",	"CMP",	"CMP",	"CMP",	"CMP",	"CMP",	"ANDC",	"ROR",	"ROR",	"PHY",	"DBNZ",	"RTS",
		"BVS",	"JST7",	"CLR1",	"BBC",	"CMP",	"CMP",	"CMP",	"CMP",	"CMP",	"CMP",	"ADW",	"ROR",	"ROR",	"TXA",	"CPY",	"RTI",
		"SEC",	"JST8",	"SET1",	"BBS",	"ADC",	"ADC",	"ADC",	"ADC",	"ADC",	"ADC",	"EORC",	"DEC",	"DEC",	"LDY",	"PLP",	"MOV",
		"BCC",	"JST9",	"CLR1",	"BBC",	"ADC",	"ADC",	"ADC",	"ADC",	"ADC",	"ADC",	"SBW",	"DEC",	"DEC",	"TSX",	"DIV",	"XCN",
		"SEI",	"JSTA",	"SET1",	"BBS",	"SBC",	"SBC",	"SBC",	"SBC",	"SBC",	"SBC",	"LDC",	"INC",	"INC",	"CPY",	"PLA",	"STA",
		"BCS",	"JSTB",	"CLR1",	"BBC",	"SBC",	"SBC",	"SBC",	"SBC",	"SBC",	"SBC",	"LDW",	"INC",	"INC",	"TXS",	"DAS",	"LDA",
		"CLI",	"JSTC",	"SET1",	"BBS",	"STA",	"STA",	"STA",	"STA",	"CPX",	"STX",	"STC",	"STY",	"STY",	"LDX",	"PLX",	"MUL",
		"BNE",	"JSTD",	"CLR1",	"BBC",	"STA",	"STA",	"STA",	"STA",	"STX",	"STX",	"STW",	"STY",	"DEY",	"TYA",	"CBNE",	"DAA",
		"CLV",	"JSTE",	"SET1",	"BBS",	"LDA",	"LDA",	"LDA",	"LDA",	"LDA",	"LDX",	"NOT",	"LDY",	"LDY",	"NOTC",	"PLY",	"WAI",
		"BEQ",	"JSTF",	"CLR1",	"BBC",	"LDA",	"LDA",	"LDA",	"LDA",	"LDX",	"LDX",	"MOV",	"LDY",	"INY",	"TAY",	"DBNZ",	"STP",
	];

	const addressingModeTable = [	
		"imp",	"imp",	"d.b",	"d.b,r",	"d",	"a",	"(X)",	"(d,X)",	"#",	"dd,ds",	"m.b",	"d",	"a",	"imp",	"a",	"imp",
		"r",	"imp",	"d.b",	"d.b,r",	"d,X",	"a,X",	"a,Y",	"(d),Y",	"d,#",	"(X),(Y)",	"d",	"d,X",	"A",	"imp",	"a",	"(a,X)",
		"imp",	"imp",	"d.b",	"d.b,r",	"d",	"a",	"(X)",	"(d,X)",	"#",	"dd,ds",	"m.b",	"d",	"a",	"imp",	"d",	"r",
		"r",	"imp",	"d.b",	"d.b,r",	"d,X",	"a,X",	"a,Y",	"(d),Y",	"d,#",	"(X),(Y)",	"d",	"d,X",	"A",	"imp",	"d",	"a",
		"imp",	"imp",	"d.b",	"d.b,r",	"d",	"a",	"(X)",	"(d,X)",	"#",	"dd,ds",	"m.b",	"d",	"a",	"imp",	"a",	"imp",
		"r",	"imp",	"d.b",	"d.b,r",	"d,X",	"a,X",	"a,Y",	"(d),Y",	"d,#",	"(X),(Y)",	"d",	"d,X",	"A",	"imp",	"a",	"a",
		"imp",	"imp",	"d.b",	"d.b,r",	"d",	"a",	"(X)",	"(d,X)",	"#",	"dd,ds",	"m.b",	"d",	"a",	"imp",	"d",	"imp",
		"r",	"imp",	"d.b",	"d.b,r",	"d,X",	"a,X",	"a,Y",	"(d),Y",	"d,#",	"(X),(Y)",	"d",	"d,X",	"A",	"imp",	"d",	"imp",
		"imp",	"imp",	"d.b",	"d.b,r",	"d",	"a",	"(X)",	"(d,X)",	"#",	"dd,ds",	"m.b",	"d",	"a",	"#",	"imp",	"d,#",
		"r",	"imp",	"d.b",	"d.b,r",	"d,X",	"a,X",	"a,Y",	"(d),Y",	"d,#",	"(X),(Y)",	"d",	"d,X",	"A",	"imp",	"imp",	"A",
		"imp",	"imp",	"d.b",	"d.b,r",	"d",	"a",	"(X)",	"(d,X)",	"#",	"dd,ds",	"m.b",	"d",	"a",	"#",	"imp",	"(X)+",
		"r",	"imp",	"d.b",	"d.b,r",	"d,X",	"a,X",	"a,Y",	"(d),Y",	"d,#",	"(X),(Y)",	"d",	"d,X",	"A",	"imp",	"imp",	"(X)+",
		"imp",	"imp",	"d.b",	"d.b,r",	"d",	"a",	"(X)",	"(d,X)",	"#",	"a",	"m.b",	"d",	"a",	"#",	"imp",	"imp",
		"r",	"imp",	"d.b",	"d.b,r",	"d,X",	"a,X",	"a,Y",	"(d),Y",	"d",	"d,Y",	"d",	"d,X",	"imp",	"imp",	"d,X",	"imp",
		"imp",	"imp",	"d.b",	"d.b,r",	"d",	"a",	"(X)",	"(d,X)",	"#",	"a",	"m.b",	"d",	"a",	"imp",	"imp",	"imp",
		"r",	"imp",	"d.b",	"d.b,r",	"d,X",	"a,X",	"a,Y",	"(d),Y",	"d",	"d,Y",	"dd,ds",	"d,X",	"imp",	"imp",	"imp",	"imp",
	];

	const instLengthTable = [
		1,	1,	2,	3,	2,	3,	1,	2,	2,	3,	3,	2,	3,	1,	3,	1,
		2,	1,	2,	3,	2,	3,	3,	2,	3,	1,	2,	2,	1,	1,	3,	3,
		1,	1,	2,	3,	2,	3,	1,	2,	2,	3,	3,	2,	3,	1,	3,	2,
		2,	1,	2,	3,	2,	3,	3,	2,	3,	1,	2,	2,	1,	1,	2,	3,
		1,	1,	2,	3,	2,	3,	1,	2,	2,	3,	3,	2,	3,	1,	3,	2,
		2,	1,	2,	3,	2,	3,	3,	2,	3,	1,	2,	2,	1,	1,	3,	3,
		1,	1,	2,	3,	2,	3,	1,	2,	2,	3,	3,	2,	3,	1,	3,	1,
		2,	1,	2,	3,	2,	3,	3,	2,	3,	1,	2,	2,	1,	1,	2,	1,
		1,	1,	2,	3,	2,	3,	1,	2,	2,	3,	3,	2,	3,	2,	1,	3,
		2,	1,	2,	3,	2,	3,	3,	2,	3,	1,	2,	2,	1,	1,	1,	1,
		1,	1,	2,	3,	2,	3,	1,	2,	2,	3,	3,	2,	3,	2,	1,	1,
		2,	1,	2,	3,	2,	3,	3,	2,	3,	1,	2,	2,	1,	1,	1,	1,
		1,	1,	2,	3,	2,	3,	1,	2,	2,	3,	3,	2,	3,	2,	1,	1,
		2,	1,	2,	3,	2,	3,	3,	2,	2,	2,	2,	2,	1,	1,	3,	1,
		1,	1,	2,	3,	2,	3,	1,	2,	2,	3,	3,	2,	3,	1,	1,	1,
		2,	1,	2,	3,	2,	3,	3,	2,	2,	2,	3,	2,	1,	1,	2,	1,
	];

	const instCycleTable = [
		2,	8,	4,	5,	3,	4,	3,	6,	2,	6,	5,	4,	5,	4,	6,	8,
		2,	8,	4,	5,	4,	5,	5,	6,	5,	5,	6,	5,	2,	2,	4,	6,
		2,	8,	4,	5,	3,	4,	3,	6,	2,	6,	5,	4,	5,	4,	5,	4,
		2,	8,	4,	5,	4,	5,	5,	6,	5,	5,	6,	5,	2,	2,	3,	8,
		2,	8,	4,	5,	3,	4,	3,	6,	2,	6,	4,	4,	5,	4,	6,	6,
		2,	8,	4,	5,	4,	5,	5,	6,	5,	5,	4,	5,	2,	2,	4,	3,
		2,	8,	4,	5,	3,	4,	3,	6,	2,	6,	4,	4,	5,	4,	5,	5,
		2,	8,	4,	5,	4,	5,	5,	6,	5,	5,	5,	5,	2,	2,	3,	6,
		2,	8,	4,	5,	3,	4,	3,	6,	2,	6,	5,	4,	5,	2,	4,	5,
		2,	8,	4,	5,	4,	5,	5,	6,	5,	5,	5,	5,	2,	2,	12,	5,
		3,	8,	4,	5,	3,	4,	3,	6,	2,	6,	4,	4,	5,	2,	4,	4,
		2,	8,	4,	5,	4,	5,	5,	6,	5,	5,	5,	5,	2,	2,	3,	4,
		3,	8,	4,	5,	4,	5,	4,	7,	2,	5,	6,	4,	5,	2,	4,	9,
		2,	8,	4,	5,	5,	6,	6,	7,	4,	5,	4,	5,	2,	2,	6,	3,
		2,	8,	4,	5,	3,	4,	3,	6,	2,	4,	5,	3,	4,	3,	4,	3,
		2,	8,	4,	5,	4,	5,	5,	6,	3,	4,	5,	4,	2,	2,	4,	2,
	];

	const instHandler = [
		this.NOP.bind(this),	this.JST.bind(this),	this.SET1.bind(this),	this.BBS.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORC.bind(this),	this.ASL.bind(this),	this.ASL.bind(this),	this.PHP.bind(this),	this.TSB.bind(this),	this.BRK.bind(this),
		this.BPL.bind(this),	this.JST.bind(this),	this.CLR1.bind(this),	this.BBC.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.ORA.bind(this),	this.DEW.bind(this),	this.ASL.bind(this),	this.ASL.bind(this),	this.DEX.bind(this),	this.CPX.bind(this),	this.JMP.bind(this),
		this.CLP.bind(this),	this.JST.bind(this),	this.SET1.bind(this),	this.BBS.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.ORC.bind(this),	this.ROL.bind(this),	this.ROL.bind(this),	this.PHA.bind(this),	this.CBNE.bind(this),	this.BRA.bind(this),
		this.BMI.bind(this),	this.JST.bind(this),	this.CLR1.bind(this),	this.BBC.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.AND.bind(this),	this.INW.bind(this),	this.ROL.bind(this),	this.ROL.bind(this),	this.INX.bind(this),	this.CPX.bind(this),	this.JSR.bind(this),
		this.SEP.bind(this),	this.JST.bind(this),	this.SET1.bind(this),	this.BBS.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.ANDC.bind(this),	this.LSR.bind(this),	this.LSR.bind(this),	this.PHX.bind(this),	this.TRB.bind(this),	this.JSP.bind(this),
		this.BVC.bind(this),	this.JST.bind(this),	this.CLR1.bind(this),	this.BBC.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.EOR.bind(this),	this.CPW.bind(this),	this.LSR.bind(this),	this.LSR.bind(this),	this.TAX.bind(this),	this.CPY.bind(this),	this.JMP.bind(this),
		this.CLC.bind(this),	this.JST.bind(this),	this.SET1.bind(this),	this.BBS.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.ANDC.bind(this),	this.ROR.bind(this),	this.ROR.bind(this),	this.PHY.bind(this),	this.DBNZ.bind(this),	this.RTS.bind(this),
		this.BVS.bind(this),	this.JST.bind(this),	this.CLR1.bind(this),	this.BBC.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.CMP.bind(this),	this.ADW.bind(this),	this.ROR.bind(this),	this.ROR.bind(this),	this.TXA.bind(this),	this.CPY.bind(this),	this.RTI.bind(this),
		this.SEC.bind(this),	this.JST.bind(this),	this.SET1.bind(this),	this.BBS.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.EORC.bind(this),	this.DEC.bind(this),	this.DEC.bind(this),	this.LDY.bind(this),	this.PLP.bind(this),	this.MOV.bind(this),
		this.BCC.bind(this),	this.JST.bind(this),	this.CLR1.bind(this),	this.BBC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.ADC.bind(this),	this.SBW.bind(this),	this.DEC.bind(this),	this.DEC.bind(this),	this.TSX.bind(this),	this.DIV.bind(this),	this.XCN.bind(this),
		this.SEI.bind(this),	this.JST.bind(this),	this.SET1.bind(this),	this.BBS.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.LDC.bind(this),	this.INC.bind(this),	this.INC.bind(this),	this.CPY.bind(this),	this.PLA.bind(this),	this.STA.bind(this),
		this.BCS.bind(this),	this.JST.bind(this),	this.CLR1.bind(this),	this.BBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.SBC.bind(this),	this.LDW.bind(this),	this.INC.bind(this),	this.INC.bind(this),	this.TXS.bind(this),	this.DAS.bind(this),	this.LDA.bind(this),
		this.CLI.bind(this),	this.JST.bind(this),	this.SET1.bind(this),	this.BBS.bind(this),	this.STA.bind(this),	this.STA.bind(this),	this.STA.bind(this),	this.STA.bind(this),	this.CPX.bind(this),	this.STX.bind(this),	this.STC.bind(this),	this.STY.bind(this),	this.STY.bind(this),	this.LDX.bind(this),	this.PLX.bind(this),	this.MUL.bind(this),
		this.BNE.bind(this),	this.JST.bind(this),	this.CLR1.bind(this),	this.BBC.bind(this),	this.STA.bind(this),	this.STA.bind(this),	this.STA.bind(this),	this.STA.bind(this),	this.STX.bind(this),	this.STX.bind(this),	this.STW.bind(this),	this.STY.bind(this),	this.DEY.bind(this),	this.TYA.bind(this),	this.CBNE.bind(this),	this.DAA.bind(this),
		this.CLV.bind(this),	this.JST.bind(this),	this.SET1.bind(this),	this.BBS.bind(this),	this.LDA.bind(this),	this.LDA.bind(this),	this.LDA.bind(this),	this.LDA.bind(this),	this.LDA.bind(this),	this.LDX.bind(this),	this.NOT.bind(this),	this.LDY.bind(this),	this.LDY.bind(this),	this.NOTC.bind(this),	this.PLY.bind(this),	this.WAI.bind(this),
		this.BEQ.bind(this),	this.JST.bind(this),	this.CLR1.bind(this),	this.BBC.bind(this),	this.LDA.bind(this),	this.LDA.bind(this),	this.LDA.bind(this),	this.LDA.bind(this),	this.LDX.bind(this),	this.LDX.bind(this),	this.MOV.bind(this),	this.LDY.bind(this),	this.INY.bind(this),	this.TAY.bind(this),	this.DBNZ.bind(this),	this.STP.bind(this),
	];
}


const REG_VOLLn = 0x00;
const REG_VOLRn = 0x01;
const REG_PITCHLn = 0x02;
const REG_PITCHHn = 0x03;
const REG_SRCNn = 0x04;
const REG_ADSR1n = 0x05;
const REG_ADSR2n = 0x06;
const REG_GAINn = 0x07;
const REG_ENVXn = 0x08;
const REG_OUTXn = 0x09;

const REG_MVOLL = 0x0C;
const REG_MVOLR = 0x1C;
const REG_EVOLL = 0x2C;
const REG_EVOLR = 0x3C;
const REG_KON = 0x4C;
const REG_KOFF = 0x5C;
const REG_FLG = 0x6C;
const REG_ENDX = 0x7C;

const REG_EFB = 0x0D;
const REG_PMON = 0x2D;
const REG_NON = 0x3D;
const REG_EON = 0x4D;
const REG_DIR = 0x5D;
const REG_ESA = 0x6D;
const REG_EDL = 0x7D;

const REG_FIRn = 0x0F;

const inf = 2^32-1;

const gaussTable = [
	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,	0x000,
	0x001,	0x001,	0x001,	0x001,	0x001,	0x001,	0x001,	0x001,	0x001,	0x001,	0x001,	0x002,	0x002,	0x002,	0x002,	0x002,
	0x002,	0x002,	0x003,	0x003,	0x003,	0x003,	0x003,	0x004,	0x004,	0x004,	0x004,	0x004,	0x005,	0x005,	0x005,	0x005,
	0x006,	0x006,	0x006,	0x006,	0x007,	0x007,	0x007,	0x008,	0x008,	0x008,	0x009,	0x009,	0x009,	0x00A,	0x00A,	0x00A,
	0x00B,	0x00B,	0x00B,	0x00C,	0x00C,	0x00D,	0x00D,	0x00E,	0x00E,	0x00F,	0x00F,	0x00F,	0x010,	0x010,	0x011,	0x011,
	0x012,	0x013,	0x013,	0x014,	0x014,	0x015,	0x015,	0x016,	0x017,	0x017,	0x018,	0x018,	0x019,	0x01A,	0x01B,	0x01B,
	0x01C,	0x01D,	0x01D,	0x01E,	0x01F,	0x020,	0x020,	0x021,	0x022,	0x023,	0x024,	0x024,	0x025,	0x026,	0x027,	0x028,
	0x029,	0x02A,	0x02B,	0x02C,	0x02D,	0x02E,	0x02F,	0x030,	0x031,	0x032,	0x033,	0x034,	0x035,	0x036,	0x037,	0x038,
	0x03A,	0x03B,	0x03C,	0x03D,	0x03E,	0x040,	0x041,	0x042,	0x043,	0x045,	0x046,	0x047,	0x049,	0x04A,	0x04C,	0x04D,
	0x04E,	0x050,	0x051,	0x053,	0x054,	0x056,	0x057,	0x059,	0x05A,	0x05C,	0x05E,	0x05F,	0x061,	0x063,	0x064,	0x066,
	0x068,	0x06A,	0x06B,	0x06D,	0x06F,	0x071,	0x073,	0x075,	0x076,	0x078,	0x07A,	0x07C,	0x07E,	0x080,	0x082,	0x084,
	0x086,	0x089,	0x08B,	0x08D,	0x08F,	0x091,	0x093,	0x096,	0x098,	0x09A,	0x09C,	0x09F,	0x0A1,	0x0A3,	0x0A6,	0x0A8,
	0x0AB,	0x0AD,	0x0AF,	0x0B2,	0x0B4,	0x0B7,	0x0BA,	0x0BC,	0x0BF,	0x0C1,	0x0C4,	0x0C7,	0x0C9,	0x0CC,	0x0CF,	0x0D2,
	0x0D4,	0x0D7,	0x0DA,	0x0DD,	0x0E0,	0x0E3,	0x0E6,	0x0E9,	0x0EC,	0x0EF,	0x0F2,	0x0F5,	0x0F8,	0x0FB,	0x0FE,	0x101,
	0x104,	0x107,	0x10B,	0x10E,	0x111,	0x114,	0x118,	0x11B,	0x11E,	0x122,	0x125,	0x129,	0x12C,	0x130,	0x133,	0x137,
	0x13A,	0x13E,	0x141,	0x145,	0x148,	0x14C,	0x150,	0x153,	0x157,	0x15B,	0x15F,	0x162,	0x166,	0x16A,	0x16E,	0x172,
	0x176,	0x17A,	0x17D,	0x181,	0x185,	0x189,	0x18D,	0x191,	0x195,	0x19A,	0x19E,	0x1A2,	0x1A6,	0x1AA,	0x1AE,	0x1B2,
	0x1B7,	0x1BB,	0x1BF,	0x1C3,	0x1C8,	0x1CC,	0x1D0,	0x1D5,	0x1D9,	0x1DD,	0x1E2,	0x1E6,	0x1EB,	0x1EF,	0x1F3,	0x1F8,
	0x1FC,	0x201,	0x205,	0x20A,	0x20F,	0x213,	0x218,	0x21C,	0x221,	0x226,	0x22A,	0x22F,	0x233,	0x238,	0x23D,	0x241,
	0x246,	0x24B,	0x250,	0x254,	0x259,	0x25E,	0x263,	0x267,	0x26C,	0x271,	0x276,	0x27B,	0x280,	0x284,	0x289,	0x28E,
	0x293,	0x298,	0x29D,	0x2A2,	0x2A6,	0x2AB,	0x2B0,	0x2B5,	0x2BA,	0x2BF,	0x2C4,	0x2C9,	0x2CE,	0x2D3,	0x2D8,	0x2DC,
	0x2E1,	0x2E6,	0x2EB,	0x2F0,	0x2F5,	0x2FA,	0x2FF,	0x304,	0x309,	0x30E,	0x313,	0x318,	0x31D,	0x322,	0x326,	0x32B,
	0x330,	0x335,	0x33A,	0x33F,	0x344,	0x349,	0x34E,	0x353,	0x357,	0x35C,	0x361,	0x366,	0x36B,	0x370,	0x374,	0x379,
	0x37E,	0x383,	0x388,	0x38C,	0x391,	0x396,	0x39B,	0x39F,	0x3A4,	0x3A9,	0x3AD,	0x3B2,	0x3B7,	0x3BB,	0x3C0,	0x3C5,
	0x3C9,	0x3CE,	0x3D2,	0x3D7,	0x3DC,	0x3E0,	0x3E5,	0x3E9,	0x3ED,	0x3F2,	0x3F6,	0x3FB,	0x3FF,	0x403,	0x408,	0x40C,
	0x410,	0x415,	0x419,	0x41D,	0x421,	0x425,	0x42A,	0x42E,	0x432,	0x436,	0x43A,	0x43E,	0x442,	0x446,	0x44A,	0x44E,
	0x452,	0x455,	0x459,	0x45D,	0x461,	0x465,	0x468,	0x46C,	0x470,	0x473,	0x477,	0x47A,	0x47E,	0x481,	0x485,	0x488,
	0x48C,	0x48F,	0x492,	0x496,	0x499,	0x49C,	0x49F,	0x4A2,	0x4A6,	0x4A9,	0x4AC,	0x4AF,	0x4B2,	0x4B5,	0x4B7,	0x4BA,
	0x4BD,	0x4C0,	0x4C3,	0x4C5,	0x4C8,	0x4CB,	0x4CD,	0x4D0,	0x4D2,	0x4D5,	0x4D7,	0x4D9,	0x4DC,	0x4DE,	0x4E0,	0x4E3,
	0x4E5,	0x4E7,	0x4E9,	0x4EB,	0x4ED,	0x4EF,	0x4F1,	0x4F3,	0x4F5,	0x4F6,	0x4F8,	0x4FA,	0x4FB,	0x4FD,	0x4FF,	0x500,
	0x502,	0x503,	0x504,	0x506,	0x507,	0x508,	0x50A,	0x50B,	0x50C,	0x50D,	0x50E,	0x50F,	0x510,	0x511,	0x511,	0x512,
	0x513,	0x514,	0x514,	0x515,	0x516,	0x516,	0x517,	0x517,	0x517,	0x518,	0x518,	0x518,	0x518,	0x518,	0x519,	0x519,
];

const ADSRRateTable = [
	 inf, 2048, 1536, 1200,
	1024,  768,  640,  512,
	 384,  320,  256,  192,
	 160,  120,   96,   80,
	  64,   48,   40,   32,
	  24,   20,   16,   12,
	  10,   8,     6,    5,
	   4,    3,    2,    1,
];

const ADSR_STATE_ATTACK = 0;
const ADSR_STATE_DECAY = 1;
const ADSR_STATE_SUSTAIN = 2;
const ADSR_STATE_RELEASE = 3;

const noiseClockTable = [
	   0,   16,   21,   25,   31,    42,    50,    63,
	  83,  100,  125,  167,  200,   250,   333,   400,
	 500,  667,  800, 1000, 1300,  1600,  2000,  2700,
	3200, 4000, 5300, 6400, 8000, 10700, 16000, 32000,
];

function DSP() {

	this.register = new Uint8Array(128);
	this.DSPADDR;

	this.bus;

	this.voiceInfo = new Array(8);
	this.echoBufferHead;
	this.noiseClockCounter;
	this.noiseLevel;

	this.reset = function(bus) {
		this.bus = bus;

		for (let i = 0; i < 128; i++) {
			this.register[i] = 0;
		}
		this.register[REG_FLG] = 0xE0;

		this.DSPADDR = 0;

		for (let i = 0; i < 8; i++) {
			this.voiceInfo[i] = {
				currentRFAddr: 0,
				BBRSampleBuffer: [0, 0, 0, 0],
				ADSRState: 0,
				envelopeCounter: 0,
				envelopeLevel: 0,
			};

		}

		this.echoBufferHead = 0;
		this.noiseClockCounter = 0;
		this.noiseLevel = 0;
	}

	this.writeDSPADDR = function(addr) {
		this.DSPADDR = addr;
	}

	this.readDSPADDR = function() {
		return this.DSPADDR;
	}
	
	this.readDSPDATA = function() {
		const addr = this.DSPADDR & 0x7F;
		const res = this.register[addr];
		//logger.log(`spc700 read dsp register[$${addr.toString(16).padStart(2, 0)}] = $${res.toString(16)}`);
		return res;
	}

	this.writeDSPDATA = function(data) {
		const readOnly = (this.DSPADDR >> 7) & 1;
		if (!readOnly) {
			const addr = this.DSPADDR & 0x7F;
			const n = (this.DSPADDR >> 4) & 15;
			this.register[addr] = data;
		
			switch (addr) {
				case REG_KON: {	//反映までに5サンプル分遅延あり
					const dir = this.register[REG_DIR];
					const srcn = this.register[(n << 4) | REG_SRCNn];
					this.voiceInfo[n].currentRFAddr = dir * 0x100 + srcn * 4;
					this.voiceInfo[n].BBRSampleBuffer = [0, 0, 0, 0];
					this.voiceInfo[n].ADSRState = ADSR_STATE_ATTACK;
					this.voiceInfo[n].envelopeCounter = 0;
					this.voiceInfo[n].envelopeLevel = 0;

					break;
				}
				case REG_KOFF: {
					this.voiceInfo[n].ADSRState = ADSR_STATE_RELEASE;

					break;
				}
			}

			//logger.log(`spc700 write dsp register[$${addr.toString(16).padStart(2, 0)}] = $${data.toString(16)}`);
		}
	}

	this.clock = function() {

		const kon = this.register[REG_KON];
		const output = new Int16Array(8);
		for (let n = 0; n < 8; n++) {

			const keyonFlag = (kon >> n) & 1;
			if (keyonFlag === 1) {
				let sample1 = this.fetchBBRSample(n);
				
				let sample2 = this.decodeBBRSample(n, sample1);
				this.pushBBRSample(n, sample2);

				let sample3 = this.applyGaussianInterpolation(n);
				let sample4 = this.switchNoiseSample(n, sample3);
				let sample5 = this.applyADSR(n, sample4);

				this.updateBBRSample(n);

				output[n] = sample5;
			}
			else {
				output[n] = 0;
				this.register[(n << 4) | REG_ENVXn] = 0;
				this.register[(n << 4) | REG_OUTXn] = 0;
			}
		}

		let [outputL, outputR] = this.mixer(output);

		//ステレオの場合はどうする？
		//push(outputL);

		const FLG = this.register[REG_FLG];
		const muteFlag = (FLG >> 6) & 1;
		if (muteFlag === 1) {
			outputR = 0;
			outputL = 0;
		}

		this.updateNoiseSample();
	}
	
	this.fetchBBRSample = function(n) {
		const sampleNumber = (this.voiceInfo[n].pitchCounter >> 12) & 15;
		const sampleAddr = this.voiceInfo[n].currentRFAddr + 1 + (sampleNumber >> 1);
		const sample = this.bus.read(sampleAddr);
		if (sampleNumber & 1) {
			return sample & 15
		}
		else {
			return (sample >> 4) & 15;
		}
	}

	this.decodeBBRSample = function(n, sample) {
		const v = this.voiceInfo[n];

		const RF = this.bus.read(v.currentRFAddr);
		const shift = (RF >> 4) & 15;
		const filterMode = (RF >> 2) & 3;
		
		let a = 0, b = 0;
		if (filterMode === 1) {
			a = 0.09375;
		}
		else if (filterMode === 2) {
			a = 1.90625;
			b = -0.9375;
		}
		else if (filterMode === 3) {
			a = 1.796875;
			b = -0.8125;
		}
		
		let res = sample << shift;
		res += a * v.BBRSampleBuffer[0];
		res += b * v.BBRSampleBuffer[1];

		return res;
	}

	this.pushBBRSample = function(n, sample) {
		const v = this.voiceInfo[n];
		v.BBRSampleBuffer[3] = v.BBRSampleBuffer[2];
		v.BBRSampleBuffer[2] = v.BBRSampleBuffer[1];
		v.BBRSampleBuffer[1] = v.BBRSampleBuffer[0];
		v.BBRSampleBuffer[0] = sample;
	}

	this.applyGaussianInterpolation = function(n) {
		const v = this.voiceInfo[n];
		const index = (v.pitchCounter >> 3) & 0x1FF;

		let res = gaussTable[0x0FF - index] * v.BBRSampleBuffer[3];
		res += gaussTable[0x1FF - index] * v.BBRSampleBuffer[2];
		res += gaussTable[0x100 + index] * v.BBRSampleBuffer[1];
		res += gaussTable[0x000 + index] * v.BBRSampleBuffer[0];
		
		return res;
	}
	
	this.updateBBRSample = function(n) {
		
		const v = this.voiceInfo[n];

		const pitchh = this.register[(n << 4) | REG_PITCHHn];
		const pitchl = this.register[(n << 4) | REG_PITCHLn];
		let step = (pitchh << 8) | pitchl;

		const pmon = this.register[(n << 4) | REG_PMON];
		const pitchModulationEnableFlag = (pmon >> n) & 1;
		if (n > 0 && pitchModulationEnableFlag === 1) {
			let fractor = this.register[((n - 1) << 4) | REG_OUTXn];
			fractor = (fractor >> 4) + 0x400;
			step = (step + fractor) >> 10;
		}
		v.pitchCounter += step;

		const carryFlag = (v.pitchCounter >> 16) & 1;
		if (carryFlag === 1) {
			const RF = this.bus.read(v.currentRFAddr);
			const loopFlag = (RF >> 1) & 1;
			const endFlag = RF & 1;
			if (endFlag === 1) {
				if (loopFlag === 1) {
					const dir = this.register[(n << 4) | REG_DIR];
					const src = this.register[(n << 4) | REG_SRCNn];
					const addr = dir * 0x100 + src * 4;
					const loopAddrL = this.bus.read(addr + 2);
					const loopAddrH = this.bus.read(addr + 3);
					this.currentRFAddr = (loopAddrH << 8) | loopAddrL;
				}
				else {
					this.mute(n);
				}
				this.register[(1 << n) | REG_ENDX] |= (1 << n);
			}
			else {
				v.currentRFAddr += 9;
			}

			v.pitchCounter &= 0xFFFF;
		}

	}

	this.applyADSR = function(n, sample) {

		const adsr1 = this.register[(n << 4) | REG_ADSR1n];
		const adsr2 = this.register[(n << 4) | REG_ADSR2n];
		const gain = this.register[(n << 4) | REG_GAINn];
		let period, step, threshold;
		
		const v = this.voiceInfo[n];
		if (v.ADSRState === ADSR_STATE_ATTACK) {
			const ar = adsr1 & 15;
			const rate = ar * 2 + 1;
			period = ADSRRateTable[rate];
			step = 32;
			threshold = 2047;
		}
		else if (v.ADSRState === ADSR_STATE_DECAY) {
			const dr = (adsr1 >> 4) & 7;
			const sl = (adsr2 >> 13) & 7;
			const rate = dr * 2 + 16;
			period = ADSRRateTable[rate];
			step = -(((v.envelopeLevel - 1) >> 8) + 1);
			threshold = (sl + 1) * 0x100;
		}
		else if (v.ADSRState === ADSR_STATE_SUSTAIN) {
			const sr = adsr2 & 31;
			const sl = (adsr2 >> 13) & 7;
			const rate = sr * 2 + 16;
			period = ADSRRateTable[rate];
			step = -(((v.envelopeLevel - 1) >> 8) + 1);
			threshold = 0;
		}
		else if (v.ADSRState === ADSR_STATE_RELEASE) {
			period = ADSRRateTable[31];
			step = -8;
			threshold = 0;
		}

		const gainSelect = (adsr1 >> 7) & 1;
		if (gainSelect === 1) {
			const customGain = (gain >> 7) & 1;
			if (customGain === 1) {
				const gainMode = (gain >> 5) & 3;
				const rate = gain & 31;
				period = ADSRRateTable[rate];

				if (gainMode === 0) {
					step = -32;
					threshold = 0;
				}
				else if (gainMode === 1) {
					step = -(((v.envelopeLevel - 1) >> 8) + 1);
					threshold = 0;
				}
				else if (gainMode === 2) {
					step = 32;
					threshold = 2047;
				}
				else if (gainMode === 3) {
					if (v.envelopeLevel < 0x600) {
						step = 32;
					}
					else {
						step = 8;
					}
					threshold = 2047;
				}
			}
			else {
				const fixedVolume = gain & 63;
				v.envelopeLevel = fixedVolume * 16;
				v.envelopeCounter = 0;
				period = inf;
				step = 0;
				threshold = 0;
		
			}
		}

		v.envelopeCounter++;
		if (v.envelopeCounter >= period) {
			v.envelopeCounter = 0;
			v.envelopeLevel += step;

			if ((step > 0 && v.envelopeLevel >= threshold) ||
				(step < 0 && v.envelopeLevel <= threshold))
			{
				v.envelopeCounter = threshold;
				if (v.ADSRState < ADSR_STATE_SUSTAIN) {
					v.ADSRState++;
				}
			}
		}

		let res = sample * v.envelopeLevel;
		this.register[(n << 4) | REG_ENVXn] = (v.envelopeLevel >> 4) & 127;
		this.register[(n << 4) | REG_OUTXn] = (res >> 7) & 255;
		return res;

	}

	this.mixer = function(output) {
		
		const eon = this.register[REG_EON];

		let mainL = 0, mainR = 0, subL = 0, subR = 0;
		for (let n = 0; n < 8; n++) {
			const voll = this.register[(n << 4) | REG_VOLLn];
			const volr = this.register[(n << 4) | REG_VOLRn];
			const outputL = this.applyVolume(output, voll);
			const outputR = this.applyVolume(output, volr);

			mainL += outputL;
			mainR += outputR;
			
			const enableEcho = (eon >> n) & 1;
			if (enableEcho) {
				subL += outputL;
				subR += outputR;
			}
		}

		this.pushEchoBuffer(subL, subR);
		const [echoL, echoR] = this.applyEcho();
		
		const resL = this.applyVolume(mainL, this.register[REG_MVOLL]) + this.applyVolume(echoL, this.register[REG_EVOLL]);
		const resR = this.applyVolume(mainR, this.register[REG_MVOLR]) + this.applyVolume(echoR, this.register[REG_EVOLR]);
	
		return [resL, resR];
	}

	this.applyEcho = function() {
		
		const esa = this.register[REG_ESA];
		const edl = this.register[REG_EDL];

		const echoBufferBase = esa * 256;
		let echoBufferSize = (edl & 15) * 2048;
		if (echoBufferSize === 0) {
			echoBufferSize = 4;
		}

		//push後なので4*(8+1)=36
		let tail = this.echoBufferHead - 36;
		if (tail < echoBufferBase) {
			tail += echoBufferSize;
		}

		let resL = 0, resR = 0;
		for (let n = 0; n < 8; n++) {
			const echoBufferL = (this.bus.read(tail + 1) << 8) | this.bus.read(tail);
			const echoBufferR = (this.bus.read(tail + 3) << 8) | this.bus.read(tail + 2);
			resL += echoBufferL * this.register[(n << 4) | REG_FIRn];
			resR += echoBufferR * this.register[(n << 4) | REG_FIRn];

			tail += 4;
			if (tail > echoBufferBase + echoBufferSize) {
				tail -= echoBufferSize;
			}
		}

		return [resL, resR];
	}
	
	this.pushEchoBuffer = function(outputL, outputR) {
		const flg = this.register[REG_FLG];

		const echoBufferWriteDisable = (flg >> 5) & 1;
		if (echoBufferWriteDisable === 0) {
			const esa = this.register[REG_ESA];
			const edl = this.register[REG_EDL];

			const echoBufferBase = esa * 256;

			let echoBufferSize = (edl & 15) * 2048;
			if (echoBufferSize === 0) {
				echoBufferSize = 4;
			}

			this.bus.write(this.echoBufferHead, outputL & 0xFF);
			this.bus.write(this.echoBufferHead + 1, (outputL >> 8) & 0xFF);
			this.bus.write(this.echoBufferHead + 2, outputR & 0xFF);
			this.bus.write(this.echoBufferHead + 3, (outputR >> 8) & 0xFF);

			this.echoBufferHead += 4;
			if (this.echoBufferHead > echoBufferBase + echoBufferSize) {
				this.echoBufferHead = echoBufferBase;
			}
		}
	}

	this.switchNoiseSample = function(n, sample) {
		let res = sample;

		const non = this.register[REG_NON];
		const noiseEnable = (non >> n) & 1;
		if (noiseEnable === 1) {
			res = this.noiseLevel;
		}

		return res;
	}

	this.updateNoiseSample = function() {
		const flg = this.register[REG_FLG];
		const nck = flg & 31;
		const threshold = 32000 / noiseClockTable[nck] | 0;

		this.noiseClockCounter++;
		if (this.noiseClockCounter >= threshold) {
			this.noiseClockCounter = 0;
			const noiseLevelBit0 = this.noiseLevel & 1;
			const noiseLevelBit1 = (this.noiseLevel >> 1) & 1;
			this.noiseLevel = ((this.noiseLevel >> 1) & 0x3FF) | (noiseLevelBit0 ^ noiseLevelBit1)
		}
	}

	this.applyVolume = function(sample, volume) {
		let value = volume & 127;
		const negativeFlag = (volume >> 7) & 1;
		if (negativeFlag) {
			value = -value;
		}
		const res = sample * value;
		return res;
	}

	this.mute = function(n) {
		this.voiceInfo[n].ADSRState = ADSR_STATE_RELEASE;
	}

}

const audioContext = new AudioContext({sampleRate: 44100});
await audioContext.audioWorklet.addModule("mixer.js");
const mixer = new AudioWorkletNode(audioContext, "mixer");
mixer.connect(audioContext.destination);

const buf = [];
function push(data) {
	buf.push(data);
	
	if (buf.length === 128) {
		mixer.port.postMessage(buf);
		buf.length = 0;
	}
}
