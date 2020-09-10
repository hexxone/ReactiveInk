/**
 * @license
 * Copyright (c) 2019 D.Thiele All rights reserved.  
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.  
 * 
 * @see
 * ReactiveInk
 * for Wallpaper Engine (https://steamcommunity.com/app/431960)
 * 
 * @author
 * by hexxone 			(https://hexx.one)
 * 
 * Todo:
 * - Fix Project settings 
 * - Update Main Repos
 * 
*/

// custom logging function
function print(arg) {
	console.log("ReactiveInk: " + JSON.stringify(arg));
}

// base object for wallpaper
var reactiveInk = {
	// holds default wallpaper settings
	// these basically connect 1:1 to wallpaper engine settings.
	// for more explanation on settings visit the Workshop-Item-Forum (link above)
	settings: {
		schemecolor: "0 0 0",
		speed: 65,
		blur_strength: 5,
		strength: 10,
		shade_contrast: 2,
		audio_multiplier: 2,
		ink_color: "0.1 0.1 0.1",
		paper_color: "1 0.9 0.8",
		shader_quality: "medium",
		stats_option: -1,
		seizure_warning: false
	},
	// fps limit, by wallpaper engine
	fps: 60,
	// context?
	isWebContext: false,
	// started yet?
	initialized: false,
	// re-init timeout
	resetTimeout: null,
	// paused?
	PAUSED: false,
	// context
	container: null,
	mainCanvas: null,
	scene: null,
	camera: null,
	renderer: null,

	composer: null,
	rorPass: null,
	blurPassX: null,
	blurPassY: null,
	chromaPass: null,

	light: null,
	fpsThreshold: 0,

	// requestAnimationFrame ID
	lastFrame: performance.now() / 1000,
	// audio time boosting
	audioTimeBoost: 0,

	///////////////////////////////////////////////
	// APPLY SETTINGS
	///////////////////////////////////////////////

	// Apply settings from the project.json "properties" object and takes certain actions
	applyCustomProps: function (props) {
		//print("applying settings: " + Object.keys(props).length + JSON.stringify(props));

		var self = reactiveInk;
		var sett = self.settings;
		var reInitFlag = false;

		var settStorage = [sett, weas.settings, weicue.settings];

		var _ignore = ["audioprocessing"];
		var _reInit = ["strength", "blur_strength", "shader_quality"];

		// loop all settings for updated values
		for (var setting in props) {
			// ignore this setting or apply it manually
			if (_ignore.includes(setting) || setting.startsWith("HEADER_")) continue;
			// get the updated setting
			var prop = props[setting];
			// check typing
			if (!prop || !prop.type || prop.type == "text") continue;
			// process all storages
			var found = false;
			for (var storage of settStorage) {
				if (storage[setting] != null) {
					// save b4
					found = true;
					var b4Setting = storage[setting];
					// apply prop value
					if (prop.type == "bool")
						storage[setting] = prop.value == true;
					else
						storage[setting] = prop.value;

					// set re-init flag if value changed and included in list
					reInitFlag = reInitFlag || b4Setting != storage[setting] && _reInit.includes(setting);
				}
			}
			// invalid?
			if (!found) print("Unknown setting: " + setting);
		}

		// update preview visbility after setting possibly changed
		weicue.updatePreview();

		return reInitFlag;
	},

	///////////////////////////////////////////////
	// INITIALIZE
	///////////////////////////////////////////////

	initFirst: function () {
		var self = reactiveInk;
		var sett = self.settings;

		// real initializer
		self.initSystem();

		// change handler only after init, due to Chrome bug
		window.addEventListener("resize", (event) => {
			if (!self.initialized) return;
			self.camera.aspect = window.innerWidth / window.innerHeight;
			self.camera.updateProjectionMatrix();
			self.renderer.setSize(window.innerWidth, window.innerHeight);
		}, false);

		// start fade-in wrapper
		var initWrap = () => {
			$("#mainCvs").addClass("show");
		};

		// show seizure warning before initializing?
		if (!sett.seizure_warning) initWrap();
		else WarnHelper.Show(initWrap);
	},

	// re-initialize the system
	reInitSystem: function () {
		print("re-initializing...");
		// Lifetime variables
		var self = reactiveInk;

		// hide reload indicator
		ReloadHelper.Hide();
		// kill stats
		if (self.stats) self.stats.dispose();
		self.stats = null;
		// kill shaders
		self.blurPassX = null;
		self.blurPassY = null;
		self.chromaPass = null;
		// kill shader processor
		if (self.composer) self.composer.reset();
		self.composer = null;
		// kill frame animation and webgl
		self.renderer.setAnimationLoop(null);
		self.renderer.forceContextLoss();
		// recreate webgl canvas
		self.container.removeChild(self.mainCanvas);
		var mainCvs = document.createElement("canvas");
		mainCvs.id = "mainCvs";
		self.container.appendChild(mainCvs);
		// actual re-init
		self.initSystem();
		// show again
		$("#mainCvs").addClass("show");
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

		// inject shader quality
		ShaderQuality.Inject(sett.shader_quality, [THREE.RorSchader, THREE.GlowShader, THREE.ChromaticShader])

		// Lifetime variables
		self.fpsThreshold = 0;
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

		// effect composer
		self.composer = new THREE.EffectComposer(self.renderer);
		self.composer.addPass(new THREE.RenderPass(self.scene, self.camera, null, 0x000000, 1));

		// Main shader pass (generator)
		self.rorPass = new THREE.ShaderPass(THREE.RorSchader);
		self.composer.addPass(self.rorPass);

		// Glow pass (transformer)
		if (sett.blur_strength > 0) {
			self.blurPassX = new THREE.ShaderPass(THREE.GlowShader);
			self.blurPassY = new THREE.ShaderPass(THREE.GlowShader);
			self.composer.addPass(self.blurPassX);
			self.composer.addPass(self.blurPassY);
		}

		// Chroma Pass (transformer)
		if (sett.strength > 0) {
			self.chromaPass = new THREE.ShaderPass(THREE.ChromaticShader);
			self.chromaPass.renderToScreen = true;
			self.composer.addPass(self.chromaPass);
		}

		// create some light
		self.light = new THREE.HemisphereLight(0xeeeeee, 0x888888, 1);
		self.light.position.set(0, 20, 0);
		self.scene.add(self.light);

		// init plugins
		weicue.init(self.mainCanvas);
		// start rendering
		self.renderer.setAnimationLoop(reactiveInk.renderLoop);
		// print
		print("startup complete.", true);
	},

	///////////////////////////////////////////////
	// RENDERING
	///////////////////////////////////////////////

	renderLoop: function () {
		try {
			var self = reactiveInk;
			// paused - stop render
			if (self.PAUSED) return;
			// Figure out how much time passed since the last animation
			var fpsThreshMin = 1 / self.fps;
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
			print("renderLoop exception: " + ex.message);
		}
	},
	// render a single frame with the given delta Multiplicator
	renderFrame: function (delta, ellapsed) {
		var self = reactiveInk;
		var sett = self.settings;
		// stats
		if (self.stats) self.stats.begin();

		// audio calculation
		var hasAudio = weas.hasAudio();
		var bassIntensity = 1.0;
		var peakIntensity = 1.0;
		if (hasAudio) {
			var flmult = (1 + sett.audio_multiplier) * 0.5;
			var laa = weas.lastAudio;
			// bass calculation
			bassIntensity = ((laa.bass * 2 - laa.mids + laa.peaks) / 60 / laa.average) * flmult;
			// peak calucation
			peakIntensity = ((laa.peaks * 2 + laa.mids + laa.bass) / 60 / laa.average) * flmult;
			// audio boosting
			self.audioTimeBoost += bassIntensity * flmult * 0.001 * delta;
		}
		// apply main shader values
		self.rorPass.uniforms.timeBoost.value = self.audioTimeBoost;
		self.rorPass.uniforms.speed.value = sett.speed / 500;
		self.rorPass.uniforms.shade_contrast.value = Math.pow(sett.shade_contrast / 10, 3) * peakIntensity;
		// apply colors
		var iCol = sett.ink_color.split(" ");
		var pCol = sett.paper_color.split(" ");
		self.rorPass.uniforms.inkColor.value = new THREE.Vector3(iCol[0], iCol[1], iCol[2]);
		self.rorPass.uniforms.paperColor.value = new THREE.Vector3(pCol[0], pCol[1], pCol[2]);
		// apply blur
		if(sett.blur_strength > 0) {
			var bs = Math.max(0.1, sett.blur_strength - bassIntensity / 20) / 10;
			self.blurPassX.uniforms.u_dir.value = new THREE.Vector2(bs, 0);
			self.blurPassY.uniforms.u_dir.value = new THREE.Vector2(0, bs);
		}
		// apply chroma
		if (sett.strength > 0) {
			self.chromaPass.uniforms.strength.value = sett.strength * bassIntensity;
		}
		// canvas render
		self.composer.render(ellapsed);
		// ICUE PROCESSING
		weicue.updateCanvas();
		// stats
		if (self.stats) self.stats.end();
	},
};

