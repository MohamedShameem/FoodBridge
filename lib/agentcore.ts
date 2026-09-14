import { env } from 'cloudflare:workers';

export type AgentCoreResult = {
  result: string;
  modelProvider: string;
  fallbackUsed: boolean;
};

export class AgentCoreUnavailableError extends Error {
  constructor(message = 'The live FoodBridge agent is temporarily unavailable.') {
    super(message);
    this.name = 'AgentCoreUnavailableError';
  }
}

type AgentCoreResponse = {
  result?: string;
  error?: string;
  model_provider?: string;
  fallback_used?: boolean;
};

function runtimeSetting(name: 'AGENTCORE_RUNTIME_URL' | 'AGENTCORE_BEARER_TOKEN' | 'AGENTCORE_BRIDGE_KEY') {
  const workerValue = (env as unknown as Record<string, unknown>)[name];
  if (typeof workerValue === 'string' && workerValue.trim()) return workerValue.trim();
  return process.env[name]?.trim();
}

function configuredRuntimeUrl() {
  const configured = runtimeSetting('AGENTCORE_RUNTIME_URL')?.replace(/\/$/, '');
  if (configured) return configured;
  return process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8080' : null;
}

export function isAgentCoreConfigured() {
  return Boolean(configuredRuntimeUrl());
}

/** Invoke AgentCore through either a bearer-protected runtime or the AWS bridge. */
export async function invokeAgentCoreDetailed(payload: Record<string, unknown>): Promise<AgentCoreResult | null> {
  const runtimeUrl = configuredRuntimeUrl();
  if (!runtimeUrl) return null;
  const token = runtimeSetting('AGENTCORE_BEARER_TOKEN');
  const bridgeKey = runtimeSetting('AGENTCORE_BRIDGE_KEY');
  const invocationUrl = runtimeUrl.endsWith('/invocations') ? runtimeUrl : `${runtimeUrl}/invocations`;
  const response = await fetch(invocationUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(bridgeKey ? { 'X-FoodBridge-Key': bridgeKey } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({})) as AgentCoreResponse;
  if (!response.ok) throw new Error(body.error ?? 'AgentCore invocation failed.');
  if (!body.result) throw new Error('AgentCore returned an empty response.');
  return {
    result: body.result,
    modelProvider: body.model_provider ?? 'unknown',
    fallbackUsed: Boolean(body.fallback_used),
  };
}

export async function invokeAgentCore(payload: Record<string, unknown>): Promise<string | null> {
  const response = await invokeAgentCoreDetailed(payload);
  return response?.result ?? null;
}
