/**
 * @license
 * Copyright (c) 2019 D.Thiele All rights reserved.  
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.  
 * 
 * @see
 * Rorschaach animated
 * for Wallpaper Engine (https://steamcommunity.com/app/431960)
 * 
 * @author
 * by Hexxon 			(https://hexxon.me)
 * 
 * @todo
 * - weicue
 * - weasWorker
 * 
 * 
*/

// custom logging function
function print(arg, force) {
	console.log("Rorschach animated: " + JSON.stringify(arg));
}

// Provides requestAnimationFrame in a cross browser way.
// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
if (!window.requestAnimationFrame) {
	window.requestAnimationFrame = (() => {
		return window.webkitRequestAnimationFrame ||
			window.mozRequestAnimationFrame ||
			window.oRequestAnimationFrame ||
			window.msRequestAnimationFrame;
	})();
}

// Provides a custom rendering function
window.requestCustomAnimationFrame = (callback) => {
	var sett = rorschach.settings;
	if (!sett.system_drawing)
		rorschach.rafID = setTimeout(() => callback(), 1000 / sett.fps_limit)
	else
		rorschach.rafID = requestAnimationFrame(callback);
};

// base object for wallpaper
var rorschach = {
	// holds default wallpaper settings
	// these basically connect 1:1 to wallpaper engine settings.
	// for more explanation on settings visit the Workshop-Item-Forum (link above)
	settings: {
		schemecolor: "0 0 0",
		icue_mode: false,
		icue_area_xoff: 50,
		icue_area_yoff: 90,
		icue_area_width: 75,
		icue_area_height: 30,
		icue_area_blur: 5,
		icue_area_decay: 15,
		icue_area_preview: false,
		speed: 65,
		shadeContrast: 2,
		audio_multiplier: 2,
		ink_color: "0.1 0.1 0.1",
		paper_color: "1 0.9 0.8"
	},
	// context?
	isWebContext: false,
	// started yet?
	initialized: false,
	// paused?
	PAUSED: false,
	// canvas
	mainCanvas: null,
	helperCanvas: null,
	helperContext: null,
	// requestAnimationFrame ID
	lastFrame: performance.now() / 1000,
	rafID: null,
	// audio time boosting
	audioTimeBoost: 0,
	// interval for random numer audio generator
	wallpaperAudioInterval: null,
	// interval for reloading the wallpaper
	resetTimeout: null,
	// iCue Stuff
	icueAvailable: false,
	icueCanvasX: 23,
	icueCanvasY: 7,
	icueDevices: [],
	icuePreview: null,


	///////////////////////////////////////////////
	// APPLY SETTINGS
	///////////////////////////////////////////////

	// Apply settings from the project.json "properties" object and takes certain actions
	applyCustomProps: function (props) {
		print("apply: " + JSON.stringify(props));

		var self = rorschach;
		var sett = self.settings;

		// loop all settings for updated values
		for (var setting in props) {
			if (setting.startsWith("IGNORE_")) continue;
			// get the updated setting
			var prop = props[setting];
			// check typing
			if (!prop || !prop.type || prop.type == "text") continue;
			if (sett[setting] != null) {
				// apply prop value
				if (prop.type == "bool")
					sett[setting] = prop.value == true;
				else
					sett[setting] = prop.value;
			}
			else print("Unknown setting: " + setting);
		}

		// TODO
		/// weas.audio_smoothing = sett.audio_smoothing;
		/// weas.silentThreshHold = sett.minimum_volume / 1000;

		// create preview
		if (!self.icuePreview && sett.icue_area_preview) {
			self.icuePreview = document.createElement("div");
			self.icuePreview.classList.add("cuePreview");
			document.body.appendChild(self.icuePreview);
		}
		// update settings or destroy
		if (self.icuePreview) {
			if (!sett.icue_area_preview) {
				document.body.removeChild(self.icuePreview);
				self.icuePreview = null;
			}
			else Object.assign(self.icuePreview.style, self.getICUEArea(true));
		}
	},


	///////////////////////////////////////////////
	// INITIALIZE
	///////////////////////////////////////////////

	initFirst: function () {
		window.addEventListener("resize", (event) => {
			if (!this.initialized) return;
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
		}, false);

		// real initializer
		this.initSystem();
	},

	// initialize the geometric & grpahics system
	// => starts rendering loop afterwards
	initSystem: function () {
		print("initializing...");
		// No WebGL ? o.O
		if (!Detector.webgl) {
			Detector.addGetWebGLMessage();
			return;
		}
		var self = this;
		var sett = self.settings;
		// Lifetime variables
		self.startTime = Date.now();
		self.fpsThreshold = 0;
		self.swirlStep = 0;
		// statistics
		if (sett.stats_option >= 0) {
			print("Init stats: " + sett.stats_option);
			self.stats = new Stats();
			self.stats.showPanel(sett.stats_option); // 0: fps, 1: ms, 2: mb, 3+: custom
			document.body.appendChild(self.stats.dom);
		}
		// get container
		self.container = document.getElementById("renderContainer");
		// get canvas & context
		self.mainCanvas = document.getElementById("mainCvs");
		// get helper canvas & context
		self.helperCanvas = document.getElementById("helpCvs");
		self.helperCanvas.width = self.icueCanvasX;
		self.helperCanvas.height = self.icueCanvasY;
		self.helperCanvas.style.display = "none";
		self.helperContext = self.helperCanvas.getContext("2d");

		// create scene
		self.scene = new THREE.Scene();

		/// create camera
		self.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
		self.camera.position.x = 0;
		self.camera.position.y = 0;
		self.camera.position.z = 5;

		// create renderer and effects
		self.renderer = new THREE.WebGLRenderer({
			canvas: self.mainCanvas,
			clearColor: 0x000000,
			clearAlpha: 1,
			alpha: true,
			antialias: true
		});
		self.renderer.setSize(window.innerWidth, window.innerHeight);

		/// effect composer
		self.composer = new THREE.EffectComposer(self.renderer);
		self.composer.addPass(new THREE.RenderPass(self.scene, self.camera, null, 0x000000, 1));

		// effect pass
		self.rorPass = new THREE.ShaderPass(THREE.RorSchader);
		
		// todo custom colors
		self.rorPass.uniforms.iResolution.value = new THREE.Vector2(window.innerWidth, window.innerHeight);
		self.rorPass.renderToScreen = true;
		self.composer.addPass(self.rorPass);

		// create some light
		self.light = new THREE.HemisphereLight(0xeeeeee, 0x888888, 1);
		self.light.position.set(0, 20, 0);
		self.scene.add(self.light);

		// init plugins
		if (self.icueAvailable) self.initICUE();
		else self.icueMessage("iCUE: Not available!");
		// start rendering
		if (!self.postRendering) self.renderLoop();
		else self.renderer.setAnimationLoop(self.renderLoop);
		$("#renderContainer").fadeIn(5000);
		// print
		print("startup complete.", true);
	},

	///////////////////////////////////////////////
	// RENDERING
	///////////////////////////////////////////////

	renderLoop: function () {
		try {
			var self = rorschach;
			// paused - stop render
			if (self.PAUSED) return;
			if (!self.postRendering) window.requestCustomAnimationFrame(self.renderLoop);
			// Figure out how much time passed since the last animation
			var fpsThreshMin = 1 / 60;
			var now = performance.now() / 1000;
			var ellapsed = Math.min(now - self.lastFrame, 1);
			self.lastFrame = now;
			// skip rendering the frame if we reached the desired FPS
			self.fpsThreshold += ellapsed;
			// over FPS limit? cancel animation..
			if (self.fpsThreshold < fpsThreshMin) return;
			self.fpsThreshold -= fpsThreshMin;
			// render canvas
			var delta = ellapsed / fpsThreshMin;
			self.renderFrame(delta, ellapsed);
		} catch (ex) {
			console.log("renderLoop exception: ", true);
			console.log(ex, true);
		}
	},
	// render a single frame with the given delta Multiplicator
	renderFrame: function (delta, ellapsed) {
		var self = rorschach;
		var sett = self.settings;
		// stats
		if (self.stats) self.stats.begin();

		// audio calculation
		var hasAudio = weas.hasAudio();
		var peakIntensity = 1.0;
		if (hasAudio) {
			var flmult = (15 + sett.audio_multiplier) * 0.02;
			var lastAudio = weas.lastAudio;

			var bassIntensity = (lastAudio.bass * 2 - lastAudio.mids + lastAudio.peaks) / 60 / lastAudio.average;
			var boost = bassIntensity * flmult;
			self.audioTimeBoost += boost * delta;

			peakIntensity =  0.3 + ((lastAudio.peaks * 2 + lastAudio.mids + lastAudio.bass) / 60 / lastAudio.average) * 0.5;

			print("audio: bass=" + bassIntensity + ", peak="+ peakIntensity);
		}

		// apply shader runtime
		var time = (Date.now() - self.startTime) / 1000;
		self.rorPass.uniforms.iTime.value = time + self.audioTimeBoost;
		// apply contrast
		self.rorPass.uniforms.shadeContrast.value = sett.shadeContrast * peakIntensity / 10;
		// apply colors
		var iCol = sett.ink_color.split(" ");
		var pCol = sett.paper_color.split(" ");
		self.rorPass.uniforms.inkColor.value = new THREE.Vector3(iCol[0], iCol[1], iCol[2]);
		self.rorPass.uniforms.paperColor.value = new THREE.Vector3(pCol[0], pCol[1], pCol[2]);

		// canvas render
		self.composer.render(ellapsed);

		// ICUE PROCESSING
		// its better to do this every frame instead of seperately timed
		if (sett.icue_mode == 1) {
			// get helper vars
			var cueWid = self.icueCanvasX;
			var cueHei = self.icueCanvasY;
			var area = self.getICUEArea();
			var hctx = self.helperContext;
			// overlay "decay"
			hctx.fillStyle = "rgba(0, 0, 0, " + sett.icue_area_decay / 100 + ")";
			hctx.fillRect(0, 0, cueWid, cueHei);
			// scale down and copy the image to the helper canvas
			hctx.drawImage(self.mainCanvas, area.left, area.top, area.width, area.height, 0, 0, cueWid, cueHei);
			// blur the helper projection canvas
			if (sett.icue_area_blur > 0) self.gBlurCanvas(self.helperCanvas, hctx, sett.icue_area_blur);
		}

		// stats
		if (self.stats) self.stats.end();
	},


	///////////////////////////////////////////////
	// ICUE INTEGRATION
	///////////////////////////////////////////////

	// will return a rectangle object represnting the icue area in pixels
	// choosable as integer or string with "px" suffix (for css styling)
	getICUEArea: function (inPx) {
		var sett = rorschach.settings;
		var wwid = window.innerWidth;
		var whei = window.innerHeight;
		var w = wwid * sett.icue_area_width / 100;
		var h = whei * sett.icue_area_height / 100;
		var l = ((wwid - w) * sett.icue_area_xoff / 100);
		var t = ((whei - h) * sett.icue_area_yoff / 100);
		return {
			width: w + (inPx ? "px" : ""),
			height: h + (inPx ? "px" : ""),
			left: l + (inPx ? "px" : ""),
			top: t + (inPx ? "px" : ""),
		};
	},
	// will initialize ICUE api & usage
	initICUE: function () {
		print("iCUE: async initialization...")
		var self = rorschach;
		self.icueDevices = [];
		window.cue.getDeviceCount((deviceCount) => {
			self.icueMessage("iCUE: " + deviceCount + " devices found.");
			for (var xi = 0; xi < deviceCount; xi++) {
				var xl = xi;
				window.cue.getDeviceInfo(xl, (info) => {
					info.id = xl;
					window.cue.getLedPositionsByDeviceIndex(xl, function (leds) {
						info.leds = leds;
						print("iCUE: Device " + JSON.stringify(info));
						self.icueDevices[xl] = info;
					});
				});
			}
		});
		// update devices about every 33ms/30fps. iCue doesnt really support higher values 
		self.icueInterval = setInterval(self.processICUE, 1000 / 30);
	},
	// process LEDs for iCUE devices
	processICUE: function () {
		var self = rorschach;
		var sett = self.settings;
		if (self.PAUSED || self.icueDevices.length < 1 || sett.icue_mode == 0) return;
		// projection mode
		if (sett.icue_mode == 1) {
			// get local values
			var cueWid = self.icueCanvasX;
			var cueHei = self.icueCanvasY;
			var ctx = self.helperContext;
			// get scaled down image data
			var imgData = ctx.getImageData(0, 0, cueWid, cueHei);
			// encode data for icue
			var encDat = self.getEncodedCanvasImageData(imgData);
			// update all devices with data
			for (var xi = 0; xi < self.icueDevices.length; xi++) {
				window.cue.setLedColorsByImageData(xi, encDat, cueWid, cueHei);
			}
		}
		// color mode
		if (sett.icue_mode == 2) {
			// get lol objects
			var col = sett.icue_main_color.split(" ");
			var ledColor = {
				r: col[0] * 255,
				g: col[1] * 255,
				b: col[2] * 255
			};;
			// try audio multiplier processing
			if (weas.hasAudio()) {
				var aud = weas.lastAudio;
				var mlt = 255 * aud.average / aud.range / aud.intensity * 10;
				ledColor = {
					r: Math.min(255, Math.max(0, col[0] * mlt)),
					g: Math.min(255, Math.max(0, col[1] * mlt)),
					b: Math.min(255, Math.max(0, col[2] * mlt))
				};
			}
			// update all devices with data
			for (var xi = 0; xi < self.icueDevices.length; xi++) {
				window.cue.setAllLedsColorsAsync(xi, ledColor);
			}
		}
	},
	// get data for icue
	getEncodedCanvasImageData: function (imageData) {
		var colorArray = [];
		for (var d = 0; d < imageData.data.length; d += 4) {
			var write = d / 4 * 3;
			colorArray[write] = imageData.data[d];
			colorArray[write + 1] = imageData.data[d + 1];
			colorArray[write + 2] = imageData.data[d + 2];
		}
		return String.fromCharCode.apply(null, colorArray);
	},
	// canvas blur helper function
	gBlurCanvas: function (canvas, ctx, blur) {
		var sum = 0;
		var delta = 5;
		var alpha_left = 1 / (2 * Math.PI * delta * delta);
		var step = blur < 3 ? 1 : 2;
		for (var y = -blur; y <= blur; y += step) {
			for (var x = -blur; x <= blur; x += step) {
				var weight = alpha_left * Math.exp(-(x * x + y * y) / (2 * delta * delta));
				sum += weight;
			}
		}
		for (var y = -blur; y <= blur; y += step) {
			for (var x = -blur; x <= blur; x += step) {
				ctx.globalAlpha = alpha_left * Math.exp(-(x * x + y * y) / (2 * delta * delta)) / sum * blur * blur;
				ctx.drawImage(canvas, x, y);
			}
		}
		ctx.globalAlpha = 1;
	},
	// show a message by icue
	icueMessage: function (msg) {
		$("#icuetext").html(msg);
		$("#icueholder").fadeIn({ queue: false, duration: "slow" });
		$("#icueholder").animate({ top: "0px" }, "slow");
		setTimeout(() => {
			$("#icueholder").fadeOut({ queue: false, duration: "slow" });
			$("#icueholder").animate({ top: "-120px" }, "slow");
		}, 12000);
	},
};


