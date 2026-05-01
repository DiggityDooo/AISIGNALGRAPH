(function bootstrapSiteEffects() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;

  function setMotionPreference() {
    root.classList.toggle("reduced-motion", prefersReducedMotion.matches);
  }

  setMotionPreference();
  if (typeof prefersReducedMotion.addEventListener === "function") {
    prefersReducedMotion.addEventListener("change", setMotionPreference);
  } else if (typeof prefersReducedMotion.addListener === "function") {
    prefersReducedMotion.addListener(setMotionPreference);
  }

  const body = document.body;
  if (!body) {
    return;
  }

  const progressBar = document.querySelector("[data-scroll-progress]");
  const pointerOrbs = [...document.querySelectorAll("[data-ambient-orb]")];
  const revealTargets = [...document.querySelectorAll("[data-animate]")];
  const tiltTargets = [...document.querySelectorAll("[data-tilt]")];
  const magneticTargets = [...document.querySelectorAll("[data-magnetic]")];
  const countupTargets = [...document.querySelectorAll("[data-countup]")];
  const reactiveTargets = [...document.querySelectorAll("[data-pointer-reactive]")];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateScrollProgress() {
    if (!progressBar) {
      return;
    }
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = clamp(window.scrollY / scrollable, 0, 1);
    progressBar.style.transform = `scaleX(${ratio})`;
  }

  function primeRevealTargets() {
    revealTargets.forEach((element, index) => {
      element.style.setProperty("--reveal-delay", `${Math.min(index * 70, 420)}ms`);
    });
  }

  function observeRevealTargets() {
    if (!revealTargets.length) {
      return;
    }

    if (prefersReducedMotion.matches) {
      revealTargets.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    revealTargets.forEach((element) => observer.observe(element));
  }

  function attachTilt(element) {
    if (prefersReducedMotion.matches) {
      return;
    }

    const reset = () => {
      element.style.setProperty("--tilt-rotate-x", "0deg");
      element.style.setProperty("--tilt-rotate-y", "0deg");
      element.style.setProperty("--tilt-glow-opacity", "0");
    };

    reset();

    element.addEventListener("pointermove", (event) => {
      const rect = element.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
      const y = clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
      const rotateY = (x - 0.5) * 10;
      const rotateX = (0.5 - y) * 10;
      element.style.setProperty("--tilt-rotate-x", `${rotateX.toFixed(2)}deg`);
      element.style.setProperty("--tilt-rotate-y", `${rotateY.toFixed(2)}deg`);
      element.style.setProperty("--tilt-glow-opacity", "1");
      element.style.setProperty("--spotlight-x", `${(x * 100).toFixed(2)}%`);
      element.style.setProperty("--spotlight-y", `${(y * 100).toFixed(2)}%`);
    });

    element.addEventListener("pointerleave", reset);
  }

  function attachMagnetic(element) {
    if (prefersReducedMotion.matches) {
      return;
    }

    const reset = () => {
      element.style.setProperty("--magnetic-x", "0px");
      element.style.setProperty("--magnetic-y", "0px");
    };

    element.addEventListener("pointermove", (event) => {
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
      const y = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
      element.style.setProperty("--magnetic-x", `${(x * 10).toFixed(2)}px`);
      element.style.setProperty("--magnetic-y", `${(y * 10).toFixed(2)}px`);
    });

    element.addEventListener("pointerleave", reset);
    reset();
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(Math.round(value));
  }

  function animateCountup(element) {
    const rawTarget = element.dataset.countup || element.textContent;
    const target = Number.parseFloat(String(rawTarget).replace(/,/g, ""));
    if (!Number.isFinite(target)) {
      return;
    }

    if (element.dataset.countupDone === "true") {
      return;
    }

    if (prefersReducedMotion.matches) {
      element.textContent = formatNumber(target);
      element.dataset.countupDone = "true";
      return;
    }

    const duration = 1200;
    const start = window.performance.now();

    const tick = (now) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = formatNumber(target * eased);
      if (progress < 1) {
        window.requestAnimationFrame(tick);
        return;
      }
      element.textContent = formatNumber(target);
      element.dataset.countupDone = "true";
    };

    window.requestAnimationFrame(tick);
  }

  function observeCountups() {
    if (!countupTargets.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          animateCountup(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.4 }
    );

    countupTargets.forEach((element) => observer.observe(element));
  }

  function bindReactivePointer(element) {
    element.addEventListener("pointermove", (event) => {
      const rect = element.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
      const y = clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
      element.style.setProperty("--spotlight-x", `${(x * 100).toFixed(2)}%`);
      element.style.setProperty("--spotlight-y", `${(y * 100).toFixed(2)}%`);
    });
  }

  function handleBodyPointer(event) {
    const x = event.clientX / Math.max(window.innerWidth, 1);
    const y = event.clientY / Math.max(window.innerHeight, 1);
    root.style.setProperty("--cursor-x", `${(x * 100).toFixed(2)}%`);
    root.style.setProperty("--cursor-y", `${(y * 100).toFixed(2)}%`);

    pointerOrbs.forEach((orb, index) => {
      const driftX = (x - 0.5) * (index === 0 ? 60 : -42);
      const driftY = (y - 0.5) * (index === 0 ? 48 : -32);
      orb.style.transform = `translate3d(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px, 0)`;
    });
  }

  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress);
  window.addEventListener("pointermove", handleBodyPointer, { passive: true });

  primeRevealTargets();
  observeRevealTargets();
  observeCountups();
  updateScrollProgress();

  tiltTargets.forEach(attachTilt);
  magneticTargets.forEach(attachMagnetic);
  reactiveTargets.forEach(bindReactivePointer);
})();
