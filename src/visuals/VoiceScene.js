import { damp, EMPTY_SIGNAL } from '../audio/signal.js';

/**
 * True 3D holographic voice sculpture. The original React/Realtime interface is unchanged.
 * Uses only built-in WebGL2 (no Three.js or package installation required).
 * Geometry is in XYZ world space and is transformed by a moving perspective camera.
 */
const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec4 aData;
uniform mat4 uProjection;
uniform mat4 uView;
uniform float uTime;
uniform float uLevel;
uniform float uLow;
uniform float uMid;
uniform float uHigh;
uniform float uMode;
uniform float uPointPass;
uniform float uPixelRatio;
out vec3 vColor;
out float vOpacity;

float noise(float n) { return fract(sin(n * 37.17) * 43758.5453123); }

void main() {
  vec3 world = vec3(0.0);
  float strength = 1.0;
  float pointSize = 3.0;

  if (uMode < 0.5) {
    // Depth-separated vertical streams: aData = (baseX, progress, baseZ, seed).
    float x = aData.x;
    float p = aData.y;
    float z = aData.z;
    float seed = aData.w;
    float shoulder = exp(-pow(abs(x) / 1.62, 1.7));
    float spire = exp(-pow(abs(x) / 0.51, 1.65));
    float crossDepth = 0.78 + 0.22 * exp(-pow(abs(z) / 1.25, 2.0));
    float energy = 0.86 + 1.0 * uLevel + 0.42 * uMid + 0.21 * uLow;
    float height = (0.18 + 0.95 * shoulder + 2.55 * spire) * energy;
    height *= crossDepth * (0.76 + noise(seed * 7.17) * 0.48);
    height = min(4.85, height);
    float turbulence = (0.018 + uHigh * 0.17 + uLevel * 0.1) * p;
    world.x = x + turbulence * sin(8.0 * p + seed * 6.1 + uTime * 2.1)
                + p * p * 0.05 * sin(seed * 2.0 - uTime * 0.6);
    world.y = -1.4 + height * pow(p, 0.79);
    world.z = z + turbulence * sin(11.0 * p + seed * 5.3 - uTime * 1.35);
    strength = (0.16 + 0.39 * shoulder + 0.31 * spire) * (0.65 + 0.45 * (1.0 - p));
    vColor = mix(vec3(0.13, 0.52, 1.0), vec3(0.70, 0.91, 1.0), spire * 0.8 + noise(seed) * 0.2);
    pointSize = 3.1 + spire * 2.1;
  } else if (uMode < 1.5) {
    // A rippling horizontal sheet with real XZ depth.
    float x = aData.x;
    float z = aData.z;
    float distance = length(vec2(x * 0.66, z * 0.8));
    float envelope = exp(-distance * 0.48);
    float ripple = sin(distance * 7.0 - uTime * 2.1 + z * 0.65);
    float cross = sin(x * 3.4 + uTime * 1.6 - z * 2.2);
    world = vec3(x,
      -1.43 + (0.025 + uLevel * 0.27 + uLow * 0.07) * envelope * ripple
             + envelope * cross * (0.025 + uMid * 0.1),
      z);
    strength = (0.13 + envelope * 0.48) * (0.65 + uLevel * 0.7);
    vColor = vec3(0.20, 0.64, 1.0);
    pointSize = 2.0;
  } else if (uMode < 2.5) {
    // Sparks float up through volume instead of a flat 2D animation.
    float seed = aData.w;
    float t = fract(aData.y + uTime * (0.085 + noise(seed * 3.7) * 0.08));
    float spread = 1.1 - t * 0.42;
    world.x = aData.x * spread + 0.17 * sin(t * 10.0 + seed * 4.1 + uTime);
    world.y = -1.38 + t * (2.35 + 2.0 * uLevel + 0.6 * uMid);
    world.z = aData.z * spread + 0.10 * cos(t * 8.0 + seed * 8.1);
    float fade = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.65, 1.0, t));
    strength = fade * (0.19 + uLevel * 0.60);
    vColor = vec3(0.42, 0.78, 1.0);
    pointSize = (2.2 + noise(seed * 1.7) * 4.2) * (0.7 + uLevel);
  } else {
    // Expanding floor rings viewed at a low angle; circular in actual 3D space.
    float ring = aData.w;
    float radius = 0.32 + ring * 0.47;
    float scale = 1.0 + sin(uTime * 0.7 + ring * 0.9) * 0.025 + uLow * 0.07;
    world = vec3(aData.x * scale, -1.47 + sin(uTime * 1.3 + ring) * 0.007, aData.z * scale);
    strength = (0.22 + 0.24 * exp(-radius * 0.29)) * (0.75 + uLevel * 0.7);
    vColor = vec3(0.19, 0.58, 0.98);
    pointSize = 2.0;
  }

  vec4 cameraPosition = uView * vec4(world, 1.0);
  gl_Position = uProjection * cameraPosition;
  gl_PointSize = clamp(pointSize * uPixelRatio * (8.0 / max(3.0, -cameraPosition.z)), 1.0, 12.0);
  vOpacity = strength * (uPointPass > 0.5 && uMode < 0.5 ? 0.22 : 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vColor;
in float vOpacity;
uniform float uPointPass;
out vec4 fragColor;
void main() {
  float alpha = vOpacity;
  if (uPointPass > 0.5) {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float radius2 = dot(point, point);
    if (radius2 > 1.0) discard;
    alpha *= pow(1.0 - radius2, 1.35);
  }
  fragColor = vec4(vColor, alpha);
}
`;

function pushSegment(target, x1, y1, z1, seed1, x2, y2, z2, seed2) {
  target.push(x1, y1, z1, seed1, x2, y2, z2, seed2);
}

/** Static, reproducible volume geometry; the GPU applies speech-driven displacement. */
export function createVolumeGeometry() {
  const plume = [];
  const floor = [];
  const rings = [];
  const particles = [];

  // 160 real 3D filaments, each following a stepped path in height and depth.
  const strands = 160;
  const heightSteps = 31;
  for (let j = 0; j < strands; j++) {
    const seed = j + 1;
    const phase = (j * 0.61803398875) % 1;
    const radial = Math.sqrt((j + 0.5) / strands);
    const angle = phase * Math.PI * 2;
    const x = Math.cos(angle) * radial * 3.28;
    const z = Math.sin(angle) * radial * 1.48;
    for (let i = 0; i < heightSteps; i++) {
      const a = i / heightSteps;
      const b = (i + 1) / heightSteps;
      pushSegment(plume, x, a, z, seed, x, b, z, seed);
    }
  }
  // Extra narrowly clustered central shafts make the hologram read as a volume.
  for (let j = 0; j < 44; j++) {
    const phase = j * 2.399963;
    const radius = 0.05 + Math.sqrt((j + 1) / 44) * 0.49;
    const x = Math.cos(phase) * radius;
    const z = Math.sin(phase) * radius * 2.0;
    const seed = 180 + j;
    for (let i = 0; i < heightSteps; i++) {
      pushSegment(plume, x, i / heightSteps, z, seed, x, (i + 1) / heightSteps, z, seed);
    }
  }

  // Floor curves run laterally through distinct Z positions.
  const floorRows = 34;
  const floorSteps = 85;
  for (let row = 0; row < floorRows; row++) {
    const z = -2.65 + 5.3 * row / (floorRows - 1);
    for (let i = 0; i < floorSteps; i++) {
      const x1 = -4.65 + (9.3 * i / floorSteps);
      const x2 = -4.65 + (9.3 * (i + 1) / floorSteps);
      pushSegment(floor, x1, 0, z, row, x2, 0, z, row);
    }
  }

  for (let ring = 0; ring < 8; ring++) {
    const radius = 0.32 + ring * 0.47;
    const ringSteps = 100;
    for (let i = 0; i < ringSteps; i++) {
      const a = Math.PI * 2 * i / ringSteps;
      const b = Math.PI * 2 * (i + 1) / ringSteps;
      pushSegment(rings,
        Math.cos(a) * radius, 0, Math.sin(a) * radius, ring,
        Math.cos(b) * radius, 0, Math.sin(b) * radius, ring);
    }
  }

  for (let i = 0; i < 760; i++) {
    const theta = i * 2.399963;
    const radius = Math.sqrt((i + 0.5) / 760);
    particles.push(
      Math.cos(theta) * radius * 1.75,
      (i * 0.627914) % 1,
      Math.sin(theta) * radius * 1.5,
      i + 1
    );
  }

  return {
    plume: new Float32Array(plume),
    floor: new Float32Array(floor),
    rings: new Float32Array(rings),
    particles: new Float32Array(particles)
  };
}

function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = 2 * far * near / (near - far);
  return out;
}

function lookAt(eye, target) {
  const normalize = v => {
    const length = Math.hypot(...v) || 1;
    return v.map(x => x / length);
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = normalize(eye.map((n, i) => n - target[i]));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to allocate WebGL shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`3D shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to allocate WebGL program.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`3D shader linking failed: ${message}`);
  }
  return program;
}

