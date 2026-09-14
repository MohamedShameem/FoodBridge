"""Load FoodBridge's Groq, GLM, and final-fallback Bedrock models."""

import os

from botocore.config import Config
from strands.models.bedrock import BedrockModel

BEDROCK_PROVIDER = "bedrock"
GLM_PROVIDER = "glm"
GROQ_PROVIDER = "groq"


def _local_api_key(provider: str) -> str:
    """Read direct or AgentCore CLI-injected local credentials."""
    normalized = provider.strip().upper()
    return (
        os.getenv(f"{normalized}_API_KEY", "")
        or os.getenv(f"AGENTCORE_CREDENTIAL_FOODBRIDGE_{normalized}", "")
    ).strip()


def groq_is_configured() -> bool:
    """Return whether a local Groq credential is available."""
    return bool(_local_api_key(GROQ_PROVIDER))


def glm_is_configured() -> bool:
    """Return whether a GLM API credential is available without exposing it."""
    return bool(_local_api_key(GLM_PROVIDER))


def load_model(provider: str = BEDROCK_PROVIDER, *, api_key: str | None = None):
    """Create a Strands model provider without making a network request."""
    normalized = provider.strip().lower()
    if normalized == GROQ_PROVIDER:
        resolved_api_key = (api_key or _local_api_key(GROQ_PROVIDER)).strip()
        if not resolved_api_key:
            raise RuntimeError("GROQ_API_KEY is required when the Groq provider is selected.")
        from strands.models.openai import OpenAIModel

        return OpenAIModel(
            client_args={
                "api_key": resolved_api_key,
                "base_url": os.getenv(
                    "GROQ_BASE_URL", "https://api.groq.com/openai/v1"
                ),
                "timeout": 20,
                "max_retries": 0,
            },
            model_id=os.getenv("GROQ_MODEL_ID", "openai/gpt-oss-20b"),
            params={
                "max_tokens": 1600,
                "reasoning_effort": "low",
                "extra_body": {"reasoning_format": "hidden"},
            },
        )
    if normalized == BEDROCK_PROVIDER:
        return BedrockModel(
            model_id=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-micro-v1:0"),
            boto_client_config=Config(
                connect_timeout=5,
                read_timeout=8,
                retries={"mode": "standard", "total_max_attempts": 1},
            ),
        )
    if normalized == GLM_PROVIDER:
        resolved_api_key = (api_key or _local_api_key(GLM_PROVIDER)).strip()
        if not resolved_api_key:
            raise RuntimeError("GLM_API_KEY is required when the GLM provider is selected.")
        from strands.models.openai import OpenAIModel

        return OpenAIModel(
            client_args={
                "api_key": resolved_api_key,
                "base_url": os.getenv(
                    "GLM_BASE_URL", "https://api.z.ai/api/paas/v4/"
                ),
                "timeout": 45,
                "max_retries": 0,
            },
            model_id=os.getenv("GLM_MODEL_ID", "glm-5.1"),
        )
    raise ValueError(f"Unsupported MODEL_PROVIDER: {provider}")


def is_provider_unavailable_error(error: BaseException) -> bool:
    """Recognize provider failures that are safe to route to the next model."""
    messages: list[str] = []
    current: BaseException | None = error
    while current is not None and len(messages) < 5:
        messages.append(f"{type(current).__name__}: {current}".lower())
        current = current.__cause__ or current.__context__
    text = " ".join(messages)
    return any(
        marker in text
        for marker in (
            "throttlingexception",
            "too many tokens per day",
            "too many requests",
            "accessdeniedexception",
            "modelnotreadyexception",
            "readtimeouterror",
            "read timeout",
            "read timed out",
            "connecttimeouterror",
            "endpointconnectionerror",
            "ratelimiterror",
            "authenticationerror",
            "permissiondeniederror",
            "apiconnectionerror",
            "apitimeouterror",
            "internalservererror",
            "service unavailable",
            "resource not found",
            "status code: 429",
            "status code: 401",
            "status code: 403",
            "parsing failed",
            "could not be parsed",
        )
    )


# Compatibility alias for older imports and external checks.
is_bedrock_unavailable_error = is_provider_unavailable_error
