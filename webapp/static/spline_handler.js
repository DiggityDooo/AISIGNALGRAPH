(function bootstrapSplineHero() {
  const shell = document.querySelector("[data-spline-shell]");
  const wave = document.querySelector("[data-spline-wave]");
  const status = document.querySelector("[data-spline-status]");

  if (!shell || !wave) {
    return;
  }

  const setStatus = (value) => {
    if (status) {
      status.textContent = value;
    }
  };

  const onPointerMove = (event) => {
    const rect = shell.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
    shell.style.setProperty("--pointer-x", `${x.toFixed(2)}%`);
    shell.style.setProperty("--pointer-y", `${y.toFixed(2)}%`);
    setStatus("tracking cursor distortion");
  };

  const pulseWave = (event) => {
    const rect = shell.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    wave.style.left = `${x}px`;
    wave.style.top = `${y}px`;
    wave.classList.remove("is-pulsing");
    void wave.offsetWidth;
    wave.classList.add("is-pulsing");
    setStatus("wavefront deployed");
    window.setTimeout(() => setStatus("tracking signal flow"), 900);
  };

  shell.addEventListener("pointermove", onPointerMove);
  shell.addEventListener("pointerleave", () => {
    shell.style.removeProperty("--pointer-x");
    shell.style.removeProperty("--pointer-y");
    setStatus("tracking signal flow");
  });
  shell.addEventListener("click", pulseWave);

  window.addEventListener("load", () => {
    setStatus("core synchronized");
  });
})();
