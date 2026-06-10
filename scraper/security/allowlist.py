"""Trusted domain registry. Only URLs from these domains are ever fetched."""

from urllib.parse import urlparse

import tldextract

ALLOWED_DOMAINS: set[str] = {
    "openai.com",
    "anthropic.com",
    "deepmind.google",
    "deepmind.com",
    "huggingface.co",
    "arxiv.org",
    "semanticscholar.org",
    "venturebeat.com",
    "techcrunch.com",
    "technologyreview.com",
    "wired.com",
    "theverge.com",
    "arstechnica.com",
    "zdnet.com",
    "ieee.org",
    "spectrum.ieee.org",
    "acm.org",
    "cacm.acm.org",
    "nature.com",
    "science.org",
    "cell.com",
    "blog.google",
    "google.com",
    "ai.googleblog.com",
    "research.google",
    "microsoft.com",
    "research.microsoft.com",
    "meta.ai",
    "ai.facebook.com",
    "ai.meta.com",
    "facebook.com",
    "stability.ai",
    "mistral.ai",
    "cohere.com",
    "inflection.ai",
    "together.ai",
    "a16z.com",
    "nber.org",
    "web.archive.org",
    "archive.org",
    "wikipedia.org",
    "wikimedia.org",
    "mit.edu",
    "stanford.edu",
    "cmu.edu",
    "berkeley.edu",
    "ox.ac.uk",
    "cambridge.ac.uk",
    "toronto.edu",
    "utoronto.ca",
    "turing.ac.uk",
    "eleutherai.org",
    "nytimes.com",
    "washingtonpost.com",
    "reuters.com",
    "apnews.com",
}

# Second-level TLDs trusted regardless of registered domain.
ALLOWED_TLD_EXCEPTIONS: set[str] = {
    "ac.uk",
    "edu.au",
    "gov.uk",
}

# Offline-safe extraction: never hit the public suffix list over the network.
_extract = tldextract.TLDExtract(suffix_list_urls=())


def is_domain_allowed(url: str) -> bool:
    """True only when the registered domain is explicitly trusted."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if not parsed.hostname:
        return False

    ext = _extract(parsed.hostname)
    registered = ext.top_domain_under_public_suffix
    if registered and registered.lower() in ALLOWED_DOMAINS:
        return True

    suffix = ext.suffix.lower()
    return suffix in ALLOWED_TLD_EXCEPTIONS
