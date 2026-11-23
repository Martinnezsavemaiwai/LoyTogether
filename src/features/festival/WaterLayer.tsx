import { useEffect, useRef } from 'react';

/**
 * Moving water over the bottom half of a venue backdrop, in a single WebGL fragment
 * shader (no Three.js). It re-draws the backdrop's own water with a rippled lookup, so
 * the reflections of the landmarks and lamps wobble and stretch the way they do on a
 * real river at night, and adds small moving glints where the light hits the ripples.
 *
 * The canvas is laid over the SVG scene with the same `slice` crop, so the shader
 * repeats that crop maths. If WebGL is missing, nothing is drawn and the still
 * backdrop shows through.
 */

const SCENE_W = 1440;
const SCENE_H = 900;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uGlow;
uniform float uMoonX;
uniform float uAlpha;
// Optional mask rendered by Blender: white where the water is visible (SUT's pool).
uniform sampler2D uMask;
uniform float uHasMask;

float hash(vec2 p) {
  p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
  return fract(p.x * p.y * (p.x + p.y));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Water height on the river plane. Three drifting noise layers plus a slow swell,
// all carried to the right by the current.
float height(vec2 q, float t) {
  q.x -= t * 0.06;
  float h = 0.5 * noise(q * 1.0 + t * vec2(0.10, 0.04));
  h += 0.3 * noise(q * 2.3 - t * vec2(0.06, 0.13));
  h += 0.2 * noise(q * 4.7 + t * vec2(0.17, -0.07));
  h += 0.12 * sin(q.y * 2.6 + q.x * 0.5 - t * 0.8);
  return h;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float scale = max(uRes.x / ${SCENE_W.toFixed(1)}, uRes.y / ${SCENE_H.toFixed(1)});
  vec2 offset = (uRes - vec2(${SCENE_W.toFixed(1)}, ${SCENE_H.toFixed(1)}) * scale) * 0.5;
  vec2 uv = (frag - offset) / scale / vec2(${SCENE_W.toFixed(1)}, ${SCENE_H.toFixed(1)});

  if (uv.y < 0.5) discard;

  // 0 at the horizon, 1 at the bottom of the frame. Perspective: far water is
  // compressed, so the same ripple covers fewer pixels near the horizon.
  float d = (uv.y - 0.5) * 2.0;
  if (uHasMask > 0.5 && texture2D(uMask, uv).r < 0.5) discard;
  float z = 1.0 / max(d, 0.035);
  vec2 q = vec2((uv.x - 0.5) * 1.6 * z, z * 1.8) * 2.2;

  float e = 0.04;
  float h0 = height(q, uTime);
  float hx = height(q + vec2(e, 0.0), uTime);
  float hz = height(q + vec2(0.0, e), uTime);
  vec2 slope = vec2(hx - h0, hz - h0) / e;

  // Far ripples fade out instead of turning into noise.
  float near = smoothstep(0.0, 0.35, d);
  // No ripple right at the horizon, so the bank line stays straight.
  float atBank = smoothstep(0.0, 0.1, d);
  vec2 shift = vec2(slope.x * 0.008, slope.y * 0.02) * (0.15 + 0.85 * near) * atBank;

  vec2 s = uv + shift;
  s.y = max(s.y, uv.y);
  vec3 col = texture2D(uTex, s).rgb;

  // Glints: where a ripple faces the viewer and there is light to reflect.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float ridge = smoothstep(0.55, 1.0, h0 + 0.35 * slope.y * 0.1);
  float moonCol = exp(-pow((uv.x - uMoonX) / (0.03 + 0.09 * d), 2.0));
  float glint = ridge * (smoothstep(0.08, 0.5, lum) * 0.9 + moonCol * 0.6) * (0.3 + 0.7 * near);
  col += glint * mix(uGlow, vec3(1.0, 0.96, 0.86), moonCol) * 0.5;

  // A thin, slightly lighter band right at the horizon, where water meets the bank.
  col += uGlow * 0.04 * (1.0 - smoothstep(0.0, 0.05, d));

  gl_FragColor = vec4(col, uAlpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function WaterLayer({
  src,
  glow,
  moonX,
  quality,
  maskSrc,
  className,
}: {
  src: string;
  glow: string;
  /** Moon x in scene pixels (0-1440), for the moonlight path on the water. */
  moonX: number;
  quality: 'full' | 'lite';
  /** When only part of the lower half is water: a white-on-black image of where it is (blender/venues.py --mask). */
  maskSrc?: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // A fresh canvas per effect run, so cleanup can release its WebGL context without
    // React StrictMode's second run picking up a context that was already lost.
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(canvas);
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    });
    if (!gl) {
      canvas.remove();
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      canvas.remove();
      return;
    }
    const program = gl.createProgram();
    if (!program) {
      canvas.remove();
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      canvas.remove();
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'uRes');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uAlpha = gl.getUniformLocation(program, 'uAlpha');
    gl.uniform3fv(gl.getUniformLocation(program, 'uGlow'), hexToRgb(glow));
    gl.uniform1f(gl.getUniformLocation(program, 'uMoonX'), moonX / SCENE_W);
    gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'uHasMask'), maskSrc ? 1 : 0);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pixelScale =
      Math.min(window.devicePixelRatio || 1, 1.5) * (quality === 'lite' ? 0.5 : 0.75);
    const frameGap = quality === 'lite' ? 1000 / 30 : 0;

    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * pixelScale));
      const h = Math.max(1, Math.round(canvas.clientHeight * pixelScale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let ready = false;
    let alpha = 0;
    let raf = 0;
    let last = 0;
    let stopped = false;
    const start = performance.now();

    const draw = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(draw);
      if (!ready || document.hidden) return;
      if (frameGap && now - last < frameGap) return;
      last = now;
      alpha = Math.min(1, alpha + 0.04);
      gl.uniform1f(uTime, reduceMotion ? 0 : (now - start) / 1000);
      gl.uniform1f(uAlpha, alpha);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (reduceMotion && alpha >= 1) {
        stopped = true;
        cancelAnimationFrame(raf);
      }
    };

    // The backdrop goes in texture unit 0 and the optional water mask in unit 1.
    // Drawing starts once every texture this venue needs has loaded.
    let pending = maskSrc ? 2 : 1;
    const loadTexture = (url: string, unit: number) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (stopped) return;
        const tex = gl.createTexture();
        gl.activeTexture(unit === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        pending -= 1;
        ready = pending === 0;
      };
      img.src = url;
    };
    loadTexture(src, 0);
    if (maskSrc) loadTexture(maskSrc, 1);
    raf = requestAnimationFrame(draw);

    const onLost = (e: Event) => {
      e.preventDefault();
      stopped = true;
      cancelAnimationFrame(raf);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
  }, [src, glow, moonX, quality, maskSrc]);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
