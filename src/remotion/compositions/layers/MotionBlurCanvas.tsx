/**
 * MotionBlurLayer.tsx
 *
 * Directional motion blur using RAW WEBGL.
 * Replaces PixiJS to ensure exact color matching and no initialization race conditions.
 *
 * Key features:
 * - Raw WebGL 2.0 context
 * - Manual texture management with UNPACK_COLORSPACE_CONVERSION_WEBGL: NONE
 * * Custom shader for directional blur with cinematic shutter weighting
 * - Optional velocity smoothing for stable motion trails
 */

import React, { useEffect, useRef, useState } from 'react';
import { useCurrentFrame } from 'remotion';
import { clamp01, smootherStep } from '@/lib/core/math';
import { useProjectStore } from '@/stores/project-store';
import { getMotionBlurConfig } from '../utils/transforms/zoom-transform';
import { MOTION_BLUR_FRAGMENT_SHADER, MOTION_BLUR_VERTEX_SHADER } from './shaders/motion-blur';

export interface MotionBlurCanvasProps {
    /** Whether motion blur feature is enabled (layout check) */
    enabled?: boolean;
    /** Velocity vector in pixels per frame */
    velocity: { x: number; y: number };

    // Removed config props - now read from store
    // maxBlurRadius, velocityThreshold, etc.

    /** Video element to use as texture source (legacy - prefer containerRef) */
    videoElement?: HTMLVideoElement | null;
    /** Container ref to search for video element */
    containerRef?: React.RefObject<HTMLElement>;

    /** Dimensions of the rendered video */
    drawWidth: number;
    drawHeight: number;
    /** Position offset */
    offsetX: number;
    offsetY: number;
}

