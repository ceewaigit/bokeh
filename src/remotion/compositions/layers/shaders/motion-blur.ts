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

    // Calculate blur magnitude - if near zero, passthrough directly
    float blurMagnitude = length(u_velocity) * u_intensity;
    
    // RAW PASSTHROUGH: When blur is minimal, skip ALL processing
    // Threshold lowered to 0.0005 to ensure even subtle motion blur is rendered
    if (blurMagnitude < 0.0005) {
        outColor = texture(u_image, v_texCoord);
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
