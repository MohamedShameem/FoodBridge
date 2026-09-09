type AgentCoreResponse = { result?: string; error?: string };

/**
 * Invoke an OAuth-protected AgentCore Runtime when configured.
 * The deterministic demo workflow remains available when no runtime exists.
 */
export async function invokeAgentCore(payload: Record<string, unknown>): Promise<string | null> {
  const runtimeUrl = process.env.AGENTCORE_RUNTIME_URL?.replace(/\/$/, '');
  if (!runtimeUrl) return null;
  const token = process.env.AGENTCORE_BEARER_TOKEN;
  const response = await fetch(`${runtimeUrl}/invocations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json() as AgentCoreResponse;
  if (!response.ok) throw new Error(body.error ?? 'AgentCore invocation failed.');
  return body.result ?? null;
}
