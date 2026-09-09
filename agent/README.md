# FoodBridge AgentCore service

This package is the required Strands Agents implementation. It contains the model configuration, safety rules, tools, and AgentCore Runtime entry point. The web dashboard can run independently in transparent demo mode while AWS credentials are being configured.

## Local setup

```bash
uv sync
uv run python main.py
```

Invoke the local AgentCore contract:

```bash
curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Coordinate 60 refrigerated meals in Salmiya before 9 PM."}'
```

## AgentCore deployment

Install the current AgentCore CLI, configure AWS credentials, and create a Python/Strands/Bedrock CodeZip project. Replace the generated `main.py` and package files with this directory, then run `agentcore deploy`. The runtime role needs Bedrock model-invocation and CloudWatch logging permissions.

See the root README for the complete deployment checklist and architecture.
