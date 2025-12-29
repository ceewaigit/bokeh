/**
 * MotionBlurLayer.tsx
 *
 * Directional motion blur using RAW WEBGL.
 * Replaces PixiJS to ensure exact color matching and no initialization race conditions.
 *
 * Key features:
 * - Raw WebGL 2.0 context
 * - Manual texture management with UNPACK_COLORSPACE_CONVERSION_WEBGL: NONE
 * - Custom shader for directional blur with cinematic shutter weighting
 * - Optional velocity smoothing for stable motion trails
 */

import React, { useEffect, useRef, useState } from 'react';
import { useCurrentFrame } from 'remotion';
import { clamp01, smootherStep } from '@/lib/core/math';

export interface MotionBlurLayerProps {
    /** Whether motion blur feature is enabled */
    enabled: boolean;
    /** Blur intensity (0-1) - acts as Shutter Angle multiplier */
    blurIntensity: number;
    /** Velocity vector in pixels per frame */
    velocity: { x: number; y: number };
    /** Maximum blur radius in pixels */
    maxBlurRadius: number;
    /** Velocity threshold (px/frame) to trigger blur */
    velocityThreshold: number;
    /** Advanced tuning */
    gamma: number;
    rampRange: number;
    clamp: number;
    /** Video element to use as texture source (legacy - prefer containerRef) */
    videoElement?: HTMLVideoElement | null;
    /**
     * Container ref to search for video element.
     * When provided, MotionBlurLayer will query for a video element inside this container.
     * This makes motion blur independent of clip identity - it always finds the active video.
     */
    containerRef?: React.RefObject<HTMLElement>;
    /** Dimensions of the rendered video */
    drawWidth: number;
    drawHeight: number;
    /** Position offset */
    offsetX: number;
    offsetY: number;
    /** Debug Mode: Split screen */
    debugSplit?: boolean;
    /** Color Space Configuration */
    colorSpace?: 'srgb' | 'display-p3';
    /** Texture Unpack Configuration */
    unpackColorspaceConversion?: 'default' | 'none';
    /** Use SRGB8_ALPHA8 internal format + FRAMEBUFFER_SRGB (Correct Linear Workflow) */
    useSRGBBuffer?: boolean;
    /** Manual number of samples (override default calculation) */
    samples?: number;
    /** Manual Black Level (0.0 - 0.2) */
    blackLevel?: number;
    /** Saturation adjustment (0.0 - 2.0) */
    saturation?: number;
    /** Unpack Premultiply Alpha */
    unpackPremultiplyAlpha?: boolean;
    /** Force enable blur for debugging */
    force?: boolean;
}

// Shader Sources
const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
uniform vec2 u_resolution;