///////////////////////////////////////////////
// Actual Initialisation
///////////////////////////////////////////////

print("Begin Startup...")

// will apply settings edited in Wallpaper Engine
// this will also cause initialization for the first time
window.wallpaperPropertyListener = {
	applyGeneralProperties: (props) => {
		// nothing to do here
	},
	applyUserProperties: (props) => {
		rorschach.applyCustomProps(props);
		// very first initialization
		if (!rorschach.initialized) {
			rorschach.initialized = true;
			$(() => rorschach.initFirst());
		}
	},
	setPaused: (isPaused) => {
		if (rorschach.PAUSED == isPaused) return;
		console.log("Set pause: " + isPaused);
		rorschach.PAUSED = isPaused;
		rorschach.lastFrame = (performance.now() / 1000) - 1;
		if (!isPaused) window.requestCustomAnimationFrame(rorschach.renderLoop);
		if (rorschach.postRendering) rorschach.renderer.setAnimationLoop(isPaused ? null : rorschach.renderLoop);
	}
};

// will initialize icue functionality if available
window.wallpaperPluginListener = {
	onPluginLoaded: function (name, version) {
		print("Plugin loaded: " + name + ", Version: " + version);
		if (name === "cue") rorschach.icueAvailable = true;
	}
};

// will be called first when wallpaper is run from web(with wewwa)
window.wewwaListener = {
	initWebContext: function () {
		rorschach.isWebContext = true;
	}
};

// after the page finished loading: if the wallpaper context is not given => start wallpaper 
$(() => {
	if (!window.wallpaperRegisterAudioListener) {
		print("wallpaperRegisterAudioListener not defined. We are probably outside of wallpaper engine. Manual init..");
		rorschach.applyCustomProps({});
		rorschach.initialized = true;
		rorschach.initFirst();
	}
});
