# backend/config.py
from __future__ import annotations
import json
import logging
import os
import re
from pathlib import Path
from functools import lru_cache
from typing import TypeVar

from dotenv import load_dotenv
from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Load .env from backend/ directory — do this BEFORE anything else
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path, override=True)


class Settings:
    """Simple settings class that reads from environment variables."""

    def __init__(self):
        self.tavily_api_key: str = os.getenv("TAVILY_API_KEY", "")
        self.exa_api_key: str = os.getenv("EXA_API_KEY", "")
        self.serper_api_key: str = os.getenv("SERPER_API_KEY", "")
        self.openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
        self.llm_provider: str = "openrouter"
        self.llm_model: str = os.getenv("LLM_MODEL", "deepseek/deepseek-v3.2")
        self.cache_dir: str = os.getenv("CACHE_DIR", "cache")
        self.langsmith_tracing: bool = os.getenv("LANGCHAIN_TRACING_V2", "").lower() == "true"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def get_llm():
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY not set")
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0,
        max_tokens=16384,
        request_timeout=300,
    )


def _strip_fences(text: str) -> str:
    """Remove markdown code fences from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text


def invoke_structured(llm, schema: type[T], messages: list) -> T:
    """Call LLM with structured output, with fence-stripping fallback.

    Tries with_structured_output first (json_schema mode). If parsing fails
    due to markdown fences in the response, falls back to raw invoke +
    manual JSON parsing.
    """
    try:
        structured_llm = llm.with_structured_output(schema)
        return structured_llm.invoke(messages)
    except Exception as first_err:
        # Check if this is a JSON parsing error (e.g. markdown fences)
        err_str = str(first_err)
        if "json" not in err_str.lower() and "invalid" not in err_str.lower():
            raise

        logger.warning("Structured output failed, retrying with manual parsing: %s", first_err)

        # Fallback: raw invoke + strip fences + parse manually
        response = llm.invoke(messages)
        text = _strip_fences(response.content)
        return schema.model_validate_json(text)