void main() {
    // Convert from pixel coords (0..width, 0..height) to clip space (-1..1)
    vec2 zeroToOne = a_position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;
    
    // Flip Y for WebGL
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_velocity;     // Velocity in texture coordinates (0..1)
uniform float u_intensity;   // Blur intensity
uniform int u_samples;       // Number of samples

uniform float u_debugSplit;  // 0 = normal, 1 = debug split (show only right half)
uniform float u_gamma;       // Gamma correction factor
uniform float u_blackLevel;  // Manual Black Level (0.0 - 0.2)
uniform float u_saturation;  // Saturation (0.0 - 2.0)

// Pseudo-random number generator
float hash12(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 sRGBToLinear(vec3 color) {
    return pow(color, vec3(2.2));
}

vec3 linearToSRGB(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

float shutterWeight(float t) {
    // Cinematic shutter: bell-shaped exposure with soft edges.
    float dist = abs(t);
    float core = smoothstep(0.5, 0.0, dist);
    return pow(core, 1.6);
}

void main() {
    // Debug Split Logic:
    if (u_debugSplit > 0.5 && v_texCoord.x < 0.5) {
        outColor = vec4(0.0);
        return;
    }

    vec4 color = vec4(0.0);
    float totalWeight = 0.0;
    
    float samples = float(u_samples);
    
    // Jitter for dithering (banding removal)
    float jitter = hash12(gl_FragCoord.xy);
    
    for (int i = 0; i < u_samples; i++) {
        // Map i to range -0.5 to 0.5
        float t = ((float(i) + jitter) / samples) - 0.5;
        
        float weight = shutterWeight(t);
        
        vec2 offset = u_velocity * t * u_intensity;
        vec2 sampleCoord = v_texCoord + offset;
        
        // Clamp to edge (or discard if we want hard edges, but clamp is safer)
        sampleCoord = clamp(sampleCoord, 0.0, 1.0);

        vec4 sampleColor = texture(u_image, sampleCoord);

        // Linear blending
        vec3 linearColor = sRGBToLinear(sampleColor.rgb);

        color += vec4(linearColor, sampleColor.a) * weight;
        totalWeight += weight;
    }

    vec4 baseSample = texture(u_image, v_texCoord);
    
    vec4 blurred = color / totalWeight;
    
    // Pure accumulation - no mixing with base image
    vec3 corrected = blurred.rgb;

    if (u_blackLevel != 0.0) {
        corrected = max(vec3(0.0), corrected - u_blackLevel) / (1.0 - u_blackLevel);
    }

    // Saturation adjustment (Luma-based)
    if (u_saturation != 1.0) {
        const vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);
        float luma = dot(corrected, lumaWeights);
        corrected = mix(vec3(luma), corrected, u_saturation);
    }

    if (u_gamma != 1.0) {
        corrected = pow(corrected, vec3(1.0 / u_gamma));
    }
    corrected = clamp(corrected, 0.0, 1.0);

    vec4 finalColor = vec4(corrected, baseSample.a);

    // Linear -> sRGB
    finalColor.rgb = linearToSRGB(finalColor.rgb);

    outColor = finalColor;
}
`;

export const MotionBlurLayer: React.FC<MotionBlurLayerProps> = ({
    enabled,
    blurIntensity,
    velocity,
    maxBlurRadius,
    velocityThreshold,
    rampRange,
    clamp,
    videoElement: propsVideoElement,
    containerRef,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
    debugSplit = false,
    gamma = 1.0,
    colorSpace = 'display-p3',
    unpackColorspaceConversion = 'none',
    useSRGBBuffer = false,
    samples,
    blackLevel = 0,
    saturation = 1.0,
    unpackPremultiplyAlpha = false,
    force = false,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const glRef = useRef<WebGL2RenderingContext | null>(null);
    const textureRef = useRef<WebGLTexture | null>(null);
    // Programs & Locations
    const programRef = useRef<WebGLProgram | null>(null);
    const locationsRef = useRef<any>({});
    const buffersRef = useRef<any>({});
    const lastTextureSizeRef = useRef({ w: 0, h: 0 });

    // Force re-render on video events
    const [tick, setTick] = useState(0);
    const frame = useCurrentFrame();

    // Discover video element from container (clip-agnostic)
    const [discoveredVideoElement, setDiscoveredVideoElement] = useState<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (!containerRef?.current) {
            setDiscoveredVideoElement(null);
            return;
        }

        // Find the video element in the container
        const findVideo = () => {
            const video = containerRef.current?.querySelector('video');
            if (video !== discoveredVideoElement) {
                setDiscoveredVideoElement(video || null);
            }
        };

        findVideo();

        // Observe for video element changes (clips switching)
        const observer = new MutationObserver(findVideo);
        observer.observe(containerRef.current, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [containerRef, discoveredVideoElement]);

    // Use discovered video element if containerRef is provided, otherwise use prop
    // NOTE: This automatic discovery is CRITICAL for the "Motion Blur" feature.
    // By finding the <video> tag inside the current clip's container, we ensure:
    // 1. Clips can switch freely without breaking the blur reference.
    // 2. We automatically use the CORRECT video source (Proxy or High-Res) chosen by VideoClipRenderer.
    //    - In Preview: Uses Proxy (fast)
    //    - In Export: Uses Source/High-Res (quality)
    // This gives us "WYSIWYG" preview performance and perfect export quality without extra logic here.
    const videoElement = containerRef ? discoveredVideoElement : propsVideoElement;

    // 1. Initialization
    useEffect(() => {
        if (!canvasRef.current) return;

        const gl = canvasRef.current.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
            drawingBufferColorSpace: colorSpace,
        }) as WebGL2RenderingContext | null;

        if (!gl) return;
        glRef.current = gl;

        // Compile Shader
        const createShader = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vs = createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        if (!vs || !fs) return;
        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
        programRef.current = program;

        // Locations
        locationsRef.current = {
            a_position: gl.getAttribLocation(program, 'a_position'),
            a_texCoord: gl.getAttribLocation(program, 'a_texCoord'),
            u_resolution: gl.getUniformLocation(program, 'u_resolution'),
            u_image: gl.getUniformLocation(program, 'u_image'),
            u_velocity: gl.getUniformLocation(program, 'u_velocity'),
            u_intensity: gl.getUniformLocation(program, 'u_intensity'),
            u_samples: gl.getUniformLocation(program, 'u_samples'),
            u_debugSplit: gl.getUniformLocation(program, 'u_debugSplit'),
            u_gamma: gl.getUniformLocation(program, 'u_gamma'),
            u_blackLevel: gl.getUniformLocation(program, 'u_blackLevel'),
            u_saturation: gl.getUniformLocation(program, 'u_saturation'),
        };

        // Buffers
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
            0.0, 1.0, 1.0, 0.0, 1.0, 1.0,
        ]), gl.STATIC_DRAW);

        buffersRef.current = { position: positionBuffer, texCoord: texCoordBuffer };

        // Texture
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // SRGB8 Setup: storage must be allocated once
        if (useSRGBBuffer) {
            // Allocate immutable storage for SRGB8_ALPHA8
            // We need width/height. If they change, we need to re-allocate (re-run effect).
            // For now, assuming drawWidth/drawHeight are stable or effect re-runs.
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.SRGB8_ALPHA8, drawWidth, drawHeight);
        }

        textureRef.current = texture;

        return () => {
            // Cleanup
            if (glRef.current) {
                const g = glRef.current;
                g.deleteProgram(program);
                g.deleteShader(vs);
                g.deleteShader(fs);
                g.deleteBuffer(positionBuffer);
                g.deleteBuffer(texCoordBuffer);
                g.deleteTexture(texture);
            }
        };
    }, [colorSpace, useSRGBBuffer]);

    // 2. Render Loop
    React.useLayoutEffect(() => {
        const gl = glRef.current;
        if (!gl || !programRef.current || !videoElement) return;
        if (videoElement.readyState < 2) return;

        let handle: number;
        if ('requestVideoFrameCallback' in videoElement) {
            handle = (videoElement as any).requestVideoFrameCallback(() => setTick(t => t + 1));
        }

        // DETERMINISTIC: Use passed-in velocity directly (already smoothed by controller)
        // This ensures export/multi-thread consistency.
        // Sanitize to prevent NaN
        const smoothVx = Number.isFinite(velocity.x) ? velocity.x : 0;
        const smoothVy = Number.isFinite(velocity.y) ? velocity.y : 0;

        const speed = Math.sqrt(smoothVx * smoothVx + smoothVy * smoothVy);
        // Sanitize threshold and ramp to prevent NaN
        const validThreshold = Number.isFinite(velocityThreshold) ? velocityThreshold : 1;
        const validRamp = Number.isFinite(rampRange) ? rampRange : 0.5;
        const excess = Math.max(0, speed - validThreshold);
        const softKneeRange = Math.max(1, validThreshold * validRamp);
        let rampFactor = smootherStep(clamp01(excess / softKneeRange));

        // Sanitize intensity
        const validIntensity = Number.isFinite(blurIntensity) ? blurIntensity : 0;
        let shouldRender = (rampFactor > 0.01 && validIntensity > 0.05) || debugSplit;

        // FORCE DEBUG OVERRIDE
        if (force) {
            shouldRender = true;
            rampFactor = 1.0;
        }

        if (!shouldRender) {
            gl.clear(gl.COLOR_BUFFER_BIT);
            if (videoElement.style.opacity !== '1') videoElement.style.opacity = '1';
            if (canvasRef.current) canvasRef.current.style.opacity = '0';
            return;
        }

        gl.useProgram(programRef.current);
        gl.viewport(0, 0, drawWidth, drawHeight);
        gl.uniform2f(locationsRef.current.u_resolution, drawWidth, drawHeight);

        // Update Vertecies
        const x1 = 0; const x2 = drawWidth; const y1 = 0; const y2 = drawHeight;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.position);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2,
        ]), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(locationsRef.current.a_position);
        gl.vertexAttribPointer(locationsRef.current.a_position, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffersRef.current.texCoord);
        gl.enableVertexAttribArray(locationsRef.current.a_texCoord);
        gl.vertexAttribPointer(locationsRef.current.a_texCoord, 2, gl.FLOAT, false, 0, 0);

        // TEXTURE UPDATE
        if (unpackColorspaceConversion === 'none') {
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        } else {
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
        }
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, unpackPremultiplyAlpha);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);

        const videoWidth = videoElement.videoWidth;
        const videoHeight = videoElement.videoHeight;

        if (useSRGBBuffer) {
            // Linear Workflow: Upload via SubImage into SRGB8 storage
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, drawWidth, drawHeight, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
        } else {
            // Standard Workflow with SMART UPDATES (Memory Optimization)
            // Only re-allocate storage if dimensions change. Otherwise use fast sub-update.
            if (lastTextureSizeRef.current.w === videoWidth && lastTextureSizeRef.current.h === videoHeight) {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
                lastTextureSizeRef.current = { w: videoWidth, h: videoHeight };
            }
        }

        gl.uniform1i(locationsRef.current.u_image, 0);

        const targetRadius = (force ? 600 : speed) * (force ? 1.0 : validIntensity);
        const maxRadius = clamp > 0 ? clamp : maxBlurRadius;
        const effectiveRadius = Math.min(maxRadius, targetRadius) * rampFactor;

        if (canvasRef.current && canvasRef.current.style.opacity !== '1') {
            canvasRef.current.style.opacity = '1';
        }
        if (debugSplit) {
            if (videoElement.style.opacity !== '1') videoElement.style.opacity = '1';
        } else {
            if (videoElement.style.opacity !== '0') videoElement.style.opacity = '0';
        }
        let dirX = 0; let dirY = 0;
        if (force) {
            dirX = 1.0; dirY = 0.5; // Fixed diagonal blur
        } else if (speed > 0.01) {
            dirX = smoothVx / speed; dirY = smoothVy / speed;
        }
        const uvVelocityX = (dirX * effectiveRadius) / drawWidth;
        const uvVelocityY = (dirY * effectiveRadius) / drawHeight;

        gl.uniform2f(locationsRef.current.u_velocity, Number.isFinite(uvVelocityX) ? uvVelocityX : 0, Number.isFinite(uvVelocityY) ? uvVelocityY : 0);
        gl.uniform1f(locationsRef.current.u_intensity, 1.0);
        const sampleCount = Math.max(8, Math.min(128, Math.ceil(effectiveRadius)));
        gl.uniform1i(locationsRef.current.u_samples, samples ?? sampleCount);
        gl.uniform1f(locationsRef.current.u_debugSplit, debugSplit ? 1.0 : 0.0);
        gl.uniform1f(locationsRef.current.u_gamma, Number.isFinite(gamma) ? gamma : 1.0);
        // SAFETY: Clamp black level < 0.99 to prevent divide-by-zero in shader
        const safeBlackLevel = Math.min(0.99, Number.isFinite(blackLevel) ? blackLevel : -0.13);
        gl.uniform1f(locationsRef.current.u_blackLevel, safeBlackLevel);
        const safeSaturation = Number.isFinite(saturation) ? saturation : 1.0;
        gl.uniform1f(locationsRef.current.u_saturation, safeSaturation);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        return () => {
            if (handle && 'cancelVideoFrameCallback' in videoElement) (videoElement as any).cancelVideoFrameCallback(handle);
        };
    }, [frame, velocity, blurIntensity, debugSplit, drawWidth, drawHeight, videoElement, rampRange, velocityThreshold, clamp, maxBlurRadius, tick, gamma, unpackColorspaceConversion, useSRGBBuffer, samples, blackLevel, saturation, unpackPremultiplyAlpha, force]);

    if (!enabled) return null;

    return (
        <canvas
            ref={canvasRef}
            width={drawWidth}
            height={drawHeight}
            style={{
                position: 'absolute',
                left: offsetX,
                top: offsetY,
                width: drawWidth,
                height: drawHeight,
                pointerEvents: 'none',
                zIndex: 10,
                // If debugging, we might want to ensure it's visible. 
                // The useEffect handles opacity updates.
                opacity: 0,
            }}
        />
    );
};
