/**
 * @author alteredq / http://alteredqualia.com/
 */

THREE.ShaderPass = function (shader, textureID) {

	THREE.Pass.call(this);
	this.textureID = (textureID !== undefined) ? textureID : "tDiffuse";

	if (shader instanceof THREE.ShaderMaterial) {

		this.uniforms = shader.uniforms;

		this.material = shader;

	} else if (shader) {

		this.uniforms = THREE.UniformsUtils.clone(shader.uniforms);

		this.material = new THREE.ShaderMaterial({

			defines: Object.assign({}, shader.defines),
			uniforms: this.uniforms,
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader
		});
	}
	this.fsQuad = new THREE.Pass.FullScreenQuad(this.material);
};

THREE.ShaderPass.prototype = Object.assign(Object.create(THREE.Pass.prototype), {

	constructor: THREE.ShaderPass,

	render: function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {

		// set render start time
		if(!this.startTime) {
			this.startTime = (Date.now() / 1000) - 0.5;
		}

		// set shader runtime uniform
		if(this.uniforms["iTime"]) {
			var runtime = (Date.now() / 1000) - this.startTime;
			this.uniforms["iTime"].value = runtime;
		}

		// set texture channel sampler
		if (this.uniforms[this.textureID]) {
			this.uniforms[this.textureID].value = readBuffer.texture;
		}

		// set resolution uniform
		if(this.uniforms["iResolution"]) {
			this.uniforms["iResolution"].value = renderer.getSize(new THREE.Vector2());
		}

		this.fsQuad.material = this.material;

		if (this.renderToScreen) {

			renderer.setRenderTarget(null);
			this.fsQuad.render(renderer);

		} else {

			renderer.setRenderTarget(writeBuffer);
			// TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
			if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
			this.fsQuad.render(renderer);
		}
	}
});
