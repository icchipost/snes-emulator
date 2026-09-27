
import { CPU } from "./cpu.js";
import { PPU } from "./ppu.js";
import { APU } from "./apu.js";
import { Cartridge } from "./catridge.js";
import { Controller } from "./contoller.js";
import { logger } from "./logger.js";

export function Snes() {
	this.cpu = new CPU();
	this.ppu = new PPU();
	this.apu = new APU();
	this.cartridge = new Cartridge();
	this.controller = new Controller();

	this.frame = 0;
	this.requestId = undefined;

	this.ppuBgChoiceBox

	this.reset = function(hard = 1) {
		this.cartridge.reset();
		this.ppu.setCpu(this.cpu);
		this.ppu.reset();
		this.cpu.reset(this.cartridge, this.ppu, this.apu, this.controller);
		this.apu.reset();
	}

	this.load = function(rom) {
		this.cartridge.load(rom);
		this.apu.powerup();
	}

	this.run = function() {
		logger.log(`frame#${this.frame}`);
		
		//262*1364
		const dotClock = 357368;
		for (let i = 0; i < dotClock; i++) {
			this.cpu.clock(i, 0);
			this.ppu.clock(i);
			this.apu.clock(i, 0);

			this.controller.clock();
			if (i === 307030) {
				this.controller.setBusyFlag();
			}
		}
		
		this.ppu.render(0);
		logger.dump();

		this.frame++;

		this.requestId = requestAnimationFrame(this.run.bind(this));
	}

	this.pause = function() {
		if (this.requestId != undefined) {
			cancelAnimationFrame(this.requestId);
			this.requestId = undefined;
		}
	}
}