///////////////////////////////////////////////
// Actual Initialisation
///////////////////////////////////////////////

print("Begin Startup...");

// will apply settings edited in Wallpaper Engine
// this will also cause initialization for the first time
window.wallpaperPropertyListener = {
	applyGeneralProperties: (props) => {
		// set fps
		if (props.fps) reactiveInk.fps = props.fps;
	},
	applyUserProperties: (props) => {
		var reInit = reactiveInk.applyCustomProps(props);
		// very first initialization
		if (!reactiveInk.initialized) {
			reactiveInk.initialized = true;
			$(() => reactiveInk.initFirst());
		}
		else if (reInit) {
			print("got reInit-flag from applying settings!", true);
			if (reactiveInk.resetTimeout) clearTimeout(reactiveInk.resetTimeout);
			reactiveInk.resetTimeout = setTimeout(reactiveInk.reInitSystem, 3000);
			ReloadHelper.Show();
			$("#mainCvs").removeClass("show");
		}
	},
	setPaused: (isPaused) => {
		if (reactiveInk.PAUSED == isPaused) return;
		print("Set pause: " + isPaused);
		reactiveInk.PAUSED = isPaused;
		reactiveInk.lastFrame = (performance.now() / 1000) - 1;
		reactiveInk.renderer.setAnimationLoop(isPaused ? null : reactiveInk.renderLoop);
	}
};

// will be called first when wallpaper is run from web(with wewwa)
window.wewwaListener = {
	initWebContext: function () {
		reactiveInk.isWebContext = true;
	}
};

// after the page finished loading: if the wallpaper context is not given => start wallpaper 
$(() => {
	if (!window.wallpaperRegisterAudioListener) {
		print("wallpaperRegisterAudioListener not defined. We are probably outside of wallpaper engine. Manual init..");
		reactiveInk.initialized = true;
		reactiveInk.initFirst();
	}
});
