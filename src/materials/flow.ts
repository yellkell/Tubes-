/**
 * The pour — RAVE RAID's clipped-liquid trick (the Half-Life: Alyx bottle
 * illusion, by way of SPLASH WARS), re-derived for pipework.
 *
 * The glowstick version clips a glow mesh against a LEVEL PLANE in world
 * space, so the liquid stays level however the stick tilts. A tube full of
 * moving payload wants the same illusion rotated ninety degrees: the pour
 * inside a run is one glow volume per telescoping segment, and the
 * fragment shader clips everything PAST THE FLOW FRONT — a single arc-
 * length coordinate that races from flange to socket when the latch dogs
 * close. Where the clip cuts the volume open you see its back faces,
 * painted as a flat bright "face of the pour" — the classic cheap fake,
 * now advancing down a pipe instead of resting in a glass.
 *
 * On top of that:
 *  - a hot FOAM BAND rides just behind the front, so the leading edge
 *    burns brighter than the body it leaves behind;
 *  - travelling ripples run the pour's length so a connected run visibly
 *    STREAMS rather than merely being lit;
 *  - a living PULSE breathes down the line at the line's own pace once
 *    the run settles in — MAINS rolls slow and heavy, COOLANT streams,
 *    VOLT strobes (the `chop` knob squares the wave into plasma packets);
 *  - Blinn-Phong glints and a fresnel skin keep the volume reading as a
 *    wet cylinder of light, not flat neon — the same two-lobe gloss the
 *    gel wears, tuned for a bore you look at from outside.
 *
 * Each segment's volume is a unit cylinder scaled into place, carrying its
 * own arc-length span [uS0, uS1]; every segment of a run shares the run's
 * front, time and energy through per-material uniforms fed by FlowSystem.
 * The volumes render OPAQUE (they write depth) and the frosted shell
 * blends over the top — exactly the sort order the illusion needs.
 */

import { Color, DoubleSide, ShaderMaterial, type ColorRepresentation } from 'three';

const FLOW_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vAlong; // 0..1 along this segment's own axis
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vAlong = position.y + 0.5; // unit cylinder: local y in [-0.5, 0.5]
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FLOW_FRAG = /* glsl */ `
  uniform float uS0;      // this segment's arc-length span along the run (m)
  uniform float uS1;
  uniform float uFront;   // the flow front's arc length (m); huge once landed
  uniform float uTime;
  uniform float uEnergy;  // 0 dormant → 1 fully alive (charge ramps it)
  uniform float uPulseHz; // the line's living pulse once connected
  uniform float uChop;    // 0 = liquid, 1 = plasma packets (VOLT)
  uniform vec3 uGlow;     // lit body
  uniform vec3 uDeep;     // shadowed depths
  uniform vec3 uFoam;     // front band / cut face / meniscus
  uniform float uBand;    // hot band length behind the front (m)
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vAlong;

  void main(){
    float s = mix(uS0, uS1, vAlong);
    // A wobble on the front line so the pour arrives as a surge, not a
    // laser-straight bulkhead sliding down the pipe.
    float wobble = sin(s * 9.0 - uTime * 7.0) * 0.02 + sin(s * 23.0 + uTime * 11.0) * 0.012;
    if (s + wobble > uFront) discard;

    if (!gl_FrontFacing) {
      // The open cut — the face of the advancing pour. Flat and bright,
      // shimmering with the same wobble that shapes its line.
      float shimmer = 0.9 + 0.1 * sin(uTime * 13.0 + s * 40.0);
      gl_FragColor = vec4(uFoam * shimmer, 1.0);
      return;
    }

    // The body: lit and streaming. Two travelling waves run the pour's
    // length; their sum is the "current" you can see. The weights sit
    // HOT on purpose: the glowstick gel this shader descends from was
    // tuned for optical density in a dark void, but this pour lives
    // behind a frosted shell over a daylit real room — a body weighted
    // toward its depths read as murk, and the light is the payoff.
    float stream =
      sin(s * 6.0 - uTime * 5.2) * 0.5 +
      sin(s * 13.0 - uTime * 8.6) * 0.5;
    // The living pulse: a slow breath down the whole line, with its
    // trough lifted — the line breathes, it never gutters. VOLT's chop
    // still squares it into packets with dark water between them.
    float phase = sin((uTime * uPulseHz - s * 0.55) * 6.2831853);
    float breath = 0.5 + 0.5 * phase;
    float packets = smoothstep(0.15, 0.65, breath);
    float pulse = mix(0.78 + 0.22 * breath, 0.3 + 0.85 * packets, uChop);

    float up = clamp(vWorldNormal.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uDeep, uGlow, (0.52 + 0.42 * up + 0.12 * stream) * pulse);

    // The hot band hugging the front — brightest just behind the face.
    col = mix(col, uFoam, smoothstep(uBand, 0.0, uFront - s) * 0.85);

    // Wet gloss: a broad sheen plus a hot pin, off a fixed key light.
    vec3 n = normalize(vWorldNormal);
    vec3 lightDir = normalize(vec3(0.35, 0.85, 0.4));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 h = normalize(lightDir + viewDir);
    float ndh = max(dot(n, h), 0.0);
    col += pow(ndh, 24.0) * 0.32 * uEnergy;
    col += pow(ndh, 110.0) * 0.8 * uEnergy;
    // Fresnel skin: the bore turns to bright film at grazing angles.
    col += pow(1.0 - max(dot(n, viewDir), 0.0), 4.0) * 0.24 * uGlow;

    // One honest gain over the lot — body, band, gloss and skin brighten
    // together, so the pour reads LIT through the frosted shell instead
    // of merely coloured.
    col *= 1.12;

    // Dormant hardware idles DIM — energy scales the whole volume so a
    // charging line visibly wakes before the front ever moves.
    col *= 0.18 + 0.82 * uEnergy;

    // FULLY OPAQUE: a pour with alpha shows you the far wall of the pipe.
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface FlowUniforms {
  uS0: { value: number };
  uS1: { value: number };
  uFront: { value: number };
  uTime: { value: number };
  uEnergy: { value: number };
  uPulseHz: { value: number };
  uChop: { value: number };
  uGlow: { value: Color };
  uDeep: { value: Color };
  uFoam: { value: Color };
  uBand: { value: number };
}

/** One pour material for one segment volume. Cheap enough to clone per
 *  segment — a run is eight of these sharing values via updateFlow(). */
export function createFlowMaterial(
  glow: ColorRepresentation,
  deep: ColorRepresentation,
  foam: ColorRepresentation,
  pulseHz: number,
  chop: number,
  band: number,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uS0: { value: 0 },
      uS1: { value: 1 },
      uFront: { value: -1 },
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uPulseHz: { value: pulseHz },
      uChop: { value: chop },
      uGlow: { value: new Color(glow) },
      uDeep: { value: new Color(deep) },
      uFoam: { value: new Color(foam) },
      uBand: { value: band },
    } satisfies FlowUniforms as unknown as ShaderMaterial['uniforms'],
    vertexShader: FLOW_VERT,
    fragmentShader: FLOW_FRAG,
    // Opaque, double-sided: back faces ARE the pour's advancing face.
    transparent: false,
    side: DoubleSide,
  });
}
