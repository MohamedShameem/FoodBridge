"""FoodBridge Strands agent deployed through Amazon Bedrock AgentCore Runtime."""

import json
from datetime import UTC, datetime

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool

from foodbridge.domain import rank_recipients
from model.load import load_model

app = BedrockAgentCoreApp()


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
Keep responses concise and report the workflow status.
"""

agent = Agent(
    model=load_model(),
    system_prompt=SYSTEM_PROMPT,
    tools=[find_eligible_recipients, request_human_approval, contact_recipient, assign_driver, send_notification, record_delivery],
)


@app.entrypoint
def invoke(payload: dict):
    """Accept a prompt or structured donation data using AgentCore's HTTP contract."""
    prompt = payload.get("prompt")
    if not prompt:
        prompt = "Coordinate this donation: " + json.dumps(payload, default=str)
    if not isinstance(prompt, str) or not prompt.strip():
        return {"error": "Provide a non-empty prompt or structured donation payload."}
    response = agent(prompt)
    return {"result": response.message["content"][0]["text"]}


if __name__ == "__main__":
    app.run()
