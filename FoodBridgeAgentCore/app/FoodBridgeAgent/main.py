"""FoodBridge Strands agent deployed through Amazon Bedrock AgentCore Runtime."""

import json
import logging
import os
from datetime import UTC, datetime

from bedrock_agentcore.identity.auth import requires_api_key
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool

from foodbridge.domain import rank_recipients
from model.load import (
    BEDROCK_PROVIDER,
    GLM_PROVIDER,
    GROQ_PROVIDER,
    glm_is_configured,
    groq_is_configured,
    is_provider_unavailable_error,
    load_model,
)

app = BedrockAgentCoreApp()
logger = logging.getLogger(__name__)


@tool
def find_eligible_recipients(meals: int, refrigerated: bool) -> str:
    """Rank recipients that have enough capacity and meet cold-storage requirements."""
    return json.dumps({"eligible_recipients": rank_recipients(meals, refrigerated)})


@tool
def request_human_approval(donation_id: str, recipient_id: str, reason: str) -> str:
    """Request an operator's approval before a recipient is contacted."""
    return json.dumps({"status": "approval_required", "donation_id": donation_id, "recipient_id": recipient_id, "reason": reason})


@tool
def contact_recipient(recipient_id: str, meals: int, pickup_by: str) -> str:
    """Reserve recipient capacity after the human operator has approved the match."""
    return json.dumps({"status": "accepted", "recipient_id": recipient_id, "meals_reserved": meals, "pickup_by": pickup_by})


@tool
def assign_driver(area: str, refrigerated: bool, pickup_by: str) -> str:
    """Assign a compatible demo driver and create a pickup window."""
    vehicle = "refrigerated van" if refrigerated else "van"
    return json.dumps({"status": "assigned", "driver": "Omar Al-Sabah", "vehicle": vehicle, "area": area, "eta_minutes": 12, "pickup_by": pickup_by})


@tool
def send_notification(audience: str, message: str) -> str:
    """Send an auditable demo notification to a donor, recipient, or driver."""
    return json.dumps({"status": "sent", "audience": audience, "message": message, "sent_at": datetime.now(UTC).isoformat()})


@tool
def record_delivery(donation_id: str, meals_delivered: int) -> str:
    """Close a verified handoff and create the measurable impact record."""
    return json.dumps({"status": "completed", "donation_id": donation_id, "meals_rescued": meals_delivered, "receipt_created": True})


SYSTEM_PROMPT = """You are FoodBridge, an autonomous surplus-food rescue coordinator.
Move safe surplus food from a donor to an eligible community recipient before its pickup deadline.

Rules:
1. Use tools to perform work; do not merely describe an operator's next step.
2. Never match a donation to a recipient without enough capacity.
3. If refrigeration is required, only choose a recipient with refrigerated storage and a compatible driver.
4. Rank candidates, explain the best match in one sentence, then request human approval before contacting anyone.
5. After approval, contact the recipient, assign a driver, and notify all parties.
6. Do not claim a delivery is complete until the operator confirms the handoff.
7. Write for busy restaurant, charity, and volunteer coordinators. Use plain language and short, scannable sections.
8. Never expose model providers, infrastructure, SDK names, internal tool names, JSON, or code in a user-facing answer.
9. For a donation response, clearly show Status, Best match, Why it fits, and What happens next. Stay under 180 words unless asked for more detail.
10. When collecting a new donation, rely only on the "Facts already confirmed" list given to you each turn, never on your own memory of earlier turns. The only required facts are food type, meal count, pickup area, deadline, and refrigeration; the donor name is optional and must never be asked about — only record it if the user volunteers it. Ask exactly one short question for the single required fact that list is missing. Never ask again about a fact already present in that list. Do not use tools or guess missing facts, and never invent, assume, or default a value for a fact the user has not explicitly stated. While any fact is still missing, end your reply with exactly one line starting with `DRAFT:` followed by a JSON object with the keys donor, area, foodType, meals, pickupBy, refrigerated. Set each key to the literal JSON value null unless the user has explicitly stated it. For example, if only the food type and meal count are known so far, write exactly: DRAFT: {"donor":null,"area":null,"foodType":"sealed cooked meals","meals":25,"pickupBy":null,"refrigerated":null}. Once all five facts are known (none of them null), ask for review instead and end with exactly one line: READY: {"donor":"source name or Community donor","area":"area","foodType":"food description","meals":25,"pickupBy":"20:30","refrigerated":true}, using 24-hour HH:MM time. Never expose, explain, or mention the DRAFT or READY line to the user.
"""

