# FoodBridge — Devpost submission copy

## Short description

FoodBridge uses a Strands AI agent to match surplus food with qualified community partners, coordinate pickups, and prevent waste before time runs out.

## Inspiration

Surplus food is often available, community organizations often have demand, and volunteer drivers are often nearby. What fails is the coordination: capacity, cold storage, deadlines, calls, rejections, and handoffs must all line up quickly. FoodBridge turns that chain of work into one accountable workflow.

## What it does

FoodBridge accepts a time-sensitive donation, applies deterministic safety constraints, ranks eligible recipients, and asks a coordinator for approval before any recipient is contacted. After approval, the agent reserves capacity, assigns a compatible driver, sends auditable notifications, and records the verified handoff. If a recipient cannot accept the donation, FoodBridge continues to the next safe match.

## How we built it

The agent is built with the Strands Agents SDK. Its custom tools handle recipient matching, human approval, dispatch, notifications, and delivery receipts. Groq GPT-OSS 20B is the responsive fast path, GLM is the secondary provider, and Amazon Nova Micro remains the final AWS fallback. The Next.js interface runs on Cloudflare Workers with D1 persistence and reaches the deployed Amazon Bedrock AgentCore Runtime through a secret-protected, least-privilege AWS Lambda bridge.

## Safety and human control

Capacity and refrigeration requirements are deterministic constraints, not optional model suggestions. FoodBridge never contacts a recipient without coordinator approval and never records a delivery until the handoff is confirmed. All public demo identities and activity are synthetic.

## Challenges we ran into

The AWS account's Bedrock inference quota was provisioned as zero across regions despite approved model agreements. We designed a transparent multi-provider route through the same Strands agent: Groq first, GLM second, and Nova Micro retained as the final AWS fallback. We also bridged Cloudflare to AgentCore without sending AWS credentials to the browser. The live site now runs the deployed agent and preserves an auditable human-approval workflow.

## What's next

FoodBridge can add live recipient availability, driver confirmation, multilingual notifications, and privacy-preserving partner integrations. The core safety gates stay unchanged as the system connects to real community networks.

## Submission checklist

- Track: Good Neighbor Agents
- Public code repository: change the current GitHub repository from private to public before final submission
- License: MIT
- Architecture diagram: `docs/ARCHITECTURE.md`
- Video: public YouTube or Vimeo link, five minutes or less
- Live demo: https://foodbridge.byshameem.space
