// Helper for syntax highlighting
const glsl = (s: TemplateStringsArray) => s[0];

export const MOTION_BLUR_VERTEX_SHADER = glsl`#version 300 es
in vec2 a_position;
in vec2 a_texCoord;

uniform vec2 u_resolution;

out vec2 v_texCoord;

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

export const MOTION_BLUR_FRAGMENT_SHADER = glsl`#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_resolution;   // Resolution in pixels
uniform vec2 u_velocity;     // Velocity in texture coordinates (0..1)
uniform float u_intensity;   // Blur intensity
uniform int u_samples;       // Number of samples

uniform float u_mix;         // Blend between original and blurred result (0..1)
uniform float u_gamma;       // Gamma correction factor
uniform float u_blackLevel;  // Manual Black Level (0.0 - 0.2)
uniform float u_saturation;  // Saturation (0.0 - 2.0)
uniform int u_linearize;     // 1 = do sRGB <-> linear conversion for blur math
uniform float u_refocusBlur; // Omnidirectional (gaussian) blur intensity (0..1)

float shutterWeight(float t) {
    // Cinematic shutter: bell-shaped exposure with soft edges.
    float dist = abs(t);
    float core = smoothstep(0.5, 0.0, dist);
    return pow(core, 1.6);
}

// sRGB transfer helpers (approximate spec)
vec3 toLinear(vec3 c) {
    vec3 lo = c / 12.92;
    vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
    return mix(lo, hi, step(vec3(0.04045), c));
}

vec3 toSrgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
}

// Gaussian weight for omnidirectional blur
float gaussianWeight(float dist, float sigma) {
    return exp(-(dist * dist) / (2.0 * sigma * sigma));
}

void main() {
    vec4 baseSample = texture(u_image, v_texCoord);
    vec3 baseRgb = baseSample.rgb;
    if (u_linearize == 1) {
        baseRgb = toLinear(baseRgb);
    }

    // Determine blur mode: refocus (omnidirectional) vs motion (directional)
    float blurMagnitude = length(u_velocity) * u_intensity;
    bool useRefocusBlur = u_refocusBlur > 0.001;

    // Early exit if no blur needed
    if (blurMagnitude < 0.0001 && !useRefocusBlur) {
        vec3 outRgb = (u_linearize == 1) ? toSrgb(baseRgb) : baseRgb;
        outRgb = clamp(outRgb, 0.0, 1.0);
        if (u_gamma != 1.0) {
            outRgb = pow(outRgb, vec3(1.0 / u_gamma));
        }
        outRgb = clamp(outRgb, 0.0, 1.0);
        outColor = vec4(outRgb, baseSample.a);
        return;
    }

    vec4 accumulatedColor = vec4(0.0);
    float totalWeight = 0.0;
    float samples = float(u_samples);
    vec2 margin = 1.0 / u_resolution;

    if (useRefocusBlur) {
        // OMNIDIRECTIONAL (REFOCUS) BLUR
        // Sample in a circular pattern for camera-like defocus effect
        float blurRadius = u_refocusBlur * 0.02; // Convert 0-1 to UV space radius
        float sigma = blurRadius * 0.5;

        // Use spiral sampling pattern for even distribution
        int ringCount = max(2, u_samples / 6);
        float samplesPerRing = samples / float(ringCount);

        // Center sample (highest weight)
        accumulatedColor += vec4(baseRgb, baseSample.a) * 1.0;
        totalWeight += 1.0;

        for (int ring = 1; ring <= ringCount; ring++) {
            float ringRadius = (float(ring) / float(ringCount)) * blurRadius;
            int samplesInRing = int(samplesPerRing * float(ring));

            for (int s = 0; s < samplesInRing; s++) {
                float angle = (float(s) / float(samplesInRing)) * 6.28318530718; // 2*PI
                vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius;

                // Aspect ratio correction
                offset.x *= u_resolution.y / u_resolution.x;

                vec2 sampleCoord = clamp(v_texCoord + offset, margin, 1.0 - margin);
                vec4 sampleColor = texture(u_image, sampleCoord);
                vec3 sampleRgb = sampleColor.rgb;
                if (u_linearize == 1) {
                    sampleRgb = toLinear(sampleRgb);
                }

                float weight = gaussianWeight(ringRadius, sigma);
                accumulatedColor += vec4(sampleRgb, sampleColor.a) * weight;
                totalWeight += weight;
            }
        }
    } else {
        // DIRECTIONAL (MOTION) BLUR
        // Original motion blur sampling along velocity vector
        for (int i = 0; i < u_samples; i++) {
            // Map i to range -0.5 to 0.5
            // Use deterministic stratified sampling (no random jitter) to avoid visible grain.
            float t = ((float(i) + 0.5) / samples) - 0.5;

            float weight = shutterWeight(t);

            vec2 offset = u_velocity * t * u_intensity;
            vec2 sampleCoord = v_texCoord + offset;

            // Clamp with small margin to avoid sampling undefined edge pixels
            // This prevents purple/blue artifacts at texture boundaries
            sampleCoord = clamp(sampleCoord, margin, 1.0 - margin);

            vec4 sampleColor = texture(u_image, sampleCoord);
            vec3 sampleRgb = sampleColor.rgb;
            if (u_linearize == 1) {
                sampleRgb = toLinear(sampleRgb);
            }
            accumulatedColor += vec4(sampleRgb, sampleColor.a) * weight;
            totalWeight += weight;
        }
    }

    vec4 blurred = accumulatedColor / totalWeight;
    vec3 corrected = mix(baseRgb, blurred.rgb, u_mix);

    if (u_blackLevel != 0.0) {
        corrected = max(vec3(0.0), corrected - u_blackLevel) / (1.0 - u_blackLevel);
    }

    // Saturation adjustment (Luma-based)
    if (u_saturation != 1.0) {
        const vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);
        float luma = dot(corrected, lumaWeights);
        corrected = mix(vec3(luma), corrected, u_saturation);
    }

    corrected = clamp(corrected, 0.0, 1.0);
    if (u_linearize == 1) {
        corrected = toSrgb(corrected);
    }
    if (u_gamma != 1.0) {
        corrected = pow(corrected, vec3(1.0 / u_gamma));
    }
    corrected = clamp(corrected, 0.0, 1.0);

    outColor = vec4(corrected, baseSample.a);
}
`;