TOOLS = [find_eligible_recipients, request_human_approval, contact_recipient, assign_driver, send_notification, record_delivery]


def build_agent(provider: str, *, api_key: str | None = None) -> Agent:
    """Build the same FoodBridge agent against the selected model provider."""
    return Agent(
        model=load_model(provider, api_key=api_key),
        system_prompt=SYSTEM_PROMPT,
        tools=TOOLS,
        # Provider routing is handled explicitly by run_agent.
        retry_strategy=None,
    )


PROVIDER_ORDER = (GROQ_PROVIDER, GLM_PROVIDER, BEDROCK_PROVIDER)


@requires_api_key(
    provider_name=os.getenv("GROQ_CREDENTIAL_PROVIDER_NAME", "foodbridge-groq")
)
async def build_identity_groq_agent(*, api_key: str) -> Agent:
    """Retrieve Groq's key from AgentCore Identity and create a fresh session."""
    return build_agent(GROQ_PROVIDER, api_key=api_key)


@requires_api_key(
    provider_name=os.getenv("GLM_CREDENTIAL_PROVIDER_NAME", "foodbridge-glm")
)
async def build_identity_glm_agent(*, api_key: str) -> Agent:
    """Retrieve GLM's key from AgentCore Identity and create a fresh session."""
    return build_agent(GLM_PROVIDER, api_key=api_key)


async def resolve_agent(provider: str) -> Agent | None:
    """Create an isolated Strands session using local or AgentCore credentials."""
    if provider == GROQ_PROVIDER:
        if groq_is_configured():
            return build_agent(provider)
        if os.getenv("GROQ_CREDENTIAL_PROVIDER_NAME"):
            return await build_identity_groq_agent()
        return None
    if provider == GLM_PROVIDER:
        if glm_is_configured():
            return build_agent(provider)
        if os.getenv("GLM_CREDENTIAL_PROVIDER_NAME"):
            return await build_identity_glm_agent()
        return None
    return build_agent(BEDROCK_PROVIDER)


async def run_agent(prompt: str):
    """Route Groq first, then GLM, keeping Amazon Bedrock as the final fallback."""
    last_error: Exception | None = None
    for provider in PROVIDER_ORDER:
        try:
            candidate = await resolve_agent(provider)
        except Exception as error:
            last_error = error
            logger.warning("%s credential unavailable; trying the next provider", provider)
            continue
        if candidate is None:
            continue
        try:
            response = await candidate.invoke_async(prompt)
            return response, provider, provider != GROQ_PROVIDER
        except Exception as error:
            last_error = error
            if provider == BEDROCK_PROVIDER or not is_provider_unavailable_error(error):
                raise
            logger.warning("%s unavailable; trying the next configured provider", provider)
    if last_error is not None:
        raise last_error
    raise RuntimeError("No model provider is configured.")


def extract_response_text(response) -> str:
    """Extract user-visible text while ignoring provider-specific reasoning blocks."""
    message = getattr(response, "message", None)
    if not isinstance(message, dict):
        raise RuntimeError("Model response did not contain a message.")
    content = message.get("content")
    if not isinstance(content, list):
        raise RuntimeError("Model response did not contain content blocks.")
    text = "".join(
        block["text"]
        for block in content
        if isinstance(block, dict) and isinstance(block.get("text"), str)
    ).strip()
    if not text:
        raise RuntimeError("Model response did not contain text.")
    return text


@app.entrypoint
async def invoke(payload: dict):
    """Accept a prompt or structured donation data using AgentCore's HTTP contract."""
    prompt = payload.get("prompt")
    if not prompt:
        prompt = "Coordinate this donation: " + json.dumps(payload, default=str)
    if not isinstance(prompt, str) or not prompt.strip():
        return {"error": "Provide a non-empty prompt or structured donation payload."}
    response, provider, fallback_used = await run_agent(prompt)
    return {
        "result": extract_response_text(response),
        "model_provider": provider,
        "fallback_used": fallback_used,
    }


if __name__ == "__main__":
    app.run()
