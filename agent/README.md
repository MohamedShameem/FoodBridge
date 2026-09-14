# FoodBridge AgentCore service

This package is the required Strands Agents implementation. It contains the model configuration, safety rules, tools, and AgentCore Runtime entry point. Groq GPT-OSS 20B is the fast path, GLM is the secondary route, and Amazon Nova Micro is retained as the final AWS fallback. The web dashboard can run independently in transparent demo mode while credentials are being configured.

## Local setup

```bash
uv sync
uv run python main.py
```

Copy the values from `.env.example` into an untracked local environment. Keep all API keys untracked. The routing order is Groq, GLM, then Amazon Bedrock.

Invoke the local AgentCore contract:

```bash
curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Coordinate 60 refrigerated meals in Salmiya before 9 PM."}'
```

## AgentCore deployment

The prepared CodeZip project is in `../FoodBridgeAgentCore`. Its runtime role needs Bedrock model-invocation and CloudWatch logging permissions. Store external model credentials in AgentCore Identity under `foodbridge-groq` and `foodbridge-glm`; never place them in committed environment or JSON files.

See the root README for the complete deployment checklist and architecture.