export const MotionBlurCanvas: React.FC<MotionBlurCanvasProps> = ({
    enabled: enabledProp = true, // Default to true if not passed
    velocity,
    videoElement: propsVideoElement,
    containerRef,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
}) => {
    // DIRECT STORE SUBSCRIPTION
    const cameraSettings = useProjectStore((s) => s.currentProject?.settings.camera);

    // Derive config from store settings safely
    const config = getMotionBlurConfig(cameraSettings);

    const cs = cameraSettings;
    const blurIntensity = (cs?.motionBlurIntensity !== undefined) ? cs.motionBlurIntensity / 100 : 0.5;
    // Use config for some defaults, or direct access with fallbacks
    // Note: getMotionBlurConfig already handles maxBlurRadius and velocityThreshold
    const maxBlurRadius = config.maxBlurRadius;
    const velocityThreshold = config.velocityThreshold;

    const rampRange = cs?.motionBlurRampRange ?? 0.5;
    const clamp = cs?.motionBlurClamp ?? 60;
    const gamma = cs?.motionBlurGamma ?? 1.0;
    const blackLevel = cs?.motionBlurBlackLevel ?? 0;
    const saturation = cs?.motionBlurSaturation ?? 1.0;

    // Developer flags
    const debugSplit = cs?.motionBlurDebugSplit ?? false;
    const colorSpace = cs?.motionBlurColorSpace ?? 'display-p3';
    const unpackColorspaceConversion = 'browser-default'; // WAS: 'none' - caused brightness mismatch
    const useSRGBBuffer = false;
    const samplesProp = cs?.motionBlurSamples;
    const samples = (samplesProp ?? 0) === 0 ? undefined : samplesProp;
    const unpackPremultiplyAlpha = cs?.motionBlurUnpackPremultiply ?? false;
    const force = cs?.motionBlurForce ?? false;

    // Layout check implies enabled
    const enabled = enabledProp && config.enabled && blurIntensity > 0;

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
                console.error('[MotionBlur] Shader compile error:', gl.getShaderInfoLog(shader));
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
            console.error('[MotionBlur] Program link error:', gl.getProgramInfoLog(program));
            return;
        }
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

                // FORCE MEMORY RELEASE:
                // Browsers are lazy about garbage collecting WebGL contexts.
                // We explicitly lose the context to ensure VRAM is freed immediately.
                const loseContextExt = g.getExtension('WEBGL_lose_context');
                if (loseContextExt) {
                    loseContextExt.loseContext();
                }

                g.deleteProgram(program);
                g.deleteShader(vs);
                g.deleteShader(fs);
                g.deleteBuffer(positionBuffer);
                g.deleteBuffer(texCoordBuffer);
                g.deleteTexture(texture);
            }
        };
    }, [colorSpace, useSRGBBuffer, drawWidth, drawHeight]);

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

        // FORCE DEBUG OVERRIDE
        if (force) {
            rampFactor = 1.0;
        }

        // IoC DESIGN: Canvas overlays video, never hides it
        // If speed is minimal, skip WebGL rendering entirely (optimization)
        // Video remains visible underneath as fallback

        // MOVED CALCULATION UP FOR OPACITY LOGIC
        // VELOCITY-PROPORTIONAL CINEMATIC BLUR
        // slow movements = subtle blur, fast movements = dramatic blur
        // This creates a natural camera pan feel instead of binary on/off blur
        const maxRadius = clamp > 0 ? clamp : maxBlurRadius;

        let effectiveRadius: number;
        if (force) {
            effectiveRadius = 600 * rampFactor;
        } else {
            // Velocity-proportional scaling with natural cinematic falloff
            // We want a response that feels like a 180-degree shutter but handles low-speed noise gracefully.

            // 1. Normalize excess velocity (how much are we moving?)
            // We use a broader range to prevent early clapping.
            const velocityRange = maxRadius * 2.0;
            const velocityRatio = clamp01(excess / Math.max(1, velocityRange));

            // 2. Cinematic Response
            // Instead of a steep bell curve that kills low-speed blur, we use a gentle power curve.
            // Power of 1.2 gives a slightly "eased" linear feel (soft start) without being unresponsive.
            const cinematicCurve = Math.pow(velocityRatio, 1.1);

            // 3. Target Radius
            // Scale blur radius proportionally. 
            const targetRadius = cinematicCurve * validIntensity * maxRadius;

            // 4. Smooth limit
            effectiveRadius = Math.min(maxRadius, targetRadius) * rampFactor;
        }
        const rawSpeed = Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0);
        // OPACITY MODULATION (Fix for Blinking)
        // Instead of binary On/Off, we modulate opacity based on blur intensity.
        // This ensures a smooth transition between the DOM video (perfect) and
        // the WebGL overlay (blurred). This hides any minor color/brightness shifts.
        const opacityRamp = clamp01(effectiveRadius / 2.0); // 2px blur = full opacity

        if (canvasRef.current) {
            canvasRef.current.style.opacity = opacityRamp.toFixed(3);
        }

        const isIdle = !force && rawSpeed < 0.1 && opacityRamp < 0.01;

        if (isIdle) {
            // Skip WebGL rendering when idle to save GPU
            return (() => {
                if (handle && 'cancelVideoFrameCallback' in videoElement) (videoElement as any).cancelVideoFrameCallback(handle);
            }) as any;
        }

        gl.useProgram(programRef.current);

        // RESOLUTION SYNC: Match internal buffer to video source for max sharpness
        const targetW = videoElement.videoWidth || drawWidth;
        const targetH = videoElement.videoHeight || drawHeight;

        if (gl.canvas.width !== targetW || gl.canvas.height !== targetH) {
            gl.canvas.width = targetW;
            gl.canvas.height = targetH;
        }

        gl.viewport(0, 0, targetW, targetH);
        gl.uniform2f(locationsRef.current.u_resolution, targetW, targetH);

        // Update Vertices to fill the new canvas size
        const x1 = 0; const x2 = targetW; const y1 = 0; const y2 = targetH;
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
        // Always use browser default to match video element brightness/color handling
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
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



        // Blur amount controlled entirely by effectiveRadius in shader uniforms.
        // No opacity swapping needed.
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

        // OPTIMIZATION: Cap samples to 64. 
        // We use dithering (hash12) in shader so we don't need 128 samples.
        // 32 samples on 4K is typical, 48 is High.
        const calculatedSamples = Math.max(8, Math.min(64, Math.ceil(effectiveRadius)));
        const finalSamples = Math.min(64, samples ?? calculatedSamples); // Hard limit

        gl.uniform1i(locationsRef.current.u_samples, finalSamples);
        gl.uniform1f(locationsRef.current.u_debugSplit, debugSplit ? 1.0 : 0.0);
        gl.uniform1f(locationsRef.current.u_gamma, Number.isFinite(gamma) ? gamma : 1.0);
        // SAFETY: Clamp black level to safe range and Override bad negative values from store
        const rawBlack = Number.isFinite(blackLevel) ? blackLevel : 0;
        const safeBlackLevel = Math.max(-0.02, Math.min(0.99, rawBlack));
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
