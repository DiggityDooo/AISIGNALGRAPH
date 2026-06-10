"""RSS source registry and era classification."""

RSS_SOURCES: list[dict] = [
    {"name": "OpenAI Blog",          "rss": "https://openai.com/blog/rss.xml",                          "rate": "rss"},
    {"name": "Anthropic News",       "rss": "https://www.anthropic.com/rss.xml",                        "rate": "rss"},
    {"name": "HuggingFace Blog",     "rss": "https://huggingface.co/blog/feed.xml",                     "rate": "rss"},
    {"name": "Google DeepMind",      "rss": "https://deepmind.google/blog/rss.xml",                     "rate": "rss"},
    {"name": "Google AI Blog",       "rss": "https://blog.google/technology/ai/rss/",                   "rate": "rss"},
    {"name": "Microsoft AI Blog",    "rss": "https://blogs.microsoft.com/ai/feed/",                     "rate": "rss"},
    {"name": "Meta AI",              "rss": "https://ai.meta.com/blog/rss/",                            "rate": "rss"},
    {"name": "VentureBeat AI",       "rss": "https://venturebeat.com/category/ai/feed/",                "rate": "rss"},
    {"name": "MIT Tech Review AI",   "rss": "https://www.technologyreview.com/topic/artificial-intelligence/feed", "rate": "rss"},
    {"name": "Ars Technica AI",      "rss": "https://feeds.arstechnica.com/arstechnica/technology-lab", "rate": "rss"},
    {"name": "The Verge AI",         "rss": "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", "rate": "rss"},
    {"name": "Wired AI",             "rss": "https://www.wired.com/feed/tag/ai/latest/rss",             "rate": "rss"},
    {"name": "IEEE Spectrum AI",     "rss": "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss", "rate": "rss"},
    {"name": "arXiv cs.AI",          "rss": "https://arxiv.org/rss/cs.AI",                              "rate": "rss"},
    {"name": "arXiv cs.LG",          "rss": "https://arxiv.org/rss/cs.LG",                              "rate": "rss"},
    {"name": "arXiv cs.CL",          "rss": "https://arxiv.org/rss/cs.CL",                              "rate": "rss"},
    {"name": "Semantic Scholar",     "rss": "https://www.semanticscholar.org/feeds/feed.xml",           "rate": "rss"},
    {"name": "Reuters Technology",   "rss": "https://feeds.reuters.com/reuters/technologyNews",         "rate": "rss"},
    {"name": "NYT Technology",       "rss": "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", "rate": "rss"},
    {"name": "a16z AI",              "rss": "https://a16z.com/tag/ai/feed/",                            "rate": "rss"},
    {"name": "Stability AI Blog",    "rss": "https://stability.ai/news/rss",                            "rate": "rss"},
    {"name": "Mistral AI Blog",      "rss": "https://mistral.ai/rss/",                                  "rate": "rss"},
    {"name": "Cohere Blog",          "rss": "https://cohere.com/blog/rss",                              "rate": "rss"},
]

ERA_DATE_RANGES: dict[str, tuple[int, int]] = {
    "founding":      (1956, 1969),
    "symbolic":      (1966, 1973),
    "first_winter":  (1974, 1979),
    "connectionist": (1980, 1986),
    "second_winter": (1987, 1993),
    "statistical":   (1993, 2005),
    "deep_learning": (2006, 2016),
    "transformer":   (2017, 2022),
    "frontier":      (2022, 2024),
    "agentic":       (2024, 2026),
}

# Order matters: later eras win when ranges overlap.
_ERA_ORDER = list(ERA_DATE_RANGES.keys())


def classify_era(year: int) -> str:
    """Return the era for a year. Overlapping years prefer the later era."""
    matched = "agentic" if year > ERA_DATE_RANGES["agentic"][1] else "founding"
    for era in _ERA_ORDER:
        start, end = ERA_DATE_RANGES[era]
        if start <= year <= end:
            matched = era
    return matched
