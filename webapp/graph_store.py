from __future__ import annotations

import json
import math
import re
import sqlite3
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import bleach
import markdown
import numpy as np
from loguru import logger
from sklearn.cluster import KMeans

from .types import GraphData, HealthReport


LEGACY_MASTER_DOCUMENT_PATH = Path("/home/seanb/Documents/New Folder/AI_Master_Document_2020_2026.md")
DATASET_VERSION = "master-doc-v3"
SCHEMA_VERSION = "1"
DISPLAY_CLUSTER_REFINEMENT_THRESHOLD = 120
DISPLAY_CLUSTER_TARGET_SIZE = 12
DISPLAY_CLUSTER_MAX_COUNT = 20
MONTHS = {
    "jan": "01",
    "feb": "02",
    "mar": "03",
    "apr": "04",
    "may": "05",
    "jun": "06",
    "jul": "07",
    "aug": "08",
    "sep": "09",
    "oct": "10",
    "nov": "11",
    "dec": "12",
}
JOBS_APPENDIX_SECTION = "ai jobs appendix"
JOBS_PLATFORM_SUBSECTION = "ai evaluation & training platforms"
JOBS_CREATION_SUBSECTION = "new job roles ai has created"
JOBS_DISPLACEMENT_SUBSECTION = "job roles being eliminated or severely reduced"
JOBS_LAYOFF_SUBSECTION = "companies that have cut jobs and cited ai"
JOBS_NARRATIVE_SUBSECTIONS = {
    "entry-level and new graduate impact",
    "the real picture",
}

