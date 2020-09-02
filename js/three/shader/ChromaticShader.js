/**
 * @author D.Thiele @https://hexx.one
 */

THREE.ChromaticShader = {

    shaderID: "chromaticShader",

    uniforms: {
		tDiffuse: { value: null },
        iResolution: { value: new THREE.Vector2(1, 1) },
        strength: { value: 10.0 },
    },

    // Default vertex shader
    vertexShader: `
    precision lowp float;
    //shaderquality
    
    varying vec2 vUv;
    
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
    `,

    // Simple Chromatic Aberration Shader
    fragmentShader: `
    precision lowp float;
    //shaderquality
      
	uniform sampler2D tDiffuse;
    uniform vec2 iResolution;
    uniform float strength;
    
    varying vec2 vUv;

    vec4 ca(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
        vec4 col = vec4(0.0);
        vec2 off = vec2(1.33333333333333) * direction;
        col.ra = texture2D(image, uv).ra;
        col.g = texture2D(image, uv - (off / resolution)).g;
        col.b = texture2D(image, uv - 2. * (off / resolution)).b;
        return col;
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / iResolution;
        vec2 direction = (uv - .5) * strength;
        gl_FragColor = ca(tDiffuse, uv, iResolution.xy, direction);
    }
    `,
};
