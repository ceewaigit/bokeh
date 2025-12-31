import { MOTION_BLUR_FRAGMENT_SHADER, MOTION_BLUR_VERTEX_SHADER } from './shaders/motion-blur';

/**
 * Singleton controller for Motion Blur WebGL resources.
 * Prevents "Too many active WebGL contexts" error by sharing a single context.
 *
 * Usage:
 * MotionBlurController.instance.render(videoElement, props);
 */
export class MotionBlurController {
    private static _instance: MotionBlurController;
    private canvas: OffscreenCanvas | HTMLCanvasElement;
    private gl: WebGL2RenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private locations: Record<string, WebGLUniformLocation | number> = {};
    private buffers: { position: WebGLBuffer; texCoord: WebGLBuffer } | null = null;
    private texture: WebGLTexture | null = null;

    // Track last dimensions to minimize resizing
    private lastWidth = 0;
    private lastHeight = 0;

    private constructor() {
        // Prefer OffscreenCanvas if available (works in Workers/Headless)
        if (typeof OffscreenCanvas !== 'undefined') {
            this.canvas = new OffscreenCanvas(300, 150); // Initial size
        } else {
            // Fallback for environments without OffscreenCanvas (rare nowadays)
            this.canvas = document.createElement('canvas');
        }

        this.initWebGL();
    }

    public static get instance(): MotionBlurController {
        if (!MotionBlurController._instance) {
            MotionBlurController._instance = new MotionBlurController();
        }
        return MotionBlurController._instance;
    }

    /**
     * Re-initializes WebGL context if lost or not yet created.
     */
    private initWebGL() {
        // 1. Get Context
        const gl = this.canvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
        }) as WebGL2RenderingContext | null;

        if (!gl) {
            console.error('[MotionBlurController] WebGL2 not supported');
            return;
        }
        this.gl = gl;

        // 2. Compile Shaders
        const createShader = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('[MotionBlurController] Shader compile error:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vs = createShader(gl.VERTEX_SHADER, MOTION_BLUR_VERTEX_SHADER);
        const fs = createShader(gl.FRAGMENT_SHADER, MOTION_BLUR_FRAGMENT_SHADER);
        if (!vs || !fs) return;

        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('[MotionBlurController] Program link error:', gl.getProgramInfoLog(program));
            return;
        }
        this.program = program;

        // 3. Locations
        this.locations = {
            a_position: gl.getAttribLocation(program, 'a_position'),
            a_texCoord: gl.getAttribLocation(program, 'a_texCoord'),
            u_resolution: gl.getUniformLocation(program, 'u_resolution')!,
            u_image: gl.getUniformLocation(program, 'u_image')!,
            u_velocity: gl.getUniformLocation(program, 'u_velocity')!,
            u_intensity: gl.getUniformLocation(program, 'u_intensity')!,
            u_samples: gl.getUniformLocation(program, 'u_samples')!,
            u_debugSplit: gl.getUniformLocation(program, 'u_debugSplit')!,
            u_gamma: gl.getUniformLocation(program, 'u_gamma')!,
            u_blackLevel: gl.getUniformLocation(program, 'u_blackLevel')!,
            u_saturation: gl.getUniformLocation(program, 'u_saturation')!,
        };

        // 4. Buffers
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        // Static tex coords (Standard UVs)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
            0.0, 1.0, 1.0, 0.0, 1.0, 1.0,
        ]), gl.STATIC_DRAW);

        this.buffers = { position: positionBuffer!, texCoord: texCoordBuffer! };

        // 5. Texture
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // Standard pixel store
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        this.texture = texture;
    }

    /**
     * Renders the blurred video frame.
     * returns the internal canvas (OffscreenCanvas) which can be drawn to another context.
     */
    public render(
        source: TexImageSource,
        width: number,
        height: number,
        uniforms: {
            uvVelocityX: number;
            uvVelocityY: number;
            intensity: number;
            samples: number;
            debugSplit: boolean;
            gamma: number;
            blackLevel: number;
            saturation: number;
        }
    ): OffscreenCanvas | HTMLCanvasElement | null {
        if (!this.gl || this.gl.isContextLost()) {
            this.initWebGL(); // Try to restore
        }
        const gl = this.gl;
        if (!gl || !this.program || !this.buffers || !this.texture) return null;

        // 1. Resize if needed
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            gl.viewport(0, 0, width, height);

            // Update vertices for full quad
            const x1 = 0; const x2 = width; const y1 = 0; const y2 = height;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2,
            ]), gl.STATIC_DRAW);

            this.lastWidth = width;
            this.lastHeight = height;
        }

        // 2. Clear (Fix for artifacting)
        // Important: clears the buffer before every draw to prevent ghosting/streaking 
        // if preserving drawing buffer or invalidation issues occur.
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // 3. Upload Textures
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        // Always standard upload
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); // Match typical video settings
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

        // 4. Set Uniforms
        gl.uniform1i(this.locations.u_image as WebGLUniformLocation, 0);
        gl.uniform2f(this.locations.u_resolution as WebGLUniformLocation, width, height);

        gl.uniform2f(this.locations.u_velocity as WebGLUniformLocation, uniforms.uvVelocityX, uniforms.uvVelocityY);
        gl.uniform1f(this.locations.u_intensity as WebGLUniformLocation, uniforms.intensity);
        gl.uniform1i(this.locations.u_samples as WebGLUniformLocation, uniforms.samples);
        gl.uniform1f(this.locations.u_debugSplit as WebGLUniformLocation, uniforms.debugSplit ? 1.0 : 0.0);
        gl.uniform1f(this.locations.u_gamma as WebGLUniformLocation, uniforms.gamma);
        gl.uniform1f(this.locations.u_blackLevel as WebGLUniformLocation, uniforms.blackLevel);
        gl.uniform1f(this.locations.u_saturation as WebGLUniformLocation, uniforms.saturation);

        // 5. Draw
        // Bind attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.enableVertexAttribArray(this.locations.a_position as number);
        gl.vertexAttribPointer(this.locations.a_position as number, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
        gl.enableVertexAttribArray(this.locations.a_texCoord as number);
        gl.vertexAttribPointer(this.locations.a_texCoord as number, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Return the canvas itself so caller can drawImage(this.canvas)
        return this.canvas;
    }
}
