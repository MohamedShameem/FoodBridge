# FoodBridge demo script (about four minutes)

## 0:00–0:25 — Problem

“Every day, safe food is discarded while nearby families and community organizations need it. The problem is not just food supply; it is coordinating capacity, refrigeration, deadlines, calls, and transport fast enough.”

## 0:25–1:05 — Create a rescue

Open FoodBridge and create a refrigerated donation. Say: “A donor has 60 meals in Salmiya that must be collected before the deadline. FoodBridge captures the operational facts instead of starting with a generic chat.”

## 1:05–1:40 — Explain safe matching

Show the ranked partners. Say: “FoodBridge's Strands agent uses tools to evaluate capacity, cold storage, distance, and reliability. A model cannot override these deterministic safety constraints.”

## 1:40–2:10 — Human approval

Approve the top match. Say: “The agent recommends a safe recipient, but it deliberately pauses for the one decision that needs a human: authorizing outreach.”

## 2:10–2:50 — Coordinate pickup

Show the recipient acceptance, compatible driver assignment, and notifications. Say: “After approval, FoodBridge coordinates the handoff end-to-end rather than only telling an operator what to do.”

## 2:50–3:20 — Recovery workflow

Demonstrate a declined or unavailable recipient and the next eligible match. Say: “If the first partner cannot accept, FoodBridge recovers by selecting the next qualified option. It never relaxes capacity or refrigeration rules to complete the workflow.”

## 3:20–3:45 — Impact

Confirm delivery and show the meals-rescued metrics. Say: “A delivery is only recorded after a verified handoff, creating an accountable impact receipt.”

## 3:45–4:15 — Technical implementation and close

Show the architecture diagram and agent source. Say: “FoodBridge is built with the Strands Agents SDK, custom workflow tools, and Amazon Bedrock AgentCore Runtime. Groq provides the responsive user-facing path, GLM supplies a second route, and Nova Micro remains the final AWS fallback. The provider can change, but the deterministic safety gates and human approval checkpoint stay unchanged.”

Close: “FoodBridge turns surplus into support before time runs out.”
