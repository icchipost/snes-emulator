
import { Renderer } from "./renderer.js";
import { logger } from "./logger.js";

//レジスタアドレス定数
const INIDISP = 0x2100;
const SETINI = 0x2133;
const BGMODE = 0x2105;
const MOSAIC = 0x2106;
const M7SEL = 0x211A;
const M7A = 0x211B;
const M7B = 0x211C;
const M7C = 0x211D;
const M7D = 0x211E;
const M7X = 0x211F;
const M7Y = 0x2120;
const TM = 0x212C;
const TS = 0x212D;
const OBSEL = 0x2101;
const OAMADDL = 0x2102;
const OAMADDH = 0x2103;
const OAMDATA = 0x2104;
const RDOAM = 0x2138;
const VMAIN = 0x2115;
const VMADDL = 0x2116;
const VMADDH = 0x2117;
const VMDATAL = 0x2118;
const VMDATAH = 0x2119;
const RDVRAML = 0x2139;
const RDVRAMH = 0x213A;
const CGADD = 0x2121;
const CGDATA = 0x2122;
const RDCGRAM = 0x213B;
const BG1SC = 0x2107;
const BG2SC = 0x2108;
const BG3SC = 0x2109;
const BG4SC = 0x210A;
const BG12NBA = 0x210B;
const BG34NBA = 0x210C;
const BG1HOFS = 0x210D;
const BG1VOFS = 0x210E;
const BG2HOFS = 0x210F;
const BG2VOFS = 0x2110;
const BG3HOFS = 0x2111;
const BG3VOFS = 0x2112;
const BG4HOFS = 0x2113;
const BG4VOFS = 0x2114;
const W12SEL = 0x2123;
const W34SEL = 0x2124;
const WOBJSEL = 0x2125;
const WH0 = 0x2126;
const WH1 = 0x2127;
const WH2 = 0x2128;
const WH3 = 0x2129;
const WBGLOG = 0x212A;
const WOBJLOG = 0x212B;
const TMW = 0x212E;
const TSW = 0x212F;
const CGWSEL = 0x2130;
const CGADSUB = 0x2131;
const COLDATA = 0x2132;
const MPYL = 0x2134;
const MPYM = 0x2135;
const MPYH = 0x2136;
const SLHV = 0x2137;
const OPHCT = 0x213C;
const OPVCT = 0x213D;
const STAT77 = 0x213E;
const STAT78 = 0x213F;

const NMITIMEN = 0x4200;
const HTIMEL = 0x4207;
const HTIMEH = 0x4208;
const VTIMEL = 0x4209;
const VTIMEH = 0x420A;
const RDNMI = 0x4210;
const TIMEUP = 0x4211;
const HVBJOY = 0x4212;

const VRAM_SIZE = 0x8000;
const OAM_SIZE = 544;
const CGRAM_SIZE = 512;

