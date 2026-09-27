
import { logger } from "./logger.js";

const LOROM = 0;
const HIROM = 1;
const EXHIROM = 2;

const ROMTypeName = [
	"LOROM",
	"HIROM",
	"EXHIROM"
];

const header = [
	0x00_7FC0,
	0x00_FFC0,
	0x40_FFC0,
];

export function Cartridge() {
	this.ROM = undefined;

	this.ROMType;
	this.headered;

	this.reset = function() {
		;
	}

	this.load = function(ROM) {

		this.headered = (ROM.byteLength & 0x3FF) === 0x200;
		if (this.headered) {
			this.ROM = new Uint8Array(ROM.slice(0x200)); 
		}
		else {
			this.ROM = new Uint8Array(ROM);
		}

		//ヘッダーなし
		for (let i = 0; i < 3; i++) {
			const headerAddress = header[i];
			if (headerAddress >= this.ROM.length) {
				continue;
			}

			//チェックサムを確認
			const checksum = this.ROM[headerAddress + 0x1C] | (this.ROM[headerAddress + 0x1D] << 8);
			const checksumCompliment = this.ROM[headerAddress + 0x1E] | (this.ROM[headerAddress + 0x1F] << 8);
			if ((checksum ^ checksumCompliment) === 0xFFFF) {
				this.ROMType = i;
				return;
			}

			//マップモードを確認
			const mapMode = this.ROM[headerAddress + 0x15];
			switch (mapMode) {
				case 0x20:
				case 0x30: {
					this.ROMType = LOROM;
					return;
				}
				case 0x21:
				case 0x31: {
					this.ROMType = HIROM;
					return;
				}
				case 0x25:
				case 0x35: {
					this.ROMType = EXHIROM;
					return;
				}
			}

			//リセットベクタ(最初の命令)を確認
			const resetVector = this.ROM[headerAddress + 0x3C] | (this.ROM[headerAddress + 0x3D] << 8)
			const op = this.ROM[resetVector];

			if (resetVector >= 0x8000) {
				//sei,clc,sec,stz,jmp,jmlのいずれなら有効
				if (op === 0x78 ||	//sei
					op === 0x18	||	//clc
					op === 0x38	||	//sec
					op === 0x64 || op === 0x74 || op === 0x9c || op === 0x9E ||	//stz
					op === 0x4c || op === 0x5c || op === 0x6c || op === 0x7c || op === 0xdc ||	//jmp
					op === 0x22	//jml
				) {
					this.ROMType = i;
					//this.headered = 0;
					return;
				}
			}

			

			// if (resetVector != 0 && resetVector != 0xffff) {
			// 	//brk,cop,stp,wdm,$ff(sbc long)は無効
			// 	if (op === 0x00 || //brk
			// 		op === 0x02 || //cop
			// 		op === 0xdb || //stp
			// 		op === 0x42 || //wdb
			// 		op === 0xff
			// 	) {
			// 		continue;
			// 	}
			// 	else {
			// 		this.ROMType = i;
			// 		return;
			// 	}
			// }

			

			// {
			// 	//タイトル
			// 	let title = "";
			// 	for (let i = 0; i < 21; i++) {
			// 		const code = this.ROM[headerAddress + i];

			// 		//英大文字("A"..."Z")か判定
			// 		if (0x41 <= code && code <= 0x5a) {
			// 			title += String.fromCharCode(code);
			// 		}
			// 	}
				
			// 	logger.log(`title:${title}`);

			// 	//ROM速度
			// 	const ROMSpeed = this.ROM[headerAddress + 15];
			// 	logger.log(`ROMSpeed:${ROMSpeed}`);

			// 	//チップセット
			// 	const chipset = this.ROM[headerAddress + 16];
			// 	logger.log(`chipset:${chipset}`);

			// 	//ROMサイズ、RAMサイズを確認
			// 	const ROMSize = this.ROM[headerAddress + 17];
			// 	const RAMSize = this.ROM[headerAddress + 18];
			// 	logger.log(`ROMSize:${1 << ROMSize}[KB]`);
			// 	logger.log(`RAMSize:${1 << RAMSize}[KB]`);
				
			// 	if (ROMSize === 0) {
			// 		continue;
			// 	}
			// }

		}
		
		//ROMを判定できない場合はLOROMとして扱う
		this.ROMType = LOROM;

		return;
	}

	this.read = function(address) {
		let a = address;
		
		if (this.ROMType === LOROM) {
			const temp = a >> 16;
			a = ((a & 0x7FFF) | (temp << 15));
			a &= 0x1F_FFFF;
		}
		else if (this.ROMType === HIROM) {
			a &= 0x3F_FFFF;
		}

		if (a > this.ROM.length) {
			a &= (this.ROM.length - 1);
		}

		//logger.log(`ROM[${a.toString(16).padStart(6, 0)}(${address.toString(16).padStart(6, 0)})] = ${this.ROM[a].toString(16).padStart(2, 0)}`);

		return this.ROM[a];
	}

	this.isHiROM = function() {
		return (this.ROMType === HIROM);
	}
}