ENTITY_DEFINITIONS = [
    {"id": "year-2020", "name": "2020", "type": "year", "group": "Years", "description": "AI foundation year: GPT-3, AlphaFold, and pandemic-scale digital adoption.", "importance": 3, "aliases": ["2020"]},
    {"id": "year-2021", "name": "2021", "type": "year", "group": "Years", "description": "Commercialization year: Copilot, DALL-E, and Anthropic's founding.", "importance": 3, "aliases": ["2021"]},
    {"id": "year-2022", "name": "2022", "type": "year", "group": "Years", "description": "Generative AI breakout year led by Stable Diffusion and ChatGPT.", "importance": 4, "aliases": ["2022"]},
    {"id": "year-2023", "name": "2023", "type": "year", "group": "Years", "description": "Enterprise adoption, OpenAI board crisis, and the context-window race.", "importance": 4, "aliases": ["2023"]},
    {"id": "year-2024", "name": "2024", "type": "year", "group": "Years", "description": "Reasoning, multimodal products, and Nvidia-scale infrastructure dominance.", "importance": 5, "aliases": ["2024"]},
    {"id": "year-2025", "name": "2025", "type": "year", "group": "Years", "description": "DeepSeek shock, agent consolidation, and visible labor disruption.", "importance": 5, "aliases": ["2025"]},
    {"id": "year-2026", "name": "2026", "type": "year", "group": "Years", "description": "AI labor crisis and intensified global model competition.", "importance": 5, "aliases": ["2026"]},
    {"id": "openai", "name": "OpenAI", "type": "company", "group": "Labs", "description": "Frontier lab spanning ChatGPT, GPT, o-series reasoning models, and multimodal products.", "importance": 5, "aliases": ["openai", "chatgpt", "gpt-4", "gpt-4o", "gpt-5", "o1", "o3", "codex", "sora", "dall-e", "clip"]},
    {"id": "anthropic", "name": "Anthropic", "type": "company", "group": "Labs", "description": "Safety-focused frontier lab behind Claude and major enterprise agent adoption.", "importance": 5, "aliases": ["anthropic", "claude", "constitutional ai", "claude code"]},
    {"id": "google-deepmind", "name": "Google DeepMind", "type": "company", "group": "Labs", "description": "Google's unified AI research arm spanning Gemini, AlphaFold, and scientific systems.", "importance": 5, "aliases": ["google deepmind", "deepmind", "google brain", "google ai", "gemini", "palm", "lamda", "meena", "alphafold", "alphaproof", "alphageometry"]},
    {"id": "meta", "name": "Meta AI", "type": "company", "group": "Labs", "description": "Open-weight force centered on the Llama family and ecosystem strategy.", "importance": 4, "aliases": ["meta", "facebook ai", "fair", "llama", "llama 2", "llama 3", "llama 4"]},
    {"id": "microsoft", "name": "Microsoft", "type": "company", "group": "Platforms", "description": "Cloud and productivity distribution layer for copilots, OpenAI, and enterprise AI.", "importance": 5, "aliases": ["microsoft", "azure", "copilot", "microsoft ai", "satya nadella", "maia"]},
    {"id": "nvidia", "name": "NVIDIA", "type": "company", "group": "Infrastructure", "description": "Hardware bottleneck for frontier training and inference economics.", "importance": 5, "aliases": ["nvidia", "cuda", "a100", "h100", "h200", "blackwell", "b200", "jensen huang"]},
    {"id": "amazon", "name": "Amazon", "type": "company", "group": "Platforms", "description": "Cloud and capital backer in Anthropic and custom AI chips through AWS.", "importance": 4, "aliases": ["amazon", "aws", "bedrock", "trainium", "inferentia"]},
    {"id": "apple", "name": "Apple", "type": "company", "group": "Platforms", "description": "Consumer platform with privacy-forward AI positioning and on-device inference focus.", "importance": 4, "aliases": ["apple", "apple intelligence", "m-series", "m4"]},
    {"id": "deepseek", "name": "DeepSeek", "type": "company", "group": "Labs", "description": "Chinese lab that changed cost and openness expectations through efficient frontier-scale models.", "importance": 5, "aliases": ["deepseek", "deepseek r1", "deepseek v2", "deepseek v3", "deepseek v4", "high-flyer", "liang wenfeng"]},
    {"id": "mistral", "name": "Mistral AI", "type": "company", "group": "Labs", "description": "European frontier lab pushing efficient open-weight models and consumer chat.", "importance": 4, "aliases": ["mistral", "mixtral", "mistral large", "le chat"]},
    {"id": "hugging-face", "name": "Hugging Face", "type": "company", "group": "Platforms", "description": "Hub and distribution layer for open models, datasets, and evaluation culture.", "importance": 4, "aliases": ["hugging face", "transformers library"]},
    {"id": "stability-ai", "name": "Stability AI", "type": "company", "group": "Media", "description": "Open image generation pioneer tied to diffusion culture and later collapse.", "importance": 3, "aliases": ["stability ai", "stable diffusion", "emad mostaque"]},
    {"id": "midjourney", "name": "Midjourney", "type": "company", "group": "Media", "description": "Image-generation product that created mainstream AI art culture.", "importance": 3, "aliases": ["midjourney"]},
    {"id": "runway", "name": "Runway", "type": "company", "group": "Media", "description": "Video AI company associated with early generative video momentum.", "importance": 3, "aliases": ["runway", "runway ml", "gen-2", "gen-3"]},
    {"id": "character-ai", "name": "Character.AI", "type": "company", "group": "Consumer", "description": "Consumer companion platform showing both engagement upside and social risk.", "importance": 3, "aliases": ["character.ai", "character ai"]},
    {"id": "xai", "name": "xAI", "type": "company", "group": "Labs", "description": "Elon Musk's lab centered on Grok and social-native distribution.", "importance": 3, "aliases": ["xai", "grok", "elon musk"]},
    {"id": "cohere", "name": "Cohere", "type": "company", "group": "Labs", "description": "Enterprise-oriented API lab focused on practical language model deployment.", "importance": 3, "aliases": ["cohere"]},
    {"id": "inflection", "name": "Inflection AI", "type": "company", "group": "Consumer", "description": "High-profile personal AI startup later hollowed out by Microsoft hiring its core team.", "importance": 3, "aliases": ["inflection", "pi personal ai", "pi assistant"]},
    {"id": "adept", "name": "Adept AI", "type": "company", "group": "Agents", "description": "Agent startup later pulled into consolidation through an acqui-hire pattern.", "importance": 3, "aliases": ["adept ai", "adept"]},
    {"id": "cognition", "name": "Cognition", "type": "company", "group": "Agents", "description": "Agent company behind Devin and later Windsurf consolidation moves.", "importance": 4, "aliases": ["cognition", "devin", "windsurf"]},
    {"id": "databricks", "name": "Databricks", "type": "company", "group": "Infrastructure", "description": "Enterprise data platform whose MosaicML acquisition highlighted infrastructure consolidation.", "importance": 3, "aliases": ["databricks", "mosaicml"]},
    {"id": "scale-ai", "name": "Scale AI", "type": "company", "group": "Infrastructure", "description": "Data-labeling and evaluation company that benefited early from the data bottleneck.", "importance": 3, "aliases": ["scale ai"]},
    {"id": "oracle", "name": "Oracle", "type": "company", "group": "Infrastructure", "description": "Infrastructure player in the Stargate buildout and large data-center commitments.", "importance": 3, "aliases": ["oracle"]},
    {"id": "softbank", "name": "SoftBank", "type": "company", "group": "Capital", "description": "Capital engine behind giant infrastructure and private funding rounds.", "importance": 3, "aliases": ["softbank", "stargate"]},
    {"id": "amd", "name": "AMD", "type": "company", "group": "Infrastructure", "description": "NVIDIA challenger assembling an AI stack through accelerators and acquisitions.", "importance": 3, "aliases": ["amd", "mi300x", "silo ai"]},
    {"id": "qualcomm", "name": "Qualcomm", "type": "company", "group": "Infrastructure", "description": "Chip company participating in AI market consolidation and edge hardware strategy.", "importance": 2, "aliases": ["qualcomm", "alphawave"]},
    {"id": "intel", "name": "Intel", "type": "company", "group": "Infrastructure", "description": "Legacy chip player struggling to gain traction in the accelerator era.", "importance": 2, "aliases": ["intel", "gaudi"]},
    {"id": "google", "name": "Google", "type": "company", "group": "Platforms", "description": "Search and platform giant reshaping its stack around Gemini and AI products.", "importance": 4, "aliases": ["google", "bard", "workspace duet ai"]},
    {"id": "tesla", "name": "Tesla", "type": "company", "group": "Robotics", "description": "EV and autonomy company central to AI labor and robotics speculation.", "importance": 2, "aliases": ["tesla", "fsd", "autopilot", "optimus"]},
    {"id": "moonshot-ai", "name": "Moonshot AI", "type": "company", "group": "Labs", "description": "Chinese lab behind the Kimi model line and agent-focused releases.", "importance": 3, "aliases": ["moonshot ai", "moonshot", "kimi"]},
    {"id": "alibaba", "name": "Alibaba / Qwen Team", "type": "company", "group": "Platforms", "description": "Alibaba's model organization behind the Qwen family and large open-weight distribution.", "importance": 4, "aliases": ["alibaba", "alibaba cloud", "tongyi qianwen", "qwen team"]},
    {"id": "perplexity", "name": "Perplexity", "type": "company", "group": "Consumer", "description": "AI-native answer engine blending retrieval search with fast model routing.", "importance": 3, "aliases": ["perplexity", "perplexity ai", "answer engine"]},
    {"id": "figure-ai", "name": "Figure AI", "type": "company", "group": "Robotics", "description": "Humanoid robotics company linked to AI-native labor automation experiments.", "importance": 3, "aliases": ["figure ai", "figure robotics", "figure 01", "figure 02"]},
    {"id": "gpt-family", "name": "GPT Family", "type": "model", "group": "Models", "description": "OpenAI's flagship model line spanning GPT-3 through GPT-5 and the o-series adjacency.", "importance": 5, "aliases": ["gpt-3", "gpt-3.5", "gpt-4", "gpt-4 turbo", "gpt-4o", "gpt-4.5", "gpt-5"]},
    {"id": "o-series", "name": "OpenAI o-Series", "type": "model", "group": "Models", "description": "Reasoning-focused OpenAI model line built around inference-time compute.", "importance": 5, "aliases": ["o1", "o3", "o4-mini", "strawberry"]},
    {"id": "claude-family", "name": "Claude Family", "type": "model", "group": "Models", "description": "Anthropic's model family centered on long context, coding quality, and agentic workflows.", "importance": 5, "aliases": ["claude 1", "claude 2", "claude 2.1", "claude 3", "claude 3.5", "claude 3.7", "claude 4.5", "claude opus", "claude sonnet", "claude haiku"]},
    {"id": "gemini-family", "name": "Gemini Family", "type": "model", "group": "Models", "description": "Google's Gemini line spanning high-context, multimodal, and flash variants.", "importance": 5, "aliases": ["gemini 1.0", "gemini 1.5", "gemini 2.0", "gemini 2.5", "gemini 3", "gemini advanced", "gemini flash", "gemini pro"]},
    {"id": "llama-family", "name": "Llama Family", "type": "model", "group": "Models", "description": "Meta's open-weight model family and the backbone of many downstream deployments.", "importance": 4, "aliases": ["llama 1", "llama 2", "llama 3", "llama 3.1", "llama 3.2", "llama 4"]},
    {"id": "deepseek-models", "name": "DeepSeek Models", "type": "model", "group": "Models", "description": "DeepSeek's efficient model line that reset cost expectations for frontier AI.", "importance": 5, "aliases": ["deepseek llm", "deepseek v2", "deepseek v3", "deepseek r1", "deepseek v4"]},
    {"id": "mistral-models", "name": "Mistral Models", "type": "model", "group": "Models", "description": "Mistral's European model family including Mixtral and large-model releases.", "importance": 3, "aliases": ["mistral 7b", "mixtral", "mistral large"]},
    {"id": "gemma-family", "name": "Gemma Family", "type": "model", "group": "Models", "description": "Google's open-weight Gemma line for smaller-scale deployment and experimentation.", "importance": 3, "aliases": ["gemma 3", "gemma"]},
    {"id": "stable-diffusion", "name": "Stable Diffusion", "type": "model", "group": "Media Models", "description": "Open image generation line that drove the open media-AI explosion.", "importance": 4, "aliases": ["stable diffusion", "latent diffusion"]},
    {"id": "dalle", "name": "DALL-E", "type": "model", "group": "Media Models", "description": "OpenAI's text-to-image line that brought image generation into mainstream product consciousness.", "importance": 4, "aliases": ["dall-e", "dall-e 2", "dall-e 3"]},
    {"id": "sora", "name": "Sora", "type": "model", "group": "Media Models", "description": "OpenAI's high-fidelity video-generation system.", "importance": 4, "aliases": ["sora"]},
    {"id": "gpt-3-model", "name": "GPT-3", "type": "model", "group": "OpenAI Models", "description": "175B parameter release that kicked off the API economy for large language models.", "importance": 5, "aliases": ["gpt-3"]},
    {"id": "chatgpt-gpt-3-5", "name": "ChatGPT / GPT-3.5", "type": "model", "group": "OpenAI Models", "description": "Conversational interface and RLHF-tuned model that drove mainstream adoption.", "importance": 5, "aliases": ["chatgpt", "gpt-3.5", "gpt-3.5 rlhf"]},
    {"id": "gpt-4-model", "name": "GPT-4", "type": "model", "group": "OpenAI Models", "description": "Multimodal flagship that reset the frontier in 2023.", "importance": 5, "aliases": ["gpt-4"]},
    {"id": "gpt-4-turbo-model", "name": "GPT-4 Turbo", "type": "model", "group": "OpenAI Models", "description": "Cheaper and longer-context GPT-4 variant.", "importance": 4, "aliases": ["gpt-4 turbo"]},
    {"id": "gpt-4o-model", "name": "GPT-4o", "type": "model", "group": "OpenAI Models", "description": "Real-time multimodal model for text, audio, and image interaction.", "importance": 5, "aliases": ["gpt-4o"]},
    {"id": "gpt-4-1-model", "name": "GPT-4.1", "type": "model", "group": "OpenAI Models", "description": "Coding- and instruction-focused GPT line update.", "importance": 4, "aliases": ["gpt-4.1"]},
    {"id": "gpt-4-1-mini-model", "name": "GPT-4.1 mini", "type": "model", "group": "OpenAI Models", "description": "Smaller GPT-4.1 variant for lighter deployment.", "importance": 3, "aliases": ["gpt-4.1 mini"]},
    {"id": "gpt-4-5-model", "name": "GPT-4.5", "type": "model", "group": "OpenAI Models", "description": "Interim flagship before GPT-5.", "importance": 4, "aliases": ["gpt-4.5"]},
    {"id": "gpt-5-model", "name": "GPT-5", "type": "model", "group": "OpenAI Models", "description": "Unified routing flagship in the 2025 cycle.", "importance": 5, "aliases": ["gpt-5"]},
    {"id": "o1-model", "name": "o1", "type": "model", "group": "OpenAI Models", "description": "Reasoning model introducing deliberate inference-time compute.", "importance": 5, "aliases": ["o1", "strawberry"]},
    {"id": "o3-model", "name": "o3", "type": "model", "group": "OpenAI Models", "description": "Stronger reasoning line with ARC-AGI gains.", "importance": 5, "aliases": ["o3"]},
    {"id": "o4-mini-model", "name": "o4-mini", "type": "model", "group": "OpenAI Models", "description": "Smaller reasoning-oriented OpenAI model.", "importance": 4, "aliases": ["o4-mini"]},
    {"id": "gpt-oss-models", "name": "GPT-OSS", "type": "model", "group": "OpenAI Models", "description": "Open-weight OpenAI reasoning models.", "importance": 4, "aliases": ["gpt-oss", "gpt-oss-120b", "gpt-oss-20b"]},
    {"id": "codex-model", "name": "Codex", "type": "model", "group": "OpenAI Models", "description": "OpenAI coding model line that powered Copilot and later coding workflows.", "importance": 4, "aliases": ["codex"]},
    {"id": "clip-model", "name": "CLIP", "type": "model", "group": "OpenAI Models", "description": "Multimodal contrastive model foundational to image-language tooling.", "importance": 3, "aliases": ["clip"]},
    {"id": "dall-e-1-model", "name": "DALL-E 1", "type": "model", "group": "OpenAI Models", "description": "Early text-to-image model from OpenAI.", "importance": 3, "aliases": ["dall-e 1"]},
    {"id": "dall-e-2-model", "name": "DALL-E 2", "type": "model", "group": "OpenAI Models", "description": "Major leap in photorealistic text-to-image synthesis.", "importance": 4, "aliases": ["dall-e 2"]},
    {"id": "dall-e-3-model", "name": "DALL-E 3", "type": "model", "group": "OpenAI Models", "description": "ChatGPT-integrated image generation model.", "importance": 4, "aliases": ["dall-e 3"]},
    {"id": "claude-1-model", "name": "Claude 1", "type": "model", "group": "Anthropic Models", "description": "Early Constitutional AI release from Anthropic.", "importance": 3, "aliases": ["claude 1"]},
    {"id": "claude-1-0-model", "name": "Claude 1.0", "type": "model", "group": "Anthropic Models", "description": "Public Claude release with long-context positioning.", "importance": 3, "aliases": ["claude 1.0"]},
    {"id": "claude-2-model", "name": "Claude 2", "type": "model", "group": "Anthropic Models", "description": "Claude generation with 200K context momentum.", "importance": 4, "aliases": ["claude 2"]},
    {"id": "claude-2-1-model", "name": "Claude 2.1", "type": "model", "group": "Anthropic Models", "description": "Refined Claude 2 line with lower hallucination rates.", "importance": 4, "aliases": ["claude 2.1"]},
    {"id": "claude-3-opus-model", "name": "Claude 3 Opus", "type": "model", "group": "Anthropic Models", "description": "Top-tier Claude 3 reasoning and writing model.", "importance": 5, "aliases": ["claude 3 opus", "opus"]},
    {"id": "claude-3-sonnet-model", "name": "Claude 3 Sonnet", "type": "model", "group": "Anthropic Models", "description": "Mid-tier Claude 3 model balancing quality and speed.", "importance": 4, "aliases": ["claude 3 sonnet"]},
    {"id": "claude-3-haiku-model", "name": "Claude 3 Haiku", "type": "model", "group": "Anthropic Models", "description": "Fast Claude 3 variant.", "importance": 3, "aliases": ["claude 3 haiku"]},
    {"id": "claude-3-5-sonnet-model", "name": "Claude 3.5 Sonnet", "type": "model", "group": "Anthropic Models", "description": "Widely adopted coding and artifact-generation release.", "importance": 5, "aliases": ["claude 3.5 sonnet"]},
    {"id": "claude-3-5-sonnet-v2-model", "name": "Claude 3.5 Sonnet v2", "type": "model", "group": "Anthropic Models", "description": "Updated Sonnet line paired with computer use.", "importance": 4, "aliases": ["claude 3.5 sonnet v2"]},
    {"id": "claude-3-5-haiku-model", "name": "Claude 3.5 Haiku", "type": "model", "group": "Anthropic Models", "description": "Fast updated Claude 3.5 line.", "importance": 3, "aliases": ["claude 3.5 haiku"]},
    {"id": "claude-3-7-sonnet-model", "name": "Claude 3.7 Sonnet", "type": "model", "group": "Anthropic Models", "description": "Extended-thinking Claude release heavily favored by developers.", "importance": 5, "aliases": ["claude 3.7 sonnet"]},
    {"id": "claude-4-5-model", "name": "Claude 4.5", "type": "model", "group": "Anthropic Models", "description": "Production computer-use Claude generation.", "importance": 5, "aliases": ["claude 4.5"]},
    {"id": "meena-model", "name": "Meena", "type": "model", "group": "Google Models", "description": "Early Google conversational model.", "importance": 3, "aliases": ["meena"]},
    {"id": "lamda-model", "name": "LaMDA", "type": "model", "group": "Google Models", "description": "Dialogue model central to Google's early chatbot push.", "importance": 4, "aliases": ["lamda"]},
    {"id": "palm-model", "name": "PaLM", "type": "model", "group": "Google Models", "description": "540B-parameter Google model associated with emergent abilities.", "importance": 4, "aliases": ["palm"]},
    {"id": "palm-2-model", "name": "PaLM 2", "type": "model", "group": "Google Models", "description": "More efficient PaLM follow-up.", "importance": 4, "aliases": ["palm 2"]},
    {"id": "gemini-ultra-model", "name": "Gemini Ultra", "type": "model", "group": "Google Models", "description": "Top-end Gemini 1.0 release.", "importance": 4, "aliases": ["gemini ultra", "ultra 1.0"]},
    {"id": "gemini-pro-model", "name": "Gemini Pro", "type": "model", "group": "Google Models", "description": "General-purpose Gemini 1.0 release.", "importance": 4, "aliases": ["gemini pro", "gemini 1.0 pro"]},
    {"id": "gemini-nano-model", "name": "Gemini Nano", "type": "model", "group": "Google Models", "description": "On-device Gemini 1.0 release.", "importance": 3, "aliases": ["gemini nano", "gemini 1.0 nano"]},
    {"id": "gemini-1-5-pro-model", "name": "Gemini 1.5 Pro", "type": "model", "group": "Google Models", "description": "Long-context Gemini release with million-token scale.", "importance": 5, "aliases": ["gemini 1.5 pro"]},
    {"id": "gemini-1-5-flash-model", "name": "Gemini 1.5 Flash", "type": "model", "group": "Google Models", "description": "Fast Gemini 1.5 deployment line.", "importance": 4, "aliases": ["gemini 1.5 flash"]},
    {"id": "gemini-2-0-flash-model", "name": "Gemini 2.0 Flash", "type": "model", "group": "Google Models", "description": "Low-latency multimodal and agentic Gemini release.", "importance": 4, "aliases": ["gemini 2.0 flash"]},
    {"id": "gemini-2-0-pro-model", "name": "Gemini 2.0 Pro", "type": "model", "group": "Google Models", "description": "Higher-end Gemini 2.0 line.", "importance": 4, "aliases": ["gemini 2.0 pro"]},
    {"id": "gemini-2-5-model", "name": "Gemini 2.5", "type": "model", "group": "Google Models", "description": "Competitive Gemini generation approaching GPT-5 level.", "importance": 4, "aliases": ["gemini 2.5"]},
    {"id": "gemini-3-model", "name": "Gemini 3", "type": "model", "group": "Google Models", "description": "Gemini generation that overtook OpenAI on some benchmarks in the document.", "importance": 5, "aliases": ["gemini 3"]},
    {"id": "gemma-3-model", "name": "Gemma 3", "type": "model", "group": "Google Models", "description": "Open-weight Google model line.", "importance": 3, "aliases": ["gemma 3"]},
    {"id": "alphafold-model", "name": "AlphaFold", "type": "model", "group": "Google Models", "description": "Protein structure prediction breakthrough.", "importance": 5, "aliases": ["alphafold"]},
    {"id": "alphaproof-model", "name": "AlphaProof", "type": "model", "group": "Google Models", "description": "Math-proof system from Google DeepMind.", "importance": 3, "aliases": ["alphaproof"]},
    {"id": "alphageometry-2-model", "name": "AlphaGeometry 2", "type": "model", "group": "Google Models", "description": "Olympiad-level geometry system.", "importance": 3, "aliases": ["alphageometry 2"]},
    {"id": "deepseek-llm-7b-model", "name": "DeepSeek LLM 7B", "type": "model", "group": "DeepSeek Models", "description": "Small open DeepSeek language model.", "importance": 3, "aliases": ["deepseek llm 7b"]},
    {"id": "deepseek-llm-67b-model", "name": "DeepSeek LLM 67B", "type": "model", "group": "DeepSeek Models", "description": "Larger early DeepSeek LLM release.", "importance": 3, "aliases": ["deepseek llm 67b"]},
    {"id": "deepseek-v2-model", "name": "DeepSeek V2", "type": "model", "group": "DeepSeek Models", "description": "Efficient MoE DeepSeek release.", "importance": 4, "aliases": ["deepseek v2"]},
    {"id": "deepseek-v3-model", "name": "DeepSeek V3", "type": "model", "group": "DeepSeek Models", "description": "671B MoE DeepSeek release that shocked Western labs on efficiency.", "importance": 5, "aliases": ["deepseek v3"]},
    {"id": "deepseek-r1-model", "name": "DeepSeek R1", "type": "model", "group": "DeepSeek Models", "description": "Reasoning release tied to the 2025 Sputnik moment.", "importance": 5, "aliases": ["deepseek r1"]},
    {"id": "deepseek-v4-pro-model", "name": "DeepSeek V4 Pro", "type": "model", "group": "DeepSeek Models", "description": "Long-context 2026 DeepSeek release.", "importance": 5, "aliases": ["deepseek-v4-pro", "deepseek v4 pro"]},
    {"id": "deepseek-v4-flash-model", "name": "DeepSeek V4 Flash", "type": "model", "group": "DeepSeek Models", "description": "Fast DeepSeek V4 deployment line.", "importance": 4, "aliases": ["deepseek-v4-flash", "deepseek v4 flash"]},
    {"id": "qwen-family", "name": "Qwen Family", "type": "model", "group": "Qwen Models", "description": "Alibaba's open and commercial model family spanning chat, coding, and reasoning variants.", "importance": 4, "aliases": ["qwen", "tongyi qianwen", "qwen family"]},
    {"id": "qwen-2-5-model", "name": "Qwen 2.5", "type": "model", "group": "Qwen Models", "description": "Widely deployed Qwen generation for coding and multilingual use.", "importance": 4, "aliases": ["qwen 2.5", "qwen2.5"]},
    {"id": "qwen-3-model", "name": "Qwen 3", "type": "model", "group": "Qwen Models", "description": "Successor Qwen generation emphasizing stronger reasoning and enterprise deployment.", "importance": 4, "aliases": ["qwen 3", "qwen3"]},
    {"id": "grok-family", "name": "Grok Family", "type": "model", "group": "xAI Models", "description": "xAI's Grok line integrated with social-native and realtime distribution channels.", "importance": 3, "aliases": ["grok", "grok family"]},
    {"id": "grok-3-model", "name": "Grok 3", "type": "model", "group": "xAI Models", "description": "Grok generation tied to xAI's large-scale compute expansion and benchmark campaigns.", "importance": 3, "aliases": ["grok 3", "grok3"]},
    {"id": "kimi-family", "name": "Kimi Family", "type": "model", "group": "Kimi Models", "description": "Moonshot AI's Kimi line spanning long-context, reasoning, and agentic releases.", "importance": 4, "aliases": ["kimi family", "kimi"]},
    {"id": "kimi-model", "name": "Kimi", "type": "model", "group": "Kimi Models", "description": "Moonshot AI's original Kimi assistant line.", "importance": 3, "aliases": ["kimi assistant", "kimi"]},
    {"id": "kimi-k1-5-model", "name": "Kimi K1.5", "type": "model", "group": "Kimi Models", "description": "Early long-context Kimi release.", "importance": 3, "aliases": ["kimi k1.5", "kimi k1-5"]},
    {"id": "kimi-k2-model", "name": "Kimi K2", "type": "model", "group": "Kimi Models", "description": "Open-source agentic Kimi release from Moonshot AI.", "importance": 4, "aliases": ["kimi k2"]},
    {"id": "kimi-k2-thinking-model", "name": "Kimi K2 Thinking", "type": "model", "group": "Kimi Models", "description": "Reasoning-oriented Kimi K2 variant.", "importance": 4, "aliases": ["kimi k2 thinking"]},
    {"id": "kimi-k2-5-model", "name": "Kimi K2.5", "type": "model", "group": "Kimi Models", "description": "Visual and coding-oriented Kimi release.", "importance": 4, "aliases": ["kimi k2.5"]},
    {"id": "kimi-k2-6-model", "name": "Kimi K2.6", "type": "model", "group": "Kimi Models", "description": "Visual agentic Kimi release for production tasks.", "importance": 4, "aliases": ["kimi k2.6"]},
    {"id": "deepmind-science", "name": "AI for Science", "type": "topic", "group": "Science", "description": "Scientific breakthroughs driven by model systems in biology, chemistry, and math.", "importance": 4, "aliases": ["alphafold", "protein folding", "drug discovery", "alphaproof", "alphageometry", "radiology"]},
    {"id": "agents", "name": "AI Agents", "type": "keyword", "group": "Workflows", "description": "Systems that act, browse, code, and coordinate multi-step work.", "importance": 5, "aliases": ["agent", "agents", "agentic ai", "autogpt", "babyagi", "computer use", "async coding agent"]},
    {"id": "coding-agents", "name": "Coding Agents", "type": "keyword", "group": "Workflows", "description": "Repo-aware systems that write code, run tools, and file pull requests.", "importance": 5, "aliases": ["copilot", "codex", "claude code", "devin", "jules", "windsurf", "cursor", "software engineer"]},
    {"id": "multimodal", "name": "Multimodal Systems", "type": "keyword", "group": "Capabilities", "description": "Models spanning text, image, audio, video, and interactive interfaces.", "importance": 5, "aliases": ["multimodal", "image input", "vision", "audio", "video", "omni", "voice", "text-to-video"]},
    {"id": "reasoning", "name": "Reasoning Models", "type": "keyword", "group": "Capabilities", "description": "Inference-time compute and deliberate reasoning as a distinct scaling axis.", "importance": 5, "aliases": ["reasoning", "extended thinking", "thinks before answering", "chain-of-thought", "o1", "o3", "o4-mini", "r1"]},
    {"id": "open-source", "name": "Open Source", "type": "keyword", "group": "Strategy", "description": "Open weights and ecosystem distribution as a strategic counterweight to API control.", "importance": 5, "aliases": ["open source", "open-source", "open weights", "open-weight", "commercial license", "leaked", "downloads in millions"]},
    {"id": "closed-source", "name": "Closed Source", "type": "keyword", "group": "Strategy", "description": "API-gated model access, monetization, and centralized safety control.", "importance": 4, "aliases": ["closed source", "closed-source", "api only", "api economy", "exclusive cloud"]},
    {"id": "regulation", "name": "AI Regulation", "type": "keyword", "group": "Policy", "description": "State attempts to contain, steer, or accelerate frontier model deployment.", "importance": 4, "aliases": ["regulation", "executive order", "ai act", "safety summit", "senate", "policy", "compliance", "licensing regime"]},
    {"id": "labor", "name": "AI Labor Displacement", "type": "keyword", "group": "Impact", "description": "Job compression, workforce restructuring, and AI-forward headcount logic.", "importance": 5, "aliases": ["layoffs", "job cuts", "headcount", "workforce", "buyouts", "displacement", "automation"]},
    {"id": "copyright", "name": "Copyright Conflict", "type": "keyword", "group": "Policy", "description": "Copyright disputes around training data, generated media, and licensing rights.", "importance": 4, "aliases": ["copyright", "getty images", "lawsuit", "artists", "music industry", "fake drake", "licensing deal"]},
    {"id": "safety", "name": "Safety vs Speed", "type": "keyword", "group": "Risk", "description": "Persistent tension between deployment velocity and control of model risks.", "importance": 5, "aliases": ["safety", "misuse concerns", "not consistently candid", "ai safety", "safety testing", "voluntary safety commitments"]},
    {"id": "chips", "name": "Chip Wars", "type": "keyword", "group": "Infrastructure", "description": "Hardware bottlenecks and chip geopolitics shaping the AI frontier.", "importance": 5, "aliases": ["gpu", "gpus", "chip", "chips", "semiconductor", "chip export controls", "hopper", "blackwell"]},
    {"id": "china", "name": "China AI Competition", "type": "keyword", "group": "Geopolitics", "description": "Chinese labs, export controls, and national competition over AI capability.", "importance": 5, "aliases": ["china", "chinese", "deepseek", "baidu", "tongyi", "ernie", "ccp", "government devices act"]},
    {"id": "context-windows", "name": "Long Context", "type": "keyword", "group": "Capabilities", "description": "Huge context windows turning entire documents and repos into model input.", "importance": 4, "aliases": ["context window", "context windows", "100k context", "128k context", "200k context", "1 million token", "2 million tokens", "10m token context"]},
    {"id": "benchmarks", "name": "Benchmark Battles", "type": "keyword", "group": "Measurement", "description": "Leaderboard competition, benchmark claims, and contest over what real capability means.", "importance": 4, "aliases": ["benchmark", "benchmarks", "leaderboard", "chatbot arena", "arc-agi", "imo", "swe-bench", "lmarena"]},
    {"id": "investment", "name": "Capital and Funding", "type": "keyword", "group": "Business", "description": "Mega-rounds, acqui-hires, and infrastructure capex dictating who gets to compete.", "importance": 4, "aliases": ["funding", "valuation", "series", "invests", "raises", "acquires", "acquisition", "capex", "committed"]},
    {"id": "robotics", "name": "Physical AI", "type": "keyword", "group": "Embodied", "description": "Robotics and embodied intelligence as the next frontier beyond software-only agents.", "importance": 3, "aliases": ["robotics", "physical ai", "figure", "boston dynamics", "optimus"]},
    {"id": "companions", "name": "AI Companions", "type": "keyword", "group": "Consumer", "description": "Persistent consumer relationship products blending utility with attachment.", "importance": 3, "aliases": ["companion", "companions", "pi personal ai", "character ai", "grok ai assistant"]},
    {"id": "education", "name": "Education Shift", "type": "keyword", "group": "Impact", "description": "Academic integrity shocks, tutors, and workflow changes in education.", "importance": 3, "aliases": ["universities", "academic", "khanmigo", "duolingo", "education", "bootcamp"]},
    {"id": "creative", "name": "Creative Industry Disruption", "type": "keyword", "group": "Impact", "description": "AI art, music, writing, and video altering media production and labor.", "importance": 4, "aliases": ["ai art", "midjourney art", "wga", "sag-aftra", "music industry", "deep fake", "pornography", "video generation"]},
    {"id": "science", "name": "Science Acceleration", "type": "keyword", "group": "Science", "description": "Scientific progress accelerated by AI systems in biology, chemistry, and medicine.", "importance": 4, "aliases": ["science", "healthcare", "diagnostic", "protein", "drug", "olympiad"]},
    {"id": "search", "name": "AI Search Shift", "type": "keyword", "group": "Consumer", "description": "Migration from classical search links to answer-engine style AI interaction.", "importance": 3, "aliases": ["ai search", "answer engine", "search disruption", "search replacement"]},
    {"id": "sam-altman", "name": "Sam Altman", "type": "person", "group": "People", "description": "OpenAI chief executive and central operator in the commercialization of frontier AI.", "importance": 4, "aliases": ["sam altman", "altman"]},
    {"id": "dario-amodei", "name": "Dario Amodei", "type": "person", "group": "People", "description": "Anthropic CEO and major advocate of safety-constrained frontier deployment.", "importance": 3, "aliases": ["dario amodei"]},
    {"id": "ilya-sutskever", "name": "Ilya Sutskever", "type": "person", "group": "People", "description": "Key researcher in deep learning and OpenAI board crisis participant later founding SSI.", "importance": 3, "aliases": ["ilya sutskever", "ssi", "safe superintelligence"]},
    {"id": "demis-hassabis", "name": "Demis Hassabis", "type": "person", "group": "People", "description": "DeepMind leader at the center of AI-for-science and Google's consolidated AI push.", "importance": 3, "aliases": ["demis hassabis"]},
    {"id": "jensen-huang", "name": "Jensen Huang", "type": "person", "group": "People", "description": "NVIDIA chief whose hardware bets became the core of AI infrastructure strategy.", "importance": 3, "aliases": ["jensen huang"]},
    {"id": "mustafa-suleyman", "name": "Mustafa Suleyman", "type": "person", "group": "People", "description": "DeepMind and Inflection co-founder later leading Microsoft AI.", "importance": 3, "aliases": ["mustafa suleyman"]},
    {"id": "geoffrey-hinton", "name": "Geoffrey Hinton", "type": "person", "group": "People", "description": "Deep learning pioneer whose warnings sharpened public AI risk discourse.", "importance": 3, "aliases": ["geoffrey hinton", "hinton"]},
    {"id": "yann-lecun", "name": "Yann LeCun", "type": "person", "group": "People", "description": "Meta chief scientist and major critic of near-term AI doom narratives.", "importance": 2, "aliases": ["yann lecun", "yann le cun"]},
    {"id": "mark-zuckerberg", "name": "Mark Zuckerberg", "type": "person", "group": "People", "description": "Meta chief executive behind the largest open-weight AI bet from a hyperscaler.", "importance": 2, "aliases": ["mark zuckerberg", "zuckerberg"]},
]
ALLOWED_MARKDOWN_TAGS = set(bleach.sanitizer.ALLOWED_TAGS).union(
    {"p", "br", "hr", "pre", "code", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td"}
)
ALLOWED_MARKDOWN_ATTRIBUTES = {
    **bleach.sanitizer.ALLOWED_ATTRIBUTES,
    "a": ["href", "title", "rel"],
    "th": ["colspan", "rowspan"],
    "td": ["colspan", "rowspan"],
}


class GraphStoreError(RuntimeError):
    pass


class GraphStoreCancelled(GraphStoreError):
    pass


def slugify(value: str) -> str:
    value = re.sub(r"[*_`]", "", value).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "item"


def clean_md(text: str) -> str:
    text = text.replace("\\*", "*").replace("\\#", "#").replace("\\_", "_").replace("\\.", ".")
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def title_from_text(text: str, fallback: str = "Untitled") -> str:
    text = clean_md(text)
    if not text:
        return fallback
    parts = re.split(r"[.:;]", text, maxsplit=1)
    title = parts[0].strip()
    words = title.split()
    if len(words) > 14:
        title = " ".join(words[:14]).rstrip(",")
    return title or fallback


def short_excerpt(text: str, limit: int = 180) -> str:
    cleaned = " ".join(clean_md(text).split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "..."


def render_markdown_safe(text: str) -> str:
    rendered = markdown.markdown(text, extensions=["fenced_code", "tables", "sane_lists", "nl2br"])
    return bleach.clean(
        rendered,
        tags=ALLOWED_MARKDOWN_TAGS,
        attributes=ALLOWED_MARKDOWN_ATTRIBUTES,
        protocols={"http", "https", "mailto"},
        strip=True,
    )


def timeline_month_key(date_text: str | None) -> str | None:
    if not date_text or date_text == "reference":
        return None
    match = re.match(r"^(20\d{2})(?:-(\d{2}))?(?:-(\d{2}))?$", date_text)
    if match:
        year, month = match.group(1), match.group(2) or "01"
        return f"{year}-{month}"
    year_match = re.search(r"\b(20\d{2})\b", date_text)
    if year_match:
        return f"{year_match.group(1)}-01"
    return None


def timeline_month_sort_key(month_key: str | None) -> tuple[int, int]:
    if not month_key:
        return (9999, 12)
    year, month = month_key.split("-", 1)
    return (int(year), int(month))


def month_range(start_month: str, end_month: str) -> list[str]:
    start_year, start_value = [int(part) for part in start_month.split("-", 1)]
    end_year, end_value = [int(part) for part in end_month.split("-", 1)]
    cursor_year = start_year
    cursor_month = start_value
    months = []
    while (cursor_year, cursor_month) <= (end_year, end_value):
        months.append(f"{cursor_year:04d}-{cursor_month:02d}")
        cursor_month += 1
        if cursor_month > 12:
            cursor_month = 1
            cursor_year += 1
    return months


def month_index_from_key(month_key: str | None) -> int | None:
    if not month_key:
        return None
    year, month = month_key.split("-", 1)
    return int(year) * 12 + int(month)


def timeline_day_sort_key(date_text: str | None) -> tuple[int, int, int]:
    if not date_text or date_text == "reference":
        return (0, 0, 0)
    match = re.match(r"^(20\d{2})(?:-(\d{2}))?(?:-(\d{2}))?$", date_text)
    if match:
        year = int(match.group(1))
        month = int(match.group(2) or "1")
        day = int(match.group(3) or "1")
        return (year, month, day)
    month_key = timeline_month_key(date_text)
    if month_key:
        year, month = month_key.split("-", 1)
        return (int(year), int(month), 1)
    year_match = re.search(r"\b(20\d{2})\b", date_text)
    if year_match:
        return (int(year_match.group(1)), 1, 1)
    return (0, 0, 0)


def cluster_role_for_entity_type(entity_type: str) -> str:
    return "timeline" if entity_type == "year" else "entity"


def graph_node_type(node_type: str, group_name: str) -> str:
    normalized_group = slugify(group_name)
    if node_type == "story":
        return "story"
    if node_type == "model":
        return "model"
    if node_type == "person":
        return "person"
    if node_type == "year":
        return "year"
    if node_type == "risk" or normalized_group in {"risk", "policy", "impact"}:
        return "risk"
    if node_type in {"keyword", "topic"}:
        return "topic"
    if normalized_group in {"consumer", "media", "platforms", "products"}:
        return "product"
    return "lab"


def graph_edge_type(source_type: str, target_type: str, relation: str) -> str:
    if source_type == "story":
        return f"story_to_{target_type}"
    if source_type == "year" and target_type == "story":
        return "year_to_story"
    if relation == "context":
        return "story_context"
    return f"{source_type}_to_{target_type}"


def _community_type_hint(type_names: list[str]) -> str | None:
    ordered_hints = {
        "model": "Models",
        "lab": "Labs",
        "product": "Products",
        "risk": "Risks",
        "topic": "Topics",
        "person": "People",
        "story": "Stories",
    }
    for type_name in type_names:
        hint = ordered_hints.get(type_name)
        if hint:
            return hint
    return None


@dataclass
class EntityRecord:
    id: str
    name: str
    entity_type: str
    group_name: str
    description: str
    importance: int
    cluster_id: int | None
    cluster_role: str | None
    story_count: int
    mention_count: int
    stories: list[dict[str, Any]]
    links: list[dict[str, Any]]
    category: str

    @property
    def excerpt(self) -> str:
        return short_excerpt(self.description, 150)


@dataclass
class StoryRecord:
    id: str
    title: str
    kind: str
    status: str
    event_date: str
    summary: str
    details_markdown: str
    details_html: str
    importance: int
    cluster_id: int | None
    cluster_role: str | None
    tags: list[str]
    entities: list[dict[str, Any]]
    related_stories: list[dict[str, Any]]
    era: str | None = None
    year: int | None = None

    @property
    def excerpt(self) -> str:
        return short_excerpt(self.summary, 185)


class GraphStore:
    def __init__(self, root_path: Path, source_path: Path | None = None, db_path: Path | None = None):
        self.root_path = Path(root_path)
        self.data_dir = self.root_path / "data"
        self.db_path = Path(db_path) if db_path is not None else self.data_dir / "ai_graph.db"
        self.seed_path = self.data_dir / "ai_graph_seed.json"
        self.source_path = Path(source_path) if source_path is not None else self.data_dir / "ai_master.md"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._signature: int | None = None
        self._graph_data_cache: GraphData | None = None
        self._entities: dict[str, EntityRecord] = {}
        self._stories: dict[str, StoryRecord] = {}
        self._entity_lookup = self._compile_entity_lookup()
        self._last_ingest_check: float = 0.0
        self._ingest_lock = threading.Lock()
        self.ensure_initialized()

    def _compile_entity_lookup(self) -> list[dict[str, Any]]:
        lookup = []
        for item in ENTITY_DEFINITIONS:
            aliases = item.get("aliases", []) + [item["name"]]
            patterns = [re.compile(rf"(?<!\w){re.escape(alias.lower())}(?!\w)") for alias in aliases]
            lookup.append({**item, "patterns": patterns})
        return lookup

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def get_graph_etag(self) -> str:
        self._refresh()
        return f"graph-{self._signature or 0}"

    def _compact_graph_node(self, node: dict[str, Any]) -> dict[str, Any]:
        compact = {
            "id": node["id"],
            "label": node["label"],
            "node_type": node["node_type"],
            "type": node["type"],
            "route": node["route"],
            "description": node["description"],
            "importance": node["importance"],
            "timeline_month": node["timeline_month"],
            "year": node["year"],
            "category": node.get("category"),
        }
        return {key: value for key, value in compact.items() if value not in (None, "")}

    def _compact_graph_edge(self, edge: dict[str, Any]) -> dict[str, Any]:
        return {
            "source": edge["source"],
            "target": edge["target"],
            "flow_kind": edge["flow_kind"],
        }

    def _table_columns(self, conn: sqlite3.Connection, table_name: str) -> set[str]:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()}

    def _ensure_cluster_columns(self, conn: sqlite3.Connection) -> None:
        table_columns = {
            "entities": {"cluster_id": "INTEGER", "cluster_role": "TEXT"},
            "stories": {"cluster_id": "INTEGER", "cluster_role": "TEXT"},
        }
        for table_name, columns in table_columns.items():
            existing = self._table_columns(conn, table_name)
            for column_name, column_type in columns.items():
                if column_name not in existing:
                    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")

    def _story_months_from_records(self, stories: list[sqlite3.Row | dict[str, Any]]) -> dict[str, str | None]:
        return {row["id"]: timeline_month_key(row["event_date"]) for row in stories}

    def _entity_first_seen_map(
        self,
        entities: list[sqlite3.Row | dict[str, Any]],
        entity_to_stories: dict[str, list[str]],
        story_months: dict[str, str | None],
        fallback_month: str,
    ) -> dict[str, str]:
        first_seen: dict[str, str] = {}
        for entity in entities:
            candidate_months = [
                story_months.get(story_id)
                for story_id in entity_to_stories.get(entity["id"], [])
                if story_months.get(story_id)
            ]
            if entity["entity_type"] == "year":
                candidate_months.append(f"{entity['name']}-01")
            first_seen[entity["id"]] = min(candidate_months, key=timeline_month_sort_key) if candidate_months else fallback_month
        return first_seen

    def _build_story_context_links(
        self,
        stories: list[sqlite3.Row | dict[str, Any]],
        story_to_entities: dict[str, list[str]],
    ) -> list[dict[str, Any]]:
        story_months = self._story_months_from_records(stories)
        ordered_stories = sorted(
            stories,
            key=lambda row: (
                timeline_month_sort_key(story_months.get(row["id"])),
                row["id"],
            ),
        )

        links: list[dict[str, Any]] = []
        for index, source_story in enumerate(ordered_stories):
            source_entity_ids = set(story_to_entities.get(source_story["id"], []))
            candidates: list[tuple[str, int]] = []
            for target_story in ordered_stories[index + 1 :]:
                overlap = len(source_entity_ids.intersection(story_to_entities.get(target_story["id"], [])))
                if overlap >= 3:
                    candidates.append((target_story["id"], overlap))

            source_month = story_months.get(source_story["id"])
            for target_id, weight in sorted(candidates, key=lambda item: (-item[1], item[0]))[:4]:
                target_month = story_months.get(target_id)
                valid_months = [month for month in (source_month, target_month) if month]
                links.append(
                    {
                        "source": source_story["id"],
                        "target": target_id,
                        "weight": weight,
                        "source_month": source_month,
                        "target_month": target_month,
                        "timeline_month": max(valid_months, key=timeline_month_sort_key) if valid_months else None,
                    }
                )
        return links

    def _pick_cluster_count(self, nontrivial_values: np.ndarray, node_count: int) -> int:
        nontrivial_count = int(nontrivial_values.shape[0])
        if node_count <= 1 or nontrivial_count <= 0:
            return 1

        valid_cluster_max = min(25, node_count, nontrivial_count)
        if valid_cluster_max < 2:
            return 1

        candidate_max = min(25, node_count - 1, nontrivial_count - 1)
        if candidate_max < 4:
            return max(2, valid_cluster_max)

        candidate_values = list(range(4, candidate_max + 1))
        gap_by_k = {
            cluster_count: float(nontrivial_values[cluster_count] - nontrivial_values[cluster_count - 1])
            for cluster_count in candidate_values
        }
        winning_k = max(candidate_values, key=lambda cluster_count: (gap_by_k[cluster_count], -cluster_count))
        winning_gap = gap_by_k[winning_k]
        previous_gap = float(nontrivial_values[winning_k - 1] - nontrivial_values[winning_k - 2]) if winning_k >= 2 else 0.0
        if previous_gap > 0 and winning_gap < previous_gap * 1.5:
            return min(max(5, 2), valid_cluster_max)
        return min(winning_k, valid_cluster_max)

    def _deterministic_cluster_chunks(
        self,
        node_ids: list[str],
        cluster_count: int,
        month_index_by_node: dict[str, int] | None = None,
    ) -> dict[str, int]:
        if cluster_count <= 1 or len(node_ids) <= 1:
            return {node_id: 0 for node_id in node_ids}
        ordered_ids = sorted(node_ids, key=lambda node_id: ((month_index_by_node or {}).get(node_id, 0), node_id))
        assignments: dict[str, int] = {}
        for index, node_id in enumerate(ordered_ids):
            label = min(cluster_count - 1, (index * cluster_count) // len(ordered_ids))
            assignments[node_id] = label
        return assignments

    def _fixed_k_spectral_assignments(
        self,
        node_ids: list[str],
        weighted_edges: list[tuple[str, str, float]],
        cluster_count: int,
        month_index_by_node: dict[str, int],
    ) -> dict[str, int]:
        effective_cluster_count = min(max(cluster_count, 1), len(node_ids))
        if effective_cluster_count <= 1 or len(node_ids) <= 1:
            return {node_id: 0 for node_id in node_ids}

        ordered_ids = sorted(node_ids)
        index_by_id = {node_id: index for index, node_id in enumerate(ordered_ids)}
        adjacency = np.zeros((len(ordered_ids), len(ordered_ids)), dtype=np.float64)

        for left_id, right_id, weight in weighted_edges:
            left_index = index_by_id.get(left_id)
            right_index = index_by_id.get(right_id)
            if left_index is None or right_index is None or left_index == right_index:
                continue
            adjacency[left_index, right_index] += max(weight, 0.0)
            adjacency[right_index, left_index] += max(weight, 0.0)

        if not np.any(adjacency):
            return self._deterministic_cluster_chunks(ordered_ids, effective_cluster_count, month_index_by_node)

        degrees = adjacency.sum(axis=1)
        laplacian = np.diag(degrees) - adjacency
        inv_sqrt_degrees = np.zeros_like(degrees)
        nonzero = degrees > 0
        inv_sqrt_degrees[nonzero] = 1.0 / np.sqrt(degrees[nonzero])
        normalized_laplacian = np.diag(inv_sqrt_degrees) @ laplacian @ np.diag(inv_sqrt_degrees)

        eigenvalues, eigenvectors = np.linalg.eigh(normalized_laplacian)
        ordering = np.argsort(eigenvalues)
        eigenvalues = eigenvalues[ordering]
        eigenvectors = eigenvectors[:, ordering]
        nontrivial_positions = np.where(eigenvalues > 1e-9)[0]
        usable_dimensions = int(nontrivial_positions.size)
        if usable_dimensions < 1:
            return self._deterministic_cluster_chunks(ordered_ids, effective_cluster_count, month_index_by_node)
        if usable_dimensions < effective_cluster_count:
            return self._deterministic_cluster_chunks(ordered_ids, effective_cluster_count, month_index_by_node)

        embedding = eigenvectors[:, nontrivial_positions[:effective_cluster_count]]
        model = KMeans(n_clusters=effective_cluster_count, init="k-means++", n_init=1, random_state=42)
        labels = model.fit_predict(embedding)

        cluster_members: dict[int, list[str]] = defaultdict(list)
        for node_id, label in zip(ordered_ids, labels, strict=True):
            cluster_members[int(label)].append(node_id)

        max_cluster_size = max(len(members) for members in cluster_members.values())
        if max_cluster_size > max(60, math.ceil(len(ordered_ids) / effective_cluster_count) * 2):
            return self._deterministic_cluster_chunks(ordered_ids, effective_cluster_count, month_index_by_node)

        ordered_labels = sorted(
            cluster_members,
            key=lambda label: (
                sum(month_index_by_node.get(node_id, 0) for node_id in cluster_members[label]) / max(len(cluster_members[label]), 1),
                min(cluster_members[label]),
            ),
        )
        remap = {label: index for index, label in enumerate(ordered_labels)}
        return {node_id: remap[int(label)] for node_id, label in zip(ordered_ids, labels, strict=True)}

    def _compute_display_clusters(
        self,
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
    ) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
        non_timeline_nodes = [
            node for node in nodes
            if node["cluster_id"] is not None and node["cluster_role"] != "timeline"
        ]
        members_by_parent: dict[int, list[dict[str, Any]]] = defaultdict(list)
        month_index_by_node = {node["id"]: int(node.get("month_index") or 0) for node in non_timeline_nodes}
        node_by_id = {node["id"]: node for node in non_timeline_nodes}
        for node in non_timeline_nodes:
            members_by_parent[int(node["cluster_id"])].append(node)

        intra_cluster_edges: dict[int, list[tuple[str, str, float]]] = defaultdict(list)
        for edge in edges:
            if edge["flow_kind"] not in {"mention", "context", "support"}:
                continue
            source = node_by_id.get(edge["source"])
            target = node_by_id.get(edge["target"])
            if source is None or target is None:
                continue
            if source["cluster_id"] != target["cluster_id"]:
                continue
            intra_cluster_edges[int(source["cluster_id"])].append(
                (edge["source"], edge["target"], float(edge.get("weight", 1) or 1))
            )

        community_specs: list[dict[str, Any]] = []
        for parent_cluster_id in sorted(members_by_parent):
            members = members_by_parent[parent_cluster_id]
            member_ids = sorted(node["id"] for node in members)
            if len(member_ids) <= DISPLAY_CLUSTER_REFINEMENT_THRESHOLD:
                community_specs.append(
                    {
                        "parent_cluster_id": None,
                        "source_cluster_id": parent_cluster_id,
                        "node_ids": member_ids,
                    }
                )
                continue

            target_count = min(
                DISPLAY_CLUSTER_MAX_COUNT,
                max(2, math.ceil(len(member_ids) / DISPLAY_CLUSTER_TARGET_SIZE)),
            )
            local_assignments = self._fixed_k_spectral_assignments(
                member_ids,
                intra_cluster_edges.get(parent_cluster_id, []),
                target_count,
                month_index_by_node,
            )

            local_members: dict[int, list[str]] = defaultdict(list)
            for node_id, label in local_assignments.items():
                local_members[int(label)].append(node_id)

            ordered_local_labels = sorted(
                local_members,
                key=lambda label: (
                    sum(month_index_by_node.get(node_id, 0) for node_id in local_members[label]) / max(len(local_members[label]), 1),
                    min(local_members[label]),
                ),
            )
            for local_label in ordered_local_labels:
                community_specs.append(
                    {
                        "parent_cluster_id": parent_cluster_id,
                        "source_cluster_id": parent_cluster_id,
                        "node_ids": sorted(local_members[local_label]),
                    }
                )

        ordered_specs = sorted(
            community_specs,
            key=lambda spec: (
                sum(month_index_by_node.get(node_id, 0) for node_id in spec["node_ids"]) / max(len(spec["node_ids"]), 1),
                min(spec["node_ids"]),
            ),
        )

        display_meta_by_node: dict[str, dict[str, Any]] = {}
        communities: list[dict[str, Any]] = []
        for display_cluster_id, spec in enumerate(ordered_specs):
            members = [node_by_id[node_id] for node_id in spec["node_ids"] if node_id in node_by_id]
            type_counts = Counter(member["type"] for member in members)
            dominant_types = [name for name, _count in type_counts.most_common(3)]
            story_members = sorted(
                (member for member in members if member["node_type"] == "story"),
                key=lambda member: (
                    -(member.get("importance") or 0),
                    -(member.get("month_index") or -1),
                    member["id"],
                ),
            )
            label = self._community_label(display_cluster_id, members, story_members, dominant_types)
            for node_id in spec["node_ids"]:
                display_meta_by_node[node_id] = {
                    "display_cluster_id": display_cluster_id,
                    "display_cluster_label": label,
                    "parent_cluster_id": spec["parent_cluster_id"],
                }

            community_entry = {
                "id": display_cluster_id,
                "label": label,
                "node_ids": spec["node_ids"],
                "node_count": len(spec["node_ids"]),
                "story_count": sum(1 for member in members if member["node_type"] == "story"),
                "entity_count": sum(1 for member in members if member["node_type"] == "entity"),
                "dominant_types": dominant_types,
                "anchor_story_ids": [member["id"] for member in story_members[:3]],
            }
            if spec["parent_cluster_id"] is not None:
                community_entry["parent_cluster_id"] = spec["parent_cluster_id"]
            communities.append(community_entry)

        return display_meta_by_node, communities

    def _community_label(
        self,
        display_cluster_id: int,
        members: list[dict[str, Any]],
        story_members: list[dict[str, Any]],
        dominant_types: list[str],
    ) -> str:
        entity_candidates = sorted(
            (
                member
                for member in members
                if member["node_type"] == "entity" and member.get("type") != "year"
            ),
            key=lambda member: (
                -(member.get("importance") or 0),
                -(member.get("story_count") or 0),
                member["label"],
            ),
        )
        unique_entity_labels: list[str] = []
        seen_entity_labels: set[str] = set()
        for member in entity_candidates:
            label = clean_md(member["label"])
            normalized = label.lower()
            if not label or normalized in seen_entity_labels:
                continue
            seen_entity_labels.add(normalized)
            unique_entity_labels.append(label)
            if len(unique_entity_labels) == 3:
                break

        if len(unique_entity_labels) >= 2:
            return f"{unique_entity_labels[0]} + {unique_entity_labels[1]}"
        if unique_entity_labels:
            type_hint = _community_type_hint(dominant_types)
            if type_hint and unique_entity_labels[0] != type_hint:
                return f"{unique_entity_labels[0]} / {type_hint}"
            return unique_entity_labels[0]

        story_candidates = [title_from_text(member["label"], fallback=member["label"]) for member in story_members if clean_md(member["label"])]
        story_candidates = [
            candidate
            for candidate in story_candidates
            if candidate
            and re.search(r"[A-Za-z]", candidate)
            and not re.fullmatch(r"[0-9 .\-]+", candidate)
        ]
        if story_candidates:
            type_hint = _community_type_hint(dominant_types)
            if type_hint and type_hint.lower() not in story_candidates[0].lower():
                return f"{story_candidates[0]} / {type_hint}"
            return story_candidates[0]

        type_hint = _community_type_hint(dominant_types) or "Cluster"
        return f"{type_hint} {display_cluster_id + 1}"

    def _compute_cluster_assignments(self, conn: sqlite3.Connection) -> tuple[dict[str, int], int]:
        conn.row_factory = sqlite3.Row
        story_rows = conn.execute(
            "SELECT id, event_date, importance FROM stories"
        ).fetchall()
        entity_rows = conn.execute(
            "SELECT id, name, entity_type, importance FROM entities"
        ).fetchall()
        story_entity_rows = conn.execute(
            "SELECT story_id, entity_id FROM story_entities"
        ).fetchall()
        entity_link_rows = conn.execute(
            "SELECT source_id, target_id, weight FROM entity_links WHERE relation = 'co-mentioned'"
        ).fetchall()

        story_to_entities: dict[str, list[str]] = defaultdict(list)
        entity_to_stories: dict[str, list[str]] = defaultdict(list)
        for row in story_entity_rows:
            story_to_entities[row["story_id"]].append(row["entity_id"])
            entity_to_stories[row["entity_id"]].append(row["story_id"])

        story_months = self._story_months_from_records(story_rows)
        known_story_months = sorted((month for month in story_months.values() if month), key=timeline_month_sort_key)
        fallback_month = known_story_months[0] if known_story_months else "2020-01"
        entity_first_seen = self._entity_first_seen_map(entity_rows, entity_to_stories, story_months, fallback_month)
        context_links = self._build_story_context_links(story_rows, story_to_entities)

        month_index_by_composite: dict[str, int] = {}
        composite_ids = [f"story:{row['id']}" for row in story_rows]
        composite_ids.extend(f"entity:{row['id']}" for row in entity_rows if row["entity_type"] != "year")
        composite_ids = sorted(composite_ids)

        for row in story_rows:
            composite_id = f"story:{row['id']}"
            month_index_by_composite[composite_id] = month_index_from_key(story_months.get(row["id"])) or month_index_from_key(fallback_month) or 0
        for row in entity_rows:
            if row["entity_type"] == "year":
                continue
            composite_id = f"entity:{row['id']}"
            month_index_by_composite[composite_id] = month_index_from_key(entity_first_seen.get(row["id"])) or month_index_from_key(fallback_month) or 0

        if not composite_ids:
            return {}, 0

        if len(composite_ids) == 1:
            return {composite_ids[0]: 0}, 1

        index_by_composite = {composite_id: index for index, composite_id in enumerate(composite_ids)}
        adjacency = np.zeros((len(composite_ids), len(composite_ids)), dtype=np.float64)

        def add_weight(left_id: str, right_id: str, weight: float) -> None:
            left_index = index_by_composite.get(left_id)
            right_index = index_by_composite.get(right_id)
            if left_index is None or right_index is None or left_index == right_index:
                return
            adjacency[left_index, right_index] += weight
            adjacency[right_index, left_index] += weight

        for row in story_entity_rows:
            entity_key = f"entity:{row['entity_id']}"
            if entity_key not in index_by_composite:
                continue
            add_weight(f"story:{row['story_id']}", entity_key, 1.0)

        for row in entity_link_rows:
            add_weight(f"entity:{row['source_id']}", f"entity:{row['target_id']}", max(1, row["weight"]) * 0.75)

        for link in context_links:
            add_weight(f"story:{link['source']}", f"story:{link['target']}", link["weight"] * 0.45)

        degrees = adjacency.sum(axis=1)
        laplacian = np.diag(degrees) - adjacency
        inv_sqrt_degrees = np.zeros_like(degrees)
        nonzero = degrees > 0
        inv_sqrt_degrees[nonzero] = 1.0 / np.sqrt(degrees[nonzero])
        d_inv_sqrt = np.diag(inv_sqrt_degrees)
        normalized_laplacian = d_inv_sqrt @ laplacian @ d_inv_sqrt

        eigenvalues, eigenvectors = np.linalg.eigh(normalized_laplacian)
        ordering = np.argsort(eigenvalues)
        eigenvalues = eigenvalues[ordering]
        eigenvectors = eigenvectors[:, ordering]
        nontrivial_positions = np.where(eigenvalues > 1e-9)[0]

        if nontrivial_positions.size == 0:
            assignments = {composite_id: 0 for composite_id in composite_ids}
            return assignments, 1

        nontrivial_values = eigenvalues[nontrivial_positions]
        cluster_count = self._pick_cluster_count(nontrivial_values, len(composite_ids))
        if cluster_count <= 1:
            assignments = {composite_id: 0 for composite_id in composite_ids}
            return assignments, 1

        embedding_positions = nontrivial_positions[:cluster_count]
        embedding = eigenvectors[:, embedding_positions]
        model = KMeans(n_clusters=cluster_count, init="k-means++", n_init=1, random_state=42)
        labels = model.fit_predict(embedding)

        cluster_members: dict[int, list[str]] = defaultdict(list)
        for composite_id, label in zip(composite_ids, labels, strict=True):
            cluster_members[int(label)].append(composite_id)

        ordered_clusters = sorted(
            cluster_members,
            key=lambda label: (
                min(month_index_by_composite[composite_id] for composite_id in cluster_members[label]),
                min(cluster_members[label]),
            ),
        )
        remap = {original_label: new_label for new_label, original_label in enumerate(ordered_clusters)}
        assignments = {composite_id: remap[int(label)] for composite_id, label in zip(composite_ids, labels, strict=True)}
        return assignments, len(ordered_clusters)

    def _persist_cluster_assignments(self, conn: sqlite3.Connection) -> int:
        assignments, cluster_count = self._compute_cluster_assignments(conn)

        conn.execute("UPDATE stories SET cluster_id = NULL, cluster_role = 'story'")
        conn.execute(
            """
            UPDATE entities
            SET cluster_id = NULL,
                cluster_role = CASE WHEN entity_type = 'year' THEN 'timeline' ELSE 'entity' END
            """
        )

        story_updates = []
        entity_updates = []
        for composite_id, cluster_id in assignments.items():
            node_kind, node_id = composite_id.split(":", 1)
            if node_kind == "story":
                story_updates.append((cluster_id, node_id))
            else:
                entity_updates.append((cluster_id, node_id))

        if story_updates:
            conn.executemany("UPDATE stories SET cluster_id = ? WHERE id = ?", story_updates)
        if entity_updates:
            conn.executemany("UPDATE entities SET cluster_id = ? WHERE id = ?", entity_updates)

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            ("community_count", str(cluster_count)),
        )
        return cluster_count

    def _source_signature(self) -> str:
        if self.source_path.exists():
            return f"{DATASET_VERSION}:{int(self.source_path.stat().st_mtime_ns)}"
        return f"{DATASET_VERSION}:fallback"

    def _check_cancelled(self, cancel_event: Any | None) -> None:
        if cancel_event is not None and getattr(cancel_event, "is_set", lambda: False)():
            raise GraphStoreCancelled("Database rebuild cancelled.")

    def _validate_payload(self, payload: dict[str, Any]) -> None:
        required_top_level = {"entities", "stories", "story_entities", "story_tags", "entity_links"}
        missing = sorted(required_top_level.difference(payload))
        if missing:
            raise GraphStoreError(f"Dataset payload is missing required keys: {', '.join(missing)}")
        for key in required_top_level:
            if not isinstance(payload[key], list):
                raise GraphStoreError(f"Dataset payload field '{key}' must be a list.")

    def ensure_initialized(self) -> None:
        try:
            with self._connect() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS meta (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS entities (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        entity_type TEXT NOT NULL,
                        group_name TEXT NOT NULL,
                        description TEXT NOT NULL,
                        importance INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS stories (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        kind TEXT NOT NULL,
                        status TEXT NOT NULL,
                        event_date TEXT NOT NULL,
                        summary TEXT NOT NULL,
                        details TEXT NOT NULL,
                        importance INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS story_entities (
                        story_id TEXT NOT NULL,
                        entity_id TEXT NOT NULL,
                        PRIMARY KEY (story_id, entity_id)
                    );
                    CREATE TABLE IF NOT EXISTS story_tags (
                        story_id TEXT NOT NULL,
                        tag TEXT NOT NULL,
                        PRIMARY KEY (story_id, tag)
                    );
                    CREATE TABLE IF NOT EXISTS entity_links (
                        source_id TEXT NOT NULL,
                        target_id TEXT NOT NULL,
                        relation TEXT NOT NULL,
                        weight INTEGER NOT NULL DEFAULT 1,
                        PRIMARY KEY (source_id, target_id, relation)
                    );
                    """
                )
                self._ensure_cluster_columns(conn)
                from webapp.db import run_migrations
                run_migrations(conn)
                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("schema_version", SCHEMA_VERSION))
                row = conn.execute("SELECT value FROM meta WHERE key = 'source_signature'").fetchone()
                count = conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0]
        except sqlite3.DatabaseError as exc:
            logger.error(f"Failed to initialize the AI graph database: {exc}")
            raise GraphStoreError("Failed to initialize the AI graph database.") from exc
        if count == 0 or not row or row[0] != self._source_signature():
            logger.info("Refreshing graph database from {}", self.source_path)
            self.seed_database(reset=True)

    def seed_database(self, reset: bool = False, cancel_event: Any | None = None) -> None:
        try:
            if self.source_path.exists():
                payload = self._build_payload_from_master_document(cancel_event=cancel_event)
            elif self.seed_path.exists():
                payload = json.loads(self.seed_path.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    # Append supplemental model stories to ensure model-release kind is present
                    stories = payload.setdefault("stories", [])
                    seen_story_ids = {s["id"] for s in stories}
                    for story in self._supplemental_model_stories():
                        if story["id"] not in seen_story_ids:
                            stories.append(story)

                    # Ensure any entity referenced by supplemental stories exists in payload["entities"]
                    entities = payload.setdefault("entities", [])
                    seen_entity_ids = {e["id"] for e in entities}
                    entity_defs = {item["id"]: item for item in ENTITY_DEFINITIONS}
                    for story in stories:
                        ent_ids = story.get("entities", story.get("entity_ids", []))
                        for ent_id in ent_ids:
                            if ent_id not in seen_entity_ids and ent_id in entity_defs:
                                ent_record = self._entity_record(entity_defs[ent_id])
                                entities.append(ent_record)
                                seen_entity_ids.add(ent_id)

                    if "story_entities" not in payload or "story_tags" not in payload:
                        story_entities = []
                        story_tags = []
                        for story in stories:
                            story_id = story.get("id")
                            if story_id:
                                ent_ids = story.get("entities", story.get("entity_ids", []))
                                for ent_id in ent_ids:
                                    story_entities.append((story_id, ent_id))
                                for tag in story.get("tags", []):
                                    story_tags.append((story_id, tag))
                        if "story_entities" not in payload:
                            payload["story_entities"] = story_entities
                        if "story_tags" not in payload:
                            payload["story_tags"] = story_tags
                    if "entity_links" not in payload:
                        payload["entity_links"] = self._build_entity_links(stories, payload.get("story_entities", []))
            else:
                raise GraphStoreError(
                    f"No dataset source was found. Set AI_MASTER_DOC_PATH or add a seed file at {self.seed_path}."
                )
            self._validate_payload(payload)
            self._check_cancelled(cancel_event)
        except GraphStoreError:
            raise
        except (OSError, json.JSONDecodeError, KeyError, ValueError) as exc:
            logger.error(f"Failed to load or parse the AI graph source data: {exc}")
            raise GraphStoreError("Failed to load or parse the AI graph source data.") from exc

        try:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                if reset:
                    conn.executescript(
                        """
                        DELETE FROM meta;
                        DELETE FROM entity_links;
                        DELETE FROM story_tags;
                        DELETE FROM story_entities;
                        DELETE FROM stories;
                        DELETE FROM entities;
                        """
                    )

                self._check_cancelled(cancel_event)
                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("dataset_name", payload.get("name", "AI Signal Graph")))
                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("source_signature", self._source_signature()))
                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("source_path", str(self.source_path)))
                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("schema_version", SCHEMA_VERSION))

                for ent in payload.get("entities", []):
                    if "category" not in ent or ent["category"] is None:
                        name = ent.get("name", "")
                        ent_id = ent.get("id", "")
                        ent_type = ent.get("type", ent.get("entity_type", ""))
                        group_name = ent.get("group", ent.get("group_name", ""))
                        job_role_pattern = re.compile(
                            r"\b(?:job[\s-]?role|labor|career|salary|hiring|layoff|displacement|workforce|employment)\b",
                            re.IGNORECASE
                        )
                        if ent_id.startswith("job-role-") or job_role_pattern.search(name) or job_role_pattern.search(ent_id):
                            ent["category"] = "job_role"
                        elif ent_type == "company" or (group_name and group_name.lower() in {"labs", "companies", "platforms", "infrastructure", "capital"}):
                            ent["category"] = "organization"
                        else:
                            ent["category"] = "topic"

                    # Ensure all binding parameter keys are present in the dictionary
                    ent.setdefault("id", "")
                    ent.setdefault("name", "")
                    ent.setdefault("type", ent.get("entity_type", ""))
                    ent.setdefault("group", ent.get("group_name", ""))
                    ent.setdefault("description", "")
                    ent.setdefault("importance", 0)

                conn.executemany(
                    "INSERT INTO entities (id, name, entity_type, group_name, description, importance, category) VALUES (:id, :name, :type, :group, :description, :importance, :category)",
                    payload["entities"],
                )
                for story in payload.get("stories", []):
                    date = story.get("date", story.get("event_date", ""))
                    year = story.get("year")
                    if year is None and date:
                        try:
                            year = int(date[:4])
                        except ValueError:
                            pass
                    story["year"] = year

                    if "era" not in story or not story["era"]:
                        if year is not None:
                            from scraper.sources import classify_era
                            story["era"] = classify_era(year)
                        else:
                            story["era"] = "frontier"

                    story.setdefault("id", "")
                    story.setdefault("title", "")
                    story.setdefault("kind", "")
                    story.setdefault("status", "")
                    story.setdefault("date", date)
                    story.setdefault("summary", "")
                    story.setdefault("details", "")
                    story.setdefault("importance", 1)

                conn.executemany(
                    "INSERT INTO stories (id, title, kind, status, event_date, summary, details, importance, era, year) VALUES (:id, :title, :kind, :status, :date, :summary, :details, :importance, :era, :year)",
                    payload["stories"],
                )
                conn.executemany("INSERT INTO story_entities (story_id, entity_id) VALUES (?, ?)", payload["story_entities"])
                conn.executemany("INSERT INTO story_tags (story_id, tag) VALUES (?, ?)", payload["story_tags"])
                conn.executemany(
                    "INSERT INTO entity_links (source_id, target_id, relation, weight) VALUES (:source, :target, :relation, :weight)",
                    payload["entity_links"],
                )
                self._check_cancelled(cancel_event)
                self._persist_cluster_assignments(conn)
        except sqlite3.DatabaseError as exc:
            raise GraphStoreError("Failed to rebuild the AI graph database.") from exc

        self._signature = None
        self._graph_data_cache = None
        self._refresh()

    def _build_payload_from_master_document(self, cancel_event: Any | None = None) -> dict[str, Any]:
        lines = self.source_path.read_text(encoding="utf-8").splitlines()
        stories: list[dict[str, Any]] = []
        seen: set[str] = set()
        current_section = ""
        current_subsection = ""
        current_year = ""
        i = 0

        while i < len(lines):
            if i % 250 == 0:
                self._check_cancelled(cancel_event)
            raw = lines[i].rstrip()
            line = raw.strip()

            if not line:
                i += 1
                continue

            if line.startswith("## "):
                current_section = clean_md(line.lstrip("# ").strip())
                current_subsection = ""
                year_match = re.search(r"\b(20\d{2})\b", current_section)
                current_year = year_match.group(1) if year_match else current_year
                i += 1
                continue

            if line.startswith("### "):
                current_subsection = clean_md(line.lstrip("# ").strip())
                year_match = re.search(r"\b(20\d{2})\b", current_subsection)
                if year_match:
                    current_year = year_match.group(1)
                i += 1
                continue

            if line.startswith("|"):
                rows = []
                while i < len(lines) and lines[i].strip().startswith("|"):
                    row = lines[i].strip()
                    if not re.search(r"\|[\s:-]+\|", row):
                        rows.append(row)
                    i += 1
                for row in rows:
                    story = self._story_from_table_row(row, current_section, current_subsection, current_year)
                    if story:
                        self._append_story(stories, seen, story)
                continue

            if line.startswith("* "):
                bullet = clean_md(line[2:])
                story = self._story_from_bullet(bullet, current_section, current_subsection, current_year)
                if story:
                    self._append_story(stories, seen, story)
                i += 1
                continue

            if len(line) > 80 and current_section:
                story = self._story_from_paragraph(clean_md(line), current_section, current_subsection, current_year)
                if story:
                    self._append_story(stories, seen, story)
            i += 1

        for story in self._supplemental_model_stories():
            self._append_story(stories, seen, story)

        connected_entities: set[str] = set()
        synthetic_entity_map: dict[str, dict[str, Any]] = {}
        story_entities: list[tuple[str, str]] = []
        story_tags: list[tuple[str, str]] = []
        for story in stories:
            for entity in story.pop("synthetic_entities", []):
                synthetic_entity_map.setdefault(entity["id"], entity)
            for entity_id in story.pop("entity_ids"):
                connected_entities.add(entity_id)
                story_entities.append((story["id"], entity_id))
            for tag in story["tags"]:
                story_tags.append((story["id"], tag))

        entity_map = {item["id"]: item for item in ENTITY_DEFINITIONS}
        entity_map.update(synthetic_entity_map)
        entities = [self._entity_record(entity_map[entity_id]) for entity_id in sorted(connected_entities)]
        entity_links = self._build_entity_links(stories, story_entities)
        return {
            "name": "AI Signal Graph",
            "entities": entities,
            "stories": stories,
            "story_entities": story_entities,
            "story_tags": story_tags,
            "entity_links": entity_links,
        }

    def _supplemental_model_stories(self) -> list[dict[str, Any]]:
        return [
            {
                "id": "2023-10-kimi-assistant-launch",
                "title": "Kimi assistant established Moonshot AI's long-context consumer presence",
                "kind": "model-release",
                "status": "historical",
                "date": "2023-10",
                "summary": "Moonshot AI's Kimi line entered the conversation as a long-context assistant and gave the lab a recognizable consumer surface.",
                "details": "## Detail\n\nMoonshot AI's Kimi assistant line established the company's early identity around long context and consumer-facing access.",
                "importance": 3,
                "tags": ["model-release", "kimi", "moonshot", "2023"],
                "entity_ids": ["moonshot-ai", "kimi-family", "kimi-model", "china", "year-2023"],
            },
            {
                "id": "2024-11-kimi-k1-5",
                "title": "Kimi K1.5 pushed Moonshot deeper into long-context competition",
                "kind": "model-release",
                "status": "watch",
                "date": "2024-11",
                "summary": "The K1.5 line extended Moonshot AI's relevance in the Chinese model race around large context windows and stronger reasoning behavior.",
                "details": "## Detail\n\nMoonshot AI's Kimi K1.5 represented Moonshot AI's stronger push into the long-context and reasoning conversation.",
                "importance": 3,
                "tags": ["model-release", "kimi", "moonshot", "long-context", "2024"],
                "entity_ids": ["moonshot-ai", "kimi-family", "kimi-k1-5-model", "context-windows", "china", "year-2024"],
            },
            {
                "id": "2025-07-kimi-k2",
                "title": "Kimi K2 positioned Moonshot AI as an open-source agentic competitor",
                "kind": "model-release",
                "status": "active",
                "date": "2025-07",
                "summary": "Kimi K2 was presented as an open-source agentic model with strong coding and workflow ambitions, expanding the Chinese open-model field beyond DeepSeek and Qwen narratives.",
                "details": "## Detail\n\nMoonshot AI framed Kimi K2 as an open and agent-oriented release with stronger coding workflows and model integration paths.",
                "importance": 4,
                "tags": ["model-release", "kimi", "moonshot", "agents", "open-source", "2025"],
                "entity_ids": ["moonshot-ai", "kimi-family", "kimi-k2-model", "agents", "open-source", "china", "year-2025"],
            },
            {
                "id": "2025-11-kimi-k2-thinking",
                "title": "Kimi K2 Thinking added a reasoning-flavored branch to Moonshot's lineup",
                "kind": "model-release",
                "status": "active",
                "date": "2025-11",
                "summary": "Moonshot AI extended the K2 line with a more deliberate reasoning-oriented variant, aligning with the broader industry move toward visible or specialized thinking modes.",
                "details": "## Detail\n\nKimi K2 Thinking leaned into reasoning and agent improvement at a time when inference-time deliberation had become a major frontier theme.",
                "importance": 4,
                "tags": ["model-release", "kimi", "moonshot", "reasoning", "2025"],
                "entity_ids": ["moonshot-ai", "kimi-family", "kimi-k2-thinking-model", "reasoning", "china", "year-2025"],
            },
            {
                "id": "2026-01-kimi-k2-5",
                "title": "Kimi K2.5 expanded Moonshot into visual coding and agent work",
                "kind": "model-release",
                "status": "active",
                "date": "2026-01",
                "summary": "Kimi K2.5 pushed Moonshot AI further into multimodal coding and agent workflows, strengthening Kimi's relevance in practical software tasks.",
                "details": "## Detail\n\nKimi K2.5 extended the K2 family with stronger coding and multimodal workflow positioning.",
                "importance": 4,
                "tags": ["model-release", "kimi", "moonshot", "coding", "multimodal", "2026"],
                "entity_ids": ["moonshot-ai", "kimi-family", "kimi-k2-5-model", "coding-agents", "multimodal", "china", "year-2026"],
            },
            {
                "id": "2026-04-kimi-k2-6",
                "title": "Kimi K2.6 emphasized visual agentic work for real production tasks",
                "kind": "model-release",
                "status": "active",
                "date": "2026-04",
                "summary": "Kimi K2.6 was positioned as a visual agentic model for real-world work, giving the Kimi line a stronger production and computer-use identity.",
                "details": "## Detail\n\nKimi K2.6 sharpened Moonshot AI's pitch around visual agents, coding, and practical task execution.",
                "importance": 4,
                "tags": ["model-release", "kimi", "moonshot", "visual", "agents", "2026"],
                "entity_ids": ["moonshot-ai", "kimi-family", "kimi-k2-6-model", "agents", "multimodal", "china", "year-2026"],
            },
            {
                "id": "2025-01-deepseek-r1-reasoning-shock",
                "title": "DeepSeek R1 accelerated open reasoning adoption across the industry",
                "kind": "model-release",
                "status": "active",
                "date": "2025-01",
                "summary": "DeepSeek R1 strengthened the case that open reasoning models could pressure closed labs on quality-per-dollar and distribution speed.",
                "details": "## Detail\n\nDeepSeek R1 became a reference point for open reasoning economics and intensified benchmark competition across frontier labs.",
                "importance": 5,
                "tags": ["model-release", "deepseek", "reasoning", "open-source", "2025"],
                "entity_ids": ["deepseek", "deepseek-r1-model", "reasoning", "open-source", "china", "year-2025"],
            },
            {
                "id": "2025-04-llama-4-open-weight-cycle",
                "title": "Llama 4 sustained Meta's open-weight strategy in the frontier race",
                "kind": "strategy",
                "status": "active",
                "date": "2025-04",
                "summary": "Meta's Llama 4 cycle reinforced the open-weight distribution strategy and kept pressure on API-gated deployment models.",
                "details": "## Detail\n\nLlama 4 continued Meta's positioning around open ecosystem leverage, downstream fine-tuning, and enterprise self-hosting demand.",
                "importance": 4,
                "tags": ["strategy", "llama", "meta", "open-source", "2025"],
                "entity_ids": ["meta", "llama-family", "open-source", "coding-agents", "year-2025"],
            },
            {
                "id": "2025-06-qwen-2-5-enterprise-coding",
                "title": "Qwen 2.5 expanded Alibaba's enterprise coding and multilingual footprint",
                "kind": "model-release",
                "status": "active",
                "date": "2025-06",
                "summary": "Qwen 2.5 strengthened Alibaba's position in multilingual enterprise workloads and practical coding pipelines.",
                "details": "## Detail\n\nAlibaba's Qwen 2.5 line improved adoption in Asia-focused enterprise deployments and contributed to broader open-model competition.",
                "importance": 4,
                "tags": ["model-release", "qwen", "alibaba", "coding", "2025"],
                "entity_ids": ["alibaba", "qwen-family", "qwen-2-5-model", "coding-agents", "open-source", "china", "year-2025"],
            },
            {
                "id": "2025-09-grok-3-social-distribution",
                "title": "Grok 3 pushed xAI's social-native distribution strategy",
                "kind": "model-release",
                "status": "active",
                "date": "2025-09",
                "summary": "Grok 3 tied model iteration to social platform distribution and large public benchmark messaging.",
                "details": "## Detail\n\nxAI used Grok 3 to emphasize realtime social deployment, larger training clusters, and faster public iteration loops.",
                "importance": 3,
                "tags": ["model-release", "grok", "xai", "distribution", "2025"],
                "entity_ids": ["xai", "grok-family", "grok-3-model", "multimodal", "year-2025"],
            },
            {
                "id": "2026-01-qwen-3-reasoning-wave",
                "title": "Qwen 3 intensified Chinese reasoning-model competition",
                "kind": "model-release",
                "status": "active",
                "date": "2026-01",
                "summary": "Qwen 3 reinforced Alibaba's frontier relevance and deepened competition around reasoning quality, cost, and deployment flexibility.",
                "details": "## Detail\n\nQwen 3 marked a stronger reasoning push from Alibaba and expanded the set of viable non-US frontier model suppliers.",
                "importance": 4,
                "tags": ["model-release", "qwen", "reasoning", "china", "2026"],
                "entity_ids": ["alibaba", "qwen-family", "qwen-3-model", "reasoning", "open-source", "china", "year-2026"],
            },
            {
                "id": "2026-02-perplexity-answer-engine-enterprise",
                "title": "Perplexity scaled answer-engine usage in consumer and enterprise workflows",
                "kind": "business",
                "status": "active",
                "date": "2026-02",
                "summary": "Perplexity's growth highlighted demand for retrieval-grounded answer interfaces beyond classic search listings.",
                "details": "## Detail\n\nPerplexity's expansion reflected a broader shift toward conversational answer engines, model routing, and citation-first UX patterns.",
                "importance": 3,
                "tags": ["business", "perplexity", "search", "consumer", "2026"],
                "entity_ids": ["perplexity", "search", "openai", "anthropic", "year-2026"],
            },
            {
                "id": "2026-03-blackwell-capacity-ramp",
                "title": "NVIDIA Blackwell ramp reinforced compute concentration pressure",
                "kind": "infrastructure",
                "status": "active",
                "date": "2026-03",
                "summary": "Blackwell deployment scale tightened the connection between capital access and frontier model competitiveness.",
                "details": "## Detail\n\nThe Blackwell ramp amplified infrastructure concentration and increased the strategic importance of long-term GPU allocation agreements.",
                "importance": 5,
                "tags": ["infrastructure", "nvidia", "blackwell", "chips", "2026"],
                "entity_ids": ["nvidia", "chips", "investment", "year-2026"],
            },
            {
                "id": "2026-04-stargate-capex-commitments",
                "title": "Stargate-style capex commitments signaled a new infrastructure financing phase",
                "kind": "infrastructure",
                "status": "active",
                "date": "2026-04",
                "summary": "Large multi-partner compute projects linked OpenAI-scale training ambitions to utility-grade capital and power planning.",
                "details": "## Detail\n\nStargate-era commitments demonstrated that future frontier gains depend as much on infrastructure finance and energy coordination as on model architecture.",
                "importance": 5,
                "tags": ["infrastructure", "stargate", "capex", "2026"],
                "entity_ids": ["openai", "oracle", "softbank", "chips", "investment", "year-2026"],
            },
            {
                "id": "2026-04-figure-embodied-ai-pilots",
                "title": "Figure AI pilot deployments expanded embodied AI into production discussions",
                "kind": "impact",
                "status": "active",
                "date": "2026-04",
                "summary": "Humanoid pilot programs pushed embodied AI from demo narratives toward measurable labor and workflow experiments.",
                "details": "## Detail\n\nFigure AI deployment pilots highlighted how robotics, foundation models, and labor economics are converging into a single product frontier.",
                "importance": 3,
                "tags": ["impact", "robotics", "figure", "labor", "2026"],
                "entity_ids": ["figure-ai", "robotics", "labor", "year-2026"],
            },
        ]

    def _append_story(self, stories: list[dict[str, Any]], seen: set[str], story: dict[str, Any]) -> None:
        fingerprint = f"{story['title']}::{story.get('date', story.get('event_date', 'reference'))}::{story['summary'][:80]}"
        if fingerprint in seen:
            return
        used_ids = {item["id"] for item in stories}
        base_id = story["id"]
        counter = 2
        while story["id"] in used_ids:
            story["id"] = f"{base_id}-{counter}"
            counter += 1
        seen.add(fingerprint)
        stories.append(story)

    def _jobs_kind_for_section(self, section: str, subsection: str) -> str | None:
        section_lower = clean_md(section).lower()
        subsection_lower = clean_md(subsection).lower()
        if JOBS_APPENDIX_SECTION not in section_lower:
            return None
        if JOBS_PLATFORM_SUBSECTION in subsection_lower:
            return "ai-work-platform"
        if JOBS_CREATION_SUBSECTION in subsection_lower:
            return "job-creation"
        if JOBS_DISPLACEMENT_SUBSECTION in subsection_lower:
            return "job-displacement"
        if JOBS_LAYOFF_SUBSECTION in subsection_lower:
            return "ai-layoff"
        if subsection_lower in JOBS_NARRATIVE_SUBSECTIONS:
            return "labor-analysis"
        return None

    def _lookup_entity_id_by_alias(self, label: str) -> str | None:
        normalized = slugify(clean_md(label))
        if not normalized:
            return None
        for item in ENTITY_DEFINITIONS:
            if item["id"] == normalized:
                return item["id"]
            aliases = item.get("aliases", []) + [item["name"]]
            for alias in aliases:
                if slugify(alias) == normalized:
                    return item["id"]
        return None

    def _synthetic_entity(
        self,
        label: str,
        *,
        entity_type: str,
        group_name: str,
        description: str,
        importance: int = 3,
        prefix: str,
        aliases: list[str] | None = None,
    ) -> tuple[str, dict[str, Any] | None]:
        existing_id = self._lookup_entity_id_by_alias(label)
        if existing_id is not None:
            return existing_id, None
        entity_id = f"{prefix}-{slugify(label)}"
        entity = {
            "id": entity_id,
            "name": clean_md(label),
            "type": entity_type,
            "group": group_name,
            "description": description,
            "importance": importance,
            "aliases": sorted({clean_md(alias) for alias in (aliases or []) if clean_md(alias)}),
        }
        if clean_md(label) not in entity["aliases"]:
            entity["aliases"].append(clean_md(label))
        return entity_id, entity

    def _normalize_jobs_date(self, default_date: str, *texts: str) -> str:
        for text in texts:
            normalized = self._normalize_date("", text)
            if normalized != "reference":
                return normalized
        return default_date

    def _job_role_aliases(self, role_label: str) -> list[str]:
        aliases = [clean_md(role_label)]
        aliases.extend(part.strip() for part in re.split(r"\s*/\s*", clean_md(role_label)) if part.strip())
        return sorted(set(alias for alias in aliases if alias))

    def _build_jobs_details(self, section: str, subsection: str, fields: list[tuple[str, str]]) -> str:
        body = "\n".join(f"**{label}:** {clean_md(value)}" for label, value in fields if clean_md(value))
        return self._build_details(section, subsection, body)

    def _jobs_table_story(self, cells: list[str], section: str, subsection: str, current_year: str) -> dict[str, Any] | None:
        kind = self._jobs_kind_for_section(section, subsection)
        if kind is None:
            return None

        lowered_cells = [clean_md(cell).lower() for cell in cells]
        if kind == "ai-work-platform" and lowered_cells[:4] == ["platform", "role type", "pay range", "notes"]:
            return None
        if kind == "job-creation" and lowered_cells[:4] == ["role", "what they do", "pay (us)", "trend"]:
            return None
        if kind == "job-displacement" and lowered_cells[:3] == ["job / role", "status", "impact / evidence"]:
            return None
        if kind == "ai-layoff" and lowered_cells[:5] == ["company", "jobs cut", "industry", "date", "ai attribution"]:
            return None

        section_tags = self._section_tags(section, subsection, current_year, kind)
        status = self._infer_status(current_year, kind)
        synthetic_entities: list[dict[str, Any]] = []
        entity_ids: set[str] = set()

        def register_entity(
            label: str,
            *,
            entity_type: str,
            group_name: str,
            description: str,
            importance: int = 3,
            prefix: str,
            aliases: list[str] | None = None,
        ) -> None:
            entity_id, entity = self._synthetic_entity(
                label,
                entity_type=entity_type,
                group_name=group_name,
                description=description,
                importance=importance,
                prefix=prefix,
                aliases=aliases,
            )
            entity_ids.add(entity_id)
            if entity is not None:
                synthetic_entities.append(entity)

        if kind == "ai-work-platform" and len(cells) >= 4:
            platform, role_type, pay_range = cells[0], cells[1], cells[2]
            notes = " | ".join(cells[3:])
            event_date = self._normalize_jobs_date("2026-04", notes, platform, role_type)
            title = clean_md(platform)
            summary = short_excerpt(f"{platform} offers {role_type}. {notes}", 240)
            details = self._build_jobs_details(
                section,
                subsection,
                [("Platform", platform), ("Role Type", role_type), ("Pay Range", pay_range), ("Notes", notes)],
            )
            register_entity(
                platform,
                entity_type="company",
                group_name="Platforms",
                description=f"AI work platform imported from the jobs appendix: {clean_md(notes)}",
                importance=3,
                prefix="org",
            )
            register_entity(
                role_type,
                entity_type="keyword",
                group_name="Labor",
                description=f"AI labor role imported from the jobs appendix: {clean_md(role_type)}",
                importance=3,
                prefix="job-role",
                aliases=self._job_role_aliases(role_type),
            )
            entity_ids.update(self._match_entities(" ".join(cells + [section, subsection, current_year])))
            tags = sorted(section_tags.union({slugify(title), slugify(role_type), "labor", "platform"}).union(self._entity_tags(list(entity_ids))))
            return {
                "id": slugify(f"{event_date}-{title}"),
                "title": title,
                "kind": kind,
                "status": status,
                "date": event_date,
                "summary": summary,
                "details": details,
                "importance": self._story_importance(kind, list(entity_ids), title, notes),
                "tags": tags,
                "entity_ids": sorted(entity_ids),
                "synthetic_entities": synthetic_entities,
            }

        if kind == "job-creation" and len(cells) >= 3:
            role_name, role_desc = cells[0], cells[1]
            pay_trend = " | ".join(cells[2:])
            event_date = self._normalize_jobs_date("2026-04", role_desc, pay_trend, role_name)
            title = clean_md(role_name)
            summary = short_excerpt(f"{role_desc} | {pay_trend}", 240)
            details = self._build_jobs_details(
                section,
                subsection,
                [("Role", role_name), ("Description", role_desc), ("Pay/Trend", pay_trend)],
            )
            register_entity(
                role_name,
                entity_type="keyword",
                group_name="Labor",
                description=f"AI-created work role imported from the jobs appendix: {clean_md(role_desc)}",
                importance=3,
                prefix="job-role",
                aliases=self._job_role_aliases(role_name),
            )
            entity_ids.add("labor")
            entity_ids.update(self._match_entities(" ".join(cells + [section, subsection, current_year])))
            tags = sorted(section_tags.union({slugify(title), "labor", "job-creation"}).union(self._entity_tags(list(entity_ids))))
            return {
                "id": slugify(f"{event_date}-{title}"),
                "title": title,
                "kind": kind,
                "status": status,
                "date": event_date,
                "summary": summary,
                "details": details,
                "importance": self._story_importance(kind, list(entity_ids), title, role_desc),
                "tags": tags,
                "entity_ids": sorted(entity_ids),
                "synthetic_entities": synthetic_entities,
            }

        if kind == "job-displacement" and len(cells) >= 3:
            role_name, impact_status = cells[0], cells[1]
            evidence = " | ".join(cells[2:])
            event_date = self._normalize_jobs_date("2026-04", evidence, impact_status, role_name)
            title = clean_md(role_name)
            summary = short_excerpt(f"{impact_status}. {evidence}", 240)
            details = self._build_jobs_details(
                section,
                subsection,
                [("Job / Role", role_name), ("Status", impact_status), ("Impact / Evidence", evidence)],
            )
            register_entity(
                role_name,
                entity_type="keyword",
                group_name="Labor",
                description=f"AI-displaced work role imported from the jobs appendix: {clean_md(evidence)}",
                importance=3,
                prefix="job-role",
                aliases=self._job_role_aliases(role_name),
            )
            entity_ids.add("labor")
            entity_ids.update(self._match_entities(" ".join(cells + [section, subsection, current_year])))
            tags = sorted(section_tags.union({slugify(title), slugify(impact_status), "labor", "job-displacement"}).union(self._entity_tags(list(entity_ids))))
            return {
                "id": slugify(f"{event_date}-{title}"),
                "title": title,
                "kind": kind,
                "status": status,
                "date": event_date,
                "summary": summary,
                "details": details,
                "importance": self._story_importance(kind, list(entity_ids), title, evidence),
                "tags": tags,
                "entity_ids": sorted(entity_ids),
                "synthetic_entities": synthetic_entities,
            }

        if kind == "ai-layoff" and len(cells) >= 5:
            company, jobs_cut, industry, date_value = cells[0], cells[1], cells[2], cells[3]
            attribution = " | ".join(cells[4:])
            event_date = self._normalize_jobs_date("2026-04", date_value, attribution, company)
            title = clean_md(company)
            summary = short_excerpt(f"{jobs_cut} jobs cut in {industry}. {attribution}", 240)
            details = self._build_jobs_details(
                section,
                subsection,
                [("Company", company), ("Jobs Cut", jobs_cut), ("Industry", industry), ("Date", date_value), ("AI Attribution", attribution)],
            )
            register_entity(
                company,
                entity_type="company",
                group_name="Companies",
                description=f"Employer imported from the jobs appendix: {clean_md(industry)}. {clean_md(attribution)}",
                importance=3,
                prefix="org",
            )
            entity_ids.add("labor")
            entity_ids.update(self._match_entities(" ".join(cells + [section, subsection, current_year])))
            tags = sorted(section_tags.union({slugify(title), slugify(industry), "labor", "ai-layoff"}).union(self._entity_tags(list(entity_ids))))
            return {
                "id": slugify(f"{event_date}-{title}"),
                "title": title,
                "kind": kind,
                "status": status,
                "date": event_date,
                "summary": summary,
                "details": details,
                "importance": self._story_importance(kind, list(entity_ids), title, attribution),
                "tags": tags,
                "entity_ids": sorted(entity_ids),
                "synthetic_entities": synthetic_entities,
            }

        return None

    def _story_from_table_row(self, row: str, section: str, subsection: str, current_year: str) -> dict[str, Any] | None:
        cells = [clean_md(cell) for cell in row.strip("|").split("|")]
        cells = [cell for cell in cells if cell]
        if not cells:
            return None

        jobs_story = self._jobs_table_story(cells, section, subsection, current_year)
        if jobs_story is not None:
            return jobs_story

        kind = self._infer_kind(section, subsection)
        status = self._infer_status(current_year, kind)
        section_tags = self._section_tags(section, subsection, current_year, kind)

        if len(cells) == 1:
            text = cells[0]
            title = title_from_text(text, fallback=subsection or section)
            details = self._build_details(section, subsection, text)
            entity_ids = self._match_entities(" ".join([title, text, section, subsection, current_year]))
            return {
                "id": slugify(f"{current_year}-{subsection}-{title}"),
                "title": title,
                "kind": kind,
                "status": status,
                "date": self._normalize_date(current_year, text),
                "summary": short_excerpt(text, 240),
                "details": details,
                "importance": self._story_importance(kind, entity_ids, title, text),
                "tags": sorted(section_tags.union(self._entity_tags(entity_ids))),
                "entity_ids": entity_ids,
            }

        label = cells[0]
        body = " ".join(cells[1:])
        event_date = self._normalize_date(current_year, label)
        date_like = bool(re.search(r"\b(20\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b", label, re.I))
        if date_like:
            title = title_from_text(body, fallback=label)
        else:
            title = label if len(label.split()) <= 16 else title_from_text(label)
        details = self._build_details(section, subsection, body, label if not date_like else None)
        entity_ids = self._match_entities(" ".join([label, body, section, subsection, current_year]))
        return {
            "id": slugify(f"{event_date}-{title}"),
            "title": title,
            "kind": kind,
            "status": status,
            "date": event_date,
            "summary": short_excerpt(body, 240),
            "details": details,
            "importance": self._story_importance(kind, entity_ids, label, body),
            "tags": sorted(section_tags.union(self._entity_tags(entity_ids))),
            "entity_ids": entity_ids,
        }

    def _story_from_bullet(self, bullet: str, section: str, subsection: str, current_year: str) -> dict[str, Any] | None:
        if len(bullet) < 18:
            return None
        if " — " in bullet:
            title, body = bullet.split(" — ", 1)
        else:
            title = title_from_text(bullet)
            body = bullet
        kind = self._infer_kind(section, subsection)
        entity_ids = self._match_entities(" ".join([title, body, section, subsection, current_year]))
        return {
            "id": slugify(f"{current_year}-{subsection}-{title}"),
            "title": clean_md(title),
            "kind": kind,
            "status": self._infer_status(current_year, kind),
            "date": self._normalize_date(current_year, bullet),
            "summary": short_excerpt(body, 220),
            "details": self._build_details(section, subsection, body, title),
            "importance": self._story_importance(kind, entity_ids, title, body),
            "tags": sorted(self._section_tags(section, subsection, current_year, kind).union(self._entity_tags(entity_ids))),
            "entity_ids": entity_ids,
        }

    def _story_from_paragraph(self, paragraph: str, section: str, subsection: str, current_year: str) -> dict[str, Any] | None:
        title = subsection or section
        kind = self._infer_kind(section, subsection)
        entity_ids = self._match_entities(" ".join([paragraph, section, subsection, current_year]))
        return {
            "id": slugify(f"{current_year}-{title}-{paragraph[:48]}"),
            "title": title_from_text(title, fallback=section),
            "kind": kind,
            "status": self._infer_status(current_year, kind),
            "date": self._normalize_date(current_year, paragraph),
            "summary": short_excerpt(paragraph, 260),
            "details": self._build_details(section, subsection, paragraph),
            "importance": self._story_importance(kind, entity_ids, title, paragraph),
            "tags": sorted(self._section_tags(section, subsection, current_year, kind).union(self._entity_tags(entity_ids))),
            "entity_ids": entity_ids,
        }

    def _infer_kind(self, section: str, subsection: str) -> str:
        jobs_kind = self._jobs_kind_for_section(section, subsection)
        if jobs_kind is not None:
            return jobs_kind
        haystack = f"{section} {subsection}".lower()
        if "model release timeline" in haystack or "model family" in haystack:
            return "model-release"
        if "regulation" in haystack or "policy" in haystack:
            return "policy"
        if "hardware" in haystack or "semiconductor" in haystack or "chip wars" in haystack:
            return "infrastructure"
        if "investment" in haystack or "business" in haystack or "funding" in haystack:
            return "business"
        if "open source" in haystack or "closed source" in haystack or "strategic battle" in haystack:
            return "strategy"
        if "agentic" in haystack or "agents" in haystack:
            return "agents"
        if "social impact" in haystack or "creative industries" in haystack or "labor market" in haystack or "education" in haystack or "healthcare" in haystack:
            return "impact"
        if "people" in haystack or "founders" in haystack or "scientists" in haystack:
            return "people"
        if "failed" in haystack or "graveyard" in haystack or "collapsed" in haystack:
            return "collapse"
        if "patterns" in haystack or "what comes next" in haystack or "analysis" in haystack:
            return "analysis"
        if "overview" in haystack:
            return "overview"
        return "timeline"

    def _infer_status(self, current_year: str, kind: str) -> str:
        try:
            year = int(current_year)
        except (TypeError, ValueError):
            return "reference"
        if kind in {"analysis", "people", "strategy"}:
            return "reference"
        if year >= 2025:
            return "active"
        if year == 2024:
            return "watch"
        return "historical"

    def _normalize_date(self, current_year: str, text: str) -> str:
        cleaned = clean_md(text)
        exact = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})", cleaned, re.I)
        if exact:
            return f"{exact.group(3)}-{MONTHS[exact.group(1).lower()[:3]]}-{int(exact.group(2)):02d}"
        month_year = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20\d{2})", cleaned, re.I)
        if month_year:
            return f"{month_year.group(2)}-{MONTHS[month_year.group(1).lower()[:3]]}"
        year = re.search(r"\b(20\d{2})\b", cleaned)
        if year:
            return year.group(1)
        return current_year or "reference"

    def _section_tags(self, section: str, subsection: str, current_year: str, kind: str) -> set[str]:
        tags = {kind}
        if current_year:
            tags.add(current_year)
        for source in (section, subsection):
            lowered = clean_md(source).lower()
            for token in re.split(r"[^a-z0-9]+", lowered):
                if len(token) >= 4 and token not in {"overview", "timeline", "family", "since", "through", "major"}:
                    tags.add(token)
        return tags

    def _entity_tags(self, entity_ids: list[str]) -> set[str]:
        tags = set()
        by_id = {item["id"]: item for item in ENTITY_DEFINITIONS}
        for entity_id in entity_ids:
            item = by_id.get(entity_id)
            if item:
                tags.add(item["type"])
                tags.add(slugify(item["name"]))
        return tags

    def _build_details(self, section: str, subsection: str, text: str, label: str | None = None) -> str:
        parts = []
        if section:
            parts.append(f"## Section\n\n{section}")
        if subsection:
            parts.append(f"## Subsection\n\n{subsection}")
        if label:
            parts.append(f"## Label\n\n{clean_md(label)}")
        parts.append(f"## Detail\n\n{clean_md(text)}")
        return "\n\n".join(parts)

    def _story_importance(self, kind: str, entity_ids: list[str], title: str, body: str) -> int:
        score = 2
        if kind in {"timeline", "model-release", "policy", "infrastructure", "agents", "ai-work-platform", "job-creation", "job-displacement", "ai-layoff"}:
            score += 1
        if kind in {"analysis", "business", "labor-analysis"}:
            score += 1
        score += min(3, len(entity_ids) // 3)
        if re.search(r"\b(gpt-4|gpt-4o|gpt-5|chatgpt|alphafold|deepseek|gemini|claude|llama|nvidia|openai|anthropic)\b", f"{title} {body}".lower()):
            score += 1
        return min(score, 5)

    def _match_entities(self, text: str) -> list[str]:
        lowered = clean_md(text).lower()
        matches = []
        for item in self._entity_lookup:
            if any(pattern.search(lowered) for pattern in item["patterns"]):
                matches.append(item["id"])
        return sorted(set(matches))

    def _entity_record(self, item: dict[str, Any]) -> dict[str, Any]:
        category = item.get("category")
        if not category:
            name = item.get("name", "")
            ent_id = item.get("id", "")
            ent_type = item.get("type", item.get("entity_type", ""))
            group_name = item.get("group", item.get("group_name", ""))
            job_role_pattern = re.compile(
                r"\b(?:job[\s-]?role|labor|career|salary|hiring|layoff|displacement|workforce|employment)\b",
                re.IGNORECASE
            )
            if ent_id.startswith("job-role-") or job_role_pattern.search(name) or job_role_pattern.search(ent_id):
                category = "job_role"
            elif ent_type == "company" or (group_name and group_name.lower() in {"labs", "companies", "platforms", "infrastructure", "capital"}):
                category = "organization"
            else:
                category = "topic"

        return {
            "id": item["id"],
            "name": item["name"],
            "type": item["type"],
            "group": item["group"],
            "description": item["description"],
            "importance": item["importance"],
            "category": category,
        }


    def _build_entity_links(self, stories: list[dict[str, Any]], story_entities: list[tuple[str, str]]) -> list[dict[str, Any]]:
        story_to_entities: dict[str, list[str]] = defaultdict(list)
        for story_id, entity_id in story_entities:
            story_to_entities[story_id].append(entity_id)

        pair_counts: Counter[tuple[str, str]] = Counter()
        for story in stories:
            entity_ids = sorted(set(story_to_entities.get(story["id"], [])))
            for i, source in enumerate(entity_ids):
                for target in entity_ids[i + 1 :]:
                    pair_counts[(source, target)] += 1

        links = []
        for (source, target), weight in pair_counts.items():
            if weight >= 2:
                links.append({"source": source, "target": target, "relation": "co-mentioned", "weight": weight})
        return links

    def _db_signature(self) -> int:
        return int(self.db_path.stat().st_mtime_ns) if self.db_path.exists() else 0

    # How often a live request is allowed to trigger a check for newly
    # scraped stories. Without this, new stories only ever reached the graph
    # at process startup (DataLoader.load_stories() previously only ran from
    # _run_migrations_and_load) — a long-lived Cloud Run instance could stay
    # warm across many 4x/day scraper runs and never pick up new nodes until
    # redeployed. /api/rebuild doesn't help either: it reseeds from the
    # static master document/seed file, not the scraper's story feed.
    _INGEST_CHECK_INTERVAL_SECONDS = 300

    def ingest_stories_at_startup(self) -> int:
        """Mandatory GCS/local story rehydrate before serving graph API."""
        self._last_ingest_check = time.monotonic()
        return self._run_story_ingest(context="startup")

    def _run_story_ingest(self, *, context: str) -> int:
        """Load scraped stories from storage into SQLite.

        Returns the number of newly inserted stories, or -1 on failure.
        """
        from .loader import DataLoader

        try:
            conn = self._connect()
            try:
                inserted = DataLoader().load_stories(conn)
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001 - ingest must not break graph reads.
            logger.error("Story ingest failed ({}): {}", context, exc)
            return -1

        if inserted < 0:
            logger.error("Story ingest failed ({}): database insert rolled back", context)
            return -1

        if inserted > 0:
            logger.info("Story ingest ok ({}): {} new stories inserted", context, inserted)
            self._signature = None
            self._graph_data_cache = None
        else:
            logger.info("Story ingest ok ({}): no new stories (0 inserted)", context)

        return inserted

    def _maybe_ingest_new_stories(self) -> None:
        # A non-blocking lock makes "is it time?" + claim atomic so concurrent
        # requests on a threaded server (the long-lived Cloud Run instance this
        # whole mechanism targets) can't both pass the throttle and run two
        # ingests against the same SQLite file at once. A request that loses
        # the race just skips — the winner is already doing the work.
        if not self._ingest_lock.acquire(blocking=False):
            return
        try:
            now = time.monotonic()
            if now - self._last_ingest_check < self._INGEST_CHECK_INTERVAL_SECONDS:
                return
            self._last_ingest_check = now
            self._run_story_ingest(context="background")
        finally:
            self._ingest_lock.release()

    def _refresh(self) -> None:
        self._maybe_ingest_new_stories()
        signature = self._db_signature()
        if signature == self._signature:
            return

        self._graph_data_cache = None

        try:
            with self._connect() as conn:
                conn.row_factory = sqlite3.Row
                entity_rows = conn.execute("SELECT * FROM entities").fetchall()
                story_rows = conn.execute("SELECT * FROM stories").fetchall()
                story_entities = conn.execute("SELECT story_id, entity_id FROM story_entities").fetchall()
                story_tags = conn.execute("SELECT story_id, tag FROM story_tags").fetchall()
                entity_links = conn.execute("SELECT source_id, target_id, relation, weight FROM entity_links").fetchall()
        except sqlite3.DatabaseError as exc:
            logger.error(f"Failed to read the AI graph database: {exc}")
            raise GraphStoreError("Failed to read the AI graph database. Rebuild the dataset and try again.") from exc

        story_to_entities: dict[str, list[str]] = defaultdict(list)
        entity_to_stories: dict[str, list[str]] = defaultdict(list)
        for row in story_entities:
            story_to_entities[row["story_id"]].append(row["entity_id"])
            entity_to_stories[row["entity_id"]].append(row["story_id"])

        story_to_tags: dict[str, list[str]] = defaultdict(list)
        for row in story_tags:
            story_to_tags[row["story_id"]].append(row["tag"])

        entity_index = {row["id"]: row for row in entity_rows}
        links_by_entity: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in entity_links:
            links_by_entity[row["source_id"]].append({"target_id": row["target_id"], "relation": row["relation"], "weight": row["weight"]})
            links_by_entity[row["target_id"]].append({"target_id": row["source_id"], "relation": row["relation"], "weight": row["weight"]})

        story_records: dict[str, StoryRecord] = {}
        for row in story_rows:
            entity_refs = []
            for entity_id in story_to_entities[row["id"]]:
                entity_row = entity_index.get(entity_id)
                if entity_row is None:
                    continue
                entity_refs.append({"id": entity_row["id"], "name": entity_row["name"], "type": entity_row["entity_type"]})

            related_counter: Counter[str] = Counter()
            current_set = set(story_to_entities[row["id"]])
            for other in story_rows:
                if other["id"] == row["id"]:
                    continue
                overlap = current_set.intersection(story_to_entities[other["id"]])
                if overlap:
                    related_counter[other["id"]] = len(overlap)

            related_stories = []
            for other_id, weight in related_counter.most_common(6):
                other_row = next(item for item in story_rows if item["id"] == other_id)
                related_stories.append({"id": other_row["id"], "title": other_row["title"], "kind": other_row["kind"], "weight": weight})

            details_markdown = row["details"]
            story_records[row["id"]] = StoryRecord(
                id=row["id"],
                title=row["title"],
                kind=row["kind"],
                status=row["status"],
                event_date=row["event_date"],
                summary=row["summary"],
                details_markdown=details_markdown,
                details_html=render_markdown_safe(details_markdown),
                importance=row["importance"],
                cluster_id=row["cluster_id"],
                cluster_role=row["cluster_role"],
                tags=sorted(set(story_to_tags[row["id"]])),
                entities=entity_refs,
                related_stories=related_stories,
                era=row["era"] if "era" in row.keys() else None,
                year=int(row["year"]) if "year" in row.keys() and row["year"] is not None else None,
            )

        entity_records: dict[str, EntityRecord] = {}
        for row in entity_rows:
            linked_story_ids = entity_to_stories[row["id"]]
            stories = [story_records[story_id] for story_id in linked_story_ids if story_id in story_records]
            stories.sort(key=lambda item: (item.importance, item.event_date, item.title), reverse=True)
            entity_records[row["id"]] = EntityRecord(
                id=row["id"],
                name=row["name"],
                entity_type=row["entity_type"],
                group_name=row["group_name"],
                description=row["description"],
                importance=row["importance"],
                cluster_id=row["cluster_id"],
                cluster_role=row["cluster_role"],
                story_count=len(stories),
                mention_count=sum(item.importance for item in stories) or len(stories),
                stories=[{"id": story.id, "title": story.title, "kind": story.kind, "status": story.status, "event_date": story.event_date} for story in stories],
                links=links_by_entity[row["id"]],
                category=row["category"] if "category" in row.keys() else "topic",
            )

        self._entities = entity_records
        self._stories = dict(sorted(story_records.items(), key=lambda item: (item[1].importance, item[1].event_date, item[1].title), reverse=True))
        self._signature = signature

    def _all_tags(self) -> list[str]:
        tags: set[str] = set()
        for story in self._stories.values():
            tags.update(story.tags)
        return sorted(tags)

    def _dataset_name(self) -> str:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM meta WHERE key = 'dataset_name'").fetchone()
        return row[0] if row else "AI Signal Graph"

    def get_health_report(self) -> HealthReport:
        warnings: list[str] = []
        errors: list[str] = []
        report: HealthReport = {
            "source_path": str(self.source_path),
            "source_exists": self.source_path.exists(),
            "seed_path": str(self.seed_path),
            "seed_exists": self.seed_path.exists(),
            "database_path": str(self.db_path),
            "database_exists": self.db_path.exists(),
            "warnings": warnings,
            "errors": errors,
        }

        if not report["source_exists"] and report["seed_exists"]:
            warnings.append("Configured source document is missing; rebuilds will use the JSON seed fallback.")
        elif not report["source_exists"]:
            errors.append("Configured source document is missing and no seed fallback is available.")

        if not report["database_exists"]:
            warnings.append("Database file has not been created yet.")
            report["status"] = "degraded" if not errors else "unhealthy"
            return report

        try:
            with self._connect() as conn:
                meta_rows = conn.execute("SELECT key, value FROM meta").fetchall()
                meta = {key: value for key, value in meta_rows}
                report["stories"] = int(conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0])
                report["entities"] = int(conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0])
                report["communities"] = int(meta.get("community_count", "0"))
                report["schema_version"] = meta.get("schema_version")
                report["source_signature"] = meta.get("source_signature")
        except sqlite3.DatabaseError as exc:
            logger.error(f"Database health check failed: {exc}")
            errors.append("Failed to read graph database health information.")
            report["status"] = "unhealthy"
            return report

        if report.get("stories", 0) == 0:
            errors.append("Graph database contains zero stories.")
        if report.get("entities", 0) == 0:
            errors.append("Graph database contains zero entities.")
        if report.get("schema_version") != SCHEMA_VERSION:
            warnings.append(
                f"Schema version mismatch detected. expected={SCHEMA_VERSION} actual={report.get('schema_version') or 'missing'}"
            )

        report["status"] = "unhealthy" if errors else ("degraded" if warnings else "healthy")
        return report

    def get_runtime_stats(self) -> dict[str, Any]:
        self._refresh()
        graph = self.get_graph_data()
        kinds = Counter(story.kind for story in self._stories.values())
        keyword_nodes = sum(1 for entity in self._entities.values() if entity.entity_type == "keyword")
        return {
            "stories": len(self._stories),
            "entities": len(self._entities),
            "tags": len(self._all_tags()),
            "links": len(graph["edges"]),
            "kinds": len(kinds),
            "active_signals": sum(1 for story in self._stories.values() if story.status == "active"),
            "keywords": keyword_nodes,
        }

    def get_dashboard_data(self) -> dict[str, Any]:
        self._refresh()
        stats = self.get_runtime_stats()

        all_stories = list(self._stories.values())
        current_date = date.today()
        current_month_index = current_date.year * 12 + current_date.month
        recent_floor = current_month_index - 11

        def digest_sort_key(story: StoryRecord) -> tuple[int, int, int, int, int, str]:
            month_index = month_index_from_key(timeline_month_key(story.event_date)) or 0
            year, month, day = timeline_day_sort_key(story.event_date)
            in_recent_window = int(recent_floor <= month_index <= current_month_index)
            return (
                in_recent_window,
                int(story.importance or 0),
                month_index,
                year,
                month * 100 + day,
                story.title,
            )

        featured_stories = sorted(all_stories, key=digest_sort_key, reverse=True)[:20]

        hot_entities = sorted(self._entities.values(), key=lambda item: (item.story_count, item.importance, item.name), reverse=True)[:10]
        kind_counts = Counter(story.kind for story in self._stories.values())
        return {
            "stats": stats,
            "featured_stories": featured_stories,
            "hot_entities": hot_entities,
            "kind_counts": [{"name": key, "count": value} for key, value in sorted(kind_counts.items(), key=lambda item: (-item[1], item[0]))],
            "dataset_name": self._dataset_name(),
            "source_path": str(self.source_path),
        }

    def get_story_filters(self) -> dict[str, list[str]]:
        self._refresh()
        return {
            "kinds": sorted({story.kind for story in self._stories.values()}),
            "statuses": sorted({story.status for story in self._stories.values()}),
            "tags": self._all_tags(),
        }

    def get_entity_filters(self) -> dict[str, list[str]]:
        self._refresh()
        return {"types": sorted({entity.entity_type for entity in self._entities.values()})}

    def list_stories(self, q: str = "", kind: str | None = None, tag: str | None = None, status: str | None = None) -> list[StoryRecord]:
        self._refresh()
        items = list(self._stories.values())
        needle = q.lower().strip()
        if kind:
            items = [story for story in items if story.kind == kind]
        if tag:
            items = [story for story in items if tag in story.tags]
        if status:
            items = [story for story in items if story.status == status]
        if needle:
            items = [
                story
                for story in items
                if needle in " ".join([story.title, story.summary, story.details_markdown, " ".join(story.tags), " ".join(entity["name"] for entity in story.entities)]).lower()
            ]
        return items

    def get_story(self, story_id: str) -> StoryRecord | None:
        self._refresh()
        return self._stories.get(story_id)

    def list_entities(self, q: str = "", entity_type: str | None = None) -> list[EntityRecord]:
        self._refresh()
        items = list(self._entities.values())
        needle = q.lower().strip()
        if entity_type:
            items = [entity for entity in items if entity.entity_type == entity_type]
        if needle:
            items = [entity for entity in items if needle in " ".join([entity.name, entity.description, entity.group_name, entity.entity_type]).lower()]
        items.sort(key=lambda item: (item.story_count, item.importance, item.name), reverse=True)
        return items

    def get_entity(self, entity_id: str) -> dict[str, Any] | None:
        self._refresh()
        entity = self._entities.get(entity_id)
        if entity is None:
            return None
        linked_entities = []
        for link in sorted(entity.links, key=lambda item: (-item["weight"], item["target_id"])):
            target = self._entities.get(link["target_id"])
            if target is None:
                continue
            linked_entities.append({"id": target.id, "name": target.name, "type": target.entity_type, "relation": link["relation"], "weight": link["weight"]})
        stories = [self._stories[item["id"]] for item in entity.stories if item["id"] in self._stories]
        return {"record": entity, "stories": stories, "linked_entities": linked_entities}

    def _story_year(self, story: StoryRecord) -> int | None:
        if story.year is not None:
            return story.year
        if story.event_date:
            try:
                return int(story.event_date[:4])
            except ValueError:
                return None
        return None

    def _story_era(self, story: StoryRecord) -> str | None:
        if story.era:
            return story.era
        year = self._story_year(story)
        if year is None:
            return None
        from scraper.sources import classify_era

        return classify_era(year)

    def _included_entity_ids(self, allowed_story_ids: set[str]) -> set[str]:
        ids: set[str] = set()
        for story_id in allowed_story_ids:
            story = self._stories.get(story_id)
            if story is None:
                continue
            for ref in story.entities:
                ids.add(ref["id"])
            if story.event_date:
                ids.add(f"year-{story.event_date[:4]}")
        return ids

    def _iter_active_stories(self, allowed_story_ids: set[str] | None):
        if allowed_story_ids is None:
            return self._stories.values()
        return (self._stories[story_id] for story_id in allowed_story_ids if story_id in self._stories)

    def get_graph_data(self) -> GraphData:
        self._refresh()
        if self._graph_data_cache is not None:
            return self._graph_data_cache
        self._graph_data_cache = self._build_graph_data(None)
        return self._graph_data_cache

    def get_graph_data_by_era(self, era_name: str) -> GraphData:
        from scraper.sources import ERA_DATE_RANGES

        if era_name not in ERA_DATE_RANGES:
            raise ValueError(f"unknown era '{era_name}'")
        self._refresh()
        story_ids = {story.id for story in self._stories.values() if self._story_era(story) == era_name}
        return self._build_graph_data(story_ids)

    def get_graph_data_by_year_range(self, year_from: int, year_to: int) -> GraphData:
        self._refresh()
        story_ids = {
            story.id
            for story in self._stories.values()
            if (year := self._story_year(story)) is not None and year_from <= year <= year_to
        }
        return self._build_graph_data(story_ids)

    def _build_graph_data(self, allowed_story_ids: set[str] | None) -> GraphData:
        active_stories = list(self._iter_active_stories(allowed_story_ids))
        included_entities = self._included_entity_ids(allowed_story_ids) if allowed_story_ids is not None else None
        story_months = {story.id: timeline_month_key(story.event_date) for story in active_stories}
        known_story_months = sorted((month for month in story_months.values() if month), key=timeline_month_sort_key)
        first_story_month = known_story_months[0] if known_story_months else "2020-01"
        last_story_month = known_story_months[-1] if known_story_months else first_story_month

        entity_first_seen: dict[str, str] = {}
        for entity in self._entities.values():
            candidate_months = [
                story_months.get(item["id"])
                for item in entity.stories
                if story_months.get(item["id"])
            ]
            if entity.entity_type == "year":
                candidate_months.append(f"{entity.name}-01")
            entity_first_seen[entity.id] = min(candidate_months, key=timeline_month_sort_key) if candidate_months else first_story_month

        nodes: list[dict[str, Any]] = []
        node_by_id: dict[str, dict[str, Any]] = {}
        for entity in self._entities.values():
            if included_entities is not None and entity.id not in included_entities:
                continue
            is_model = entity.entity_type == "model"
            frontend_type = graph_node_type(entity.entity_type, entity.group_name)
            timeline_month = entity_first_seen.get(entity.id, first_story_month)
            node = {
                "id": f"entity:{entity.id}",
                "label": entity.name,
                "node_type": "entity",
                "type": frontend_type,
                "group": entity.entity_type,
                "color_group": slugify(entity.group_name),
                "radius": 7 + entity.importance * (2.2 if is_model else 1.7) + min(entity.story_count, 10) * (1.0 if is_model else 0.85) + (2.2 if is_model else 0),
                "route": f"/entities/{entity.id}",
                "subtitle": entity.group_name,
                "description": entity.description,
                "story_count": entity.story_count,
                "heat": min(1.0, entity.story_count / (10 if is_model else 12)),
                "importance": entity.importance,
                "emphasis": "model" if is_model else None,
                "timeline_month": timeline_month,
                "month_index": month_index_from_key(timeline_month),
                "cluster_id": entity.cluster_id,
                "cluster_role": entity.cluster_role,
                "layer_index": 0 if entity.entity_type == "year" else 2,
                "in_degree": 0,
                "out_degree": 0,
                "year": entity.name if entity.entity_type == "year" else "",
                "details_html": entity.description,
                "category": entity.category,
            }
            nodes.append(node)
            node_by_id[node["id"]] = node

        for story in active_stories:
            story_month = story_months.get(story.id) or last_story_month
            node = {
                "id": f"story:{story.id}",
                "label": story.title,
                "node_type": "story",
                "type": "story",
                "group": story.kind,
                "color_group": slugify(story.kind),
                "radius": 7 + story.importance * 1.9 + min(len(story.entities), 8) * 0.6,
                "route": f"/stories/{story.id}",
                "subtitle": f"{story.kind} | {story.event_date}",
                "description": story.summary,
                "story_count": len(story.entities),
                "heat": min(1.0, len(story.entities) / 10),
                "importance": story.importance,
                "event_date": story.event_date,
                "year": story.event_date[:4] if story.event_date else "",
                "timeline_month": story_month,
                "month_index": month_index_from_key(story_month),
                "cluster_id": story.cluster_id,
                "cluster_role": story.cluster_role,
                "layer_index": 1,
                "in_degree": 0,
                "out_degree": 0,
                "details_html": story.details_html,
            }
            nodes.append(node)
            node_by_id[node["id"]] = node

        edges: list[dict[str, Any]] = []
        for story in active_stories:
            story_month = story_months.get(story.id) or last_story_month
            if story.event_date:
                year_node_id = f"entity:year-{story.event_date[:4]}"
                if year_node_id in node_by_id:
                    edges.append(
                        {
                            "source": year_node_id,
                            "target": f"story:{story.id}",
                            "weight": 1,
                            "kind": "timeline",
                            "flow_kind": "timeline",
                            "directed": True,
                            "type": "year_to_story",
                            "timeline_month": story_month,
                        }
                    )

            for entity_ref in story.entities:
                target = self._entities.get(entity_ref["id"])
                if target is None:
                    continue
                # Chronology is encoded by year->story timeline edges above.
                if target.entity_type == "year":
                    continue
                target_type = graph_node_type(target.entity_type, target.group_name)
                edges.append(
                    {
                        "source": f"story:{story.id}",
                        "target": f"entity:{entity_ref['id']}",
                        "weight": 1,
                        "kind": "mention",
                        "flow_kind": "mention",
                        "directed": True,
                        "type": graph_edge_type("story", target_type, "mentions"),
                        "timeline_month": story_month,
                    }
                )

        for entity in self._entities.values():
            if entity.entity_type == "year":
                continue
            if included_entities is not None and entity.id not in included_entities:
                continue
            source_type = graph_node_type(entity.entity_type, entity.group_name)
            for link in entity.links:
                if link["relation"] != "co-mentioned" or link["weight"] < 2 or entity.id >= link["target_id"]:
                    continue
                target_entity = self._entities.get(link["target_id"])
                if target_entity is None or target_entity.entity_type == "year":
                    continue
                if included_entities is not None and target_entity.id not in included_entities:
                    continue
                source_month = entity_first_seen.get(entity.id, first_story_month)
                target_month = entity_first_seen.get(target_entity.id, first_story_month)
                valid_months = [month for month in (source_month, target_month) if month]
                target_type = graph_node_type(target_entity.entity_type, target_entity.group_name)
                edges.append(
                    {
                        "source": f"entity:{entity.id}",
                        "target": f"entity:{target_entity.id}",
                        "weight": max(1, link["weight"]),
                        "kind": "support",
                        "flow_kind": "support",
                        "directed": False,
                        "type": graph_edge_type(source_type, target_type, "co-mentioned"),
                        "timeline_month": max(valid_months, key=timeline_month_sort_key) if valid_months else first_story_month,
                    }
                )

        story_rows = [{"id": story.id, "event_date": story.event_date} for story in active_stories]
        story_to_entities = {story.id: [entity["id"] for entity in story.entities] for story in active_stories}
        for link in self._build_story_context_links(story_rows, story_to_entities):
            edges.append(
                {
                    "source": f"story:{link['source']}",
                    "target": f"story:{link['target']}",
                    "weight": link["weight"],
                    "kind": "context",
                    "flow_kind": "context",
                    "directed": True,
                    "type": "story_context",
                    "timeline_month": link["timeline_month"] or last_story_month,
                }
            )

        max_weight_by_kind = defaultdict(int)
        in_degree = Counter()
        out_degree = Counter()
        for edge in edges:
            max_weight_by_kind[edge["flow_kind"]] = max(max_weight_by_kind[edge["flow_kind"]], int(edge["weight"]))
            if edge["directed"]:
                out_degree[edge["source"]] += 1
                in_degree[edge["target"]] += 1

        for edge in edges:
            edge["weight_norm"] = (
                1.0
                if max_weight_by_kind[edge["flow_kind"]] <= 1
                else math.log1p(edge["weight"]) / math.log1p(max_weight_by_kind[edge["flow_kind"]])
            )

        for node in nodes:
            node["in_degree"] = in_degree[node["id"]]
            node["out_degree"] = out_degree[node["id"]]
        display_meta_by_node, communities = self._compute_display_clusters(nodes, edges)
        for node in nodes:
            display_meta = display_meta_by_node.get(node["id"])
            node["display_cluster_id"] = display_meta["display_cluster_id"] if display_meta else None
            node["display_cluster_label"] = display_meta["display_cluster_label"] if display_meta else None

        return {
            "nodes": [self._compact_graph_node(node) for node in nodes],
            "edges": [self._compact_graph_edge(edge) for edge in edges],
            "communities": communities,
            "timeline": {
                "months": month_range(first_story_month, last_story_month),
                "start": first_story_month,
                "end": last_story_month,
            },
        }
