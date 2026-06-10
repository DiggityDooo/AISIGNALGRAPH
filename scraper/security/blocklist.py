"""Blocked URL patterns and domains. Any match rejects the URL outright."""

import re
from urllib.parse import urlparse

import tldextract

BLOCKED_PATTERNS: list[re.Pattern] = [
    # Malware/phishing keywords in URL path
    re.compile(r"/(malware|phish|exploit|payload|inject|xss|sqli|csrf)/", re.IGNORECASE),
    # Suspicious TLDs commonly used for throwaway malicious domains
    re.compile(r"\.(tk|ml|ga|cf|gq|buzz|click|download|zip|cam|link|uno)(/|$)", re.IGNORECASE),
    # IP address URLs (no legitimate news source uses a raw IP)
    re.compile(r"https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", re.IGNORECASE),
    # URL shorteners (follow-through risk; ban entirely)
    re.compile(r"https?://(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|short\.io)", re.IGNORECASE),
    # Crypto/NFT spam patterns often masquerading as AI news
    re.compile(r"/(nft|crypto|token|airdrop|mint|blockchain-ai-crypto)[\-_]", re.IGNORECASE),
    # Pastebin and similar — no legitimate AI news sources
    re.compile(r"https?://(pastebin\.com|hastebin\.com|ghostbin\.com)", re.IGNORECASE),
    # Data exfiltration via DNS in URL: suspiciously long subdomains
    re.compile(r"https?://[\w\-]{32,}\.(com|net|org)", re.IGNORECASE),
]

# Domains observed hosting misinformation, AI content farms, or malicious
# redirects. Grows over time as bad actors are identified.
BLOCKED_DOMAINS: set[str] = set()

_extract = tldextract.TLDExtract(suffix_list_urls=())


def is_url_blocked(url: str) -> bool:
    """True if the URL matches any blocked pattern or blocked domain."""
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(url):
            return True

    try:
        parsed = urlparse(url)
    except ValueError:
        return True

    if not parsed.hostname:
        return True

    registered = _extract(parsed.hostname).top_domain_under_public_suffix
    return bool(registered) and registered.lower() in BLOCKED_DOMAINS
