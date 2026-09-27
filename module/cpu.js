
import { logger } from "./logger.js"

export function CPU() {
	//レジスタ
	this.reg = {};
	this.reg.a = 0;
	this.reg.dbr = 0;
	this.reg.d = 0;
	this.reg.k = 0;
	this.reg.pc = 0;
	this.reg.s = 0;
	this.reg.x = 0;
	this.reg.y = 0;

	this.flag = {};
	this.flag.e = 0;
	this.flag.n = 0;	//bit7
	this.flag.v = 0;	//bit6
	this.flag.m = 0;	//bit5
	this.flag.x = 0;	//bit4
	this.flag.d = 0;	//bit3
	this.flag.i = 0;	//bit2
	this.flag.z = 0;	//bit1
	this.flag.c = 0;	//bit0

	//this.assertDMAFlag = 0;
	this.assertRSTFlag = 0;
	this.assertNMIFlag = 0;
	this.assertIRQFlag = 0;
	this.assertBRKFlag = 0;
	this.assertCOPFlag = 0;

	//cpu停止フラグ(stp命令でセット)
	this.halt = 0;
	
	//割込み待ちフラグ(wai命令でセット)
	this.waitInterrupt = 0;

	this.cartridge = undefined;
	this.ppu = undefined;
	this.apu = undefined;
	this.controller = undefined;

	//WRAM
	this.wram = new Array(0x2_0000);

	//this.wmdata = 0;
	this.wmaddl = 0;
	this.wmaddm = 0;
	this.wmaddh = 0;
	
	//dma
	this.mdmaen = 0;	//420b
	this.hdmaen = 0;	//420c
	this.dmapx = new Array(8).fill(0);	//43x0
	this.bbadx = new Array(8).fill(0);	//43x1
	this.a1txl = new Array(8).fill(0);	//43x2
	this.a1txh = new Array(8).fill(0);	//43x3
	this.a1bx  = new Array(8).fill(0);	//43x4
	this.dasxl = new Array(8).fill(0);	//43x5
	this.dasxh = new Array(8).fill(0);	//43x6
	this.dasbx = new Array(8).fill(0);	//43x7
	this.a2axl = new Array(8).fill(0);	//43x8
	this.a2axh = new Array(8).fill(0);	//43x9
	this.ntrlx = new Array(8).fill(0);	//43xA
	this.unusedx = new Array(8).fill(0);	//43xB/43xF

	this.HDMAtransferred = new Array(8).fill(0);

	//オープンバス
	this.mdr = 0;

	this.reset = function(cartridge, ppu, apu, controller) {
		this.waitCycle = 0;
		this.cartridge = cartridge;
		this.ppu = ppu;
		this.apu = apu;
		this.controller = controller;

		for (let i = 0; i < this.wram.length; i++) {
			this.wram[i] = 0;
		}

		this.assertRSTFlag = 1;
		this.assertNMIFlag = 0;
		this.assertIRQFlag = 0;

		//this.logs = [];
	}

	this.performHDMA = 0;
	this.reloadHDMA = 0;

	this.HBlankFlag = 0;
	this.assertHBlank = function(flag) {
		if (this.HBlankFlag !== flag) {
			if (flag) {
				//HBlank開始
				this.performHDMA = 1;
			}
			else {
				//HBlank終了
			}
		}
		this.HBlankFlag = flag;
	}
	
	this.VBlankFlag = 0;
	this.assertVBlank = function(flag) {
		if (this.VBlankFlag !== flag) {
			if (flag) {
				this.reloadHDMA = 0;
			}
			else {
				//VBlank終了
				this.reloadHDMA = 1;
				//console.log("reload HDMA register", this.hdmaen.toString(2).padStart(8, 0));
				for (let ch = 0; ch < 8; ch++) {
					if ((this.hdmaen >> ch) & 1) {
						this.a2axl[ch] = this.a1txl[ch];
						this.a2axh[ch] = this.a1txh[ch];

						let addr = (this.a1bx[ch] << 16) | (this.a1txh[ch] << 8) | this.a1txl[ch];
						const entry = this.read(addr++);
						this.ntrlx[ch] = entry;

						const addressingMode = (this.dmapx[ch] >> 6) & 1;
						if (addressingMode === 1) {
							this.dasxl[ch] = this.read(addr++);
							this.dasxh[ch] = this.read(addr++);
						}

						this.a2axh[ch] = (addr >> 8) & 0xFF;
						this.a2axl[ch] = addr & 0xFF;
						
						//logger.log(`ch#${ch} ${this.a2axh[ch].toString(16).padStart(2, 0)}${this.a2axl[ch].toString(16).padStart(2, 0)}`);

						//console.log("ntrlx[", ch, "]=", this.ntrlx[ch].toString(2).padStart(8, 0), "HDMATAble:", addr.toString(16).padStart(6,0));

						this.HDMAtransferred[ch] = 0;

						{
							const transferDirection = (this.dmapx[ch] >> 7) & 1;
							const addressingMode = (this.dmapx[ch] >> 6) & 1;
							const transferUnitSelect = this.dmapx[ch] & 7;
							const transferBytes = transferModeTable[transferUnitSelect].length;

							const BBUsAddress = 0x2100 | this.bbadx[ch];

							// console.log("-----");
							// console.log("[HDMA] CH:", ch, "Mode:", (addressingMode ? "Indirect" : "Direct"));

							// for (let i = 0; ; i++) {
							// 	const currentAddr = addr + i * (transferBytes + 1);
							// 	const entry = this.read(currentAddr);
							// 	if (entry === 0) break;
							// 	const repeatFlag = (entry >> 7) & 1;
							// 	const lineCount = entry & 0x7F;
							// 	console.log("repeat:", repeatFlag, "lineCount:", lineCount, "transferBytes:", transferBytes);
							// 	for (let j = 0; j < transferBytes; j++) {
							// 		const data = this.read(currentAddr + j + 1);
							// 		console.log("[HDMA] CPU $", (currentAddr + j + 1).toString(16).padStart(4, 0), (transferDirection ? "<-" : "->"), BBUsAddress.toString(16), "data:", data.toString(2).padStart(8, 0));
							// 	}
							// }
						}
					}
				}
			}
		}
		this.VBlankFlag = flag;
	}

	this.logs = [];
	this.breakpoint = 0;
	this.clock = function(clock, debug = 0) {

		if (clock % 6 !== 0) return;

		const scanline = (clock / 1364) | 0;
		const cycle = clock % 1364;

		// if (cycle === 536) {
		// 	//DRAM(WRAM) Refresh
		// 	this.waitCycle += 40;
		// }

		if (this.waitCycle <= 0) {
			if (this.performHDMA && this.reloadHDMA && this.hdmaen) {
				this.performHDMA = 0;
				this.waitCycle = this.HDMA();
			}
			else if (this.mdmaen) {
				this.waitCycle = this.GPDMA();
			}
			else if (this.assertRSTFlag || this.assertNMIFlag || this.assertBRKFlag || this.assertCOPFlag) {
				this.interrupt();
			}
			else if (!this.flag.i && this.assertIRQFlag) {
				this.interrupt();
			}
			else if (!this.waitInterrupt) {
				const pc = (this.reg.k << 16) | this.reg.pc;
				const opcode = this.fetch();
				const mnemonic = this.mnemonicMatrix[opcode];
				const mode = this.modeMatrix[opcode];
				const cycleNum = this.cycleMatrix[opcode];
				const {op, addr} = this.decode(mode, mnemonic);

				const prevRegX = this.reg.x;

				this.waitCycle = this.execute(mnemonic, addr, mode) + cycleNum;

				if (debug) {
					//logger.log("-----");
					//console.log(this.ppu.debug());
					
					let log = "";
					log += "[" + pc.toString(16).padStart(6, 0) + "]";
					log += "$" + opcode.toString(16).padStart(2, 0) + " ";
					log += mnemonic + " ";
					log += ((op.length > 0) ? "$" + op[0].toString(16).padStart(2, 0) : "   ") + " ";
					log += ((op.length > 1) ? "$" + op[1].toString(16).padStart(2, 0) : "   ") + " ";
					log += ((op.length > 2) ? "$" + op[2].toString(16).padStart(2, 0) : "   ") + " ";
					if (addr[0] != undefined) log += "$" + addr[0].toString(16).padStart(4, 0) + " ";
					if (addr[1] != undefined) log += "$" + addr[1].toString(16).padStart(4, 0) + " ";
					if (addr[2] != undefined) log += "$" + addr[2].toString(16).padStart(4, 0) + " ";
					//console.log(`${log}`);
					//this.logs.push(log);
					//logger.log(`scanline:${scanline.toString(10).padStart(3)} cycle:${cycle.toString(10).padStart(3)}`);
					logger.log(log);
					
					log = "";
					log += "a:" + this.reg.a.toString(16).padStart(4, 0) + " ";
					log += "dbr:" + this.reg.dbr.toString(16).padStart(2, 0) + " ";
					log += "d:" + this.reg.d.toString(16).padStart(4, 0) + " ";
					log += "k:" + this.reg.k.toString(16).padStart(2, 0) + " ";
					log += "pc:" + this.reg.pc.toString(16).padStart(4, 0) + " ";
					log += "s:" + this.reg.s.toString(16).padStart(4, 0) + " ";
					log += "x:" + this.reg.x.toString(16).padStart(4, 0) + " ";
					log += "y:" + this.reg.y.toString(16).padStart(4, 0);
					//console.log(log);
					//this.logs.push(log);
					logger.log(log);

					log = "";
					log += "e:" + this.flag.e + " ";
					log += "n:" + this.flag.n + " ";
					log += "v:" + this.flag.v + " ";
					log += "m:" + this.flag.m + " ";
					log += "x:" + this.flag.x + " ";
					log += "d:" + this.flag.d + " ";
					log += "i:" + this.flag.i + " ";
					log += "z:" + this.flag.z + " ";
					log += "c:" + this.flag.c;
					//console.log(log);
					//this.logs.push(log);
					logger.log(log);
				}
			}
			
		}

		if (this.waitCycle > 0) {
			this.waitCycle--;
		}
	}

	const transferModeTable = [
		[0], [0, 1], [0, 0], [0, 0, 1, 1], [0, 1, 2, 3], [0, 1, 0, 1], [0, 0], [0, 0, 1, 1]
	];

	//DMA処理
	this.HDMA = function() {
		//チャンネル0→7の順に処理
		for (let ch = 0; ch < 8; ch++) {
			if ((this.hdmaen >> ch) & 1) {
				const entry = this.ntrlx[ch];

				if (entry === 0x00) {
					continue;
				}

				let repeatFlag = (entry >> 7) & 1;
				let lineCount = entry & 0x7F;
				if (entry === 0x80) {
					repeatFlag = 0;
					lineCount = 0x80;
				}

				if (this.HDMAtransferred[ch] === 0) {
					//チャンネルの設定を読み取る
					const indirectMode = (this.dmapx[ch] >> 6) & 1;
					const transferMode = this.dmapx[ch] & 7;
					const transferSize = transferModeTable[transferMode].length;
					const BBusAddr = 0x2100 | this.bbadx[ch];
					
					for (let i = 0; i < transferSize; i++) {
						let ABusAddr;
						if (indirectMode === 1) {
							//indirect Mode
							ABusAddr = (this.dasbx[ch] << 16) | (this.dasxh[ch] << 8) | this.dasxl[ch];
						}
						else {
							//direct Mode
							ABusAddr = (this.a1bx[ch] << 16) | (this.a2axh[ch] << 8) | this.a2axl[ch];
						}
						
						const src = ABusAddr++;
						const dst = BBusAddr + transferModeTable[transferMode][i];
						const data = this.read(src);
						this.write(dst, data);
						//logger.log(`[HDMA] CH:${ch} ${src.toString(16)} -[ ${data.toString(2).padStart(8, 0)} ]-> ${dst.toString(16)}`);

						if (indirectMode === 1) {
							//indirect Mode
							this.dasxh[ch] = (ABusAddr >> 8) & 0xFF;
							this.dasxl[ch] = ABusAddr & 0xFF;
						}
						else {
							//direct Mode
							this.a2axh[ch] = (ABusAddr >> 8) & 0xFF;
							this.a2axl[ch] = ABusAddr & 0xFF;
							
							//logger.log(`ch#${ch} ${this.a2axh[ch].toString(16).padStart(2, 0)}${this.a2axl[ch].toString(16).padStart(2, 0)}`);
						}
					}

					if (repeatFlag === 0) {
						this.HDMAtransferred[ch] = 1;
					}
				}
				
				if (lineCount > 0) {
					lineCount--;
					if (lineCount === 0) {
						let HDMATableCurrentAddress = (this.a1bx[ch] << 16) | (this.a2axh[ch] << 8) | this.a2axl[ch];
						
						const nextEntry = this.read(HDMATableCurrentAddress++);
						repeatFlag = (nextEntry >> 7) & 1;
						lineCount = nextEntry & 0x7F;

						if (nextEntry !== 0) {
							const indirectMode = (this.dmapx[ch] >> 6) & 1;
							if (indirectMode === 1) {
								this.dasxl[ch] = this.read(HDMATableCurrentAddress++);
								this.dasxh[ch] = this.read(HDMATableCurrentAddress++);
							}

							this.a2axh[ch] = (HDMATableCurrentAddress >> 8) & 0xFF;
							this.a2axl[ch] = HDMATableCurrentAddress & 0xFF;
							
							//logger.log(`ch#${ch} ${this.a2axh[ch].toString(16).padStart(2, 0)}${this.a2axl[ch].toString(16).padStart(2, 0)}`);

							this.HDMAtransferred[ch] = 0;
						}
						//logger.log(`ntrlx[${ch}]=${this.ntrlx[ch].toString(2).padStart(8, 0)} nextEntry${nextEntry.toString(2).padStart(8, 0)}`);
					}

					this.ntrlx[ch] = (repeatFlag << 7) | lineCount;
				}
			}
		}
		return 0;
	}

	this.GPDMA = function() {
		for (let i = 0; i < 8; i++) {
			if (this.mdmaen & (1 << i)) {
				const dir = (this.dmapx[i] >> 7) & 1;
				const step = (this.dmapx[i] >> 3) & 3;
				const mode = this.dmapx[i] & 7;

				let aBus = (this.a1bx[i] << 16) | (this.a1txh[i] << 8) | this.a1txl[i];
				//04h:OAM, 18h:VRAM, 22h:CGRAM, 80h:WRAM
				let bBus = 0x2100 | this.bbadx[i];

				let len = ((this.dasxh[i]) << 8) | this.dasxl[i];
				if (len === 0) len = 0x1_0000;
				const cycle = len;

				const addr = [];
				switch (mode) {
					case 0: {
						//21xx
						addr.push(bBus);
						break;
					}
					case 1: {
						//21xx, 21xx+1
						addr.push(bBus);
						addr.push(bBus + 1);
						break;
					}
					case 2:
					case 6: {
						//21xx, 21xx
						addr.push(bBus);
						addr.push(bBus);
						break;
					}
					case 3:
					case 7: {
						//21xx, 21xx, 21xx+1, 21xx+1
						addr.push(bBus);
						addr.push(bBus);
						addr.push(bBus + 1);
						addr.push(bBus + 1);
						break;
					}
					case 4: {
						//21xx, 21xx+1, 21xx+2, 21xx+3
						addr.push(bBus);
						addr.push(bBus + 1);
						addr.push(bBus + 2);
						addr.push(bBus + 3);
						break;
					}
					case 5: {
						addr.push(bBus);
						addr.push(bBus + 1);
						addr.push(bBus);
						addr.push(bBus + 1);
						break;
					}
				}

				//console.log("[GPDMA] CH:", i, aBus.toString(16), "->", addr[0].toString(16), "length:", len, "step:", step, "mode:", mode);

				for (let j = 0; j < len; j += addr.length) {
					for (let k = 0; k < addr.length; k++) {
						if (dir === 0) {
							//aBus -> bBus
							const data = this.read(aBus, 1);
							this.write(addr[k], data);
							//logger.log(`${aBus.toString(16)} -[${data.toString(2).padStart(8, 0)}]-> ${addr[k].toString(16)}`)
						}
						else {
							//bBus -> aBus
							const data = this.read(addr[k]);
							this.write(aBus, data);
						}

						if (step === 0) {
							//aBus = (aBus + 1) & 0xffffff;
							const a = aBus & 0xffff;
							const b = aBus & 0xff0000;
							aBus = b | ((a + 1) & 0xffff);

							this.a1txh[i] = (aBus >> 8) & 0xFF;
							this.a1txl[i] = aBus & 0xFF;
						}
						else if (step === 2) {
							//aBus = (aBus - 1) & 0xffffff;
							const a = aBus & 0xffff;
							const b = aBus & 0xff0000;
							aBus = b | ((a - 1) & 0xffff);

							this.a1txh[i] = (aBus >> 8) & 0xFF;
							this.a1txl[i] = aBus & 0xFF;
						}
					}
				}

				this.mdmaen &= ~(1 << i);
				//return cycle;
			}
		}
		return 0;
	}
	
	//割込み処理
	this.assertRST = function() {
		this.assertRSTFlag = 1;
		this.waitInterrupt = 0;
	}
	this.assertNMI = function() {
		this.assertNMIFlag = 1;
		this.waitInterrupt = 0;
	}
	this.assertIRQ = function() {
		this.assertIRQFlag = 1;
		this.waitInterrupt = 0;
	}
	this.interrupt = function() {
		//console.log("waitInterrupt:", this.waitInterrupt);

		if (this.assertRSTFlag) {
			this.reg.dbr = 0;
			this.reg.d = 0;
			this.reg.k = 0;
			this.reg.s = 0x0100;
			this.reg.x = 0;
			this.reg.y = 0;
			
			
			const pcl = this.read(0xfffc);
			const pch = this.read(0xfffd);
			this.reg.pc = (pch << 8) | pcl;

			console.log("start addr:", this.reg.pc.toString(16));

			this.flag.m = 1;
			this.flag.x = 1;
			this.flag.d = 0;
			this.flag.i = 1;
			this.flag.e = 1;
			
			this.assertRSTFlag = 0;

			//console.log("RST Interrupt");
		}
		else if (this.assertNMIFlag) {
			this.push(this.reg.k);
			this.push((this.reg.pc >> 8) & 0xff);
			this.push(this.reg.pc & 0xff);
			this.push(this.getProcessorStatus());
			this.flag.i = 1;
			this.flag.d = 0;
			this.reg.k = 0;
			this.reg.pc = (this.read(0xffeb) << 8) | this.read(0xffea);
			this.assertNMIFlag = 0;

			//console.log("NMI Interrupt $", this.reg.pc.toString(16));
		}
		else if (this.assertIRQFlag) {
			if (!this.flag.i) {
				this.push(this.reg.k);
				this.push((this.reg.pc >> 8) & 0xff);
				this.push(this.reg.pc & 0xff);
				this.push(this.getProcessorStatus());
				this.flag.i = 1;
				this.flag.d = 0;
				this.reg.k = 0;
				this.reg.pc = (this.read(0xffef) << 8) | this.read(0xffee);
				
				this.assertIRQFlag = 0;
			}
		}
		else if (this.assertBRKFlag) {
			if (this.flag.e) {
				//brk命令の16bitアドレス+2をプッシュ
				//オペコードフェッチ時にPCをインクリメントしているため、PC+1をプッシュ
				const pc = (this.reg.pc + 1) & 0xffff;
				this.push((pc >> 8) & 0xff);
				this.push(pc & 0xff);

				//brkフラグをセット
				this.push(this.getProcessorStatus() | (1 << 4));

				this.flag.i = 1;
				this.flag.d = 0;
				
				this.reg.k = 0;
				this.reg.pc = (this.read(0xffff) << 8) | this.read(0xfffe);
				this.assertBRKFlag = 0;
			}
			else {
				this.push(this.reg.k);
				
				const pc = (this.reg.pc + 1) & 0xffff;
				this.push((pc >> 8) & 0xff);
				this.push(pc & 0xff);
				this.push(this.getProcessorStatus());

				this.flag.i = 1;
				this.flag.d = 0;

				this.reg.k = 0;
				this.reg.pc = (this.read(0xffe7) << 8) | this.read(0xffe6);
				this.assertBRKFlag = 0;
			}
		}
		else if (this.assertCOPFlag) {
			if (this.flag.e) {
				//cop命令の16bitアドレス+2をプッシュ
				//オペコード、オペランドフェッチ時にPCをインクリメントしているため、そのままプッシュ
				this.push((this.reg.pc >> 8) & 0xff);
				this.push(this.reg.pc & 0xff);

				this.push(this.getProcessorStatus());

				this.flag.i = 1;
				this.flag.d = 0;
				
				this.reg.k = 0;
				this.reg.pc = (this.read(0xffe5) << 8) | this.read(0xffe4);
				this.assertCOPFlag = 0;
			}
			else {
				this.push(this.reg.k);
				this.push((this.reg.pc >> 8) & 0xff);
				this.push(this.reg.pc & 0xff);
				this.push(this.getProcessorStatus());

				this.flag.i = 1;
				this.flag.d = 0;

				this.reg.k = 0;
				this.reg.pc = (this.read(0xffe5) << 8) | this.read(0xffe4);
				this.assertCOPFlag = 0;
			}
		}
		this.waitCycle = 8;
	}

	this.fetch = function() {	
		//pcはバンク境界でラッピング
		const addr = (this.reg.k << 16) | this.reg.pc;
		const res = this.read(addr);	
		//logger.log(`PC[${addr.toString(16).padStart(6,0)}]`);

		this.reg.pc = (this.reg.pc + 1) & 0xffff;
		this.mdr = res;

		return res;
	}

	this.decode = function(mode, mnemonic) {
		const op = [];		//8bitのオペランドを格納
		const addr = [];	//24bitのデータor飛び先アドレスを格納

		const max8 = 0xff;
		const max16 = 0xffff;
		const max24 = 0xffffff;

		switch (mode) {
			case "abs": {
				op.push(this.fetch());
				op.push(this.fetch());
				if (mnemonic === "jmp" || mnemonic === "jsr") {
					const a = (this.reg.k << 16) | (op[1] << 8) | op[0];
					addr.push(a);
				}
				else {
					const a = (this.reg.dbr << 16) | (op[1] << 8) | op[0];
					addr.push(a);
					addr.push((a + 1) & max24);
				}
				break;
			}
			case "abx": {
				op.push(this.fetch());
				op.push(this.fetch());
				const a = (this.reg.dbr << 16) | (op[1] << 8) | op[0];
				addr.push((a + this.reg.x) & max24);
				addr.push((a + this.reg.x + 1) & max24);
				break;
			}
			case "aby": {
				op.push(this.fetch());
				op.push(this.fetch());
				const a = (this.reg.dbr << 16) | (op[1] << 8) | op[0];
				addr.push((a + this.reg.y) & max24);
				addr.push((a + this.reg.y + 1) & max24);
				break;
			}
			case "abi": {
				//jmp命令のみ使用
				op.push(this.fetch());
				op.push(this.fetch());
				const a = (op[1] << 8) | op[0];
				const pl = this.read(a);
				const ph = this.read((a + 1) & max16);
				addr.push((this.reg.k << 16) | (ph << 8) | pl);
				break;
			}
			case "abl": {
				//jmp命令のみ使用
				op.push(this.fetch());
				op.push(this.fetch());
				const a = (op[1] << 8) | op[0];
				const pl = this.read(a);
				const pm = this.read((a + 1) & max16);
				const ph = this.read((a + 2) & max16);
				addr.push((ph << 16) | (pm << 8) | pl);
				break;
			}
			case "axi": {
				//jmp命令、jsr命令のみ使用
				op.push(this.fetch());
				op.push(this.fetch());
				const a = (op[1] << 8) | op[0];
				const pl = this.read((this.reg.k << 16) | ((a + this.reg.x) & max16));
				const ph = this.read((this.reg.k << 16) | ((a + this.reg.x + 1) & max16));
				addr.push((this.reg.k << 16) | (ph << 8) | pl);
				break;
			}
			case "acc": {
				break;
			}

			case "dpg": {
				op.push(this.fetch());
				const dirLo = this.reg.d & max8;
				if (this.flag.e && dirLo === 0) {
					const dirHi = this.reg.d & 0xff00;
					const dataLoAddr = dirHi | op[0];
					addr.push(dataLoAddr);
				}
				else {
					const dataLoAddr = (this.reg.d +  op[0]) & max16;
					const dataHiAddr = (dataLoAddr + 1) & max16;
					addr.push(dataLoAddr);
					addr.push(dataHiAddr);
				}
				break;
			}
			case "dpx": {
				op.push(this.fetch());
				const dirLo = this.reg.d & max8;
				if (this.flag.e && dirLo === 0) {
					const dirHi = this.reg.d & 0xff00;
					const dataLoAddr = dirHi | ((op[0] + this.reg.x) & max8);
					addr.push(dataLoAddr);
				}
				else {
					const dataLoAddr = (this.reg.d + op[0] + this.reg.x) & max16;
					const dataHiAddr = (dataLoAddr + 1) & max16;
					addr.push(dataLoAddr);
					addr.push(dataHiAddr);
				}
				break;
			}
			case "dpy": {
				op.push(this.fetch());
				const dirLo = this.reg.d & max8;
				if (this.flag.e && dirLo === 0) {
					const dirHi = this.reg.d & 0xff00;
					const dataLoAddr = dirHi | ((op[0] + this.reg.y) & max8);
					addr.push(dataLoAddr);
				}
				else {
					const dataLoAddr = (this.reg.d + op[0] + this.reg.y) & max16;
					const dataHiAddr = (dataLoAddr + 1) & max16;
					addr.push(dataLoAddr);
					addr.push(dataHiAddr);
				}
				break;
			}
			case "dpi": {
				op.push(this.fetch());
				const dirLo = this.reg.d & max8;
				let ptrLoAddr = (this.reg.d + op[0]) & max16;
				let ptrHiAddr = (ptrLoAddr + 1) & max16;
				if (this.flag.e && dirLo === 0) {
					const dirHi = this.reg.d & 0xff00;
					ptrLoAddr = dirHi | op[0];
					ptrHiAddr = dirHi | ((op[0] + 1) & max8);
				}
				const ptrLo = this.read(ptrLoAddr);
				const ptrHi = this.read(ptrHiAddr);
				const dataLoAddr = (this.reg.dbr << 16) | (ptrHi << 8) | ptrLo;
				const dataHiAddr = (dataLoAddr + 1) & max24;
				addr.push(dataLoAddr);
				addr.push(dataHiAddr);
				break;
			}
			case "dpl": {
				op.push(this.fetch());
				const ptrLoAddr = (this.reg.d + op[0]) & max16;
				const ptrMiAddr = (ptrLoAddr + 1) & max16;
				const ptrHiAddr = (ptrLoAddr + 2) & max16;
				const ptrLo = this.read(ptrLoAddr);
				const ptrMi = this.read(ptrMiAddr);
				const ptrHi = this.read(ptrHiAddr);
				const dataLoAddr = (ptrHi << 16) | (ptrMi << 8) | ptrLo;
				const dataHiAddr = (dataLoAddr + 1) & max24;
				addr.push(dataLoAddr);
				addr.push(dataHiAddr);
				break;
			}
			case "dxi": {
				op.push(this.fetch());
				const dirLo = this.reg.d & max8;
				let ptrLoAddr = (this.reg.d + op[0] + this.reg.x) & max16;
				let ptrHiAddr = (ptrLoAddr + 1) & max16;
				if (this.flag.e && dirLo === 0) {
					const dirHi = this.reg.d & 0xff00;
					ptrLoAddr = dirHi | ((op[0] + this.reg.x) & max8);
					ptrHiAddr = dirHi | ((op[0] + this.reg.x + 1) & max8);
				}
				const ptrLo = this.read(ptrLoAddr);
				const ptrHi = this.read(ptrHiAddr);
				const dataLoAddr = (this.reg.dbr << 16) | (ptrHi << 8) | ptrLo;
				const dataHiAddr = (dataLoAddr + 1) & max24;
				addr.push(dataLoAddr);
				addr.push(dataHiAddr);
				break;
			}
			case "diy": {
				op.push(this.fetch());
				const dirLo = this.reg.d & max8;
				let ptrLoAddr = (this.reg.d + op[0]) & max16;
				let ptrHiAddr = (ptrLoAddr + 1) & max16;
				if (this.flag.e && dirLo === 0) {
					const dirHi = this.reg.d & 0xff00;
					ptrLoAddr = dirHi | op[0];
					ptrHiAddr = dirHi | ((op[0] + 1) & max8);
				}
				const ptrLo = this.read(ptrLoAddr);
				const ptrHi = this.read(ptrHiAddr);
				const dataLoAddr = (((this.reg.dbr << 16) | (ptrHi << 8) | ptrLo) + this.reg.y) & max24;
				const dataHiAddr = (dataLoAddr + 1) & max24;
				addr.push(dataLoAddr);
				addr.push(dataHiAddr);
				break;
			}
			case "dly": {
				op.push(this.fetch());
				const dirLo = this.reg.d & max8;
				let ptrLoAddr = (this.reg.d + op[0]) & max16;
				let ptrMiAddr = (ptrLoAddr + 1) & max16;
				let ptrHiAddr = (ptrLoAddr + 2) & max16;
				const ptrLo = this.read(ptrLoAddr);
				const ptrMi = this.read(ptrMiAddr);
				const ptrHi = this.read(ptrHiAddr);
				const dataLoAddr = (((ptrHi << 16) | (ptrMi << 8) | ptrLo) + this.reg.y) & max24;
				const dataHiAddr = (dataLoAddr + 1) & max24;
				addr.push(dataLoAddr);
				addr.push(dataHiAddr);
				break;
			}
			case "imm": {
				//8bit(rep,sep,wdm)
				//16bit(pea,per)
				//mフラグで判定(adc,sbc,cmp,and,eor,ora,bit,lda)
				//xフラグで判定(cpx,cpy,ldx,ldy)
				//eフラグで判定(cop)
				let len = 1;
				switch (mnemonic) {
					case "rep":
					case "sep":
					case "wdm":
					case "cop": {
						len = 1;
						break;
					}

					case "pea":
					case "per": {
						len = 2;
						break;
					}

					case "cpx":
					case "cpy":
					case "ldx":
					case "ldy": {
						len = 2 - this.flag.x;
						break;
					}

					default: {
						len = 2 - this.flag.m;
						break;
					}
				}

				for (let i = 0; i < len; i++) {
					op.push(this.fetch());
					addr.push(op[i]);
				}
				break;
			}
			case "imp": {
				break;
			}
			case "lng": {
				op.push(this.fetch());
				op.push(this.fetch());
				op.push(this.fetch());
				if (mnemonic === "jmp") {
					const dstAddr = (op[2] << 16) | (op[1] << 8) | op[0];
					addr.push(dstAddr);
				}
				else {
					const dataLoAddr = (op[2] << 16) | (op[1] << 8) | op[0];
					const dataHiAddr = (dataLoAddr + 1) & max24;
					addr.push(dataLoAddr);
					addr.push(dataHiAddr);
				}
				break;
			}
			case "lnx": {
				op.push(this.fetch());
				op.push(this.fetch());
				op.push(this.fetch());
				const dataLoAddr = (((op[2] << 16) | (op[1] << 8) | op[0]) + this.reg.x) & max24;
				const dataHiAddr = (dataLoAddr + 1) & max24;
				addr.push(dataLoAddr);
				addr.push(dataHiAddr);
				break;
			}
			case "pcr": {
				op.push(this.fetch());
				if (op[0] <= 127) {
					const dstAddr = (this.reg.k << 16) | ((this.reg.pc + op[0]) & max16);
					addr.push(dstAddr);
				}
				else {
					const dstAddr = (this.reg.k << 16) | ((this.reg.pc + op[0] - 256) & max16);
					addr.push(dstAddr);
				}
				break;
			}
			case "prl": {
				op.push(this.fetch());
				op.push(this.fetch());
				const dstAddr = (this.reg.k << 16) | ((this.reg.pc + ((op[1] << 8) | op[0])) & max16);
				addr.push(dstAddr);
				break;
			}
			case "blk": {
				op.push(this.fetch());
				op.push(this.fetch());
				addr.push(op[0]);
				addr.push(op[1]);
				break;
			}
			case "srl": {
				op.push(this.fetch());
				const dataLoAddr = (op[0] + this.reg.s) & max16;
				const dataHiAddr = (dataLoAddr + 1) & max16;
				addr.push(dataLoAddr);
				addr.push(dataHiAddr);
				break;
			}
			case "sry": {
				op.push(this.fetch());
				const ptrLoAddr = (op[0] + this.reg.s) & max16;
				const ptrHiAddr = (ptrLoAddr + 1) & max16;
				const ptrLo = this.read(ptrLoAddr);
				const ptrHi = this.read(ptrHiAddr);
				const dataLoAddr = (((this.reg.dbr << 16) | (ptrHi << 8) | ptrLo) + this.reg.y) & max24; 
				const dataHiAddr = (dataLoAddr + 1) & max24;
				addr.push(dataLoAddr);
				addr.push(dataHiAddr);
				break;
			}
		}

		return {op, addr};
	}


	this.execute = function(mnemonic, addr, mode) {
		let cycle = 0;
		switch (mnemonic) {
			case "adc": { this.adc(addr, mode); break; }
			case "sbc": { this.sbc(addr, mode); break; }

			case "cmp": { this.cmp(addr, mode); break; }
			case "cpx": { this.cpx(addr, mode); break; }
			case "cpy": { this.cpy(addr, mode); break; }
			
			case "dec": { this.dec(addr, mode); break; }
			case "dex": { this.dex(addr, mode); break; }
			case "dey": { this.dey(addr, mode); break; }
			case "inc": { this.inc(addr, mode); break; }
			case "inx": { this.inx(addr, mode); break; }
			case "iny": { this.iny(addr, mode); break; }
			
			case "and": { this.and(addr, mode); break; }
			case "eor": { this.eor(addr, mode); break; }
			case "ora": { this.ora(addr, mode); break; }
			
			case "bit": { this.bit(addr, mode); break; }
			
			case "trb": { this.trb(addr, mode); break; }
			case "tsb": { this.tsb(addr, mode); break; }
			
			case "asl": { this.asl(addr, mode); break; }
			case "lsr": { this.lsr(addr, mode); break; }
			case "rol": { this.rol(addr, mode); break; }
			case "ror": { this.ror(addr, mode); break; }
			
			case "bcc": { this.bcc(addr, mode); break; }
			case "bcs": { this.bcs(addr, mode); break; }
			case "beq": { this.beq(addr, mode); break; }
			case "bmi": { this.bmi(addr, mode); break; }
			case "bne": { this.bne(addr, mode); break; }
			case "bpl": { this.bpl(addr, mode); break; }
			case "bra": { this.bra(addr, mode); break; }
			case "bvc": { this.bvc(addr, mode); break; }
			case "bvs": { this.bvs(addr, mode); break; }
			
			case "brl": { this.brl(addr, mode); break; }
			
			case "jmp": { this.jmp(addr, mode); break; }
			case "jsl": { this.jsl(addr, mode); break; }
			case "jsr": { this.jsr(addr, mode); break; }
			
			case "rtl": { this.rtl(addr, mode); break; }
			case "rts": { this.rts(addr, mode); break; }
			
			case "brk": { this.brk(addr, mode); break; }
			case "cop": { this.cop(addr, mode); break; }
			
			case "rti": { this.rti(addr, mode); break; }
			
			case "clc": { this.clc(addr, mode); break; }
			case "cld": { this.cld(addr, mode); break; }
			case "cli": { this.cli(addr, mode); break; }
			case "clv": { this.clv(addr, mode); break; }
			case "sec": { this.sec(addr, mode); break; }
			case "sed": { this.sed(addr, mode); break; }
			case "sei": { this.sei(addr, mode); break; }
			
			case "rep": { this.rep(addr, mode); break; }
			case "sep": { this.sep(addr, mode); break; }
			
			case "lda": { this.lda(addr, mode); break; }
			case "ldx": { this.ldx(addr, mode); break; }
			case "ldy": { this.ldy(addr, mode); break; }
			case "sta": { this.sta(addr, mode); break; }
			case "stx": { this.stx(addr, mode); break; }
			case "sty": { this.sty(addr, mode); break; }
			case "stz": { this.stz(addr, mode); break; }
			
			case "mvn": { this.mvn(addr, mode); break; }
			case "mvp": { this.mvp(addr, mode); break; }
			
			case "nop": { this.nop(addr, mode); break; }
			case "wdm": { this.wdm(addr, mode); break; }
			
			case "pea": { this.pea(addr, mode); break; }
			case "pei": { this.pei(addr, mode); break; }
			case "per": { this.per(addr, mode); break; }
			
			case "pha": { this.pha(addr, mode); break; }
			case "phx": { this.phx(addr, mode); break; }
			case "phy": { this.phy(addr, mode); break; }
			case "pla": { this.pla(addr, mode); break; }
			case "plx": { this.plx(addr, mode); break; }
			case "ply": { this.ply(addr, mode); break; }
			
			case "phb": { this.phb(addr, mode); break; }
			case "phd": { this.phd(addr, mode); break; }
			case "phk": { this.phk(addr, mode); break; }
			case "php": { this.php(addr, mode); break; }
			case "plb": { this.plb(addr, mode); break; }
			case "pld": { this.pld(addr, mode); break; }
			case "plp": { this.plp(addr, mode); break; }
			
			case "stp": { this.stp(addr, mode); break; }
			case "wai": { this.wai(addr, mode); break; }
			
			case "tax": { this.tax(addr, mode); break; }
			case "tay": { this.tay(addr, mode); break; }
			case "tsx": { this.tsx(addr, mode); break; }
			case "txa": { this.txa(addr, mode); break; }
			case "txs": { this.txs(addr, mode); break; }
			case "txy": { this.txy(addr, mode); break; }
			case "tya": { this.tya(addr, mode); break; }
			case "tyx": { this.tyx(addr, mode); break; }
			
			case "tcd": { this.tcd(addr, mode); break; }
			case "tcs": { this.tcs(addr, mode); break; }
			case "tdc": { this.tdc(addr, mode); break; }
			case "tsc": { this.tsc(addr, mode); break; }
			
			case "xba": { this.xba(addr, mode); break; }
			
			case "xce": { this.xce(addr, mode); break; }

			// case "ASL": {
			// 	this.asl();
			// 	if (mode !== "acc") {
			// 		cycle -= 2 * this.flag.m;
			// 		if (mode.slice(0, 2) === "dir" && (this.reg.d & 0xff) === 0) cycle++; 
			// 	}
			// 	break;
			// }
			// case "BCC": {
			// 	this.bcc(addr);
			// 	if (this.flag.e) {
			// 		//ページ境界を超える場合+1サイクル
			// 	}
			// }
		}
		return cycle;
	}

	this.adc = function(addr, mode) {
		//accumulator + data + carry
		const mask = this.flag.m ? 0xff : 0xffff;
		const msb = this.flag.m ? 7 : 15;
		
		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.m) data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;
		
		let a = this.reg.a & mask;
		let res = a + data + this.flag.c;
		
		if (this.flag.d) {
			a = parseInt(a.toString(16), 10);
			data = parseInt(data.toString(16), 10);
			res = a + data + this.flag.c;
			res = parseInt(res.toString(10),16);
		}

		const s1 = (a >> msb) & 1;
		const s2 = (data >> msb) & 1;
		const s3 = (res >> msb) & 1;
		this.flag.v = (s1 == s2 && s1 != s3) ? 1 : 0;

		this.flag.c = (res > mask) ? 1 : 0;

		res &= mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.a = (this.reg.a & ~mask) | (res & mask);
	}
	this.sbc = function(addr, mode) {
		//accumulator = accumulator - data - 1 + carry
		const mask = this.flag.m ? 0xff : 0xffff;
		const msb = this.flag.m ? 7 : 15;
		
		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.m) data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;
		
		let a = this.reg.a & mask;
		if (this.flag.d) {
			a = parseInt(a.toString(16), 10);
			data = parseInt(data.toString(16), 10);
		}

		let res = a - data - 1 + this.flag.c;

		if (this.flag.d) {
			a = parseInt(a.toString(10), 16);
			data = parseInt(data.toString(10), 16);
			//if (res < 0) res += 10000;
			res = parseInt(res.toString(10),16);
		}
		
		const s1 = (a >> msb) & 1;
		const s2 = (data >> msb) & 1;
		const s3 = (res >> msb) & 1;
		this.flag.v = (s1 != s2 && s1 != s3) ? 1 : 0;

		if (this.flag.d) {
			a = parseInt(a.toString(16), 10);
			data = parseInt(data.toString(16), 10);
			res = a - data - 1 + this.flag.c;
			if (res < 0) res += 10000;
			res = parseInt(res.toString(10),16);
		}

		this.flag.c = (a >= data) ? 1 : 0;

		res &= mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.a = (this.reg.a & ~mask) | (res & mask);
	}


	this.cmp = function(addr, mode) {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);

		// let data = this.read(addr[0]);
		// if (!this.flag.m) data |= (this.read(addr[1]) << 8);
		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.m) {
			data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;
		}

		const a = this.reg.a & mask;
		const res = (a - data) & mask;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;
		this.flag.c = (a >= data) ? 1 : 0;


	}
	this.cpx = function(addr, mode) {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);

		// let data = this.read(addr[0]);
		// if (!this.flag.x) data |= (this.read(addr[1]) << 8);
		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.x) data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;

		const x = this.reg.x & mask;
		const res = (x - data) & mask;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;
		this.flag.c = (x >= data) ? 1 : 0;
	}
	this.cpy = function(addr, mode) {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);

		// let data = this.read(addr[0]);
		// if (!this.flag.x) data |= (this.read(addr[1]) << 8);
		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.x) data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;

		const y = this.reg.y & mask;
		const res = (y - data) & mask;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;
		this.flag.c = (y >= data) ? 1 : 0;
	}


	this.dec = function(addr) {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);
		let res;

		if (addr.length === 0) {
			res = this.reg.a & mask;
		}
		else {
			res = this.read(addr[0]);
			if (!this.flag.m) res |= (this.read(addr[1]) << 8);
		}

		res = (res - 1) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		if (addr.length === 0) {
			this.reg.a = (this.reg.a & ~mask) | (res & mask);
		}
		else {
			this.write(addr[0], res & 0xff);
			if (!this.flag.m) this.write(addr[1], (res >> 8) & 0xff);
		}
	}
	this.dex = function() {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);
		let res = this.reg.x & mask;

		res = (res - 1) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.x = (res & mask);
	}
	this.dey = function() {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);
		let res = this.reg.y & mask;

		res = (res - 1) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.y = (this.reg.y & ~mask) | (res & mask);
	}
	this.inc = function(addr) {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);
		let res;

		//check
		if (addr.length === 0) {
			res = this.reg.a & mask;
		}
		else {
			res = this.read(addr[0]);
			if (!this.flag.m) res |= (this.read(addr[1]) << 8);
		}

		//check
		res = (res + 1) & mask;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		//check
		if (addr.length === 0) {
			this.reg.a = (this.reg.a & ~mask) | (res & mask);
		}
		else {
			this.write(addr[0], res & 0xff);
			if (!this.flag.m) this.write(addr[1], (res >> 8) & 0xff);
		}
	}
	this.inx = function() {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);
		let res = this.reg.x & mask;

		res = (res + 1) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.x = (res & mask);
	}
	this.iny = function() {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);
		let res = this.reg.y & mask;

		res = (res + 1) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.y = (this.reg.y & ~mask) | (res & mask);
	}


	this.and = function(addr, mode) {
		//bitwise and
		const mask = (this.flag.m ? 0xff : 0xffff);
		const msb = (this.flag.m ? 7 : 15);
		 
		let res = this.reg.a & mask;
		
		// let data = this.read(addr[0]);
		// if (!this.flag.m) res |= (this.read(addr[1]) << 8);

		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.m) data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;

		res = (res & data) & mask;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;
		
		this.reg.a = (this.reg.a & ~mask) | (res & mask);
	}
	this.eor = function(addr, mode) {
		//bitwise exclusive or
		const mask = (this.flag.m ? 0xff : 0xffff);
		const msb = (this.flag.m ? 7 : 15);
		 
		let res = this.reg.a & mask;
		
		// let data = this.read(addr[0]);
		// if (!this.flag.m) res |= (this.read(addr[1]) << 8);
		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.m) data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;

		res = (res ^ data) & mask;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;
		
		this.reg.a = (this.reg.a & ~mask) | (res & mask);
	}
	this.ora = function(addr, mode) {
		//bitwise or accumulator
		const mask = (this.flag.m ? 0xff : 0xffff);
		const msb = (this.flag.m ? 7 : 15);
		 
		let res = this.reg.a & mask;
		
		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.m) data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;
		
		res = (res | data) & mask;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;
		
		this.reg.a = (this.reg.a & ~mask) | (res & mask);
	}


	this.bit = function(addr, mode) {
		//test bits
		//ANDを同じ機能、アキュムレータを更新しない
		const mask = (this.flag.m ? 0xff : 0xffff);
		const msb = (this.flag.m ? 7 : 15);
		 
		let res = this.reg.a & mask;
		
		// let data = this.read(addr[0]);
		// if (!this.flag.m) res |= (this.read(addr[1]) << 8);
		let data = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.m) data |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;

		res = (res & data) & mask;

		if (mode !== "imm") {
			//"データのみ"でフラグを更新
			this.flag.n = (data >> msb) & 1;
			this.flag.v = (data >> (msb - 1)) & 1;

			//console.log(data.toString(2).padStart(8, 0));
		}
		this.flag.z = (res === 0) ? 1 : 0;
	}

	this.trb = function(addr) {
		//test and reset bits
		const mask = (this.flag.m ? 0xff : 0xffff);
		const a = this.reg.a & mask;

		let data = this.read(addr[0]);
		if (!this.flag.m) data |= (this.read(addr[1]) << 8);
		
		const res = (data & a) & mask;
		this.flag.z = (res === 0) ? 1 : 0;
		data = data & ~a;

		this.write(addr[0], data & 0xff);
		if (!this.flag.m) this.write(addr[1], (data >> 8) & 0xff);
	}
	this.tsb = function(addr) {
		//test and set bit
		const mask = (this.flag.m ? 0xff : 0xffff);
		const a = this.reg.a & mask;
		
		let data = this.read(addr[0]);
		if (!this.flag.m) data |= (this.read(addr[1]) << 8);
		
		const res = (data & a) & mask;
		this.flag.z = (res === 0) ? 1 : 0;
		data = data | a;
		
		this.write(addr[0], data & 0xff);
		if (!this.flag.m) this.write(addr[1], (data >> 8) & 0xff);
	}


	this.asl = function(addr) {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);
		let res;

		if (addr.length === 0) {
			res = this.reg.a & mask;
		}
		else {
			res = this.read(addr[0]);
			if (!this.flag.m) {
				res |= (this.read(addr[1]) << 8);
			}
		}

		this.flag.c = (res >> msb) & 1;
		
		res = (res << 1) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		if (addr.length === 0) {
			this.reg.a = (this.reg.a & ~mask) | (res & mask);
		}
		else {
			this.write(addr[0], res & 0xff);
			if (!this.flag.m) {
				this.write(addr[1], (res >> 8) & 0xff);
			}
		}
	}
	this.lsr = function(addr) {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);
		let res;

		if (addr.length === 0) {
			res = this.reg.a & mask;
		}
		else {
			res = this.read(addr[0]);
			if (!this.flag.m) {
				res |= (this.read(addr[1]) << 8);
			}
		}

		this.flag.c = res & 1;
		
		res = (res >> 1) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		if (addr.length === 0) {
			this.reg.a = (this.reg.a & ~mask) | (res & mask);
		}
		else {
			this.write(addr[0], res & 0xff);
			if (!this.flag.m) {
				this.write(addr[1], (res >> 8) & 0xff);
			}
		}
	}
	this.rol = function(addr) {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);
		let res;

		if (addr.length === 0) {
			res = this.reg.a & mask;
		}
		else {
			res = this.read(addr[0]);
			if (!this.flag.m) {
				res |= (this.read(addr[1]) << 8);
			}
		}

		const c = this.flag.c & 1;
		this.flag.c = (res >> msb) & 1;
		
		res = ((res << 1) | c) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		if (addr.length === 0) {
			this.reg.a = (this.reg.a & ~mask) | (res & mask);
		}
		else {
			this.write(addr[0], res & 0xff);
			if (!this.flag.m) {
				this.write(addr[1], (res >> 8) & 0xff);
			}
		}
	}
	this.ror = function(addr) {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);
		let res;

		if (addr.length === 0) {
			res = this.reg.a & mask;
		}
		else {
			res = this.read(addr[0]);
			if (!this.flag.m) {
				res |= (this.read(addr[1]) << 8);
			}
		}

		const c = this.flag.c & 1;
		this.flag.c = res & 1;
		
		res = ((c << msb) | (res >> 1)) & mask;
		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		if (addr.length === 0) {
			this.reg.a = (this.reg.a & ~mask) | (res & mask);
		}
		else {
			this.write(addr[0], res & 0xff);
			if (!this.flag.m) {
				this.write(addr[1], (res >> 8) & 0xff);
			}
		}
	}

	//実効(飛び先)アドレスを引数に取る
	this.bcc = function(addr) {
		if (!this.flag.c) this.reg.pc = addr[0];
	}
	this.bcs = function(addr) {
		if (this.flag.c) this.reg.pc = addr[0];
	}
	this.beq = function(addr) {
		if (this.flag.z) this.reg.pc = addr[0];
	}
	this.bmi = function(addr) {
		if (this.flag.n) this.reg.pc = addr[0];
	}
	this.bne = function(addr) {
		if (!this.flag.z) this.reg.pc = addr[0];
	}
	this.bpl = function(addr) {
		if (!this.flag.n) this.reg.pc = addr[0];
	}
	this.bra = function(addr) {
		this.reg.pc = addr[0];
	}
	this.bvc = function(addr) {
		if (!this.flag.v) this.reg.pc = addr[0];
	}
	this.bvs = function(addr) {
		if (this.flag.v) this.reg.pc = addr[0];
	}


	this.brl = function(addr) {
		this.reg.pc = (addr[1] << 8) | addr[0];
	}


	this.jmp = function(addr) {
		this.reg.pc = addr[0] & 0xffff;
		this.reg.k = (addr[0] >> 16) & 0xff;
	}
	this.jsr = function(addr) {
		//次の命令のアドレスより1小さい値をプッシュ
		//上位バイト、下位バイトの順にプッシュ
		const pc = (this.reg.pc - 1) & 0xffff;
		this.push((pc >> 8) & 0xff);
		this.push(pc & 0xff);

		this.reg.pc = addr[0] & 0xffff;
		this.reg.k = (addr[0] >> 16) & 0xff;
	}
	this.jsl = function(addr) {
		this.push(this.reg.k);
		
		//次の命令のアドレスより1小さい値をプッシュ
		//上位バイト、下位バイトの順にプッシュ
		const pc = (this.reg.pc - 1) & 0xffff;
		this.push((pc >> 8) & 0xff);
		this.push(pc & 0xff);

		this.reg.pc = addr[0] & 0xffff;
		this.reg.k = (addr[0] >> 16) & 0xff;
	}

	this.rts = function() {
		const pcl = this.pull();
		const pch = this.pull();
		this.reg.pc = (pch << 8) | pcl;
		this.reg.pc = (this.reg.pc + 1) & 0xffff;
	}
	this.rtl = function() {
		const pcl = this.pull();
		const pch = this.pull();
		this.reg.pc = (pch << 8) | pcl;
		this.reg.pc = (this.reg.pc + 1) & 0xffff;

		const k = this.pull();
		this.reg.k = k;
	}
	
	this.brk = function() {
		this.assertBRKFlag = 1;
		this.interrupt();
	}
	this.cop = function() {
		//snesでは使用されない？
		this.assertCOPFlag = 1;
		this.interrupt();
	}


	this.rti = function() {
		if (this.flag.e) {
			const p = this.pull();
			this.setProcessorStatus(p);

			const pcl = this.pull();
			const pch = this.pull();
			this.reg.pc = (pch << 8) | pcl;
		}
		else {
			const p = this.pull();
			this.setProcessorStatus(p);

			const pcl = this.pull();
			const pch = this.pull();
			this.reg.pc = (pch << 8) | pcl;

			this.reg.k = this.pull();
		}
	}


	this.clc = function() {
		this.flag.c = 0;
	}
	this.cld = function() {
		this.flag.d = 0;
	}
	this.cli = function() {
		this.flag.i = 0;
	}
	this.clv = function() {
		this.flag.v = 0;
	}
	this.sec = function() {
		this.flag.c = 1;
	}
	this.sed = function() {
		this.flag.d = 1;
	}
	this.sei = function() {
		this.flag.i = 1;
	}


	this.rep = function(addr) {
		const data = addr[0];
		if ((data >> 7) & 1) this.flag.n = 0;
		if ((data >> 6) & 1) this.flag.v = 0;
		if ((data >> 5) & 1) this.flag.m = 0;
		if ((data >> 4) & 1) this.flag.x = 0;
		if ((data >> 3) & 1) this.flag.d = 0;
		if ((data >> 2) & 1) this.flag.i = 0;
		if ((data >> 1) & 1) this.flag.z = 0;
		if ((data >> 0) & 1) this.flag.c = 0;

		if (this.flag.e) {
			this.setEmulationMode();
		}
	}
	this.sep = function(addr) {
		const data = addr[0];
		if ((data >> 7) & 1) this.flag.n = 1;
		if ((data >> 6) & 1) this.flag.v = 1;
		if ((data >> 5) & 1) this.flag.m = 1;
		if ((data >> 4) & 1) {
			this.flag.x = 1;
			this.reg.x &= 0xff;
			this.reg.y &= 0xff;
		}
		if ((data >> 3) & 1) this.flag.d = 1;
		if ((data >> 2) & 1) this.flag.i = 1;
		if ((data >> 1) & 1) this.flag.z = 1;
		if ((data >> 0) & 1) this.flag.c = 1;
		
		if (this.flag.e) {
			this.setEmulationMode();
		}
	}


	this.lda = function(addr, mode) {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);

		// let res = this.read(addr[0]);
		// if (!this.flag.m) res |= (this.read(addr[1]) << 8);
		let res = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.m) res |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.a = (this.reg.a & ~mask) | (res & mask);
	}
	this.ldx = function(addr, mode) {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);

		// let res = this.read(addr[0]);
		// if (!this.flag.x) res |= (this.read(addr[1]) << 8);
		let res = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.x) res |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.x = (this.reg.x & ~mask) | (res & mask);
	}
	this.ldy = function(addr, mode) {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);

		// let res = this.read(addr[0]);
		// if (!this.flag.x) res |= (this.read(addr[1]) << 8);
		let res = ((mode === "imm") ? addr[0] : this.read(addr[0]));
		if (!this.flag.x) res |= ((mode === "imm") ? addr[1] : this.read(addr[1])) << 8;

		this.flag.n = (res >> msb) & 1;
		this.flag.z = (res === 0) ? 1 : 0;

		this.reg.y = (this.reg.y & ~mask) | (res & mask);
	}
	this.sta = function(addr) {
		this.write(addr[0], this.reg.a & 0xff);
		if (!this.flag.m) this.write(addr[1], (this.reg.a >> 8) & 0xff);
	}
	this.stx = function(addr) {
		this.write(addr[0], this.reg.x & 0xff);
		if (!this.flag.x) this.write(addr[1], (this.reg.x >> 8) & 0xff);
	}
	this.sty = function(addr) {
		this.write(addr[0], this.reg.y & 0xff);
		if (!this.flag.x) this.write(addr[1], (this.reg.y >> 8) & 0xff);
	}
	this.stz = function(addr) {
		this.write(addr[0], 0);
		if (!this.flag.m) this.write(addr[1], 0);
	}


	this.mvn = function(addr) {
		const mask = (this.flag.x ? 0xff : 0xffff);
		const dst = (addr[0] << 16) | this.reg.y;
		const src = (addr[1] << 16) | this.reg.x;
		this.reg.a = (this.reg.a - 1) & 0xffff;
		this.reg.x = (this.reg.x + 1) & mask;
		this.reg.y = (this.reg.y + 1) & mask;
		this.reg.dbr = addr[0];

		this.write(dst, this.read(src));

		if (this.reg.a !== 0xffff) {
			this.reg.pc = (this.reg.pc - 3) & 0xffff;
		}
	}
	this.mvp = function(addr) {
		const mask = (this.flag.x ? 0xff : 0xffff);
		const dst = (addr[0] << 16) | this.reg.y;
		const src = (addr[1] << 16) | this.reg.x;
		this.reg.a = (this.reg.a - 1) & 0xffff;
		this.reg.x = (this.reg.x - 1) & mask;
		this.reg.y = (this.reg.y - 1) & mask;
		this.reg.dbr = addr[0];

		this.write(dst, this.read(src));

		if (this.reg.a !== 0xffff) {
			this.reg.pc = (this.reg.pc - 3) & 0xffff;
		}
	}


	this.nop = function() {
		;
	}
	this.wdm = function(addr) {
		;
	}


	this.pea = function(addr) {
		this.push(addr[1]);
		this.push(addr[0]);
	}
	this.pei = function(addr) {
		//this.push((addr[0] + 1) & 0xffff);
		this.push(this.read(addr[1]));
		this.push(this.read(addr[0]));
	}
	this.per = function(addr) {
		const offset = (addr[1] << 8) | addr[0];
		let pc = this.reg.pc;
		if (offset <= 0x7fff) {
			pc = (pc + offset + this.flag.c) & 0xffff;
		}
		else {
			pc = (pc + offset - 65536 + this.flag.c) & 0xffff;
		}
		const pch = (pc >> 8) & 0xff;
		const pcl = pc & 0xff;
		this.push(pch);
		this.push(pcl);
		return;
	}


	this.pha = function() {
		if (!this.flag.m) this.push((this.reg.a >> 8) & 0xff);
		this.push(this.reg.a & 0xff);
	}
	this.phx = function() {
		if (!this.flag.x) this.push((this.reg.x >> 8) & 0xff);
		this.push(this.reg.x & 0xff);
	}
	this.phy = function() {
		if (!this.flag.x) this.push((this.reg.y >> 8) & 0xff);
		this.push(this.reg.y & 0xff);
	}
	this.pla = function() {
		const msb = (this.flag.m ? 7 : 15);
		const mask = (this.flag.m ? 0xff : 0xffff);
		let a = this.pull();
		if (!this.flag.m) a |= (this.pull() << 8);
		this.flag.n = (a >> msb) & 1;
		this.flag.z = (a === 0) ? 1 : 0;
		this.reg.a = (this.reg.a & ~mask) | (a & mask);
	}
	this.plx = function() {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);
		let x = this.pull();
		if (!this.flag.x) x |= (this.pull() << 8);
		this.flag.n = (x >> msb) & 1;
		this.flag.z = (x === 0) ? 1 : 0;
		this.reg.x = (this.reg.x & ~mask) | (x & mask);
	}
	this.ply = function() {
		const msb = (this.flag.x ? 7 : 15);
		const mask = (this.flag.x ? 0xff : 0xffff);
		let y = this.pull();
		if (!this.flag.x) y |= (this.pull() << 8);
		this.flag.n = (y >> msb) & 1;
		this.flag.z = (y === 0) ? 1 : 0;
		this.reg.y = (this.reg.y & ~mask) | (y & mask);
	}


	this.phb = function() {
		this.push(this.reg.dbr);
	}
	this.phd = function() {
		this.push((this.reg.d >> 8) & 0xff);
		this.push((this.reg.d) & 0xff);
	}
	this.phk = function() {
		this.push(this.reg.k);
	}
	this.php = function() {
		this.push(this.getProcessorStatus());
	}
	this.plb = function() {
		this.reg.dbr = this.pull();
		this.flag.n = (this.reg.dbr >> 7) & 1;
		this.flag.z = (this.reg.dbr === 0) ? 1 : 0;
	}
	this.pld = function() {
		let d = this.pull();
		d = (this.pull() << 8) | d;
		this.flag.n = (d >> 15) & 1;
		this.flag.z = (d === 0) ? 1 : 0;
		this.reg.d = d;
	}
	this.plp = function() {
		const p = this.pull();
		//console.log(p.toString(2).padStart())
		this.setProcessorStatus(p);
	}

	
	this.stp = function() {
		//リセットされるまで待機
		this.halt = 1;
	}
	this.wai = function() {
		//割込み発生まで待機
		this.waitInterrupt = 1;
	}


	this.tax = function() {
		//a->x
		//転送先レジスタのビット幅に合わせて転送
		const mask = this.flag.x ? 0xff : 0xffff;
		const msb = this.flag.x ? 7 : 15;

		const a = this.reg.a & mask;
		
		this.flag.n = (a >> msb) & 1;
		this.flag.z = (a === 0) ? 1 : 0;
		this.reg.x = (this.reg.x & ~mask) | a;
	}
	this.tay = function() {
		//a->y
		const mask = this.flag.x ? 0xff : 0xffff;
		const msb = this.flag.x ? 7 : 15;

		const a = this.reg.a & mask;
		
		this.flag.n = (a >> msb) & 1;
		this.flag.z = (a === 0) ? 1 : 0;
		this.reg.y = (this.reg.y & ~mask) | a;
	}
	this.tsx = function() {
		//s->x
		const mask = this.flag.x ? 0xff : 0xffff;
		const msb = this.flag.x ? 7 : 15;

		const s = this.reg.s & mask;
		
		this.flag.n = (s >> msb) & 1;
		this.flag.z = (s === 0) ? 1 : 0;
		this.reg.x = (this.reg.x & ~mask) | s;
	}
	this.txa = function() {
		//x->a
		const mask = this.flag.m ? 0xff : 0xffff;
		const msb = this.flag.m ? 7 : 15;

		const x = this.reg.x & mask;
		
		this.flag.n = (x >> msb) & 1;
		this.flag.z = (x === 0) ? 1 : 0;
		this.reg.a = (this.reg.a & ~mask) | x;
	}
	this.txs = function() {
		//x->s
		//sレジスタは常に16bit転送
		const mask = 0xffff;
		const msb = 15;

		const x = this.reg.x & mask;
		
		// this.flag.n = (x >> msb) & 1;
		// this.flag.z = (x === 0) ? 1 : 0;
		this.reg.s = (this.reg.s & ~mask) | x;
		if (this.flag.e) this.reg.s = (this.reg.s & 0xff) | 0x0100;
	}
	this.txy = function() {
		//x->y
		const mask = this.flag.x ? 0xff : 0xffff;
		const msb = this.flag.x ? 7 : 15;

		const x = this.reg.x & mask;
		
		this.flag.n = (x >> msb) & 1;
		this.flag.z = (x === 0) ? 1 : 0;
		this.reg.y = (this.reg.y & ~mask) | x;
	}
	this.tya = function() {
		//y->a
		const mask = this.flag.m ? 0xff : 0xffff;
		const msb = this.flag.m ? 7 : 15;

		const y = this.reg.y & mask;
		
		this.flag.n = (y >> msb) & 1;
		this.flag.z = (y === 0) ? 1 : 0;
		this.reg.a = (this.reg.a & ~mask) | y;
	}
	this.tyx = function() {
		//y->x
		const mask = this.flag.x ? 0xff : 0xffff;
		const msb = this.flag.x ? 7 : 15;

		const y = this.reg.y & mask;
		
		this.flag.n = (y >> msb) & 1;
		this.flag.z = (y === 0) ? 1 : 0;
		this.reg.x = (this.reg.x & ~mask) | y;
	}


	this.tcd = function() {
		this.reg.d = this.reg.a;
		this.flag.n = (this.reg.d >> 15) & 1;
		this.flag.z = (this.reg.d === 0) ? 1 : 0;
	}
	this.tcs = function() {
		const mask = this.flag.e ? 0xff : 0xffff;
		const a = this.reg.a;
		// this.flag.n = (a >> 15) & 1;
		// this.flag.z = (a === 0) ? 1 : 0;
		this.reg.s = (this.reg.s & ~mask) | (a & mask);
	}
	this.tdc = function() {
		this.reg.a = this.reg.d;
		this.flag.n = (this.reg.a >> 15) & 1;
		this.flag.z = (this.reg.a === 0) ? 1 : 0;
	}
	this.tsc = function() {
		this.reg.a = this.reg.s;
		this.flag.n = (this.reg.a >> 15) & 1;
		this.flag.z = (this.reg.a === 0) ? 1 : 0;
	}
	

	this.xba = function() {
		const a = (this.reg.a >> 8) & 0xff;
		const b = this.reg.a & 0xff;
		this.flag.n = (a >> 7) & 1;
		this.flag.z = (a === 0) ? 1 : 0;
		this.reg.a = (b << 8) | a;
	}

	this.xce = function() {
		const t = this.flag.e;
		this.flag.e = this.flag.c;
		this.flag.c = t;

		if (this.flag.e) {
			this.setEmulationMode();
		}
	}


	this.mnemonicMatrix = [
		"brk", "ora", "cop", "ora", "tsb", "ora", "asl", "ora", "php", "ora", "asl", "phd", "tsb", "ora", "asl", "ora",
		"bpl", "ora", "ora", "ora", "trb", "ora", "asl", "ora", "clc", "ora", "inc", "tcs", "trb", "ora", "asl", "ora",
		"jsr", "and", "jsl", "and", "bit", "and", "rol", "and", "plp", "and", "rol", "pld", "bit", "and", "rol", "and",
		"bmi", "and", "and", "and", "bit", "and", "rol", "and", "sec", "and", "dec", "tsc", "bit", "and", "rol", "and",
		"rti", "eor", "wdm", "eor", "mvp", "eor", "lsr", "eor", "pha", "eor", "lsr", "phk", "jmp", "eor", "lsr", "eor",
		"bvc", "eor", "eor", "eor", "mvn", "eor", "lsr", "eor", "cli", "eor", "phy", "tcd", "jmp", "eor", "lsr", "eor",
		"rts", "adc", "per", "adc", "stz", "adc", "ror", "adc", "pla", "adc", "ror", "rtl", "jmp", "adc", "ror", "adc",
		"bvs", "adc", "adc", "adc", "stz", "adc", "ror", "adc", "sei", "adc", "ply", "tdc", "jmp", "adc", "ror", "adc",
		"bra", "sta", "brl", "sta", "sty", "sta", "stx", "sta", "dey", "bit", "txa", "phb", "sty", "sta", "stx", "sta",
		"bcc", "sta", "sta", "sta", "sty", "sta", "stx", "sta", "tya", "sta", "txs", "txy", "stz", "sta", "stz", "sta",
		"ldy", "lda", "ldx", "lda", "ldy", "lda", "ldx", "lda", "tay", "lda", "tax", "plb", "ldy", "lda", "ldx", "lda",
		"bcs", "lda", "lda", "lda", "ldy", "lda", "ldx", "lda", "clv", "lda", "tsx", "tyx", "ldy", "lda", "ldx", "lda",
		"cpy", "cmp", "rep", "cmp", "cpy", "cmp", "dec", "cmp", "iny", "cmp", "dex", "wai", "cpy", "cmp", "dec", "cmp",
		"bne", "cmp", "cmp", "cmp", "pei", "cmp", "dec", "cmp", "cld", "cmp", "phx", "stp", "jmp", "cmp", "dec", "cmp",
		"cpx", "sbc", "sep", "sbc", "cpx", "sbc", "inc", "sbc", "inx", "sbc", "nop", "xba", "cpx", "sbc", "inc", "sbc",
		"beq", "sbc", "sbc", "sbc", "pea", "sbc", "inc", "sbc", "sed", "sbc", "plx", "xce", "jsr", "sbc", "inc", "sbc",
	];
	this.modeMatrix = [
		"imp", "dxi", "imm", "srl", "dpg", "dpg", "dpg", "dpl", "imp", "imm", "acc", "imp", "abs", "abs", "abs", "lng",
		"pcr", "diy", "dpi", "sry", "dpg", "dpx", "dpx", "dly", "imp", "aby", "acc", "imp", "abs", "abx", "abx", "lnx",
		"abs", "dxi", "lng", "srl", "dpg", "dpg", "dpg", "dpl", "imp", "imm", "acc", "imp", "abs", "abs", "abs", "lng",
		"pcr", "diy", "dpi", "sry", "dpx", "dpx", "dpx", "dly", "imp", "aby", "acc", "imp", "abx", "abx", "abx", "lnx",
		"imp", "dxi", "imm", "srl", "blk", "dpg", "dpg", "dpl", "imp", "imm", "acc", "imp", "abs", "abs", "abs", "lng",
		"pcr", "diy", "dpi", "sry", "blk", "dpx", "dpx", "dly", "imp", "aby", "imp", "imp", "lng", "abx", "abx", "lnx",
		"imp", "dxi", "imm", "srl", "dpg", "dpg", "dpg", "dpl", "imp", "imm", "acc", "imp", "abi", "abs", "abs", "lng",
		"pcr", "diy", "dpi", "sry", "dpx", "dpx", "dpx", "dly", "imp", "aby", "imp", "imp", "axi", "abx", "abx", "lnx",
		"pcr", "dxi", "prl", "srl", "dpg", "dpg", "dpg", "dpl", "imp", "imm", "imp", "imp", "abs", "abs", "abs", "lng",
		"pcr", "diy", "dpi", "sry", "dpx", "dpx", "dpy", "dly", "imp", "aby", "imp", "imp", "abs", "abx", "abx", "lnx",
		"imm", "dxi", "imm", "srl", "dpg", "dpg", "dpg", "dpl", "imp", "imm", "imp", "imp", "abs", "abs", "abs", "lng",
		"pcr", "diy", "dpi", "sry", "dpx", "dpx", "dpy", "dly", "imp", "aby", "imp", "imp", "abx", "abx", "aby", "lnx",
		"imm", "dxi", "imm", "srl", "dpg", "dpg", "dpg", "dpl", "imp", "imm", "imp", "imp", "abs", "abs", "abs", "lng",
		"pcr", "diy", "dpi", "sry", "dpg", "dpx", "dpx", "dly", "imp", "aby", "imp", "imp", "abl", "abx", "abx", "lnx",
		"imm", "dxi", "imm", "srl", "dpg", "dpg", "dpg", "dpl", "imp", "imm", "imp", "imp", "abs", "abs", "abs", "lng",
		"pcr", "diy", "dpi", "sry", "imm", "dpx", "dpx", "dly", "imp", "aby", "imp", "imp", "axi", "abx", "abx", "lnx",
	];
	this.cycleMatrix = [
		8, 7, 8, 5, 7, 4, 7, 7, 3, 3, 2, 4, 8, 5, 8, 6,
		2, 7, 6, 8, 7, 5, 8, 7, 2, 6, 2, 2, 8, 6, 9, 6,
		6, 7, 8, 5, 4, 4, 7, 7, 4, 3, 2, 5, 5, 5, 8, 6,
		2, 7, 6, 8, 5, 5, 8, 7, 2, 6, 2, 2, 6, 6, 9, 6,
		7, 7, 2, 5, 7, 4, 7, 7, 4, 3, 2, 3, 3, 5, 8, 6,
		2, 7, 6, 8, 7, 5, 8, 7, 2, 6, 4, 2, 4, 6, 9, 6,
		6, 7, 6, 5, 4, 4, 7, 7, 5, 3, 2, 6, 5, 5, 8, 6,
		2, 7, 6, 8, 5, 5, 8, 7, 2, 6, 5, 2, 6, 6, 9, 6,
		3, 7, 4, 5, 4, 4, 4, 7, 2, 3, 2, 3, 5, 5, 5, 6,
		2, 7, 6, 8, 5, 5, 5, 7, 2, 6, 2, 2, 5, 6, 6, 6,
		3, 7, 3, 5, 4, 4, 4, 7, 2, 3, 2, 4, 5, 5, 5, 6,
		2, 7, 6, 8, 5, 5, 5, 7, 2, 6, 2, 2, 6, 6, 6, 6,
		3, 7, 3, 5, 4, 4, 7, 7, 2, 3, 2, 3, 5, 5, 8, 6,
		2, 7, 6, 8, 6, 5, 8, 7, 2, 6, 4, 3, 6, 6, 9, 6,
		3, 7, 3, 5, 4, 4, 7, 7, 2, 3, 2, 3, 5, 5, 8, 6,
		2, 7, 6, 8, 5, 5, 8, 7, 2, 6, 5, 2, 8, 6, 9, 6,
	];

	this.push = function(data) {
		const mask = this.flag.e ? 0xff : 0xffff;
		const s = this.reg.s & mask;
		this.write(s, data);
		this.reg.s = (this.reg.s & ~mask) | ((s - 1) & mask);
	}
	this.pull = function() {
		const mask = this.flag.e ? 0xff : 0xffff;
		let s = this.reg.s & mask;
		s = (s + 1) & mask;
		const res = this.read(s);
		this.reg.s = (this.reg.s & ~mask) | s;
		return res;
		//return this.read(++this.reg.s);
	}

	this.getProcessorStatus = function() {
		let res = 0;
		res |= (this.flag.n << 7);
		res |= (this.flag.v << 6);
		res |= (this.flag.m << 5);
		res |= (this.flag.x << 4);
		res |= (this.flag.d << 3);
		res |= (this.flag.i << 2);
		res |= (this.flag.z << 1);
		res |= (this.flag.c << 0);
		return res;
	}
	this.setProcessorStatus = function(data) {
		this.flag.n = (data >> 7) & 1;
		this.flag.v = (data >> 6) & 1;
		this.flag.m = (data >> 5) & 1;
		this.flag.x = (data >> 4) & 1;
		this.flag.d = (data >> 3) & 1;
		this.flag.i = (data >> 2) & 1;
		this.flag.z = (data >> 1) & 1;
		this.flag.c = (data >> 0) & 1;
		if (this.flag.x) {
			this.reg.x &= 0xff;
			this.reg.y &= 0xff;
		}
		if (this.flag.e) {
			this.setEmulationMode();
		}
	}

	this.setEmulationMode = function() {
		this.flag.m = 1;
		this.flag.x = 1;
		this.reg.x &= 0xff;
		this.reg.y &= 0xff;
		this.reg.s = 0x100 | (this.reg.s & 0xff);
	}

	//4202h-4206h
	this.WRMPYA = 0xFF;
	this.WRMPYB = 0xFF;
	this.WRDIVL = 0xFF;
	this.WRDIVH = 0xFF;
	this.WRDIVB = 0xFF;

	//4214h-4217h
	this.RDDIVL = 0;
	this.RDDIVH = 0;
	this.RDMPYL = 0;
	this.RDMPYH = 0;

	this.read = function(address, debug = 0) {
		let bank = (address >> 16) & 0xff;
		let offset = address & 0xffff;
		let res = undefined;

		if (bank <= 0x3f) {
			//System Area (8K WRAM, I/O Ports, Expansion)
			if (offset <= 0x1fff) {
				//warm mirror(8K)
				res = this.read(offset | 0x7E_0000);
			}
			else if (offset <= 0x20ff) {
				///// 未使用 /////
			}
			else if (offset <= 0x21ff) {
				///// I/Oポート_Bバス(3.58MHz) /////
				if (0x2134 <= offset && offset <= 0x213F) {
					res = this.ppu.readPPUReg(offset);
				}
				else if (0x2140 <= offset && offset <= 0x217f) {
					//apu
					res = this.apu.readRegister(offset);
					//logger.log(`cpu <- apu port[$${offset.toString(16)}]=$${res.toString(16)}`);
				}
				else {
					///// WRAM Access /////
					switch (offset) {
						case 0x2180: {
							//wmdata
							let a = (this.wmaddh << 16) | (this.wmaddm << 8) | this.wmaddl;
							res = this.read(a | 0x7E_0000);

							a++;
							this.wmaddh = (a >> 16) & 1;
							this.wmaddm = (a >> 8) & 0xFF;
							this.wmaddl = a & 0xFF;

							//console.log(`read WRAM[${offset.toString(16).padStart(6, 0)}] = ${res}`);
							break;
						}
					}
				}
			}
			else if (offset <= 0x3fff) {
				///// 未使用 /////
			}
			else if (offset <= 0x41ff) {
				///// I/Oポート(1.78MHz) /////
				if (offset === 0x4016 || offset === 0x4017) {
					//JOY1/JOY2
					res = this.controller.read(offset);
					//logger.log(`read [${address.toString(16).padStart(6, 0)}] = ${res.toString(16).padStart(4, 0)}`);
				}
				else {
					//4000h..4015h, 4018h..41FFh Unused
					//console.error(`read ${offset.toString(16).padStart(4, 0)}h Unused region (open bus)`);
				}
			}
			else if (offset <= 0x5fff) {
				///// I/Oポート(1.78MHz) /////
				if (0x4210 <= offset && offset <= 0x4211) {
					res = this.ppu.readPPUReg(offset);
					//console.log(address.toString(16), ":", res.toString(2).padStart(8, 0));
				}
				else if (offset === 0x4212) {
					//HVBJOY
					res |= this.ppu.readPPUReg(offset) & 0xc0;
					res |= this.controller.read(offset) & 1;
					//console.log(`read ${address.toString(16).padStart(6, 0)}=${res.toString(2).padStart(8, 0)}`);
				}
				else if (offset === 0x4213) {
					//RDIO
					res = this.controller.read(offset);
					//console.log(`read ${address.toString(16).padStart(6, 0)}=${res.toString(2).padStart(8, 0)}`);
				}
				else if (0x4214 <= offset && offset <= 0x4217) {
					if (offset === 0x4214) {
						res = this.RDDIVL;
						//logger.log(`RDDIVL:${this.RDDIVL.toString(16).padStart(2, 0)}`);
					}
					else if (offset === 0x4215) {
						res = this.RDDIVH;
						//logger.log(`RDDIVH:${this.RDDIVH.toString(16).padStart(2, 0)}`);
					}
					else if (offset === 0x4216) {
						res = this.RDMPYL;
						//logger.log(`RDMPYL:${this.RDMPYL.toString(16).padStart(2, 0)}`);
					}
					else if (offset === 0x4217) {
						res = this.RDMPYH;
						//logger.log(`RDMPYH:${this.RDMPYH.toString(16).padStart(2, 0)}`);
					}

					//console.log(`read ${address.toString(16).padStart(6, 0)} ${res.toString(16).padStart(2,0)}`)
				}
				else if (0x4218 <= offset && offset <= 0x421F) {
					//JOY1L/JOY1H
					//JOY2L/JOY2H
					//JOY3L/JOY3H
					//JOY4L/JOY4H
					res = this.controller.read(offset);

					//console.log(`read ${address.toString(16).padStart(6, 0)}=${res.toString(2).padStart(8, 0)}`);
				}
				else {
					const ch = (offset >> 4) & 15;
					switch (offset & 0xF) {
						case 0x0: {
							res = this.dmapx[ch];
							break;
						}
						case 0x1: {
							res = this.bbadx[ch];
							break;
						}
						case 0x2: {
							res = this.a1txl[ch];
							break;
						}
						case 0x3: {
							res = this.a1txh[ch];
							break;
						}
						case 0x4: {
							res = this.a1bx[ch];
							break;
						}
						case 0x5: {
							res = this.dasxl[ch];
							break;
						}
						case 0x6: {
							res = this.dasxh[ch];
							break;
						}
						case 0x7: {
							res = this.dasbx[ch];
							break;
						}
						case 0x8: {
							res = this.a2axl[ch];
							break;
						}
						case 0x9: {
							res = this.a2axh[ch];
							break;
						}
						case 0xA: {
							res = this.ntrlx[ch];
							break;
						}
						case 0xB:
						case 0xF:  {
							res = this.unusedx[ch];
							break;
						}
						case 0xC:
						case 0xD:
						case 0xE: {
							//logger.log("read $43xC/$43xD/$43xE open bus")
							break;
						}
					}
				}
			}
			else if (offset <= 0x7fff) {
				///// 拡張(2.68MHz) /////
			}
			else {
				//WS1 LoROM (max 2048 Kbytes) (64x32K)
				res = this.cartridge.read(address);
			}
		}
		else if (bank <= 0x7d) {
			//WS1 HiROM (max 3968 Kbytes) (62x64K)
			res = this.cartridge.read(address);
		}
		else if (bank <= 0x7f) {
			//WRAM (Work RAM, 128 Kbytes) (2x64K)
			res = this.wram[address - 0x7e_0000];
			//if (address === 0x7e_0085) logger.log(`read WRAM[${(address - 0x7e_0000).toString(16).padStart(6, 0)}] = ${res.toString(16).padStart(2, 0)}`);
		}
		else if (bank <= 0xbf) {
			if (offset <= 0x7fff) {
				//System Area (8K WRAM, I/O Ports, Expansion)
				res = this.read(address & ~0x80_0000);
			}
			else {
				//WS2 LoROM (max 2048 Kbytes) (64x32K)
				res = this.cartridge.read(address);
			}
		}
		else if (bank <= 0xff) {
			//WS2 HiROM (max 4096 Kbytes) (64x64K)
			res = this.cartridge.read(address);
		}

		if (res === undefined) {
			//オープンバス
			res = this.mdr;
		}

		return res;
	}

	this.write = function(address, data) {
		const bank = (address >> 16) & 0xff;
		const offset = address & 0xffff;

		if (bank <= 0x3f) {
			//System Area (8K WRAM, I/O Ports, Expansion)
			if (offset <= 0x1fff) {
				//warm mirror(8K)
				this.write(offset | 0x7E_0000, data);
			}
			else if (offset <= 0x20ff) {
				///// unused /////
			}
			else if (offset <= 0x21ff) {
				if (offset <= 0x2133) {
					this.ppu.writePPUReg(offset, data);
				}
				else if (0x2140 <= offset && offset <= 0x217f) {
					//apu
					this.apu.writeRegister(offset, data);
					//logger.log(`cpu -> apu port[$${offset.toString(16)}]=$${data.toString(16)}`);
				}
				else if (0x2180 <= offset && offset <= 0x2183) {
					//wram
					//WRAM
					switch (offset) {
						case 0x2180: {
							//wmdata
							let a = (this.wmaddh << 16) | (this.wmaddm << 8) | this.wmaddl;
							this.write(a | 0x7E_0000, data);

							//logger.log(`2180h WRMA[${a.toString(16).padStart(6, 0)}] <- ${data.toString(16).padStart(2, 0)}`);

							a++;
							this.wmaddh = (a >> 16) & 1;
							this.wmaddm = (a >> 8) & 0xFF;
							this.wmaddl = a & 0xFF;
							break;
						}
						case 0x2181: {
							this.wmaddl = data;
							break;
						}
						case 0x2182: {
							this.wmaddm = data;
							break;
						}
						case 0x2183: {
							this.wmaddh = data;
							break;
						}
					}

					// const addr = (this.wmaddh << 16) | (this.wmaddm << 8) | this.wmaddl;
					// console.log(`WRAM Address:${addr.toString(16).padStart(6, 0)}`);
				}
			}
			else if (offset <= 0x3fff) {
				///// Unused /////
			}
			else if (offset <= 0x41ff) {
				if (offset === 0x4016) {
					this.controller.write(offset, data);
					//logger.log(`write ${address.toString(16).padStart(6, 0)}=${data.toString(2).padStart(8, 0)}`);
				}
			}
			else if (offset <= 0x5fff) {
				///// I/O Ports
				if (offset === 0x4200) {
					//NMITIMEN
					this.ppu.writePPUReg(offset, data & 0xB0);
					this.controller.write(offset, data & 1);
					//console.log(`write ${address.toString(16).padStart(6, 0)}=${data.toString(2).padStart(8, 0)}`);
				}
				else if (offset === 0x4201) {
					//WRIO
					this.controller.write(offset, data);
					//console.log(`write ${address.toString(16).padStart(6, 0)}=${data.toString(2).padStart(8, 0)}`);
				}
				else if (0x4202 <= offset && offset <= 0x4206) {
					if (offset === 0x4202) {
						this.WRMPYA = data;
						//logger.log(`WRMPYA:${this.WRMPYA.toString(16).padStart(2, 0)}`);
					}
					else if (offset === 0x4203) {
						this.WRMPYB = data;

						const multiply = this.WRMPYA * this.WRMPYB;
						this.RDMPYL = multiply & 0xFF;
						this.RDMPYH = (multiply >> 8) & 0xFF;

						this.RDDIVL = this.WRMPYB;
						this.RDDIVH = 0;

						//logger.log(`WRMPYB:${this.WRMPYB.toString(16).padStart(2, 0)}`);
						//logger.log(`WRMPYB ${this.WRMPYA} * ${this.WRMPYB} = ${multiply} -> ${multiply.toString(16).padStart(2,0)} H:${this.RDMPYH.toString(16).padStart(2,0)} L:${this.RDMPYL.toString(16).padStart(2,0)}`)
					}
					else if (offset === 0x4204) {
						this.WRDIVL = data;
						//logger.log(`WRDIVL:${this.WRDIVL.toString(16).padStart(2, 0)}`);
					}
					else if (offset === 0x4205) {
						this.WRDIVH = data;
						//logger.log(`WRDIVH:${this.WRDIVH.toString(16).padStart(2, 0)}`);
					}
					else if (offset === 0x4206) {
						this.WRDIVB = data;
						
						const dividend = (this.WRDIVH << 8) | this.WRDIVL;
						const divisor = this.WRDIVB;

						let res = 0xFFFF;
						let remainder = dividend;
						if (this.WRDIVB !== 0) {
							res = Math.trunc(dividend / divisor);
							remainder = dividend % divisor;
						}
						//const res = Math.trunc(((this.WRDIVH << 8) | this.WRDIVL) / this.WRDIVB);
						
						this.RDDIVL = res & 0xFF;
						this.RDDIVH = (res >> 8) & 0xFF;
						this.RDMPYL = remainder & 0xFF;
						this.RDMPYH = (remainder >> 8) & 0xFF;

						//logger.log(`WRDIVB:${this.WRDIVB.toString(16).padStart(2, 0)}`);
						//logger.log(`WRDIVB:${this.WRDIVB.toString(16).padStart(2, 0)} RDDIVH:${this.RDDIVH.toString(16).padStart(2, 0)} RDDIVL:${this.RDDIVL.toString(16).padStart(2, 0)}`);
					}
				}
				else if (0x4207 <= offset && offset <= 0x420a) {
					this.ppu.writePPUReg(offset, data);
				}
				else {
					//logger.log(`W	${offset.toString(16)}	${data.toString(2).padStart(8, 0)}`);


					if (offset === 0x420B) {
						this.mdmaen = data;
					}
					else if (offset === 0x420C) {
						this.hdmaen = data;
					}
					else {
						const ch = (offset >> 4) & 15;
						switch (offset & 0xF) {
							case 0x0: {
								this.dmapx[ch] = data;
								break;
							}
							case 0x1: {
								this.bbadx[ch] = data;
								break;
							}
							case 0x2: {
								this.a1txl[ch] = data;
								break;
							}
							case 0x3: {
								this.a1txh[ch] = data;
								break;
							}
							case 0x4: {
								this.a1bx[ch] = data;
								break;
							}
							case 0x5: {
								this.dasxl[ch] = data;
								break;
							}
							case 0x6: {
								this.dasxh[ch] = data;
								break;
							}
							case 0x7: {
								this.dasbx[ch] = data;
								break;
							}
							case 0x8: {
								this.a2axl[ch] = data;
								break;
							}
							case 0x9: {
								this.a2axh[ch] = data;
								break;
							}
							case 0xA: {
								this.ntrlx[ch] = data;
								break;
							}
							case 0xB:
							case 0xF:  {
								this.unusedx[ch] = data;
								break;
							}
							case 0xC:
							case 0xD:
							case 0xE: {
								//logger.log("write $43xC/$43xD/$43xE open bus")
								break;
							}
						}
					}

				}
			}
			else if (offset <= 0x7fff) {
				//Expansion
			}
			else {
				//WS1 LoROM (max 2048 Kbytes) (64x32K)
				//console.log("[cpu.read()] offset:", offset - 0x8000);
				//this.cartridge.write(offset - 0x8000, data);
				//console.error("ROMに書き込み？");
			}
		}
		else if (bank <= 0x7d) {
			//WS1 HiROM (max 3968 Kbytes) (62x64K)
		}
		else if (bank <= 0x7f) {
			//WRAM (Work RAM, 128 Kbytes) (2x64K)
			this.wram[address - 0x7e_0000] = data;
			//if (address === 0x7e_0085) logger.log(`write WRAM[${(address - 0x7e_0000).toString(16).padStart(6, 0)}] <= ${data.toString(16).padStart(2, 0)}`);
		}
		else if (bank <= 0xbf) {
			if (offset <= 0x7fff) {
				//System Area (8K WRAM, I/O Ports, Expansion)
				this.write(address & ~0x80_0000, data);
			}
			else {
				//WS2 LoROM (max 2048 Kbytes) (64x32K)
			}
		}
		else if (bank <= 0xff) {
			//WS2 HiROM (max 4096 Kbytes) (64x64K)
		}
	}
}
