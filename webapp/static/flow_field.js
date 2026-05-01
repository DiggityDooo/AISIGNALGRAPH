/**
 * AISIGNALGRAPH // Hero Flow Background (2D Canvas)
 * Non-WebGL fallback-safe animated red signal field.
 */

(function initFlowField2D() {
  const canvas = document.getElementById("flow-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const state = {
    particles: [],
    mouseX: 0,
    mouseY: 0
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
  }

  function seedParticles() {
    state.particles.length = 0;
    const count = 400;
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: 0.00022 + Math.random() * 0.00055,
        vy: (Math.random() - 0.5) * 0.00006,
        size: 0.6 + Math.random() * 1.8,
        alpha: 0.03 + Math.random() * 0.12
      });
    }
  }

  function draw() {
    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(
      width * (0.68 + state.mouseX * 0.14),
      height * (0.25 + state.mouseY * 0.10),
      width * 0.03,
      width * 0.6,
      height * 0.4,
      width * 0.7
    );
    glow.addColorStop(0, "rgba(255, 49, 72, 0.2)");
    glow.addColorStop(1, "rgba(255, 49, 72, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy + state.mouseY * 0.00006;
      p.size += Math.sin(Date.now() * 0.001 + i) * 0.003;

      if (p.x > 1.03) {
        p.x = -0.03;
        p.y = Math.random();
      }
      if (p.y < -0.05) p.y = 1.05;
      if (p.y > 1.05) p.y = -0.05;

      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.size * dpr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 95, 111, ${p.alpha})`;
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener("mousemove", (event) => {
    state.mouseX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    state.mouseY = event.clientY / Math.max(1, window.innerHeight) - 0.5;
  });

  window.addEventListener("resize", resize);

  resize();
  seedParticles();
  draw();
})();
