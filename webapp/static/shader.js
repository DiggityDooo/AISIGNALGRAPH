(function initShader() {
  const canvas = document.getElementById("bg-shader");
  if (!canvas) {
    return;
  }

  if (navigator.maxTouchPoints > 0) {
    canvas.style.background = "#050505";
    return;
  }

  const gl = canvas.getContext("webgl", { antialias: false, alpha: false }) || canvas.getContext("experimental-webgl");
  if (!gl) {
    canvas.style.background = "#050505";
    return;
  }

  const VERT_SRC = `
    attribute vec4 a_position;
    void main() {
      gl_Position = a_position;
    }
  `;

  const FRAG_SRC = `
    precision highp float;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;

    vec3 hash3(vec2 p) {
      vec3 q = vec3(dot(p, vec2(127.1, 311.7)),
                    dot(p, vec2(269.5, 183.3)),
                    dot(p, vec2(419.2, 371.9)));
      return fract(sin(q) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(dot(hash3(i + vec2(0.0, 0.0)).xy, f - vec2(0.0, 0.0)),
                     dot(hash3(i + vec2(1.0, 0.0)).xy, f - vec2(1.0, 0.0)), u.x),
                 mix(dot(hash3(i + vec2(0.0, 1.0)).xy, f - vec2(0.0, 1.0)),
                     dot(hash3(i + vec2(1.0, 1.0)).xy, f - vec2(1.0, 1.0)), u.x), u.y);
    }

    float fbm(vec2 p) {
      float val = 0.0;
      float amp = 0.5;
      float freq = 1.0;
      for (int i = 0; i < 6; i++) {
        val += amp * noise(p * freq);
        amp *= 0.5;
        freq *= 2.0;
      }
      return val;
    }

    float grid(vec2 uv, float spacing, float lineW) {
      vec2 g = fract(uv / spacing);
      vec2 d = min(g, 1.0 - g);
      return 1.0 - smoothstep(0.0, lineW, min(d.x, d.y));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
      float t = u_time * 0.12;

      vec2 q = vec2(fbm(st + t), fbm(st + vec2(1.7, 9.2) + t * 0.8));
      vec2 r = vec2(fbm(st + 2.0 * q + vec2(1.7, 9.2) + 0.15 * t),
                    fbm(st + 2.0 * q + vec2(8.3, 2.8) + 0.12 * t));
      float f = fbm(st + 2.0 * r);

      vec3 col = mix(
        vec3(0.04, 0.01, 0.01),
        vec3(1.00, 0.12, 0.20),
        clamp(f * f * 3.0, 0.0, 1.0)
      );
      col = mix(
        col,
        vec3(0.58, 0.08, 0.12),
        clamp(length(q) * 0.5, 0.0, 1.0)
      );

      vec2 mouseUV = u_mouse - uv;
      float mDist = length(mouseUV);
      col += vec3(0.45, 0.05, 0.08) * smoothstep(0.3, 0.0, mDist) * 0.4;

      float gridVal = grid(uv * u_resolution * 0.015, 1.0, 0.04);
      float gridVal2 = grid(uv * u_resolution * 0.003, 1.0, 0.04);
      col += vec3(0.9, 0.1, 0.15) * gridVal * 0.06;
      col += vec3(0.45, 0.04, 0.08) * gridVal2 * 0.04;

      float vig = 1.0 - dot(st * 0.8, st * 0.8);
      col *= vig * vig;
      col = col / (col + 0.3);
      col = pow(col, vec3(0.75));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
    }
    return shader;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
    }
  } catch (_error) {
    canvas.style.background = "#050505";
    return;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const timeLocation = gl.getUniformLocation(program, "u_time");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const mouseLocation = gl.getUniformLocation(program, "u_mouse");
  let mouse = [0.5, 0.5];

  document.addEventListener("mousemove", (event) => {
    mouse = [event.clientX / window.innerWidth, 1 - event.clientY / window.innerHeight];
  });

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener("resize", resize);
  resize();

  const start = performance.now();
  (function loop() {
    const t = (performance.now() - start) / 1000;
    gl.uniform1f(timeLocation, t);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform2f(mouseLocation, mouse[0], mouse[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    window.requestAnimationFrame(loop);
  })();
})();