export class VoiceScene {
  constructor(canvas, readFrame) {
    this.canvas = canvas;
    this.readFrame = readFrame;
    this.gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: true,
      powerPreference: 'high-performance'
    });
    if (!this.gl) throw new Error('WebGL2 is required for the 3D display. Enable hardware acceleration in your browser.');

    this.level = 0;
    this.low = 0;
    this.mid = 0;
    this.high = 0;
    this.time = 0;
    this.last = 0;
    this.running = true;
    this.contextLost = false;
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.geometryData = createVolumeGeometry();
    this.onLost = event => { event.preventDefault(); this.contextLost = true; };
    this.onRestored = () => { this.contextLost = false; this.initializeWebGL(); this.resize(); };
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.initializeWebGL();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(time => this.draw(time));
  }

  initializeWebGL() {
    const gl = this.gl;
    this.program = createProgram(gl);
    gl.useProgram(this.program);
    this.uniforms = Object.fromEntries(
      ['uProjection', 'uView', 'uTime', 'uLevel', 'uLow', 'uMid', 'uHigh', 'uMode', 'uPointPass', 'uPixelRatio']
        .map(name => [name, gl.getUniformLocation(this.program, name)])
    );
    const position = gl.getAttribLocation(this.program, 'aData');
    this.buffers = {};
    for (const [name, data] of Object.entries(this.geometryData)) {
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      if (!vao || !buffer) throw new Error('Could not allocate 3D geometry buffers.');
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 4, gl.FLOAT, false, 16, 0);
      this.buffers[name] = { vao, buffer, count: data.length / 4 };
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.clearColor(0, 0, 0, 1);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const width = Math.round(this.width * this.dpr);
    const height = Math.round(this.height * this.dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (!this.contextLost) this.gl.viewport(0, 0, width, height);
    this.projection = perspective(Math.PI * 0.22, this.width / this.height, 0.1, 70);
  }

  updateSignal(frame, dt) {
    const reduceMotion = this.motion.matches;
    if (!reduceMotion) this.time += dt;
    let output = frame.output || EMPTY_SIGNAL;
    if (frame.preview) {
      const pulse = Math.pow(Math.max(0, Math.sin(this.time * 1.9)), 2);
      const second = Math.pow(Math.max(0, Math.sin(this.time * 2.35 + 0.8)), 2);
      output = { level: pulse * 0.75, low: pulse * 0.6, mid: second * 0.75, high: second * 0.55 };
    }
    const m = reduceMotion ? 0.16 : 1;
    this.level = damp(this.level, output.level * m, 8, dt);
    this.low = damp(this.low, output.low * m, 6, dt);
    this.mid = damp(this.mid, output.mid * m, 9, dt);
    this.high = damp(this.high, output.high * m, 11, dt);
  }

  draw(timestamp) {
    if (!this.running) return;
    this.frame = requestAnimationFrame(time => this.draw(time));
    if (document.hidden || this.contextLost) {
      this.last = timestamp;
      return;
    }
    const dt = this.last ? Math.min((timestamp - this.last) / 1000, 0.05) : 1 / 60;
    this.last = timestamp;
    const frame = this.readFrame();
    this.updateSignal(frame, dt);

    const gl = this.gl;
    const u = this.uniforms;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(u.uProjection, false, this.projection);
    const angle = this.motion.matches ? 0.17 : 0.17 + Math.sin(this.time * 0.14) * 0.17;
    const camera = lookAt([Math.sin(angle) * 7.5, 2.05, Math.cos(angle) * 7.5], [0, 0.13, 0]);
    gl.uniformMatrix4fv(u.uView, false, camera);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uLevel, this.level);
    gl.uniform1f(u.uLow, this.low);
    gl.uniform1f(u.uMid, this.mid);
    gl.uniform1f(u.uHigh, this.high);
    gl.uniform1f(u.uPixelRatio, this.dpr);

    this.renderBuffer('rings', 3, gl.LINES);
    this.renderBuffer('floor', 1, gl.LINES);
    this.renderBuffer('plume', 0, gl.LINES);
    this.renderBuffer('plume', 0, gl.POINTS);
    this.renderBuffer('particles', 2, gl.POINTS);

    frame.onMeter?.(frame.input?.level || 0, this.level);
  }

  renderBuffer(name, mode, primitive) {
    const gl = this.gl;
    const item = this.buffers[name];
    gl.bindVertexArray(item.vao);
    gl.uniform1f(this.uniforms.uMode, mode);
    gl.uniform1f(this.uniforms.uPointPass, primitive === gl.POINTS ? 1 : 0);
    gl.drawArrays(primitive, 0, item.count);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    if (this.gl && !this.contextLost) {
      for (const item of Object.values(this.buffers || {})) {
        this.gl.deleteVertexArray(item.vao);
        this.gl.deleteBuffer(item.buffer);
      }
      if (this.program) this.gl.deleteProgram(this.program);
    }
  }
}