export function PPU() {
	
	//vram
	//32k word(8bit x 32 * 2)
	this.vramLo = new Uint8Array(VRAM_SIZE);
	this.vramHi = new Uint8Array(VRAM_SIZE);

	//16bit
	this.latchVram = 0;

	this.OAM = new Uint8Array(OAM_SIZE);
	this.CGRAM = new Uint8Array(CGRAM_SIZE);

	this.reg = new Uint16Array(0x5000);
	
	this.M7HOFS = 0x0000;
	this.M7VOFS = 0x0000;
	this.M7x_Latch = 0;
	this.M7x_Old = 0;

	this.internalOAMAddress = 0;
	this.OAMAccessParity = 0;
	this.latchOAMDATA = 0;
	
	this.CGADDAccessFlip = 0;

	this.latchOPHCT = 0;
	this.latchOPVCT = 0;
	
	this.BGxOFS_Old = 0;
	this.BGxOFSLatch = 0;
	this.BGxHOFSLatch = 0;

	this.HCount = 0;
	this.VCount = 0;

	this.cpu;
	this.renderer = new Renderer(".myCanvas");
	this.rendererDebug = new Renderer(".myCanvasTilemap");

	// const bppTable = [
	// 	2, 2, 2, 2,	//mode0
	// 	4, 4, 2, 0,	
	// 	4, 4, 0, 0,
	// 	8, 4, 0, 0,
	// 	8, 2, 0, 0,
	// 	4, 2, 0, 0,
	// 	4, 0, 0, 0,
	// 	8, 0, 0, 0,	//mode7
	// ];


	// const CGRAMBaseAddrTable = [
	// 	[0x00, 0x20, 0x40, 0x60, 0x80],
	// 	[0x00, 0x00, 0x00, 0x00, 0x80],
	// 	[0x00, 0x00, 0x00, 0x00, 0x80],
	// 	[0x00, 0x00, 0x00, 0x00, 0x80],
	// 	[0x00, 0x00, 0x00, 0x00, 0x80],
	// 	[0x00, 0x00, 0x00, 0x00, 0x80],
	// 	[0x00, 0x00, 0x00, 0x00, 0x80],
	// 	[0x00, 0x00, 0x00, 0x00, 0x80],
	// ];
	
	// this.bgColor = new Array(4);
	// this.bgPalette = new Array(4);
	this.bgPriority = new Array(4);
	this.screenColorValueBuffer = new Array(5);
	this.screenPaletteIndexBuffer = new Array(5);
	this.screenColorIndexBuffer = new Array(5);
	this.screenPriorityBuffer = new Array(5);

	this.objColorDataBuffer = new Array(256);
	this.objPriorityBuffer = new Array(256);
	this.objPaletteIndexBuffer = new Array(256);
	this.objColorIndexBuffer = new Array(256);
	const objSizeTable = [[8, 16], [8, 32], [8, 64], [16, 32], [16, 64], [32, 64]];
	
	//mode * 10 + screenNum * 2 + priorty
	// const priorityTable = [
	// 	//bg1		bg2			bg3			bg4			obj
	// 	5,  2,		6,  3,		11,  8,		12,  9,		10, 7, 4, 1,	//mode0
	// 	5,  2,		6,  3,		11,  8,		14, 14,		10, 7, 4, 1,	//mode1
	// 	5,  2,		6,  3,		11,  8,		12,  9,		10, 7, 4, 1,	//mode2
	// 	5,  2,		6,  3,		11,  8,		12,  9,		10, 7, 4, 1,	//mode3
	// 	5,  2,		6,  3,		11,  8,		12,  9,		10, 7, 4, 1,	//mode4
	// 	5,  2,		6,  3,		11,  8,		12,  9,		10, 7, 4, 1,	//mode5
	// 	5,  2,		6,  3,		11,  8,		12,  9,		10, 7, 4, 1,	//mode6
	// 	8, 14,		4, 14,		14, 14,		14, 14,		10, 7, 4, 1,	//mode7
	// ];

	const priorityTable = [
		//bg1			//bg2			//bg3			//bg4			//obj
		//pri=0	pri=1	pri=0	pri=1	pri=0	pri=1	pri=0	pri=1	pri=0	pri=1	pri=2	pri=3
		6,		3,		7,		4,		12,		9,		13,		10,		11,		8,		5,		2,		//mode0
		6,		3,		7,		4,		12,		9,		14,		14,		11,		8,		5,		2,		//mode1
		6,		2,		8,		4,		14,		14,		14,		14,		7,		5,		3,		1,		//mode2
		6,		2,		8,		4,		14,		14,		14,		14,		7,		5,		3,		1,		//mode3
		6,		2,		8,		4,		14,		14,		14,		14,		7,		5,		3,		1,		//mode4
		6,		2,		8,		4,		14,		14,		14,		14,		7,		5,		3,		1,		//mode5
		6,		2,		8,		4,		14,		14,		14,		14,		7,		5,		3,		1,		//mode6
		6,		2,		8,		4,		14,		14,		14,		14,		7,		5,		3,		1,		//mode7
	];


	this.insideWindow = new Array(6);
	this.colorConstantData = 0;

	
	this.state;
	const VISIBLE = 0;
	const HBLANK = 1;
	const VBLANK = 2;

	this.fieldFlag = 0;


	this.tileCache2bpp = new Array(4096);
	this.tileCache4bpp = new Array(2048);
	this.tileCache8bpp = new Array(1024);
	this.vramTileCacheVersion = 0;

	this.reset = function(powerOn = 0) {
		//メモリ初期化
		for (let i = 0; i < VRAM_SIZE; i++) {
			this.vramLo[i] = this.vramHi[i] = 0;
		}
		for (let i = 0; i < OAM_SIZE; i++) {
			this.OAM[i] = 0;
		}
		for (let i = 0; i < CGRAM_SIZE; i++) {
			this.CGRAM[i] = 0;
		}

		//レジスタ初期化
		this.HCount = 0;
		this.VCount = 0;

		for (let i = 0; i < 0x5000; i++) {
			this.reg[i] = 0;
		}

		this.reg[BGMODE]= 0x0F;
		this.reg[INIDISP] = 0x80;
		this.reg[VMAIN] = 0x0F;
		this.reg[M7A] = 0xFF;
		this.reg[M7B] = 0xFF;
		this.reg[SETINI] = 0x00;
		this.reg[OPHCT] = 0x01ff;
		this.reg[OPVCT] = 0x01ff;
		this.reg[STAT78] = 0x00;
		this.reg[NMITIMEN] = 0x00;
		this.reg[RDNMI] = 0x00;
		this.reg[MPYL] = 0x01;
		this.reg[MPYM] = 0x00;
		this.reg[MPYH] = 0x00;
	
		this.vramTileCacheVersion = 0;
	}

	this.setCpu = function(cpu) {
		this.cpu = cpu;
	}

	this.clock = function(clock, debug = 0) {
		//if (clock % 4 !== 0) return; 
		if (clock & 3 !== 0) return; 

		if (this.VCount >= 0 && this.VCount <= 223) {
			if (this.HCount >= 0 && this.HCount <= 255) {
				this.state = VISIBLE;
			}
			else if (this.HCount >= 256 && this.HCount <= 340) {
				this.state = HBLANK;
			}
		}
		else if (this.VCount >= 224 && this.VCount <= 261) {
			this.state = VBLANK;
		}

		//timer IRQ
		{
			const HVIRQ = (this.reg[NMITIMEN] >> 4) & 3;
			
			if (HVIRQ) {
				const HCountTimerValue = ((this.reg[HTIMEH] & 1) << 8) | this.reg[HTIMEL];
				const VCountTimerValue = ((this.reg[VTIMEH] & 1) << 8) | this.reg[VTIMEL];
				
				let IRQFlag = 0;
				if (HVIRQ === 1 && HCountTimerValue === this.HCount) IRQFlag = 1;
				else if (HVIRQ === 2 && this.HCount === 0 && VCountTimerValue === this.VCount) IRQFlag = 1;
				else if (HVIRQ === 3 && HCountTimerValue === this.HCount && VCountTimerValue === this.VCount) IRQFlag = 1;
				
				if (IRQFlag) {
					this.reg[TIMEUP] |= 0x80;
					this.cpu.assertIRQ();

					//logger.log(`H:${this.HCount} V:${this.VCount} IRQ assert`);
				}
			}
			else {
				this.reg[TIMEUP] &= ~0x80;
			}
		}

		if (this.state === VISIBLE) {
			if (this.HCount === 0) {
				this.reg[HVBJOY] &= ~0x40;
				this.cpu.assertHBlank(0);

				if (this.VCount === 0) {
					this.reg[RDNMI] &= ~0x80;
					this.reg[HVBJOY] &= ~0x80;
					this.reg[STAT77] &= ~0xC0;
					this.cpu.assertVBlank(0);

					this.fieldFlag ^= 1;
					this.reg[STAT78] ^= 0x80;
				}
			}

			const mode = this.reg[BGMODE] & 7;
			const H512Mode = ((mode === 5 || mode === 6) ? 1 : 0);
			const pseudoH512Mode = (this.reg[SETINI] >> 3) & 1;
			const interlaceMode = this.reg[SETINI] & 1;

			let h = this.HCount;
			let v = this.VCount;
			if (H512Mode === 1 || pseudoH512Mode === 1) {
				h = h * 2;
			}
			if (interlaceMode === 1) {
				v = v * 2 + this.fieldFlag;
			}
			
			this.fetchPixel(h, v, mode);

			this.fetchObjPixel(h, v, mode);
			this.fetchObjPixel(this.HCount, v, mode);

			let evenPixelColor = 0, oddPixelColor = 0;
			oddPixelColor = evenPixelColor = this.generatePixel(h, v, mode);

			
			this.drawPixel(this.renderer, this.HCount, this.VCount, evenPixelColor);
			// this.drawPixel(this.renderer, this.HCount * 2,		this.VCount * 2,		evenPixelColor);
			// this.drawPixel(this.renderer, this.HCount * 2 + 1,	this.VCount * 2,		oddPixelColor);
			// this.drawPixel(this.renderer, this.HCount * 2,		this.VCount * 2 + 1,	evenPixelColor);
			// this.drawPixel(this.renderer, this.HCount * 2 + 1,	this.VCount * 2 + 1,	oddPixelColor);
		}
		else if (this.state === HBLANK) {
			if (this.HCount === 256) {
				this.reg[HVBJOY] |= 0x40;
				this.cpu.assertHBlank(1);
			}
		}
		else if (this.state === VBLANK) {
			const bgVDirectionDisplay = (this.reg[SETINI] >> 2) & 1;
			const displayLine = (bgVDirectionDisplay ? 239 : 224) + 1;
			if (this.VCount === displayLine && this.HCount === 0) {
				this.reg[RDNMI] |= 0x80;
				this.reg[HVBJOY] |= 0x80;
				this.cpu.assertVBlank(1);
				if ((this.reg[NMITIMEN] >> 7) & 1) {
					this.cpu.assertNMI();
				}
			}
		}

		if (this.VCount < 224 && this.HCount === 0) {
			this.evaluateObj(this.VCount);
		}

		this.HCount++;
		if (this.HCount >= 341) {
			this.HCount = 0;
			this.VCount++;
			if (this.VCount >= 262) {
				this.VCount = 0;
			}
		}
	}




	this.fetchPixel = function(dispX, dispY, mode) {
		for (let i = 0; i < 5; i++) {
			this.screenColorValueBuffer[i] = 0;
			this.screenPaletteIndexBuffer[i] = 0;
			this.screenColorIndexBuffer[i] = 0;
			this.screenPriorityBuffer[i] = 14;
		}
		
		if (mode === 0) {
			this.fetchBgPixel(dispX, dispY, 0, 2, 0);
			this.fetchBgPixel(dispX, dispY, 1, 2, 0);
			this.fetchBgPixel(dispX, dispY, 2, 2, 0);
			this.fetchBgPixel(dispX, dispY, 3, 2, 0);
		}
		else if (mode === 1) {
			this.fetchBgPixel(dispX, dispY, 0, 4, 1);
			this.fetchBgPixel(dispX, dispY, 1, 4, 1);
			this.fetchBgPixel(dispX, dispY, 2, 2, 1);
		}
		else if (mode === 2) {
			this.fetchBgPixel(dispX, dispY, 0, 4, 2);
			this.fetchBgPixel(dispX, dispY, 1, 4, 2);
		}
		else if (mode === 3) {
			this.fetchBgPixel(dispX, dispY, 0, 8, 3);
			this.fetchBgPixel(dispX, dispY, 1, 4, 3);
		}
		else if (mode === 4) {
			this.fetchBgPixel(dispX, dispY, 0, 8, 4);
			this.fetchBgPixel(dispX, dispY, 1, 2, 4);
		}
		else if (mode === 5) {
			this.fetchBgPixel(dispX, dispY, 0, 4, 5);
			this.fetchBgPixel(dispX, dispY, 1, 2, 5);
		}
		else if (mode === 6) {
			this.fetchBgPixel(dispX, dispY, 0, 4, 6);
		}
		else if (mode === 7) {
			this.fetchBgPixelMode7(dispX, dispY);
		}
	}

	this.fetchBgPixel = function(dispX, dispY, screenNum, bpp, mode) {
		const bg = this.bgState[screenNum];

		let hofs = bg.hofs;
		let vofs = bg.vofs;

		if (mode === 2 || mode === 4 || mode === 6) {
			//if (screenNum === 0 || screenNum === 1) {
				[hofs, vofs] = this.offsetChangeMode(dispX, screenNum, mode);
			//}
		}

		let screenX = dispX + hofs;
		screenX &= bg.screenSizeX - 1;
		let screenY = dispY + vofs;
		screenY &= bg.screenSizeY - 1;

		// const mosaic = this.reg[MOSAIC];
		// const mosaicEnable = mosaic & 15;
		// const mosaicSize = ((mosaic >> 4) & 15) + 1;
		// if ((mosaicEnable >> screenNum) & 1) {
		// 	screenX = Math.trunc(screenX / mosaicSize) * mosaicSize; 
		// 	screenY = Math.trunc(screenY / mosaicSize) * mosaicSize; 
		// }

		if (bg.mosaicEnable) {
			screenX = Math.trunc(screenX / bg.mosaicSize) * bg.mosaicSize; 
			screenY = Math.trunc(screenY / bg.mosaicSize) * bg.mosaicSize; 
		}
		
		const tileMapAddr = this.calcTileMapAddr(screenX, screenY, bg.screenSize, bg.tileSizeX, bg.tileSizeY, bg.bgsc);
		if (tileMapAddr !== bg.lastTileMapAddr) {
			const tileMapLo = this.vramLo[tileMapAddr];
			const tileMapHi = this.vramHi[tileMapAddr];
			const tileMap = (tileMapHi << 8) | tileMapLo;
			
			bg.lastTileMapAddr = tileMapAddr;
			bg.tileMap = tileMap;
			bg.paletteIndex = (tileMap >> 10) & 7;
			bg.priority = (tileMap >> 13) & 1;
			bg.flipX = (tileMap >> 14) & 1;
			bg.flipY = (tileMap >> 15) & 1;
		}

		let quadrant = 0;
		if (bg.tileSizeX === 16) {
			quadrant |= ((screenX >> 3) & 1);
		}
		if (bg.tileSizeY === 16) {
			quadrant |= (((screenY >> 3) & 1) << 1);
		}

		if (
			tileMapAddr !== bg.lastTileMapAddrForTile ||
			quadrant !== bg.lastTileQuadrant ||
			bg.tileBpp !== bpp ||
			bg.tileBgnba !== bg.bgnba ||
			bg.tileCacheVersion !== this.vramTileCacheVersion
		) {
			let tileIndex = bg.tileMap & 0x3FF;
			if (bg.tileSizeX === 16) {
				let addX = (screenX >> 3) & 1;
				if (bg.flipX) addX = 1 - addX;
				tileIndex = tileIndex + addX;
			}
			if (bg.tileSizeY === 16) {
				let addY = (screenY >> 3) & 1;
				if (bg.flipY) addY = 1 - addY;
				tileIndex = tileIndex + addY * 16;
			}

			//let tile = undefined;
			if (bpp === 2) {
				const tileAddr = tileIndex + bg.bgnba * 512;
				if (this.tileCache2bpp[tileAddr] === undefined) {
					this.tileCache2bpp[tileAddr] = this.decodeTileCache2bpp(tileAddr);
				}
				bg.tile = this.tileCache2bpp[tileAddr];
			}
			else if (bpp === 4) {
				const tileAddr = tileIndex + bg.bgnba * 256;
				if (this.tileCache4bpp[tileAddr] === undefined) {
					this.tileCache4bpp[tileAddr] = this.decodeTileCache4bpp(tileAddr);
				}
				bg.tile = this.tileCache4bpp[tileAddr];
			}
			else if (bpp === 8) {
				const tileAddr = tileIndex + bg.bgnba * 128;
				if (this.tileCache8bpp[tileAddr] === undefined) {
					this.tileCache8bpp[tileAddr] = this.decodeTileCache8bpp(tileAddr);
				}
				bg.tile = this.tileCache8bpp[tileAddr];
			}

			bg.lastTileMapAddrForTile = tileMapAddr;
			bg.lastTileQuadrant = quadrant;
			bg.tileBpp = bpp;
			bg.tileBgnba = bg.bgnba;
			bg.tileCacheVersion = this.vramTileCacheVersion;
		}
		
		const pixelX = screenX & 7;
		const pixelY = screenY & 7;
		const shiftY = (bg.flipY) ? (7 - pixelY) : (pixelY);
		const shiftX = (bg.flipX) ? (pixelX) : (7 - pixelX);
		
		const colorIndex = bg.tile[shiftY * 8 + shiftX];
		const color = this.fetchColorData(mode, screenNum, bpp, bg.paletteIndex, colorIndex);

		this.bgPriority[screenNum] = bg.priority;
		this.screenColorValueBuffer[screenNum] = color;
		this.screenPaletteIndexBuffer[screenNum] = bg.paletteIndex;
		this.screenColorIndexBuffer[screenNum] = colorIndex;
		this.screenPriorityBuffer[screenNum] = priorityTable[mode * 12 + bg.priority + screenNum * 2];
	}

	this.decodeTileCache2bpp = function(tileAddr) {
		const base = tileAddr << 3;
		const cache = new Uint8Array(64).fill(0);
		for (let i = 0; i < 8; i++) {
			for (let j = 0; j < 8; j++) {
				cache[i * 8 + j] += ((this.vramLo[base + i] >> j) & 1);
				cache[i * 8 + j] += ((this.vramHi[base + i] >> j) & 1) * 2;
			}
		}
		return cache;
	}
	this.decodeTileCache4bpp = function(tileAddr) {
		const base = tileAddr << 4;
		const cache = new Uint8Array(64).fill(0);
		for (let i = 0; i < 8; i++) {
			for (let j = 0; j < 8; j++) {
				cache[i * 8 + j] += ((this.vramLo[base + i] >> j) & 1);
				cache[i * 8 + j] += ((this.vramHi[base + i] >> j) & 1) * 2;
				cache[i * 8 + j] += ((this.vramLo[base + i + 8] >> j) & 1) * 4;
				cache[i * 8 + j] += ((this.vramHi[base + i + 8] >> j) & 1) * 8;
			}
		}
		return cache;
	}
	this.decodeTileCache8bpp = function(tileAddr) {
		const base = tileAddr << 5;
		const cache = new Uint8Array(64).fill(0);
		for (let i = 0; i < 8; i++) {
			for (let j = 0; j < 8; j++) {
				cache[i * 8 + j] += ((this.vramLo[base + i] >> j) & 1);
				cache[i * 8 + j] += ((this.vramHi[base + i] >> j) & 1) * 2;
				cache[i * 8 + j] += ((this.vramLo[base + i + 8] >> j) & 1) * 4;
				cache[i * 8 + j] += ((this.vramHi[base + i + 8] >> j) & 1) * 8;
				cache[i * 8 + j] += ((this.vramLo[base + i + 16] >> j) & 1) * 16;
				cache[i * 8 + j] += ((this.vramHi[base + i + 16] >> j) & 1) * 32;
				cache[i * 8 + j] += ((this.vramLo[base + i + 24] >> j) & 1) * 64;
				cache[i * 8 + j] += ((this.vramHi[base + i + 24] >> j) & 1) * 128;
			}
		}
		return cache;
	}


	//fetchBgSetting廃止してキャッシュ化(レジスタ書き込みに合わせて更新)
	//bgsc, bgnba, size, hofs, vofs
	//lastTileMapAddr, tileMap
	this.bgState = [ {}, {}, {}, {} ];
	// this.fetchBgSetting = function(screenNum) {
	// 	let bgsc, bgnba, size, hofs, vofs;
	// 	if (screenNum === 0) {
	// 		bgsc = this.reg[BG1SC] & 0x7F;
	// 		bgnba = this.reg[BG12NBA] & 0xF;
	// 		size = (this.reg[BGMODE] >> 4) & 1;

	// 		hofs = this.reg[BG1HOFS] & 1023;
	// 		vofs = this.reg[BG1VOFS] & 1023;
	// 	}
	// 	else if (screenNum === 1) {
	// 		bgsc = this.reg[BG2SC] & 0x7F;
	// 		bgnba = (this.reg[BG12NBA] >> 4) & 0xF;
	// 		size = (this.reg[BGMODE] >> 5) & 1;

	// 		hofs = this.reg[BG2HOFS] & 1023;
	// 		vofs = this.reg[BG2VOFS] & 1023;
	// 	}
	// 	else if (screenNum === 2) {
	// 		bgsc = this.reg[BG3SC] & 0x7F;
	// 		bgnba = this.reg[BG34NBA] & 0xF;
	// 		size = (this.reg[BGMODE] >> 6) & 1;
	// 		hofs = this.reg[BG3HOFS] & 1023;
	// 		vofs = this.reg[BG3VOFS] & 1023;
	// 	}
	// 	else if (screenNum === 3) {
	// 		bgsc = this.reg[BG4SC] & 0x7F;
	// 		bgnba = (this.reg[BG34NBA] >> 4) & 0xF;
	// 		size = (this.reg[BGMODE] >> 7) & 1;
	// 		hofs = this.reg[BG4HOFS] & 1023;
	// 		vofs = this.reg[BG4VOFS] & 1023;
	// 	}

	// 	return [bgsc, bgnba, size, hofs, vofs]
	// }

	this.calcTileMapAddr = function(screenX, screenY, screenSize, tileSizeX, tileSizeY, bgsc) {
		
		let tileMapBaseAddr = ((bgsc >> 2) & 0x3f) << 10;
		// let tileX = (screenX / tileSizeX) | 0;
		// let tileY = (screenY / tileSizeY) | 0;
		let tileX = (tileSizeX === 8) ? (screenX >> 3) : (screenX >> 4);
		let tileY = (tileSizeY === 8) ? (screenY >> 3) : (screenY >> 4);

		if (screenSize === 1) {
			if (tileX > 31) {
				tileMapBaseAddr += 1024;
				tileX &= 31;
			}
		}
		else if (screenSize === 2) {
			if (tileY > 31) {
				tileMapBaseAddr += 1024;
				tileY &= 31;
			}
		}
		else if (screenSize === 3) {
			if (tileX > 31) {
				tileMapBaseAddr += 1024;
				tileX &= 31;
			}
			if (tileY > 31) {
				tileMapBaseAddr += 2048;
				tileY &= 31;
			}
		}

		let tileMapAddr = (tileY * 32 + tileX) + tileMapBaseAddr;
		tileMapAddr &= 0x7FFF;

		return tileMapAddr;
	}

	// this.calcColorIndex = function(bppHalf, tileBaseAddr, shiftX) {
	// 	// let colorIndex = 0;
	// 	// for (let bit = 0; bit < bpp; bit++) {
	// 	// 	let bitPlaneAddr = bit * 8 + tileBaseAddr;
	// 	// 	bitPlaneAddr &= 0x7FFF;
	// 	// 	const lo = (this.vramLo[bitPlaneAddr] >> shiftX) & 1;
	// 	// 	const hi = (this.vramHi[bitPlaneAddr] >> shiftX) & 1;
	// 	// 	const v = (lo + hi * 2) << (bit * 2);
	// 	// 	colorIndex |= v;
	// 	// }
	// 	// return colorIndex;


		
	// 	{
	// 		//const lineBuffer = new Array(8);
	// 		const bpp = bppHalf * 2;
	// 		const base = tileBaseAddr;
			
	// 		if (bpp === 2) {
	// 			//8color
	// 			// for (let i = 0; i < 8; i++) {
	// 			// 	const p0 = (this.vramLo[base] >> i) & 1;
	// 			// 	const p1 = (this.vramHi[base] >> i) & 1;
	// 			// 	lineBuffer[i] = p0 + p1 * 2;
	// 			// }

	// 			const p0 = (this.vramLo[base] >> shiftX) & 1;
	// 			const p1 = (this.vramHi[base] >> shiftX) & 1;
	// 			return p0 + p1 * 2;
	// 		}
	// 		else if (bpp === 4) {
	// 			//32color
	// 			// for (let i = 0; i < 8; i++) {
	// 			// 	const p0 = (this.vramLo[base] >> i) & 1;
	// 			// 	const p1 = (this.vramHi[base] >> i) & 1;
	// 			// 	const p2 = (this.vramLo[base + 8] >> i) & 1;
	// 			// 	const p3 = (this.vramHi[base + 8] >> i) & 1;
	// 			// 	lineBuffer[i] = p0 + p1 * 2 + p2 * 4 + p3 * 8;
	// 			// }

	// 			const p0 = (this.vramLo[base] >> shiftX) & 1;
	// 			const p1 = (this.vramHi[base] >> shiftX) & 1;
	// 			const p2 = (this.vramLo[base + 8] >> shiftX) & 1;
	// 			const p3 = (this.vramHi[base + 8] >> shiftX) & 1;
	// 			return p0 + p1 * 2 + p2 * 4 + p3 * 8;
	// 		}
	// 		else if (bpp === 8) {
	// 			//256color
	// 			// for (let i = 0; i < 8; i++) {
	// 			// 	const p0 = (this.vramLo[base] >> i) & 1;
	// 			// 	const p1 = (this.vramHi[base] >> i) & 1;
	// 			// 	const p2 = (this.vramLo[base + 8] >> i) & 1;
	// 			// 	const p3 = (this.vramHi[base + 8] >> i) & 1;
	// 			// 	const p4 = (this.vramLo[base + 16] >> i) & 1;
	// 			// 	const p5 = (this.vramHi[base + 16] >> i) & 1;
	// 			// 	const p6 = (this.vramLo[base + 24] >> i) & 1;
	// 			// 	const p7 = (this.vramHi[base + 24] >> i) & 1;
	// 			// 	lineBuffer[i] = p0 + p1 * 2 + p2 * 4 + p3 * 8 + p4 * 16 + p5 * 32 + p6 * 64 + p7 * 128;
	// 			// }

	// 			const p0 = (this.vramLo[base] >> shiftX) & 1;
	// 			const p1 = (this.vramHi[base] >> shiftX) & 1;
	// 			const p2 = (this.vramLo[base + 8] >> shiftX) & 1;
	// 			const p3 = (this.vramHi[base + 8] >> shiftX) & 1;
	// 			const p4 = (this.vramLo[base + 16] >> shiftX) & 1;
	// 			const p5 = (this.vramHi[base + 16] >> shiftX) & 1;
	// 			const p6 = (this.vramLo[base + 24] >> shiftX) & 1;
	// 			const p7 = (this.vramHi[base + 24] >> shiftX) & 1;
	// 			return p0 + p1 * 2 + p2 * 4 + p3 * 8 + p4 * 16 + p5 * 32 + p6 * 64 + p7 * 128;
	// 		}

	// 		//return lineBuffer;
	// 	}
	// }

	this.fetchColorData = function(mode, screenNum, bpp, paletteIndex, colorIndex) {
		//const base = CGRAMBaseAddrTable[mode][screenNum];
		let base = 0;
		if (mode === 0) {
			base = 0x20 * screenNum;
		}
		
		//const bpp = halfbpp * 2;
		//const offset = paletteIndex * (1 << (bpp << 1)) + colorIndex;
		let offset = colorIndex;
		if (bpp !== 8) {
			offset += paletteIndex * (1 << bpp);
		}

		const cgramIndex = base + offset;
		const cgramLo = this.CGRAM[cgramIndex * 2];
		const cgramHi = this.CGRAM[cgramIndex * 2 + 1];
		
		let color = cgramLo | (cgramHi << 8);
		
		//CGColorDirectSelect
		if (mode === 3 || mode === 4) {
			const direceSelect = this.reg[CGWSEL] & 1;
			if (screenNum === 0 && direceSelect === 1) {
				const r = ((colorIndex & 7) << 2) | ((paletteIndex & 1) << 1);
				const g = (((colorIndex >> 3) & 7) << 2) | (((paletteIndex >> 1) & 1) << 1);
				const b = (((colorIndex >> 6) & 3) << 3) | (((paletteIndex >> 2) & 1) << 2);
				color = (b << 10) | (g << 5) | r;

			}
		}

		if (colorIndex === 0) {
			//各パレットの0番目の色は透過色で共通？
			color = (this.CGRAM[1] << 8) | this.CGRAM[0];
		}

		return color;
	}

	this.fetchBgPixelMode7 = function(dispX, dispY) {
		const screenOver = (this.reg[M7SEL] >> 6) & 3;
		const screenVFlip = (this.reg[M7SEL] >> 1) & 1;
		const screenHFlip = this.reg[M7SEL] & 1;

		//const hofs = (this.reg[BG1HOFS] & 8191) - 4096;
		//const vofs = (this.reg[BG1VOFS] & 8191) - 4096;
		
		let m7a = this.reg[M7A];
		if (m7a >= 32768) m7a -= 65536;
		let m7b = this.reg[M7B];
		if (m7b >= 32768) m7b -= 65536;
		let m7c = this.reg[M7C];
		if (m7c >= 32768) m7c -= 65536;
		let m7d = this.reg[M7D];
		if (m7d >= 32768) m7d -= 65536;

		//-4096~4095
		let m7hofs = this.M7HOFS;
		if (m7hofs >= 4096 ) m7hofs -= 8192;
		let m7vofs = this.M7VOFS;
		if (m7vofs >= 4096) m7vofs -= 8192;
		let m7x = this.reg[M7X];
		if (m7x >= 4096) m7x -= 8192;
		let m7y = this.reg[M7Y];
		if (m7y >= 4096) m7y -= 8192;

		//screen座標を算出
		dispX = dispX ^ (screenHFlip * 0xff);
		dispY = dispY ^ (screenVFlip * 0xff);
		let screenX = (dispX + m7hofs - m7x);
		let screenY = (dispY + m7vofs - m7y);
		const screenX_tmp = ((m7a * screenX) >> 8) + ((m7b * screenY) >> 8) + m7x;
		const screenY_tmp = ((m7c * screenX) >> 8) + ((m7d * screenY) >> 8) + m7y;
		screenX = screenX_tmp;
		screenY = screenY_tmp;

		let characterNumber = -1;
		let CGRAMAddress = -1;

		if (screenY < 0 || 1024 <= screenY || screenX < 0 || 1024 <= screenX) {
			if (screenOver === 0 || screenOver === 1) {
				screenX = (screenX + 4096) & 1023;
				screenY = (screenY + 4096) & 1023;
			}
			else if (screenOver === 2) {
				CGRAMAddress = 0;
			}
			else if (screenOver === 3) {
				characterNumber = 0;
			}
		}
		
		if (characterNumber < 0) {
			//tile座標を算出
			const tileX = (screenX >> 3);
			const tileY = (screenY >> 3);
			
			//tileMap(キャラクタ番号)の格納先アドレスを算出、フェッチ
			const tileMapAddress = tileY * 128 + tileX;
			//const characterNumber = this.vramLo[tileMapAddress];
			characterNumber = this.vramLo[tileMapAddress];
		}

		//キャラクタ番号からタイルデータの格納先アドレスを算出、フェッチ
		const pixelX = (screenX & 7);
		const pixelY = (screenY & 7);

		const tileDataAddress = characterNumber * 64 + pixelY * 8 + pixelX;
		const tileData = this.vramHi[tileDataAddress];

		if (CGRAMAddress < 0) {
			//タイルデータからカラーデータの格納先アドレスを算出、フェッチ
			CGRAMAddress = tileData * 2;
		}
		
		let color = (this.CGRAM[CGRAMAddress + 1] << 8) | this.CGRAM[CGRAMAddress];

		const direceSelect = this.reg[CGWSEL] & 1;
		if (direceSelect === 1) {
			//cg direct select
			const r = (tileData & 7) << 2;
			const g = ((tileData >> 3) & 7) << 2;
			const b = ((tileData >> 6) & 3) << 3;
			color = (b << 10) | (g << 5) | r;
		}

		// this.bgColor[0] = color;
		// this.bgPalette[0] = CGRAMAddress;
		this.bgPriority[0] = 0;

		this.screenColorValueBuffer[0] = color;
		this.screenPaletteIndexBuffer[0] = 0;
		this.screenColorIndexBuffer[0] = CGRAMAddress;
		this.screenPriorityBuffer[0] = priorityTable[7 * 12 + 0];

	}

	this.offsetChangeMode = function(dispX, BGn, mode) {
		let hofs = this.reg[BG1HOFS + BGn * 2] & 1023;
		let vofs = this.reg[BG1VOFS + BGn * 2] & 1023;

		//dispXがbg0~32のどれに位置するか判定する
		const offsetNum = (dispX + (hofs & 7)) >> 3;
		
		//bgNo-1のオフセットをbg3scから取得する
		//bgNo=0の場合は適用外
		if (offsetNum > 0) {
			//hofs
			{
				const tileMapAddr = ((this.reg[BG3SC] & 0xFC) << 8) + ((this.reg[BG3VOFS] & 0xF8) << 2) + (((this.reg[BG3HOFS] >> 3) + (offsetNum - 1)) & 31);
				const tileMap = (this.vramHi[tileMapAddr] << 8) | this.vramLo[tileMapAddr];

				const offsetData = tileMap & 0x03F8;
				const applyBg1 = (tileMap >> 13) & 1;
				const applyBg2 = (tileMap >> 14) & 1;
				const applyHV = (tileMap >> 15) & 1;
				
				let applyFlag = 1;
				if (BGn === 0 && applyBg1 === 0) applyFlag = 0;
				if (BGn === 1 && applyBg2 === 0) applyFlag = 0;
				if (mode === 4 && applyHV === 1) applyFlag = 0;
				if (applyFlag) hofs = offsetData | (hofs & 7);
			}

			//vofs
			{
				const tileMapAddr = ((this.reg[BG3SC] & 0xFC) << 8) + ((this.reg[BG3VOFS] & 0xF8) << 2) + (((this.reg[BG3HOFS] >> 3) + (offsetNum - 1)) & 31) + 32;
				const tileMap = (this.vramHi[tileMapAddr] << 8) | this.vramLo[tileMapAddr];
				
				const offsetData = tileMap & 0x03FF;
				const applyBg1 = (tileMap >> 13) & 1;
				const applyBg2 = (tileMap >> 14) & 1;
				const applyHV = (tileMap >> 15) & 1;

				let applyFlag = 1;
				if (BGn === 0 && applyBg1 === 0) applyFlag = 0;
				if (BGn === 1 && applyBg2 === 0) applyFlag = 0;
				if (mode === 4 && applyHV === 0) applyFlag = 0;
				if (applyFlag) vofs = offsetData;
			}
		}

		return [hofs, vofs];
	}

	this.fetchObjPixel = function(dispX, dispY, mode) {
		this.screenColorValueBuffer[4] = this.objColorDataBuffer[dispX];
		this.screenPaletteIndexBuffer[4] = this.objPaletteIndexBuffer[dispX];
		this.screenColorIndexBuffer[4] = this.objColorIndexBuffer[dispX];
		//this.screenPriorityBuffer[4] = priorityTable[mode * 12 + 8 + this.objPriorityBuffer[dispX]];
		if (mode <= 1) {
			this.screenPriorityBuffer[4] = 11 - this.objPriorityBuffer[dispX] * 3;
		}
		else {
			this.screenPriorityBuffer[4] = 7 - this.objPriorityBuffer[dispX] * 2;
		}
	}

	//dispY:1-224
	this.evaluateObj = function(dispY, debug = 0) {
		const objPaletteBase = 0x80;
		const bitPlaneBuffer = new Array(8);

		const objSizeSelect = (this.reg[OBSEL] >> 5) & 7;
		const objNameSelect = (this.reg[OBSEL] >> 3) & 3;
		const objNameBaseAddr = this.reg[OBSEL] & 7;

		const objName = (objNameSelect) * 4096;
		const objNameBase = objNameBaseAddr * 8192;

		const backdropColor = (this.CGRAM[1] << 8) | this.CGRAM[0];

		//バッファを初期化
		for (let i = 0; i < 256; i++) {
			this.objColorDataBuffer[i] = 0;
			this.objPriorityBuffer[i] = 0;
			this.objPaletteIndexBuffer[i] = 0;
			this.objColorIndexBuffer[i] = 0;
		}

		//OAMをOBJ番号の降順(127→0)に走査
		let objNumBegin = 127;
		const priorityRoatation = (this.reg[OAMADDH] >> 7) & 1;
		if (priorityRoatation === 1) {
			//優先度ローテーション
			objNumBegin = (this.reg[OAMADDL] >> 1) & 0x7F;
			//objNumBegin = (objNumBegin - 1) & 0x7F;
		}

		let objPcs = 0;
		let objPcs8x8 = 0;

		const objNumBuffer = new Array(32);
		
		for (let i = 0; i < 128; i++) {
			const objNum = (i + objNumBegin) & 127;

			const OAMAddr1 = objNum * 4;
			let objX = this.OAM[OAMAddr1];
			const objY = this.OAM[OAMAddr1 + 1] + 1;

			const OAMAddr2 = ((objNum >> 2) & 31) + 512;
			const shift = (objNum & 3) * 2;
			const objXMsb = (this.OAM[OAMAddr2] >> shift) & 1;
			const objSizeLarge = (this.OAM[OAMAddr2] >> (shift + 1)) & 1;
			const objSize = objSizeTable[objSizeSelect][objSizeLarge];

			objX += objXMsb * -256;

			//OBJが描画範囲内か判定
			if (objY <= dispY && dispY < objY + objSize) {
				let tileNum = this.OAM[OAMAddr1 + 2];

				const attr = this.OAM[OAMAddr1 + 3];
				const flipY = (attr >> 7) & 1;
				const flipX = (attr >> 6) & 1;
				const priority = (attr >> 4) & 3;
				const paletteNum = (attr >> 1) & 7;
				const tileNumMsb = attr & 1;

				tileNum |= (tileNumMsb << 8);

				//ここから処理分ける
				if (255 < objX) {
					//X方向が画面外
					continue;
				}

				//ppuのエラッタにより、objX === -256の場合もカウントする
				//https://snes.nesdev.org/wiki/Sprites#1._32_Sprites_per_Line
				if (objX + objSize < 0 && objX !== -256) {
					continue;
				}
				
				if (objPcs >= 32) {
					//33's range over
					this.reg[STAT77] |= 0x40;
					break;
				}
				objNumBuffer[objPcs++] = objNum;
			}
		}

		for (let i = objPcs - 1; i >= 0; i--) {
			const objNum = objNumBuffer[i];

			let objX = this.OAM[objNum * 4];
			const objY = this.OAM[objNum * 4 + 1] + 1;
			let tileNum = this.OAM[objNum * 4 + 2];
			const attr = this.OAM[objNum * 4 + 3];
			
			const flipY = (attr >> 7) & 1;
			const flipX = (attr >> 6) & 1;
			const priority = (attr >> 4) & 3;
			const paletteNum = (attr >> 1) & 7;
			const tileNumMsb = attr & 1;
			
			const objXMsb = (this.OAM[((objNum >> 2) & 31) + 512] >> ((objNum & 3) * 2)) & 1;
			const objSizeLarge = (this.OAM[((objNum >> 2) & 31) + 512] >> ((objNum & 3) * 2 + 1)) & 1;
			const objSize = objSizeTable[objSizeSelect][objSizeLarge];

			objX += objXMsb * -256;
			tileNum |= (tileNumMsb << 8);

			const dy = dispY - objY;
			let tileNumAddY = (dy >> 3);

			let pixelY = dy & 7;
			if (flipY) {
				pixelY = 7 - pixelY;
				tileNumAddY = ((objSize >> 3) - 1 - tileNumAddY);
				//console.log(objSize, tileNumAddY);
			}

			let beginX = objX;
			let endX = objX + objSize;
			
			for (let x = beginX; x < endX; x += 8) {
				if (255 < x) {
					//画面外
					continue;
				}

				if (objPcs8x8 >= 34) {
					//35's time over
					this.reg[STAT77] |= 0x80;
					break;
				}
				objPcs8x8++;

				//ppuのエラッタにより、beginX === -256の場合もカウントする
				//https://snes.nesdev.org/wiki/Sprites#2._34_Slivers_per_Line
				if (x + 8 < 0) {
					continue;
				}

				const dx = (flipX) ? (endX - x - 1) : (x - objX);
				const tileNumAddX = (dx >> 3);
				const tileNumAddXY = tileNum + tileNumAddY * 16 + tileNumAddX;

				for (let i = 0; i < 8; i++) bitPlaneBuffer[i] = 0;

				//タイルデータをフェッチ
				for (let plane = 0; plane < 2; plane++) {
					//tileNumが256以上の場合、objNameはどのように加算される？
					let tileAddr = (tileNumAddXY * 16 + pixelY) + (plane * 8) + (objNameBase + tileNumMsb * objName);
					
					tileAddr = objNameBase;
					if (tileNum >= 256) {
						tileAddr += (objNameSelect + 1) * 4096;
						tileAddr &= 0x7FFF;
						tileAddr += (tileNum - 256) * 16;
					}
					else {
						tileAddr += tileNum * 16;
					}
					tileAddr += (tileNumAddY * 16 + tileNumAddX) * 16;
					tileAddr += pixelY + plane * 8;

					if (tileAddr >= 0x8000) {
						//console.log("vram[$", tileAddr.toString(16).padStart(4, 0), "]");
						tileAddr &= 0x7FFF;
					}
					
					const bitPlaneHi = this.vramHi[tileAddr];
					const bitPlaneLo = this.vramLo[tileAddr];

					for (let bit = 0; bit < 8; bit++) {
						let shiftX = (flipX) ? (bit) : (7 - bit);

						const hi = (bitPlaneHi >> shiftX) & 1;
						const lo = (bitPlaneLo >> shiftX) & 1;
						bitPlaneBuffer[bit] |= ((hi * 2 + lo) << (plane * 2));
					}
				}

				//カラーデータをフェッチ
				for (let bit = 0; bit < 8; bit++) {
					if (x + bit < 0 || x + bit > 255) continue;
					const CGRAMAddr = (paletteNum * 16 + bitPlaneBuffer[bit] + objPaletteBase) * 2;
					const colorDataLo = this.CGRAM[CGRAMAddr];
					const colorDataHi = this.CGRAM[CGRAMAddr + 1];
					let colorData = (colorDataHi << 8) | colorDataLo;

					if (bitPlaneBuffer[bit] === 0) {
						//各パレットのカラー#0は常に透明(？)
						continue;
					}

					this.objColorDataBuffer[x + bit] = colorData;
					this.objPriorityBuffer[x + bit] = priority;
					this.objPaletteIndexBuffer[x + bit] = paletteNum;
					this.objColorIndexBuffer[x + bit] = bitPlaneBuffer[bit];
				}
			}
		}
	}



	this.generatePixel = function(h, v, mode) {
		this.applyWindow(h);
		let [mainScreenColor, subScreenColor, mainScreen, subScreen, mainScreenPalette] = this.applyPriority(mode);

		const subScreenEnable = (this.reg[CGWSEL] >> 1) & 1;
		if (subScreenEnable === 0) {
			//固定カラーを使用
			subScreenColor = this.colorConstantData;
		}

		const res = this.applyColorMath(mainScreenColor, subScreenColor, this.insideWindow[5], mainScreen, subScreen, mainScreenPalette);
		return res;
	}

	this.applyWindow = function(h) {
		let insideWindow1 = 0;
		let insideWindow2 = 0;
		if (this.reg[WH0] <= h && h <= this.reg[WH1]) {
			insideWindow1 = 1;
		}
		if (this.reg[WH2] <= h && h <= this.reg[WH3]) {
			insideWindow2 = 1;
		}

		//[0]:bg1, [1]:bg2, [2]:bg3, [3]:bg4, [4]:sprite, [5]:color math
		this.insideWindow[0] = this.applyWindowSub(insideWindow1, insideWindow2, (this.reg[W12SEL] >> 0) & 15, (this.reg[WBGLOG] >> 0) & 3);
		this.insideWindow[1] = this.applyWindowSub(insideWindow1, insideWindow2, (this.reg[W12SEL] >> 4) & 15, (this.reg[WBGLOG] >> 2) & 3);
		this.insideWindow[2] = this.applyWindowSub(insideWindow1, insideWindow2, (this.reg[W34SEL] >> 0) & 15, (this.reg[WBGLOG] >> 4) & 3);
		this.insideWindow[3] = this.applyWindowSub(insideWindow1, insideWindow2, (this.reg[W34SEL] >> 4) & 15, (this.reg[WBGLOG] >> 6) & 3);
		this.insideWindow[4] = this.applyWindowSub(insideWindow1, insideWindow2, (this.reg[WOBJSEL] >> 0) & 15, (this.reg[WOBJLOG] >> 0) & 3);
		this.insideWindow[5] = this.applyWindowSub(insideWindow1, insideWindow2, (this.reg[WOBJSEL] >> 4) & 15, (this.reg[WOBJLOG] >> 2) & 3);
	}

	this.applyWindowSub = function(insideWindow1, insideWindow2, wsel, log) {
		const invertWindow1 = (wsel >> 0) & 1;
		const enableWindow1 = (wsel >> 1) & 1;
		const invertWindow2 = (wsel >> 2) & 1;
		const enableWindow2 = (wsel >> 3) & 1;

		if (invertWindow1) insideWindow1 ^= 1;
		if (invertWindow2) insideWindow2 ^= 1;

		let res = 0;
		if (enableWindow1 && enableWindow2) {
			if (log === 0) res = insideWindow1 | insideWindow2;
			else if (log === 1) res = insideWindow1 & insideWindow2;
			else if (log === 2) res = insideWindow1 ^ insideWindow2;
			else if (log === 3) res = ~(insideWindow1 ^ insideWindow2) & 1;
		}
		else if (enableWindow1) {
			res = insideWindow1;
		}
		else if (enableWindow2) {
			res = insideWindow2;
		}
		else {
			//ウィンドウ機能無効(全画面表示)
			//res = 1;
		}

		return res;
	}

	this.applyPriority = function(mode) {
		const backdropColor = this.CGRAM[0] | (this.CGRAM[1] << 8);
		const bg3PriorityHigh = (this.reg[BGMODE] >> 3) & 1;

		let mainScreenColor = backdropColor;
		let subScreenColor = this.colorConstantData;
		let mainScreenPriority = 14;
		let subScreenPriority = 14;
		let mainScreenPalette = 0;

		let mainScreen = 5;
		let subScreen = 5;
		if (mode === 1 && bg3PriorityHigh === 1 && this.bgPriority[2] === 1) {
			//this.screenPriorityBuffer[2] = 0;
			this.screenPriorityBuffer[2] = 1;
		}

		//through main/sub window
		for (let i = 0; i < 5; i++) {
			if ((~this.reg[TM] >> i) & 1) continue;

			if ((this.reg[TMW] >> i) & 1) {
				if (this.insideWindow[i] === 1) {
					//ウィンドウ機能有効 & ウィンドウ範囲外
					continue;
				}
			}

			if (this.screenColorIndexBuffer[i] === 0) continue;
			
			if (mainScreenPriority > this.screenPriorityBuffer[i]) {
				mainScreenPriority = this.screenPriorityBuffer[i];
				mainScreenColor = this.screenColorValueBuffer[i];
				mainScreenPalette = this.screenPaletteIndexBuffer[i];
				mainScreen = i;
			}
		}
		for (let i = 0; i < 5; i++) {
			if ((~this.reg[TS] >> i) & 1) continue;

			if ((this.reg[TSW] >> i) & 1) {
				if (this.insideWindow[i] === 1) {
					continue;
				}
			}

			if (this.screenColorIndexBuffer[i] === 0) continue;

			if (subScreenPriority > this.screenPriorityBuffer[i]) {
				subScreenPriority = this.screenPriorityBuffer[i];
				subScreenColor = this.screenColorValueBuffer[i];
				subScreen = i;
			}
		}
		
		return [mainScreenColor, subScreenColor, mainScreen, subScreen, mainScreenPalette];
	}
	
	this.applyColorMath = function(mainScreenColor, subScreenColor, colorWindow, mainScreen, subScreen, paletteIndex) {
		const COLOR_BACKDROP = this.CGRAM[0] | (this.CGRAM[1] << 8);
		const COLOR_BLACK = 0;

		//color window
		const subScreenTransparet = (this.reg[CGWSEL] >> 4) & 3;
		const mainScreenBlack = (this.reg[CGWSEL] >> 6) & 3;
		let mainScreenBlackFlag = 0;
		//const rawMainScreenColor = mainScreenColor;

		const wobjsel = this.reg[WOBJSEL];
		const enableWindow1 = (wobjsel >> 5) & 1;
		const enableWindow2 = (wobjsel >> 7) & 1;

		if (enableWindow1 === 1 || enableWindow2 === 1) {
			if ((mainScreenBlack === 1 && colorWindow === 0) ||
				(mainScreenBlack === 2 && colorWindow === 1) ||
				(mainScreenBlack === 3))
			{
				//黒色にする
				mainScreenBlackFlag = 1;
				mainScreenColor = COLOR_BLACK;
			}

			if ((subScreenTransparet === 1 && colorWindow === 0) ||
				(subScreenTransparet === 2 && colorWindow === 1) ||
				(subScreenTransparet === 3))
			{
				//カラー計算無効
				return mainScreenColor;
			}
		}
		
		//カラー計算
		const BG1 = 0;
		const BG2 = 1;
		const BG3 = 2;
		const BG4 = 3;
		const OBJ = 4;	//パレット4～7のみ対象
		const BACKDROP = 5;
		
		const addSub = (this.reg[CGADSUB] >> 7) & 1;
		let halfEnable = (this.reg[CGADSUB] >> 6) & 1;
		const addSubEnable = this.reg[CGADSUB] & 63;

		if ((addSubEnable >> mainScreen) & 1) {
			if (mainScreen === OBJ && paletteIndex < 4) {
				//OBJかつ、パレット0～3の場合はカラー計算無効
				return mainScreenColor;
			}
		}
		else {
			return mainScreenColor;
			//return rawMainScreenColor;
		}

		if (mainScreenBlackFlag) {
			halfEnable = 0;
		}
		if (subScreen === BACKDROP) {
			halfEnable = 0;
		}

		let res = 0;
		for (let i = 0; i < 15; i += 5) {
			let main = (mainScreenColor >> i) & 31;
			let sub = (subScreenColor >> i) & 31;
			
			if (addSub === 1) {
				main -= sub;
			}
			else {
				main += sub;
			}
			
			if (halfEnable === 1) {
				main >>= 1;
			}

			//クランプ
			if (main > 31) {
				main = 31;
			}
			else if (main < 0) {
				main = 0;
			}
			
			res |= (main << i);
		}

		return res;
	}

	this.drawPixel = function(renderer, dispX, dispY, color) {
		const forcedBlanking = (this.reg[INIDISP] >> 8) & 1;
		const masterBrightness = this.reg[INIDISP] & 15;
		if (forcedBlanking) color = 0;
		if (masterBrightness === 0) color = 0;
		
		const r5 = color & 0x1f;
		const g5 = (color >> 5) & 0x1f;
		const b5 = (color >> 10) & 0x1f;
		const r8 = (8 * (r5 + (r5 >> 5))) * (masterBrightness + 1) >> 4;
		const g8 = (8 * (g5 + (g5 >> 5))) * (masterBrightness + 1) >> 4;
		const b8 = (8 * (b5 + (b5 >> 5))) * (masterBrightness + 1) >> 4;

		// const interlaceMode = this.reg[SETINI] & 1;
		// if (interlaceMode) {
		// 	if (!this.fieldFlag) {
		// 		renderer.draw(dispX * 2,     dispY * 2, r8, g8, b8, 255);
		// 		renderer.draw(dispX * 2 + 1, dispY * 2, r8, g8, b8, 255);
		// 	}
		// 	else  {
		// 		renderer.draw(dispX * 2,     dispY * 2 + 1, r8, g8, b8, 255);
		// 		renderer.draw(dispX * 2 + 1, dispY * 2 + 1, r8, g8, b8, 255);
		// 	}
		// }
		// else {
		// 	renderer.draw(dispX * 2,     dispY * 2,     r8, g8, b8, 255);
		// 	renderer.draw(dispX * 2 + 1, dispY * 2,     r8, g8, b8, 255);
		// 	renderer.draw(dispX * 2,     dispY * 2 + 1, r8, g8, b8, 255);
		// 	renderer.draw(dispX * 2 + 1, dispY * 2 + 1, r8, g8, b8, 255);
		// }

		renderer.draw(dispX, dispY, r8, g8, b8, 255);
	}

	this.render = function(debug = 0) {
		if (debug) {
			const memory = new Array(0x10000);
			for (let i = 0; i < 0x8000; i++) {
				memory[i * 2] = this.vramLo[i];
				memory[i * 2 + 1] = this.vramHi[i];
			}
			this.drawMemoryData(memory, 0x6000, 8, 8, 32, 16);
		}

		this.renderer.flip();
		this.rendererDebug.flip();
		return;
	}

	this.readPPUReg = function(address) {
		let res = 0;
		switch (address) {
			case SLHV: {
				this.reg[OPHCT] = this.HCount;
				this.reg[OPVCT] = this.VCount;
				this.reg[STAT78] |= (1 << 6);
				//console.log("latch OPHCT:", this.reg[OPHCT], "OPVCT:", this.reg[OPVCT]);
				break;
			}

			case OPHCT: {
				if (this.latchOPHCT === 0) {
					res = (this.reg[OPHCT]) & 0xFF;
				}
				else {
					res = (this.reg[OPHCT] >> 8) & 1;
				}
				this.latchOPHCT ^= 1;
				//console.log("read OPHCT:", this.reg[OPHCT]);
				break;
			}
			case OPVCT: {
				if (this.latchOPVCT === 0) {
					res = (this.reg[OPVCT]) & 0xFF;
				}
				else {
					res = (this.reg[OPVCT] >> 8) & 1;
				}
				this.latchOPVCT ^= 1;
				//console.log("read OPVCT:", this.reg[OPVCT]);
				break;
			}
			
			case STAT78: {
				res = this.reg[STAT78];
				//res |= 0xC0;
				this.reg[STAT78] &= ~(1 << 6);
				this.latchOPHCT = 0;
				this.latchOPVCT = 0;

				//console.log(`STAT78: ${res.toString(2).padStart(8, 0)}`);
				break;
			}

			case RDOAM: {
				res = this.OAM[this.internalOAMAddress];
				this.internalOAMAddress++;
				break;
			}

			//VRAM
			case RDVRAML: {
				//プリフェッチデータの下位バイトを返す
				res = this.latchVram & 0xff;

				//下位バイトアクセス時にインクリメント
				const incrementMode = (this.reg[VMAIN] >> 7) & 1;
				if (incrementMode === 0) {
					//VRAMアドレスインクリメント前にプリフェッチする
					this.latchVram = this.readVram();
					this.incrementVramAddr();
				}
				break;
			}
			case RDVRAMH: {

				//プリフェッチデータの上位バイトを返す
				res = (this.latchVram >> 8) & 0xff;

				//上位バイトアクセス時にインクリメント
				const incrementMode = (this.reg[VMAIN] >> 7) & 1;
				if (incrementMode === 1) {
					//VRAMアドレスインクリメント前にプリフェッチする
					this.latchVram = this.readVram();
					this.incrementVramAddr();
				}
				break;
			}

			//CGRAM
			case RDCGRAM: {
				res = this.CGRAM[this.reg[CGADD]];
				this.reg[CGADD] = (this.reg[CGADD] + 1) & 0x1FF;
				break;
			}

			//割込み関連
			case 0x4210: {
				res = this.reg[RDNMI];

				//読み出し時、nmiフラグをリセット
				this.reg[RDNMI] &= ~0x80;
				break;
			}

			case TIMEUP: {
				res = this.reg[TIMEUP];
				this.reg[TIMEUP] &= ~0x80;
			}

			default: {
				res = this.reg[address];
				break;
			}
		}
		
		switch (address) {
			case MPYL:
			case MPYM:
			case MPYH: {
				//logger.log(`reg[${address.toString(16)}] = ${res.toString(16)}`);
			}
		}
		//console.log(`read ppu reg $${address.toString(16).padStart(4,0)} <- ${res.toString(2).padStart(8,0)}`);		
		
		return res;
	}

	this.writePPUReg = function(address, data) {
		//console.log(`write ppu reg $${address.toString(16).padStart(4,0)} <- ${data.toString(2).padStart(8,0)}`);
		
		switch (address) {
			case OAMADDL: {
				const oamaddh = this.reg[OAMADDH];
				const oamadd = (oamaddh << 8) | data;
				this.internalOAMAddress = (oamadd & 0x1FF) << 1;

				// this.internalOAMAddress >>= 1;
				// const hi = this.internalOAMAddress & 0x100;
				// this.internalOAMAddress = hi | data;
				// this.internalOAMAddress <<= 1;

				this.reg[address] = data;
				break;
			}
			case OAMADDH: {
				const oamaddl = this.reg[OAMADDL];
				const oamadd = (data << 8) | oamaddl;
				this.internalOAMAddress = (oamadd & 0x1FF) << 1;

				// this.internalOAMAddress >>= 1;
				// const lo = this.internalOAMAddress & 0xFF;
				// this.internalOAMAddress = ((data & 1) << 8) | lo;
				// this.internalOAMAddress <<= 1;

				this.reg[address] = data & 0x81;
				break;
			}
			case OAMDATA: {

				if ((this.internalOAMAddress & 1) === 0) {
					this.latchOAMDATA = data;
				}
				if (this.internalOAMAddress < 512) {
					if ((this.internalOAMAddress & 1) === 1) {
						this.OAM[this.internalOAMAddress - 1] = this.latchOAMDATA;
						this.OAM[this.internalOAMAddress] = data;
					}
				}
				else {
					this.OAM[this.internalOAMAddress] = data;
				}
				this.internalOAMAddress++;
				
				break;
			}

			case BG1HOFS: {
				//this.reg[address] = ((data << 8) | (this.BGxOFS_Old & ~7) | ((this.reg[address] >> 8) & 7)) & 0x3FF;
				//this.M7HOFS = ((data << 8) | this.BGxOFS_Old) & 0x1FFF;
				//this.BGxOFS_Old = data;
				
				this.reg[address] = ((data << 8) | (this.BGxOFSLatch & ~7) | (this.BGxHOFSLatch& 7)) & 0x3FF;
				this.M7HOFS = ((data << 8) | (this.BGxOFSLatch & ~7) | (this.BGxHOFSLatch& 7)) & 0x1FFF;
				this.BGxOFSLatch = data;
				this.BGxHOFSLatch = data;
				break;
			}
			case BG2HOFS:
			case BG3HOFS:
			case BG4HOFS: {
				// this.reg[address] = ((data << 8) | (this.BGxOFS_Old & ~7) | ((this.reg[address] >> 8) & 7)) & 0x3FF;
				// this.BGxOFS_Old = data;
				
				this.reg[address] = ((data << 8) | (this.BGxOFSLatch & ~7) | (this.BGxHOFSLatch& 7)) & 0x3FF;
				this.BGxOFSLatch = data;
				this.BGxHOFSLatch = data;
				break;
			}

			case BG1VOFS:{
				this.reg[address] = ((data << 8) | this.BGxOFSLatch) & 0x3FF;
				this.M7VOFS = ((data << 8) | this.BGxOFSLatch) & 0x1FFF;
				this.BGxOFSLatch = data;

				break;
			}

			case BG2VOFS:
			case BG3VOFS:
			case BG4VOFS: {
				this.reg[address] = ((data << 8) | this.BGxOFSLatch) & 0x3FF;
				this.M7VOFS = ((data << 8) | this.BGxOFSLatch) & 0x1FFF;
				this.BGxOFSLatch = data;
				break;
			}

			//VRAM
			case VMADDL: {
				this.reg[VMADDL] = data;

				//新しいアドレスからデータをプリフェッチ
				this.latchVram = this.readVram();
				break;
			}
			case VMADDH: {
				this.reg[VMADDH] = data;

				//新しいアドレスからデータをプリフェッチ
				this.latchVram = this.readVram();
				break;
			}
			case VMDATAL: {
				this.writeVram(data, 0);

				//書き込み後アドレスをインクリメント
				if ((~this.reg[VMAIN] >> 7) & 1) this.incrementVramAddr();
				break;
			}
			case VMDATAH: {
				this.writeVram(data, 1);

				//書き込み後アドレスをインクリメント
				if ((this.reg[VMAIN] >> 7) & 1) this.incrementVramAddr();
				break;
			}

			case M7A:
			case M7B: 
			case M7C:
			case M7D:
			case M7X:
			case M7Y: {
				this.reg[address] = (data << 8) | this.M7x_Old;
				this.M7x_Old = data;
				
				if (address === M7B) {
					let a = this.reg[M7A];
					let b = data;
					if ((a >> 15) & 1) a -= 65536;
					if ((b >> 7) & 1) b -= 256;

					const res = a * b & 0xFFFFFF;
					this.reg[MPYL] = res & 0xFF;
					this.reg[MPYM] = (res >> 8) & 0xFF;
					this.reg[MPYH] = (res >> 16) & 0xFF;

					//console.log(`${a.toString(16).padStart(4, 0)}(M7A) * ${b.toString(16).padStart(2, 0)}(M7B) = ${res.toString(16).padStart(6, 0)} -> MPYL:${this.reg[MPYL].toString(16).padStart(2, 0)} MPYM:${this.reg[MPYM].toString(16).padStart(2, 0)} MPYH:${this.reg[MPYH].toString(16).padStart(2, 0)}`)
				}
				
				//logger.log(`reg[${address.toString(16)}] = ${this.reg[address]}`)

				break;
			}

			//CGRAM
			case CGADD: {
				this.reg[CGADD] = data * 2;
				break;
			}
			case CGDATA: {
				this.CGRAM[this.reg[CGADD]] = data;
				this.reg[CGADD] = (this.reg[CGADD] + 1) & 0x1FF;
				break;
			}

			//color math
			case COLDATA: {
				const applyBule = (data >> 7) & 1;
				const applyGreen = (data >> 6) & 1;
				const applyRed = (data >> 5) & 1;
				const intensity = data & 31;
				if (applyBule) {
					this.colorConstantData = (this.colorConstantData & 0x3FF) | (intensity << 10);
				}
				if (applyGreen) {
					this.colorConstantData = (this.colorConstantData & 0x7C1F) | (intensity << 5);
				}
				if (applyRed) {
					this.colorConstantData = (this.colorConstantData & 0x7FE0) | intensity;
				}
				break;
			}

			default: {
				this.reg[address] = data;
				break;
			}
		}


		//bgStateキャッシュ
		switch (address) {
			case BG1SC: {
				this.bgState[0].bgsc = this.reg[address] & 127;

				this.bgState[0].screenSize = this.reg[address] & 3;
				this.bgState[0].screenSizeX = (32 << (this.bgState[0].bgsc & 1)) * this.bgState[0].tileSizeX;
				this.bgState[0].screenSizeY = (32 << ((this.bgState[0].bgsc >> 1) & 1)) * this.bgState[0].tileSizeY;
				break;
			}
			case BG2SC: {
				this.bgState[1].bgsc = this.reg[address] & 127;

				this.bgState[1].screenSize = this.reg[address] & 3;
				this.bgState[1].screenSizeX = (32 << (this.bgState[1].bgsc & 1)) * this.bgState[1].tileSizeX;
				this.bgState[1].screenSizeY = (32 << ((this.bgState[1].bgsc >> 1) & 1)) * this.bgState[1].tileSizeY;
				break;
			}
			case BG3SC: {
				this.bgState[2].bgsc = this.reg[address] & 127;

				this.bgState[2].screenSize = this.reg[address] & 3;
				this.bgState[2].screenSizeX = (32 << (this.bgState[2].bgsc & 1)) * this.bgState[2].tileSizeX;
				this.bgState[2].screenSizeY = (32 << ((this.bgState[2].bgsc >> 1) & 1)) * this.bgState[2].tileSizeY;
				break;
			}
			case BG4SC: {
				this.bgState[3].bgsc = this.reg[address] & 127;
				this.bgState[3].screenSize = this.reg[address] & 3;
				this.bgState[3].screenSizeX = (32 << (this.bgState[3].bgsc & 1)) * this.bgState[3].tileSizeX;
				this.bgState[3].screenSizeY = (32 << ((this.bgState[3].bgsc >> 1) & 1)) * this.bgState[3].tileSizeY;
				break;
			}
			
			case BG12NBA: {
				this.bgState[0].bgnba = this.reg[address] & 15;
				this.bgState[1].bgnba = (this.reg[address] >> 4) & 15;
				break;
			}
			case BG34NBA: {
				this.bgState[2].bgnba = this.reg[address] & 15;
				this.bgState[3].bgnba = (this.reg[address] >> 4) & 15;
				break;
			}
			
			case BGMODE: {
				this.bgState[0].BGnTileSize = (this.reg[address] >> 4) & 1;
				this.bgState[0].tileSizeX = this.bgState[0].BGnTileSize ? 16 : 8;
				this.bgState[0].tileSizeY = this.bgState[0].BGnTileSize ? 16 : 8;
				
				this.bgState[1].BGnTileSize = (this.reg[address] >> 5) & 1;
				this.bgState[1].tileSizeX = this.bgState[1].BGnTileSize ? 16 : 8;
				this.bgState[1].tileSizeY = this.bgState[1].BGnTileSize ? 16 : 8;
				
				this.bgState[2].BGnTileSize = (this.reg[address] >> 6) & 1;
				this.bgState[2].tileSizeX = this.bgState[2].BGnTileSize ? 16 : 8;
				this.bgState[2].tileSizeY = this.bgState[2].BGnTileSize ? 16 : 8;

				this.bgState[3].BGnTileSize = (this.reg[address] >> 7) & 1;
				this.bgState[3].tileSizeX = this.bgState[3].BGnTileSize ? 16 : 8;
				this.bgState[3].tileSizeY = this.bgState[3].BGnTileSize ? 16 : 8;
				
				const mode = this.reg[address] & 7;
				if (mode === 5) {
					this.bgState[0].tileSizeX = 16;//this.bgState[0].BGnTileSize ? 16 : 8;
					this.bgState[1].tileSizeX = 16;//this.bgState[0].BGnTileSize ? 16 : 8;
				}
				else if (mode === 6) {
					this.bgState[0].tileSizeX = 16;//this.bgState[0].BGnTileSize ? 16 : 8;
				}
				else if (mode === 7) {
					this.bgState[0].tileSizeX = 8;
					this.bgState[0].tileSizeY = 8;
				}

				
				this.bgState[0].screenSizeX = (32 << (this.bgState[0].bgsc & 1)) * this.bgState[0].tileSizeX;
				this.bgState[0].screenSizeY = (32 << ((this.bgState[0].bgsc >> 1) & 1)) * this.bgState[0].tileSizeY;
				
				this.bgState[1].screenSizeX = (32 << (this.bgState[1].bgsc & 1)) * this.bgState[1].tileSizeX;
				this.bgState[1].screenSizeY = (32 << ((this.bgState[1].bgsc >> 1) & 1)) * this.bgState[1].tileSizeY;
				
				this.bgState[2].screenSizeX = (32 << (this.bgState[2].bgsc & 1)) * this.bgState[2].tileSizeX;
				this.bgState[2].screenSizeY = (32 << ((this.bgState[2].bgsc >> 1) & 1)) * this.bgState[2].tileSizeY;
				
				this.bgState[3].screenSizeX = (32 << (this.bgState[3].bgsc & 1)) * this.bgState[3].tileSizeX;
				this.bgState[3].screenSizeY = (32 << ((this.bgState[3].bgsc >> 1) & 1)) * this.bgState[3].tileSizeY;
				break;
			}

			case BG1HOFS: {
				this.bgState[0].hofs = this.reg[address] & 1023;
				break;
			}
			case BG1VOFS: {
				this.bgState[0].vofs = this.reg[address] & 1023;
				break;
			}
			case BG2HOFS: {
				this.bgState[1].hofs = this.reg[address] & 1023;
				break;
			}
			case BG2VOFS: {
				this.bgState[1].vofs = this.reg[address] & 1023;
				break;
			}
			case BG3HOFS: {
				this.bgState[2].hofs = this.reg[address] & 1023;
				break;
			}
			case BG3VOFS: {
				this.bgState[2].vofs = this.reg[address] & 1023;
				break;
			}
			case BG4HOFS: {
				this.bgState[3].hofs = this.reg[address] & 1023;
				break;
			}
			case BG4VOFS: {
				this.bgState[3].vofs = this.reg[address] & 1023;
				break;
			}

			case MOSAIC: {
				this.bgState[0].mosaicEnable = data & 1;
				this.bgState[1].mosaicEnable = (data >> 1) & 1;
				this.bgState[2].mosaicEnable = (data >> 2) & 1;
				this.bgState[3].mosaicEnable = (data >> 3) & 1;
				
				this.bgState[0].mosaicSize = ((data >> 4) & 15) + 1;
				this.bgState[1].mosaicSize = ((data >> 4) & 15) + 1;
				this.bgState[2].mosaicSize = ((data >> 4) & 15) + 1;
				this.bgState[3].mosaicSize = ((data >> 4) & 15) + 1;
				
				break;
			}
		}

		// switch(address) {
		// 	case W12SEL:
		// 	case W34SEL:
		// 	case WOBJSEL:
		// 	case WH0:
		// 	case WH1:
		// 	case WH2:
		// 	case WH3:
		// 	case WBGLOG:
		// 	case WOBJLOG:
		// 	case TMW:
		// 	case TSW:
		// 	case CGWSEL:
		// 	{
		// 		logger.log(`${address.toString(16)} = ${data.toString(2).padStart(8, 0)}`);
		// 		break;
		// 	}
		// }
	}

	this.readVram = function() {
		let addr = (this.reg[VMADDH] << 8) | this.reg[VMADDL];
		addr = this.remappingVramAddr(addr) & 0x7FFF;
		const res = (this.vramHi[addr] << 8) | this.vramLo[addr];
		return res;
	}

	this.writeVram = function(data, isHighByte) {
		let addr = (this.reg[VMADDH] << 8) | this.reg[VMADDL];
		addr = this.remappingVramAddr(addr) & 0x7FFF;
		if (isHighByte) this.vramHi[addr] = data;
		else this.vramLo[addr] = data;

		this.tileCache2bpp[addr >> 3] = undefined;
		this.tileCache4bpp[addr >> 4] = undefined;
		this.tileCache8bpp[addr >> 5] = undefined;

		this.vramTileCacheVersion++;
	}

	this.incrementVramAddr = function() {
		let step = 1;
		if (this.reg[VMAIN] & 1) step = 32;
		if (this.reg[VMAIN] & 2) step = 128;

		let addr = (this.reg[VMADDH] << 8) | this.reg[VMADDL];
		addr = (addr + step) & 0xffff;

		this.reg[VMADDH] = (addr >> 8) & 0xff;
		this.reg[VMADDL] = addr & 0xff;
	}

	this.remappingVramAddr = function(addr) {
		const mode = (this.reg[VMAIN] >> 2) & 3;
		if (mode === 1) {
			const rot8 = ((addr << 3) & 0xff) | ((addr >> 5) & 7);
			addr = (addr & ~0xff) | rot8;
		}
		else if (mode === 2) {
			const rot9 = ((addr << 3) & 0x1ff) | ((addr >> 6) & 7);
			addr = (addr & ~0x1ff) | rot9;
		}
		else if (mode === 3) {
			const rot10 = ((addr << 3) & 0x3ff) | ((addr >> 7) & 7);
			addr = (addr & ~0x3ff) | rot10;
		}
		return addr;
	}






	this.debug = function() {
		const res = `(${this.VCount.toString(10).padStart(3)},${this.HCount.toString(10).padStart(3)})`;
		return res;
	}

	this.drawMemoryData = function(memory, begin, bpp, size = 8, row = 28, col = 8) {
		
		for (let i = 0; i < row; i++) {
			for (let j = 0; j < col; j++) {
				for (let k = 0; k < size; k++) {
					const base = (i * size * col + j * size) * bpp + k * 2 + begin * 2;
					const bitPlane = new Array(size).fill(0);
					for (let bit = 0; bit < bpp; bit++) {
						const addr = base + (bit >> 1) * 16 + (bit & 1);
						const data = memory[addr];

						for (let l = 0; l < size; l++) {
							const v = (data >> (size - 1 - l)) & 1;
							bitPlane[l] |= (v << bit);
						}
					}

					const paletteIndex = 0;
					for (let l = 0; l < size; l++) {
						const v = bitPlane[l];
						const cgramIndex = (paletteIndex * 4 + v) * 2;
						const cgramLo = this.CGRAM[cgramIndex];
						const cgramHi = this.CGRAM[cgramIndex + 1];
						const color = cgramLo | (cgramHi << 8);
						const r5 = color & 0x1f;
						const g5 = (color >> 5) & 0x1f;
						const b5 = (color >> 10) & 0x1f;
						const r8 = 8 * Math.trunc(r5 + r5 / 32);
						const g8 = 8 * Math.trunc(g5 + g5 / 32);
						const b8 = 8 * Math.trunc(b5 + b5 / 32);
						this.renderer.draw(j * size + l, i * size + k, r8, g8, b8, 255);

						// const rgb = (255 * v) >> bpp;
						// this.renderer.draw(j * size + l, i * size + k, rgb, rgb, rgb, 255);
					}
				}
			}
		}

		const end = begin + row * col * bpp * 4 - 1;
		//console.log(`drawMemoryData:${begin.toString(16).padStart(4, 0)}~${end.toString(16).padStart(4, 0)}`);

		this.renderer.flip();
	}

	this.selectTilemapNumber = -1;
	
	this.changeShowTilemapNumber = function(number) {
		this.selectTilemapNumber = number;
	}
}
