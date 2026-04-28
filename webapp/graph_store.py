from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bleach
import markdown


LEGACY_MASTER_DOCUMENT_PATH = Path("/home/seanb/Documents/New Folder/AI_Master_Document_2020_2026.md")
DATASET_VERSION = "master-doc-v2"
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


@dataclass
class EntityRecord:
    id: str
    name: str
    entity_type: str
    group_name: str
    description: str
    importance: int
    story_count: int
    mention_count: int
    stories: list[dict[str, Any]]
    links: list[dict[str, Any]]

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
    tags: list[str]
    entities: list[dict[str, Any]]
    related_stories: list[dict[str, Any]]

    @property
    def excerpt(self) -> str:
        return short_excerpt(self.summary, 185)


class GraphStore:
    def __init__(self, root_path: Path, source_path: Path | None = None):
        self.root_path = Path(root_path)
        self.data_dir = self.root_path / "data"
        self.db_path = self.data_dir / "ai_graph.db"
        self.seed_path = self.data_dir / "ai_graph_seed.json"
        self.source_path = Path(source_path) if source_path is not None else self.data_dir / "ai_master.md"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._signature: int | None = None
        self._entities: dict[str, EntityRecord] = {}
        self._stories: dict[str, StoryRecord] = {}
        self._entity_lookup = self._compile_entity_lookup()
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

    def _source_signature(self) -> str:
        if self.source_path.exists():
            return f"{DATASET_VERSION}:{int(self.source_path.stat().st_mtime_ns)}"
        return f"{DATASET_VERSION}:fallback"

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
                row = conn.execute("SELECT value FROM meta WHERE key = 'source_signature'").fetchone()
                count = conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0]
        except sqlite3.DatabaseError as exc:
            raise GraphStoreError("Failed to initialize the AI graph database.") from exc
        if count == 0 or not row or row[0] != self._source_signature():
            self.seed_database(reset=True)

    def seed_database(self, reset: bool = False) -> None:
        try:
            if self.source_path.exists():
                payload = self._build_payload_from_master_document()
            elif self.seed_path.exists():
                payload = json.loads(self.seed_path.read_text(encoding="utf-8"))
            else:
                raise GraphStoreError(
                    f"No dataset source was found. Set AI_MASTER_DOC_PATH or add a seed file at {self.seed_path}."
                )
            self._validate_payload(payload)
        except GraphStoreError:
            raise
        except (OSError, json.JSONDecodeError, KeyError, ValueError) as exc:
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

                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("dataset_name", payload.get("name", "AI Signal Graph")))
                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("source_signature", self._source_signature()))
                conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ("source_path", str(self.source_path)))

                conn.executemany(
                    "INSERT INTO entities (id, name, entity_type, group_name, description, importance) VALUES (:id, :name, :type, :group, :description, :importance)",
                    payload["entities"],
                )
                conn.executemany(
                    "INSERT INTO stories (id, title, kind, status, event_date, summary, details, importance) VALUES (:id, :title, :kind, :status, :date, :summary, :details, :importance)",
                    payload["stories"],
                )
                conn.executemany("INSERT INTO story_entities (story_id, entity_id) VALUES (?, ?)", payload["story_entities"])
                conn.executemany("INSERT INTO story_tags (story_id, tag) VALUES (?, ?)", payload["story_tags"])
                conn.executemany(
                    "INSERT INTO entity_links (source_id, target_id, relation, weight) VALUES (:source, :target, :relation, :weight)",
                    payload["entity_links"],
                )
        except sqlite3.DatabaseError as exc:
            raise GraphStoreError("Failed to rebuild the AI graph database.") from exc

        self._signature = None
        self._refresh()

    def _build_payload_from_master_document(self) -> dict[str, Any]:
        lines = self.source_path.read_text(encoding="utf-8").splitlines()
        stories: list[dict[str, Any]] = []
        seen: set[str] = set()
        current_section = ""
        current_subsection = ""
        current_year = ""
        i = 0

        while i < len(lines):
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
        story_entities: list[tuple[str, str]] = []
        story_tags: list[tuple[str, str]] = []
        for story in stories:
            for entity_id in story.pop("entity_ids"):
                connected_entities.add(entity_id)
                story_entities.append((story["id"], entity_id))
            for tag in story["tags"]:
                story_tags.append((story["id"], tag))

        entity_map = {item["id"]: item for item in ENTITY_DEFINITIONS}
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
                "details": "## Detail\n\nKimi K1.5 represented Moonshot AI's stronger push into the long-context and reasoning conversation.",
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

    def _story_from_table_row(self, row: str, section: str, subsection: str, current_year: str) -> dict[str, Any] | None:
        cells = [clean_md(cell) for cell in row.strip("|").split("|")]
        cells = [cell for cell in cells if cell]
        if not cells:
            return None

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
        if kind in {"timeline", "model-release", "policy", "infrastructure", "agents"}:
            score += 1
        if kind in {"analysis", "business"}:
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
        return {
            "id": item["id"],
            "name": item["name"],
            "type": item["type"],
            "group": item["group"],
            "description": item["description"],
            "importance": item["importance"],
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

    def _refresh(self) -> None:
        signature = self._db_signature()
        if signature == self._signature:
            return

        try:
            with self._connect() as conn:
                conn.row_factory = sqlite3.Row
                entity_rows = conn.execute("SELECT * FROM entities").fetchall()
                story_rows = conn.execute("SELECT * FROM stories").fetchall()
                story_entities = conn.execute("SELECT story_id, entity_id FROM story_entities").fetchall()
                story_tags = conn.execute("SELECT story_id, tag FROM story_tags").fetchall()
                entity_links = conn.execute("SELECT source_id, target_id, relation, weight FROM entity_links").fetchall()
        except sqlite3.DatabaseError as exc:
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
                tags=sorted(set(story_to_tags[row["id"]])),
                entities=entity_refs,
                related_stories=related_stories,
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
                story_count=len(stories),
                mention_count=sum(item.importance for item in stories) or len(stories),
                stories=[{"id": story.id, "title": story.title, "kind": story.kind, "status": story.status, "event_date": story.event_date} for story in stories],
                links=links_by_entity[row["id"]],
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
        featured_stories = list(self._stories.values())[:8]
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

    def get_graph_data(self) -> dict[str, Any]:
        self._refresh()
        nodes = []
        edges = []
        story_months = {
            story.id: timeline_month_key(story.event_date)
            for story in self._stories.values()
        }
        known_story_months = sorted((month for month in story_months.values() if month), key=timeline_month_sort_key)
        first_story_month = known_story_months[0] if known_story_months else "2020-01"
        last_story_month = known_story_months[-1] if known_story_months else first_story_month
        entity_first_seen: dict[str, str] = {}

        for entity in self._entities.values():
            candidate_months = [
                story_months.get(item["id"])
                for item in entity.stories
                if item["id"] in story_months and story_months.get(item["id"])
            ]
            if entity.entity_type == "year":
                candidate_months.append(f"{entity.name}-01")
            entity_first_seen[entity.id] = min(candidate_months, key=timeline_month_sort_key) if candidate_months else first_story_month

        for entity in self._entities.values():
            is_model = entity.entity_type == "model"
            frontend_type = graph_node_type(entity.entity_type, entity.group_name)
            nodes.append(
                {
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
                    "timeline_month": entity_first_seen.get(entity.id, first_story_month),
                }
            )

        for story in self._stories.values():
            story_month = story_months.get(story.id) or last_story_month
            nodes.append(
                {
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
                }
            )
            for entity in story.entities:
                target = self._entities.get(entity["id"])
                target_type = graph_node_type(target.entity_type, target.group_name) if target is not None else "topic"
                edges.append(
                    {
                        "source": f"story:{story.id}",
                        "target": f"entity:{entity['id']}",
                        "weight": 1,
                        "kind": "mentions",
                        "type": graph_edge_type("story", target_type, "mentions"),
                        "timeline_month": story_month,
                    }
                )

        for entity in self._entities.values():
            source_type = graph_node_type(entity.entity_type, entity.group_name)
            for link in entity.links:
                if link["weight"] >= 2 and entity.id < link["target_id"]:
                    source_month = entity_first_seen.get(entity.id, first_story_month)
                    target_month = entity_first_seen.get(link["target_id"], first_story_month)
                    target_entity = self._entities.get(link["target_id"])
                    target_type = graph_node_type(target_entity.entity_type, target_entity.group_name) if target_entity is not None else "topic"
                    edges.append(
                        {
                            "source": f"entity:{entity.id}",
                            "target": f"entity:{link['target_id']}",
                            "weight": max(1, link["weight"]),
                            "kind": link["relation"],
                            "type": graph_edge_type(source_type, target_type, link["relation"]),
                            "timeline_month": max(source_month, target_month),
                        }
                    )

        story_pair_keys: set[tuple[str, str]] = set()
        stories = list(self._stories.values())
        for index, story in enumerate(stories):
            current_entities = {entity["id"] for entity in story.entities}
            candidates = []
            for other in stories[index + 1 :]:
                overlap = len(current_entities.intersection({entity["id"] for entity in other.entities}))
                if overlap >= 3:
                    candidates.append((other.id, overlap))
            for target_id, weight in sorted(candidates, key=lambda item: (-item[1], item[0]))[:4]:
                story_pair_keys.add((story.id, target_id, weight))
        for source_id, target_id, weight in story_pair_keys:
            source_month = story_months.get(source_id) or first_story_month
            target_month = story_months.get(target_id) or first_story_month
            edges.append(
                {
                    "source": f"story:{source_id}",
                    "target": f"story:{target_id}",
                    "weight": weight,
                    "kind": "context",
                    "type": "story_context",
                    "timeline_month": max(source_month, target_month),
                }
            )

        return {
            "nodes": nodes,
            "edges": edges,
            "timeline": {
                "months": month_range(first_story_month, last_story_month),
                "start": first_story_month,
                "end": last_story_month,
            },
        }
