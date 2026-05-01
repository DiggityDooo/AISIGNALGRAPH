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

  const bootstrapHeroCardCycling = async () => {
    const originalCard = document.querySelector(".hero-cover-card");
    if (!originalCard) {
      return;
    }

    const card = originalCard.cloneNode(true);
    originalCard.replaceWith(card);

    const titleEl = card.querySelector("h3");
    const excerptEl = card.querySelector("p");
    const linkEl = card.querySelector(".hero-cover-card__link");
    const kickerEl = card.querySelector(".hero-cover-card__kicker");
    const channelEl = card.querySelector(".hero-cover-card__channel");
    const stampEl = card.querySelector(".hero-cover-card__stamp");
    const visualEl = card.querySelector(".hero-cover-card__visual");
    const progressEl = card.querySelector(".hero-cover-card__progress span");

    if (!titleEl || !excerptEl || !linkEl || !kickerEl || !visualEl) {
      return;
    }

    if (progressEl) {
      progressEl.style.animationDuration = "7s";
    }

    const protocolFallback = [
      {
        title: "Protocol: Frontier Oversight Matrix",
        excerpt: "Structured monitoring of labs, model families, policy signals, and deployment pressure across active timelines.",
        url: "/stories",
        kind: "protocol",
        stamp: "vector mode"
      },
      {
        title: "Protocol: Risk Escalation Watch",
        excerpt: "Continuous watchlist of alignment risk vectors and institutional response latency across major actors.",
        url: "/stories",
        kind: "protocol",
        stamp: "signal active"
      }
    ];
    const newsFallback = [
      {
        title: "News: Frontier Labs Raise Safety Pressure",
        excerpt: "New governance and deployment disclosures are increasing scrutiny across model-launch timelines.",
        url: "/stories",
        kind: "news",
        stamp: "breaking"
      },
      {
        title: "News: Compute Access Race Intensifies",
        excerpt: "Cloud and accelerator access constraints are reshaping release cadence and product positioning.",
        url: "/stories",
        kind: "news",
        stamp: "latest"
      }
    ];
    const entityFallback = [
      {
        title: "OpenAI",
        excerpt: "Frontier model lab tracking capability releases, safety posture, and deployment cadence.",
        url: "/entities",
        kind: "entity",
        stamp: "lab // priority"
      },
      {
        title: "Anthropic",
        excerpt: "Operational dossier covering constitutional-alignment posture, product launches, and governance signals.",
        url: "/entities",
        kind: "entity",
        stamp: "lab // active"
      }
    ];

    let fetchedStories = [];
    try {
      const response = await fetch("/api/stories/featured");
      if (response.ok) {
        const payload = await response.json();
        const rawStories = Array.isArray(payload) ? payload : Array.isArray(payload?.stories) ? payload.stories : [];
        fetchedStories = rawStories.map((story) => ({
          title: story.title,
          excerpt: story.excerpt || story.summary || "",
          url: story.url || story.href || (story.id ? `/stories/${story.id}` : "/stories"),
          kind: story.kind || "news",
          stamp: story.event_date || story.date || "live"
        })).filter((story) => story.title && story.url);
      }
    } catch (_error) {
      fetchedStories = [];
    }

    let graphPool = [];
    try {
      const graphResponse = await fetch("/api/graph");
      if (graphResponse.ok) {
        const graphPayload = await graphResponse.json();
        const nodes = Array.isArray(graphPayload?.nodes) ? graphPayload.nodes : [];
        graphPool = nodes
          .filter((node) => {
            const type = String(node.semanticType || node.node_type || node.type || "").toLowerCase();
            return type === "story" || type === "entity";
          })
          .map((node) => {
            const type = String(node.semanticType || node.node_type || node.type || "story").toLowerCase();
            const isEntity = type === "entity";
            return {
              title: node.label || node.name || node.id,
              excerpt: node.summary || node.description || "",
              url: node.route || (isEntity ? `/entities/${node.id}` : `/stories/${node.id}`),
              kind: isEntity ? "entity" : "news",
              stamp: isEntity ? "entity dossier" : (node.timeline_month || node.year || "live")
            };
          })
          .filter((item) => item.title && item.url);
      }
    } catch (_error) {
      graphPool = [];
    }

    const pageStories = Array.isArray(window.__heroStories) ? window.__heroStories : [];
    const pageEntities = Array.isArray(window.__heroEntities) ? window.__heroEntities : [];
    const newsStories = fetchedStories.length ? fetchedStories : pageStories.length ? pageStories : newsFallback;
    const entityStories = pageEntities.length ? pageEntities : entityFallback;
    const allStories = graphPool.length ? graphPool : [...newsStories, ...entityStories, ...protocolFallback];
    let previousTitle = "";

    const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const pickNext = () => {
      let chosen = randomFrom(allStories);
      if (!chosen) {
        return chosen;
      }
      if (chosen.title === previousTitle && allStories.length > 1) {
        const alternatives = allStories.filter((item) => item.title !== previousTitle);
        if (alternatives.length) {
          chosen = randomFrom(alternatives);
        }
      }
      previousTitle = chosen?.title || "";
      return chosen;
    };

    const applyStory = (story) => {
      const normalizedKind = String(story.kind || "news").toLowerCase();
      const isProtocol = normalizedKind === "protocol";
      const isEntity = normalizedKind === "entity";
      const kind = isProtocol ? "Protocol digest" : isEntity ? "Entity dossier" : "News bulletin";
      titleEl.textContent = story.title;
      excerptEl.textContent = story.excerpt;
      linkEl.href = story.url;
      kickerEl.textContent = kind;
      if (channelEl) {
        channelEl.textContent = isProtocol ? "protocol" : isEntity ? "entity" : "news";
      }
      if (stampEl) {
        stampEl.textContent = story.stamp || "live feed";
      }
      visualEl.classList.remove("is-news", "is-protocol", "is-entity");
      visualEl.classList.add(isProtocol ? "is-protocol" : isEntity ? "is-entity" : "is-news");
      card.classList.remove("is-news", "is-protocol", "is-entity", "is-swapping");
      card.classList.add(isProtocol ? "is-protocol" : isEntity ? "is-entity" : "is-news");
      if (progressEl) {
        progressEl.style.animation = "none";
        void progressEl.offsetWidth;
        progressEl.style.animation = "card-progress 7s linear infinite";
      }
    };

    const animateSwap = () => {
      const next = pickNext();
      if (!next) {
        return;
      }
      card.classList.remove("is-swapping");
      void card.offsetWidth;
      card.classList.add("is-swapping");
      window.setTimeout(() => applyStory(next), 220);
    };

    applyStory(pickNext());
    window.setTimeout(animateSwap, 1200);
    window.setInterval(animateSwap, 7000);
  };

  window.addEventListener("load", () => {
    setStatus("core synchronized");
    bootstrapHeroCardCycling();
  });
})();
