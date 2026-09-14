#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
node_bin="${FOODBRIDGE_NODE_BIN:-node}"
wrangler_cli="$project_dir/node_modules/wrangler/bin/wrangler.js"
runtime_arn="$(jq -r '.targets.default.resources.runtimes.FoodBridgeAgent.runtimeArn' "$project_dir/FoodBridgeAgentCore/agentcore/.cli/deployed-state.json")"

if ! "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo "Node.js 22+ is required. Set FOODBRIDGE_NODE_BIN to a Node.js 22+ executable." >&2
  exit 1
fi

if [[ -z "$runtime_arn" || "$runtime_arn" == "null" ]]; then
  echo "FoodBridge AgentCore runtime ARN was not found. Deploy the agent first." >&2
  exit 1
fi

foodbridge_bridge_secret="$(openssl rand -hex 32)"

aws cloudformation deploy \
  --region us-west-2 \
  --stack-name FoodBridgeAgentBridge \
  --template-file "$project_dir/infra/agentcore-bridge.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "RuntimeArn=$runtime_arn" "BridgeSecret=$foodbridge_bridge_secret"

bridge_url="$(aws cloudformation describe-stacks \
  --region us-west-2 \
  --stack-name FoodBridgeAgentBridge \
  --query 'Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue' \
  --output text)"

cd "$project_dir"
printf '%s' "$bridge_url" | "$node_bin" "$wrangler_cli" secret put AGENTCORE_RUNTIME_URL
printf '%s' "$foodbridge_bridge_secret" | "$node_bin" "$wrangler_cli" secret put AGENTCORE_BRIDGE_KEY

unset foodbridge_bridge_secret
echo "AgentCore bridge deployed and Cloudflare secrets configured."
