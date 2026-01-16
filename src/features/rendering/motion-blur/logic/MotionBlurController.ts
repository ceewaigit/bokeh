import { MOTION_BLUR_FRAGMENT_SHADER, MOTION_BLUR_VERTEX_SHADER } from '../shaders/motion-blur';

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
     * Pre-warm the WebGL context during project loading.
     * Call this before the workspace appears to avoid lag on first frame render.
     *
     * IMPORTANT: This now renders a tiny test frame to force shader compilation.
     * Without this, shaders are compiled lazily on first actual render, causing lag.
     */
    public static warmUp(): void {
        // Force singleton instantiation which triggers initWebGL() in constructor
        const instance = MotionBlurController.instance;
        if (instance.gl && !instance.gl.isContextLost()) {
            // Force shader compilation by rendering a tiny test frame
            // This compiles vertex + fragment shaders, links the program,
            // binds textures, and executes the first draw call - all the
            // expensive GPU operations that would otherwise cause first-frame lag.
            try {
                const dummyCanvas = new OffscreenCanvas(1, 1);
                const ctx = dummyCanvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, 1, 1);
                }

                // Call render with minimal data to compile shaders
                instance.render(dummyCanvas, 1, 1, {
                    uvVelocityX: 0,
                    uvVelocityY: 0,
                    intensity: 0,
                    samples: 1,
                    mix: 0,
                    gamma: 1,
                    blackLevel: 0,
                    saturation: 1,
                    colorSpace: 'srgb',
                    unpackPremultiplyAlpha: false,
                    linearize: false,
                    pixelRatio: 1,
                    refocusBlur: 0,
                });
            } catch {
                // Ignore warmup errors - first render will still work
            }

            // Flush the GPU pipeline to ensure shader compilation is complete
            instance.gl.flush();
        }
    }

    /**
     * Re-initializes WebGL context if lost or not yet created.
     */
    private initWebGL() {
        // 1. Get Context
        const gl = this.canvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: false,
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
            u_mix: gl.getUniformLocation(program, 'u_mix')!,
            u_gamma: gl.getUniformLocation(program, 'u_gamma')!,
            u_blackLevel: gl.getUniformLocation(program, 'u_blackLevel')!,
            u_saturation: gl.getUniformLocation(program, 'u_saturation')!,
            u_linearize: gl.getUniformLocation(program, 'u_linearize')!,
            u_refocusBlur: gl.getUniformLocation(program, 'u_refocusBlur')!,
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
        // Disable implicit color conversion to preserve exact sRGB source values.
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
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
            mix: number;
            gamma: number;
            blackLevel: number;
            saturation: number;
            colorSpace?: PredefinedColorSpace;
            unpackPremultiplyAlpha?: boolean;
            pixelRatio?: number;
            linearize?: boolean;
            refocusBlur?: number;
        }
    ): OffscreenCanvas | HTMLCanvasElement | null {
        if (!this.gl || this.gl.isContextLost()) {
            this.initWebGL(); // Try to restore
        }
        const gl = this.gl;
        if (!gl || !this.program || !this.buffers || !this.texture) return null;

        // 1. Resize if needed
        // Allow downscaling in preview to prevent GPU memory blowups when the underlying video
        // is decoded at high resolution (e.g. during zoom-follow-mouse).
        const rawPixelRatio = uniforms.pixelRatio ?? 1;
        const pixelRatio = Number.isFinite(rawPixelRatio) ? Math.max(0.25, rawPixelRatio) : 1;
        const widthPx = Math.max(1, Math.round(width * pixelRatio));
        const heightPx = Math.max(1, Math.round(height * pixelRatio));
        if (this.canvas.width !== widthPx || this.canvas.height !== heightPx) {
            this.canvas.width = widthPx;
            this.canvas.height = heightPx;
            gl.viewport(0, 0, widthPx, heightPx);

            // Update vertices for full quad
            const x1 = 0; const x2 = widthPx; const y1 = 0; const y2 = heightPx;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2,
            ]), gl.STATIC_DRAW);

            this.lastWidth = widthPx;
            this.lastHeight = heightPx;
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

        // Set drawing buffer color space to match the output canvas
        // This ensures the WebGL output is interpreted correctly when composited
        if (uniforms.colorSpace) {
            try {
                gl.drawingBufferColorSpace = uniforms.colorSpace;
            } catch {
                // Fall back if not supported
            }
        }

        // Disable implicit color conversion on texture upload - preserve raw sRGB bytes
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, uniforms.unpackPremultiplyAlpha ? 1 : 0);
        // Use RGBA8 with raw bytes - shader handles any color conversions explicitly
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);

        // 4. Set Uniforms
        gl.uniform1i(this.locations.u_image as WebGLUniformLocation, 0);
        gl.uniform2f(this.locations.u_resolution as WebGLUniformLocation, widthPx, heightPx);

        gl.uniform2f(this.locations.u_velocity as WebGLUniformLocation, uniforms.uvVelocityX, uniforms.uvVelocityY);
        gl.uniform1f(this.locations.u_intensity as WebGLUniformLocation, uniforms.intensity);
        gl.uniform1i(this.locations.u_samples as WebGLUniformLocation, uniforms.samples);
        gl.uniform1f(this.locations.u_mix as WebGLUniformLocation, uniforms.mix);
        gl.uniform1f(this.locations.u_gamma as WebGLUniformLocation, uniforms.gamma);
        gl.uniform1f(this.locations.u_blackLevel as WebGLUniformLocation, uniforms.blackLevel);
        gl.uniform1f(this.locations.u_saturation as WebGLUniformLocation, uniforms.saturation);
        gl.uniform1i(this.locations.u_linearize as WebGLUniformLocation, uniforms.linearize ? 1 : 0);
        gl.uniform1f(this.locations.u_refocusBlur as WebGLUniformLocation, uniforms.refocusBlur ?? 0);

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
