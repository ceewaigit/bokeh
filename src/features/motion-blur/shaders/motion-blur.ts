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

float shutterWeight(float t) {
    // Cinematic shutter: bell-shaped exposure with soft edges.
    float dist = abs(t);
    float core = smoothstep(0.5, 0.0, dist);
    return pow(core, 1.6);
}

void main() {


    // Calculate blur magnitude
    float blurMagnitude = length(u_velocity) * u_intensity;
    
    vec4 blurredColor = vec4(0.0);
    
    vec4 baseSample = texture(u_image, v_texCoord);

    // Lower threshold (0.0001 vs 0.0005) to allow more subtle blur effects
    if (blurMagnitude < 0.0001) {
        outColor = baseSample;
        return;
    }

    vec4 accumulatedColor = vec4(0.0);
    float totalWeight = 0.0;
    float samples = float(u_samples);
    
    for (int i = 0; i < u_samples; i++) {
        // Map i to range -0.5 to 0.5
        // Use deterministic stratified sampling (no random jitter) to avoid visible grain.
        float t = ((float(i) + 0.5) / samples) - 0.5;
        
        float weight = shutterWeight(t);
        
        vec2 offset = u_velocity * t * u_intensity;
        vec2 sampleCoord = v_texCoord + offset;

        // Clamp with small margin to avoid sampling undefined edge pixels
        // This prevents purple/blue artifacts at texture boundaries
        vec2 margin = 1.0 / u_resolution;
        sampleCoord = clamp(sampleCoord, margin, 1.0 - margin);

        vec4 sampleColor = texture(u_image, sampleCoord);
        accumulatedColor += sampleColor * weight;
        totalWeight += weight;
    }
    
    vec4 blurred = accumulatedColor / totalWeight;
    vec3 corrected = mix(baseSample.rgb, blurred.rgb, u_mix);

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

    outColor = vec4(corrected, baseSample.a);
}
`;
