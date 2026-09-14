import { invokeAgentCoreDetailed } from '@/lib/agentcore';

type ChatTurn = { role?: string; content?: string };
type SuggestedAction = { label: string; prompt: string; tone?: 'primary' | 'secondary' };

function suggestedActions(message: string, result: string): SuggestedAction[] {
  const input = message.toLowerCase();
  const answer = result.toLowerCase();
  const approvalRequested = /paused (?:for|pending).*approval|do you approve|please approve|approve (?:the|this) (?:recommended|selected)/.test(answer);
  const approvalGiven = /\b(i approve|approved|approve the|yes,? proceed|go ahead)\b/.test(input);
  const handoffReady = approvalGiven || /pickup (?:is|has been) (?:scheduled|arranged)|(?:driver|volunteer) (?:is|has been) assigned|all parties (?:are|have been) notified/.test(answer);

  if (approvalRequested && !approvalGiven) {
    return [
      { label: 'Approve recommendation', prompt: 'I approve the recommended recipient for this rescue. Continue by contacting the recipient, assigning a compatible driver, and notifying all parties.', tone: 'primary' },
      { label: 'Show other recipients', prompt: 'Show me the next two eligible recipients and compare their capacity, distance, refrigeration, and reliability.' },
      { label: 'Explain this match', prompt: 'Explain briefly why the recommended recipient is the safest choice for this donation.' },
    ];
  }

  if (handoffReady) {
    return [
      { label: 'Show rescue status', prompt: 'Show the current rescue status, including the recipient, assigned volunteer, pickup time, and who has been notified.', tone: 'primary' },
      { label: 'Recipient unavailable', prompt: 'The selected recipient is unavailable. Run the fallback plan and recommend the next safe recipient.' },
      { label: 'Confirm handoff', prompt: 'The food handoff is complete. Record the delivery and summarize the impact.' },
    ];
  }

  if (input.includes('other recipient') || input.includes('alternative') || input.includes('different recipient')) {
    return [
      { label: 'Choose best alternative', prompt: 'Choose the highest-ranked safe alternative and pause for my approval.', tone: 'primary' },
      { label: 'Keep original match', prompt: 'Keep the original recommended recipient and ask for my approval.' },
    ];
  }

  return [
    { label: 'Try a sample donation', prompt: 'Coordinate 60 refrigerated meals in Salmiya before 9 PM.', tone: 'primary' },
    { label: 'Explain your process', prompt: 'Explain the rescue workflow and where human approval is required.' },
  ];
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = await request.json() as { message?: unknown; history?: ChatTurn[] };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return Response.json({ error: 'Enter a message for the FoodBridge agent.' }, { status: 400 });
  if (message.length > 2000) return Response.json({ error: 'Keep the message under 2,000 characters.' }, { status: 400 });

  const history = Array.isArray(body.history)
    ? body.history.slice(-6).filter((turn) => turn?.role && turn?.content)
    : [];
  const prompt = [
    'You are speaking with a FoodBridge operations coordinator in the web workspace.',
    'Answer the latest message directly. When donation details are supplied, use your rescue tools, rank safe recipients, and stop for human approval before contacting anyone.',
    'Write for a busy restaurant, charity, or volunteer coordinator. Use plain language and short sentences. Do not mention model providers, SDKs, runtime infrastructure, internal tool names, JSON, or code.',
    'Format the answer for quick scanning: use a short heading and bullets when useful. For a donation, clearly show Status, Best match, Why it fits, and What happens next. Keep the response under 180 words unless the user asks for more detail.',
    history.length ? `Recent conversation: ${JSON.stringify(history)}` : '',
    `Latest message: ${message}`,
  ].filter(Boolean).join('\n\n');

  try {
    const response = await invokeAgentCoreDetailed({ prompt });
    if (!response) return Response.json({
      error: 'FoodBridge is not connected right now. Please try again shortly.',
      runtimeMode: 'unavailable',
    }, { status: 503 });
    return Response.json({
      ...response,
      runtimeMode: 'agentcore',
      latencyMs: Date.now() - startedAt,
      suggestedActions: suggestedActions(message, response.result),
    });
  } catch (error) {
    console.error('AgentCore chat invocation failed', error);
    return Response.json({
      error: 'The live agent could not complete this request. Please try again.',
      runtimeMode: 'unavailable',
    }, { status: 502 });
  }
}
