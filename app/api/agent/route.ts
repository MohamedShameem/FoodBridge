import { invokeAgentCoreDetailed } from '@/lib/agentcore';
import { finalizeDraft, isCompleteDraft, mergeDraft, normalizeDraft, parseDonationDraft, stripDonationMarker } from '@/lib/structured-donation';

type ChatTurn = { role?: string; content?: string };
type SuggestedAction = { label: string; prompt: string; tone?: 'primary' | 'secondary' };

function suggestedActions(message: string, result: string): SuggestedAction[] {
  const input = message.toLowerCase();
  const answer = result.toLowerCase();
  const approvalRequested = /paused (?:for|pending).*approval|do you approve|please approve|approve (?:the|this) (?:recommended|selected)/.test(answer);
  const approvalGiven = /\b(i approve|approved|approve the|yes,? proceed|go ahead)\b/.test(input);
  const handoffReady = approvalGiven || /pickup (?:is|has been) (?:scheduled|arranged)|(?:driver|volunteer) (?:is|has been) assigned|all parties (?:are|have been) notified/.test(answer);

  if (/refrigerat|keep.*cold|chilled|cold storage/.test(answer) && /\?|need to know|tell me/.test(answer)) {
    return [
      { label: 'Keep it chilled', prompt: 'Yes, the food needs to stay refrigerated.', tone: 'primary' },
      { label: 'No refrigeration', prompt: 'No, the food can be transported at room temperature.' },
    ];
  }
  if (/how many|meal count|quantity|number of meals/.test(answer)) {
    return [
      { label: 'About 25 meals', prompt: 'There are about 25 meals.' },
      { label: 'About 50 meals', prompt: 'There are about 50 meals.' },
      { label: 'About 100 meals', prompt: 'There are about 100 meals.' },
    ];
  }
  if (/area|where.*pickup|location/.test(answer) && /\?/.test(answer)) {
    return [
      { label: 'Salmiya', prompt: 'The pickup is in Salmiya.' },
      { label: 'Hawally', prompt: 'The pickup is in Hawally.' },
      { label: 'Kuwait City', prompt: 'The pickup is in Kuwait City.' },
    ];
  }
  if (/deadline|collect before|pickup time|what time/.test(answer)) {
    return [
      { label: 'Before 8 PM', prompt: 'Please collect it before 8 PM.' },
      { label: 'Before 9 PM', prompt: 'Please collect it before 9 PM.' },
      { label: 'Before 10 PM', prompt: 'Please collect it before 10 PM.' },
    ];
  }
  if (/what (?:food|kind)|food type|describe the food/.test(answer)) {
    return [
      { label: 'Sealed cooked meals', prompt: 'They are sealed cooked meals.' },
      { label: 'Fresh bakery items', prompt: 'They are fresh bakery items.' },
    ];
  }

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
  const body = await request.json() as { message?: unknown; history?: ChatTurn[]; draft?: unknown };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return Response.json({ error: 'Enter a message for the FoodBridge agent.' }, { status: 400 });
  if (message.length > 2000) return Response.json({ error: 'Keep the message under 2,000 characters.' }, { status: 400 });

  const history = Array.isArray(body.history)
    ? body.history.slice(-30).filter((turn) => turn?.role && turn?.content)
    : [];
  const priorDraft = normalizeDraft(body.draft);
  const knownFacts = priorDraft
    ? Object.fromEntries(Object.entries(priorDraft).filter(([, value]) => value !== null))
    : null;
  const knownFactsLine = knownFacts && Object.keys(knownFacts).length
    ? `Facts already confirmed earlier in this conversation: ${JSON.stringify(knownFacts)}. Do not ask about any of these fields again. Only ask about whichever required fields are missing from this list. If the user's latest message changes one of these values, update just that field and keep the rest unchanged.`
    : '';
  const prompt = [
    'You are speaking with a FoodBridge operations coordinator in the web workspace.',
    'Answer the latest message directly. If the user is describing a new donation, collect these required facts: food type, estimated number of meals, pickup area, collection deadline, and whether refrigeration is required. The donor name is optional and is never one of the required facts — only record it if the user volunteers it, never ask for it. Trust only the "Facts already confirmed" list below for what is already known, not your own reading of the conversation. Ask exactly one short follow-up question for the single required fact still missing from that list. Do not guess, choose defaults, or call rescue tools until every required fact is known.',
    'While any required fact is still missing, end your answer with exactly one line starting with `DRAFT:` followed by a JSON object with the keys donor, area, foodType, meals, pickupBy, refrigerated. Set each key to the literal JSON value null unless the user has explicitly stated it — never invent, assume, or default a value. For example, if only the food type and meal count are known so far, write exactly: DRAFT: {"donor":null,"area":null,"foodType":"sealed cooked meals","meals":25,"pickupBy":null,"refrigerated":null}. Use 24-hour HH:MM time once pickupBy is known.',
    'When every required donation fact is known, do not run the rescue yet. Briefly ask the user to review the details, then end your answer with exactly one machine-readable line in this format: READY: {"donor":"source name or Community donor","area":"Salmiya","foodType":"sealed cooked meals","meals":25,"pickupBy":"20:30","refrigerated":true}. Never show READY until all five required facts are known. Never show both a DRAFT line and a READY line in the same answer.',
    knownFactsLine,
    knownFactsLine ? 'The latest message below is very likely the user answering the single question you asked last turn. Read it carefully and check whether it supplies the one fact still missing before you decide what to ask next — do not repeat a question the latest message already answered.' : '',
    'For any existing rescue, use your rescue tools, rank safe recipients, and stop for human approval before contacting anyone.',
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
    // Merge with what was already confirmed so one turn where the model omits or drops a field
    // (it happens) never regresses a fact the user already gave earlier in the conversation.
    const donationDraft = mergeDraft(priorDraft, parseDonationDraft(response.result));
    const structuredDonation = isCompleteDraft(donationDraft) ? finalizeDraft(donationDraft!) : null;
    const result = stripDonationMarker(response.result) || (structuredDonation ? '## Ready to start\n\nPlease review the donation details below.' : response.result);
    return Response.json({
      ...response,
      result,
      structuredDonation,
      donationDraft,
      runtimeMode: 'agentcore',
      latencyMs: Date.now() - startedAt,
      suggestedActions: structuredDonation ? [] : suggestedActions(message, result),
    });
  } catch (error) {
    console.error('AgentCore chat invocation failed', error);
    return Response.json({
      error: 'The live agent could not complete this request. Please try again.',
      runtimeMode: 'unavailable',
    }, { status: 502 });
  }
}
