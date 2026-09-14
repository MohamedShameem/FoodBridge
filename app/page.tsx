'use client';

import Image from 'next/image';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DonationDraft, StructuredDonation } from '@/lib/structured-donation';
import { speak, speechOutputSupported, speechRecognitionSupported, startDictation, stopSpeaking } from '@/lib/voice';

type RuntimeMode = 'agentcore' | 'unavailable';
type Donation = {
  id: string; donor: string; area: string; foodType: string; meals: number; pickupBy: string;
  refrigerated: number; status: string; partnerId: string | null; driverId: string | null;
  agentSummary: string | null; modelProvider: string | null; runtimeMode: string | null;
  createdAt: string; completedAt: string | null;
};
type Activity = { id: number; donationId: string; kind: string; title: string; detail: string; createdAt: string };
type Partner = { id: string; name: string; area: string; distanceKm: number; capacity: number; refrigerated: number; reliability: number };
type Driver = { id: string; name: string; area: string; vehicle: string; status: string; completedTrips: number };
type Metrics = { mealsRescued: number; completedRescues: number; activeRescues: number; totalRescues: number };
type AppState = { donations: Donation[]; activities: Activity[]; partners: Partner[]; drivers: Driver[]; current: Donation | null; runtimeMode: RuntimeMode; metrics: Metrics };
type ChatWorkflowAction = 'sample' | 'createDonation' | 'approve' | 'reroute' | 'status' | 'complete' | 'openForm' | 'openRescue';
type AgentAction = { label: string; prompt?: string; workflow?: ChatWorkflowAction; tone?: 'primary' | 'secondary' };
type AgentMessage = { id: number; role: 'assistant' | 'user'; content: string; provider?: string; fallbackUsed?: boolean; runtimeMode?: RuntimeMode; latencyMs?: number; actions?: AgentAction[] };
type WorkflowProgress = { title: string; detail: string; steps: string[]; active: number; elapsed: number };
type SoundKind = 'approval' | 'success' | 'complete' | 'response';
type DictationHandle = { stop: () => void; cancel: () => void };

const emptyState: AppState = {
  donations: [], activities: [], partners: [], drivers: [], current: null, runtimeMode: 'unavailable',
  metrics: { mealsRescued: 0, completedRescues: 0, activeRescues: 0, totalRescues: 0 },
};

const navItems = [
  ['overview', 'Live rescue', '⌁'],
  ['agent', 'Ask FoodBridge', '✦'],
  ['rescues', 'Rescue history', '✓'],
  ['network', 'Partner network', '◫'],
] as const;

const starterMessages: AgentMessage[] = [{
  id: 1,
  role: 'assistant',
  content: '## Ready to coordinate a rescue\n\nTell me what food is available, or use the sample below to watch the complete workflow. I’ll always show a button when your approval is needed.',
  actions: [
    { label: 'Start sample rescue', workflow: 'sample', tone: 'primary' },
    { label: 'Add my own donation', workflow: 'openForm' },
    { label: 'How it works', prompt: 'Explain simply how FoodBridge coordinates a rescue and when you need my approval.' },
  ],
}];

function statusLabel(status: string) {
  return ({ approval_required: 'Approval needed', scheduled: 'Pickup scheduled', completed: 'Delivered' } as Record<string, string>)[status] ?? status;
}

function formatDate(value: string | null, withTime = true) {
  if (!value) return 'Not completed';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'Asia/Kuwait',
  }).format(new Date(value));
}

function progressStepsFor(message: string) {
  const lower = message.toLowerCase();
  if (/approve|go ahead|proceed/.test(lower)) return ['Confirming your approval', 'Contacting the recipient', 'Finding the right volunteer', 'Preparing the pickup plan'];
  if (/alternative|unavailable|reroute/.test(lower)) return ['Reviewing the current match', 'Checking available partners', 'Comparing safe alternatives', 'Preparing your options'];
  return ['Understanding your request', 'Checking food safety needs', 'Reviewing nearby partners', 'Preparing a clear answer'];
}

function workflowFor(action: string): Omit<WorkflowProgress, 'active' | 'elapsed'> {
  if (action === 'approve') return { title: 'Setting up the rescue', detail: 'Your approval is confirmed. FoodBridge is arranging the handoff now.', steps: ['Confirming your decision', 'Reserving recipient capacity', 'Assigning a suitable volunteer', 'Sharing the pickup plan'] };
  if (action === 'reroute') return { title: 'Finding another safe match', detail: 'FoodBridge is checking the next eligible partners.', steps: ['Reviewing the current match', 'Checking remaining capacity', 'Comparing safe alternatives', 'Preparing a new recommendation'] };
  if (action === 'complete') return { title: 'Recording the handoff', detail: 'FoodBridge is closing the rescue and updating its verified impact.', steps: ['Confirming the handoff', 'Saving the delivery time', 'Updating rescued meals', 'Creating the final receipt'] };
  return { title: 'Finding the best rescue match', detail: 'You can follow each check while FoodBridge prepares your approval.', steps: ['Reading the donation', 'Checking storage and capacity', 'Comparing nearby recipients', 'Preparing your approval card'] };
}

function actionsForRescue(donation: Donation | null): AgentAction[] {
  if (donation?.status === 'approval_required') return [
    { label: 'Approve this match', workflow: 'approve', tone: 'primary' },
    { label: 'Show another recipient', workflow: 'reroute' },
    { label: 'Open rescue details', workflow: 'openRescue' },
  ];
  if (donation?.status === 'scheduled') return [
    { label: 'Show pickup status', workflow: 'status', tone: 'primary' },
    { label: 'Confirm completed handoff', workflow: 'complete' },
    { label: 'Open rescue details', workflow: 'openRescue' },
  ];
  return [
    { label: 'Start sample rescue', workflow: 'sample', tone: 'primary' },
    { label: 'Add my own donation', workflow: 'openForm' },
    ...(donation ? [{ label: 'View latest receipt', workflow: 'openRescue' as const }] : []),
  ];
}

function rescueChatSummary(state: AppState) {
  const donation = state.current;
  if (!donation) return '## Ready for a rescue\n\nAdd a donation or run the sample workflow.';
  const recipient = state.partners.find((item) => item.id === donation.partnerId);
  const volunteer = state.drivers.find((item) => item.id === donation.driverId);
  if (donation.status === 'approval_required') return `## Match ready for approval\n\n**Status:** Paused for your decision\n\n**Best match:** ${recipient?.name ?? 'Qualified community partner'}\n\n**Why it fits:** Capacity, distance${donation.refrigerated ? ', refrigerated storage' : ''}, and reliability checks passed for all ${donation.meals} meals.\n\n**What happens next:** Press **Approve this match** below. FoodBridge will then arrange the volunteer and pickup plan.`;
  if (donation.status === 'scheduled') return `## Pickup arranged\n\n**Recipient:** ${recipient?.name ?? 'Confirmed recipient'}\n\n**Volunteer:** ${volunteer?.name ?? 'Assigned volunteer'}${volunteer?.vehicle ? ` · ${volunteer.vehicle}` : ''}\n\n**Collect before:** ${donation.pickupBy}\n\nThe food source, recipient, and volunteer have a pickup plan. After the food changes hands, press **Confirm completed handoff**.`;
  return `## Rescue completed\n\n**${donation.meals} meals delivered**\n\nThe handoff to ${recipient?.name ?? 'the recipient'} was confirmed on ${formatDate(donation.completedAt)}. The verified impact total and rescue history are updated.`;
}

function inlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function tableCells(line: string) {
  return line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function FormattedAgentResponse({ content }: { content: string }) {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (line.includes('|') && lines[index + 1]?.match(/^\s*\|?\s*:?-{3,}/)) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|')) { rows.push(tableCells(lines[index])); index += 1; }
      blocks.push(<div className="response-table-wrap" key={`table-${index}`}><table><thead><tr>{headers.map((cell) => <th key={cell}>{inlineText(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{inlineText(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    if (/^#{1,4}\s+/.test(line)) {
      blocks.push(<h4 key={`heading-${index}`}>{inlineText(line.replace(/^#{1,4}\s+/, ''))}</h4>);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^[-*]\s+/, '')); index += 1; }
      blocks.push(<ul key={`list-${index}`}>{items.map((item) => <li key={item}>{inlineText(item)}</li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^\d+[.)]\s+/, '')); index += 1; }
      blocks.push(<ol key={`ordered-${index}`}>{items.map((item) => <li key={item}>{inlineText(item)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4}\s+|[-*]\s+|\d+[.)]\s+)/.test(lines[index].trim()) && !(lines[index].includes('|') && lines[index + 1]?.match(/^\s*\|?\s*:?-{3,}/))) {
      paragraph.push(lines[index].trim()); index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{inlineText(paragraph.join(' '))}</p>);
  }

  return <div className="formatted-response">{blocks}</div>;
}

export default function Home() {
  const [data, setData] = useState<AppState>(emptyState);
  const [view, setView] = useState<(typeof navItems)[number][0]>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>(starterMessages);
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentProgress, setAgentProgress] = useState({ steps: [] as string[], active: 0, elapsed: 0 });
  const [workflowProgress, setWorkflowProgress] = useState<WorkflowProgress | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [structuredDonation, setStructuredDonation] = useState<StructuredDonation | null>(null);
  const [donationDraft, setDonationDraft] = useState<DonationDraft | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const dictationRef = useRef<DictationHandle | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const loadState = useCallback(async () => {
    const response = await fetch('/api/rescues', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load the live rescue workspace.');
    const next = await response.json() as AppState;
    setData(next);
  }, []);

  useEffect(() => {
    loadState().catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load data.')).finally(() => setLoading(false));
  }, [loadState]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [agentMessages, agentProgress.active, agentBusy, structuredDonation]);

  useEffect(() => {
    setMicSupported(speechRecognitionSupported());
    setVoiceSupported(speechOutputSupported());
    return () => {
      dictationRef.current?.cancel();
      stopSpeaking();
    };
  }, []);

  const current = data.donations.find((item) => item.id === selectedId) ?? data.current;
  const partner = data.partners.find((item) => item.id === current?.partnerId) ?? null;
  const driver = data.drivers.find((item) => item.id === current?.driverId) ?? null;
  const activity = useMemo(
    () => data.activities.filter((item) => item.donationId === current?.id),
    [data.activities, current?.id],
  );
  const completed = data.donations.filter((item) => item.status === 'completed');
  const active = data.donations.filter((item) => item.status !== 'completed');
  const live = data.runtimeMode === 'agentcore';

  const prepareSound = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext;
    if (!audioRef.current) audioRef.current = new AudioContextClass();
    if (audioRef.current.state === 'suspended') void audioRef.current.resume();
    return audioRef.current;
  }, [soundEnabled]);

  const playCue = useCallback((kind: SoundKind) => {
    const context = prepareSound();
    if (!context) return;
    const notes = kind === 'complete' ? [523, 659, 784] : kind === 'approval' ? [440, 554] : kind === 'success' ? [494, 659] : [392, 523];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.11;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.075, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });
    if ('vibrate' in navigator) navigator.vibrate(kind === 'complete' ? [35, 45, 55] : 35);
  }, [prepareSound]);

  const announce = useCallback((content: string, kind: SoundKind = 'response') => {
    playCue(kind);
    if (voiceReplies) speak(content);
  }, [playCue, voiceReplies]);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      const AudioContextClass = window.AudioContext;
      if (!audioRef.current) audioRef.current = new AudioContextClass();
      void audioRef.current.resume();
    }
  }

  function toggleVoiceReplies() {
    const next = !voiceReplies;
    setVoiceReplies(next);
    if (!next) stopSpeaking();
    else speak('Voice replies are on. Tell me about the food you want to rescue.');
  }

  function toggleDictation() {
    if (listening) {
      dictationRef.current?.stop();
      return;
    }
    stopSpeaking();
    setNotice('');
    setListening(true);
    const handle = startDictation({
      onInterim: (text) => setAgentInput(text),
      onFinal: (text) => {
        setListening(false);
        setAgentInput(text);
        void sendAgentMessage(text);
      },
      onError: (message) => {
        setListening(false);
        setNotice(message);
      },
      onEnd: () => {
        setListening(false);
        dictationRef.current = null;
      },
    });
    dictationRef.current = handle;
  }

  async function act(action: string, extra: Record<string, unknown> = {}) {
    prepareSound();
    const workflow = workflowFor(action);
    setBusy(true);
    setNotice('');
    setWorkflowProgress({ ...workflow, active: 0, elapsed: 0 });
    if (action === 'create') {
      setModalOpen(false);
      setView('overview');
    }
    const timer = window.setInterval(() => setWorkflowProgress((progress) => progress ? {
      ...progress,
      elapsed: progress.elapsed + 1,
      active: Math.min(Math.floor((progress.elapsed + 1) / 3), progress.steps.length - 1),
    } : null), 1000);
    let succeeded = false;
    try {
      const response = await fetch('/api/rescues', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: current?.id, ...extra }),
      });
      const next = await response.json() as AppState & { error?: string };
      if (!response.ok) throw new Error(next.error || 'The agent could not complete that step.');
      setData(next);
      setSelectedId(next.current?.id ?? null);
      setModalOpen(false);
      setView('overview');
      setNotice(action === 'approve' ? 'Approved — recipient and driver are arranged.' : action === 'reroute' ? 'Alternative match is ready for approval.' : action === 'complete' ? 'Delivery recorded. The impact total is updated.' : 'The agent found a safe match and paused for approval.');
      succeeded = true;
      setWorkflowProgress((progress) => progress ? { ...progress, active: workflow.steps.length } : { ...workflow, active: workflow.steps.length, elapsed: 0 });
      playCue(action === 'complete' ? 'complete' : action === 'approve' ? 'success' : 'approval');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      window.clearInterval(timer);
      setBusy(false);
      if (succeeded) window.setTimeout(() => setWorkflowProgress(null), 850);
      else setWorkflowProgress(null);
    }
  }

  function submitDonation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act('create', {
      donor: form.get('donor'), area: form.get('area'), foodType: form.get('foodType'),
      meals: Number(form.get('meals')), pickupBy: form.get('pickupBy'), refrigerated: form.get('refrigerated') === 'on',
    });
  }

  async function runChatWorkflow(workflow: ChatWorkflowAction, userText?: string, donationDetails?: StructuredDonation) {
    if (agentBusy) return;
    if (workflow === 'openForm') { setModalOpen(true); return; }
    if (workflow === 'openRescue') { if (current) setSelectedId(current.id); setView('overview'); return; }

    const label = userText || ({
      sample: 'Start the sample rescue', approve: 'Approve this match', reroute: 'Show another recipient',
      createDonation: 'Start this rescue', status: 'Show the pickup status', complete: 'Confirm the completed handoff',
    } as Partial<Record<ChatWorkflowAction, string>>)[workflow] || 'Continue';
    const userMessage: AgentMessage = { id: Date.now(), role: 'user', content: label };
    setAgentMessages((items) => [...items, userMessage]);
    setAgentInput('');
    if (workflow === 'sample') { setStructuredDonation(null); setDonationDraft(null); }

    if (workflow === 'sample' && data.current && data.current.status !== 'completed') {
      const response = '## Rescue already in progress\n\nContinue the current rescue using the button below. FoodBridge will not create a duplicate.';
      setAgentMessages((items) => [...items, { id: Date.now() + 1, role: 'assistant', content: response, actions: actionsForRescue(data.current) }]);
      announce(response);
      return;
    }
    if (workflow === 'status') {
      const response = rescueChatSummary(data);
      setAgentMessages((items) => [...items, { id: Date.now() + 1, role: 'assistant', content: response, actions: actionsForRescue(current) }]);
      announce(response);
      return;
    }

    const action = workflow === 'sample' || workflow === 'createDonation' ? 'create' : workflow;
    const progress = workflowFor(action);
    setAgentBusy(true);
    setAgentProgress({ steps: progress.steps, active: 0, elapsed: 0 });
    const timer = window.setInterval(() => setAgentProgress((value) => ({
      ...value, elapsed: value.elapsed + 1, active: Math.min(Math.floor((value.elapsed + 1) / 2), value.steps.length - 1),
    })), 1000);
    try {
      const payload = workflow === 'sample'
        ? { action: 'create', donor: 'FoodBridge Demo Kitchen', area: 'Salmiya', foodType: '24 sealed chilled meals', meals: 24, pickupBy: '20:30', refrigerated: true }
        : workflow === 'createDonation' && donationDetails
          ? { action: 'create', ...donationDetails }
          : { action, id: current?.id };
      const response = await fetch('/api/rescues', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const next = await response.json() as AppState & { error?: string };
      if (!response.ok) throw new Error(next.error || 'FoodBridge could not complete that step.');
      setData(next);
      setSelectedId(next.current?.id ?? null);
      if (workflow === 'createDonation') { setStructuredDonation(null); setDonationDraft(null); }
      setAgentMessages((items) => [...items, {
        id: Date.now() + 1, role: 'assistant', content: rescueChatSummary(next),
        provider: next.current?.modelProvider ?? undefined, actions: actionsForRescue(next.current),
      }]);
      announce(rescueChatSummary(next), workflow === 'complete' ? 'complete' : workflow === 'approve' ? 'success' : 'approval');
    } catch (error) {
      setAgentMessages((items) => [...items, {
        id: Date.now() + 1, role: 'assistant',
        content: `## I couldn't complete that step\n\n${error instanceof Error ? error.message : 'Please try again.'}`,
        actions: actionsForRescue(current),
      }]);
    } finally {
      window.clearInterval(timer);
      setAgentProgress({ steps: [], active: 0, elapsed: 0 });
      setAgentBusy(false);
    }
  }

  function handleAgentAction(action: AgentAction) {
    const inferred = action.workflow
      ?? (action.label.toLowerCase().includes('approve') ? 'approve'
        : action.label.toLowerCase().includes('other recipient') ? 'reroute'
          : action.label.toLowerCase().includes('confirm handoff') ? 'complete'
            : action.label.toLowerCase().includes('rescue status') ? 'status' : undefined);
    if (inferred) return runChatWorkflow(inferred);
    return sendAgentMessage(action.prompt ?? action.label);
  }

  function reviseDonationDetails() {
    if (!structuredDonation) return;
    setAgentInput(`Change these donation details: ${structuredDonation.meals} meals of ${structuredDonation.foodType} in ${structuredDonation.area}, collect before ${structuredDonation.pickupBy}. `);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function sendAgentMessage(message = agentInput) {
    const clean = message.trim();
    if (!clean || agentBusy) return;
    const command = clean.toLowerCase();
    if (/^(stop|stop speaking|be quiet|mute voice)[.! ]*$/.test(command)) {
      stopSpeaking();
      setVoiceReplies(false);
      setAgentInput('');
      return;
    }
    if (structuredDonation && /^(start|start rescue|start this rescue|confirm|looks good|yes)[.! ]*$/.test(command)) return runChatWorkflow('createDonation', clean, structuredDonation);
    if (current?.status === 'approval_required' && /^(ok|okay|yes|approved|approve|go ahead|proceed)[.! ]*$/.test(command)) return runChatWorkflow('approve', clean);
    if (current?.status === 'scheduled' && /^(done|complete|completed|handoff complete|confirm)[.! ]*$/.test(command)) return runChatWorkflow('complete', clean);
    if (current && /^(status|show status|pickup status|where is the rescue)[.!? ]*$/.test(command)) return runChatWorkflow('status', clean);
    if (current?.status === 'approval_required' && /^(alternative|another recipient|show another|reroute|different recipient)[.! ]*$/.test(command)) return runChatWorkflow('reroute', clean);
    if (/^(try|start|run).*(sample|demo).*(donation|rescue)/.test(command)) return runChatWorkflow('sample', clean);
    prepareSound();
    const userMessage: AgentMessage = { id: Date.now(), role: 'user', content: clean };
    const prior = agentMessages;
    setAgentMessages([...prior, userMessage]);
    setAgentInput('');
    setAgentBusy(true);
    setAgentProgress({ steps: progressStepsFor(clean), active: 0, elapsed: 0 });
    const timer = window.setInterval(() => setAgentProgress((progress) => ({
      ...progress, elapsed: progress.elapsed + 1, active: Math.min(Math.floor((progress.elapsed + 1) / 2), progress.steps.length - 1),
    })), 1000);
    try {
      const response = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, history: prior.map(({ role, content }) => ({ role, content })), draft: donationDraft }),
      });
      const result = await response.json() as { result?: string; error?: string; modelProvider?: string; fallbackUsed?: boolean; runtimeMode?: RuntimeMode; latencyMs?: number; suggestedActions?: AgentAction[]; structuredDonation?: StructuredDonation | null; donationDraft?: DonationDraft | null };
      if (!response.ok || !result.result) throw new Error(result.error || 'The live agent did not return a response.');
      setStructuredDonation(result.structuredDonation ?? null);
      setDonationDraft(result.donationDraft ?? null);
      setAgentMessages((items) => [...items, { id: Date.now() + 1, role: 'assistant', content: result.result!, provider: result.modelProvider, fallbackUsed: result.fallbackUsed, runtimeMode: result.runtimeMode, latencyMs: result.latencyMs, actions: result.suggestedActions }]);
      announce(result.result);
    } catch (error) {
      setAgentMessages((items) => [...items, { id: Date.now() + 1, role: 'assistant', content: error instanceof Error ? error.message : 'The live agent is unavailable.' }]);
    } finally {
      window.clearInterval(timer);
      setAgentProgress({ steps: [], active: 0, elapsed: 0 });
      setAgentBusy(false);
    }
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand-row">
          <button className="brand" onClick={() => setView('overview')} aria-label="FoodBridge home"><span className="brand-mark"><Image src="/brand/foodbridge-logo.png" alt="" width={39} height={39} unoptimized priority /></span><span>FoodBridge</span></button>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{sidebarCollapsed ? '→' : '←'}</button>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          <p className="nav-label">Rescue workspace</p>
          {navItems.map(([id, label, icon]) => <button key={id} title={sidebarCollapsed ? label : undefined} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><span className="nav-icon">{icon}</span><span className="nav-text">{label}</span></button>)}
        </nav>
        <div className={`runtime-card ${live ? 'online' : 'offline'}`}><i /><div><strong>{live ? 'Rescue agent ready' : 'Service unavailable'}</strong><p>{live ? 'Connected and ready' : 'Please try again shortly'}</p></div></div>
        <p className="sidebar-foot">Fast, safe food rescue coordination</p>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">Surplus food rescue</p><h1>{view === 'overview' ? 'Live rescue desk' : navItems.find(([id]) => id === view)?.[1]}</h1></div>
          <div className="topbar-actions"><button className={`sound-toggle ${soundEnabled ? 'on' : ''}`} onClick={toggleSound} aria-label={soundEnabled ? 'Turn sounds off' : 'Turn sounds on'} title={soundEnabled ? 'Sounds on' : 'Sounds off'}><span>{soundEnabled ? '♪' : '×'}</span></button><button className="agent-button" onClick={() => setView('agent')}><span>✦</span> Ask FoodBridge</button><button className="primary-button" onClick={() => setModalOpen(true)}><span>+</span> Start rescue</button></div>
        </header>

        {notice && <div className="toast" role="status"><span>✦</span><p>{notice}</p><button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
        {workflowProgress && <aside className={`workflow-progress-card ${workflowProgress.active >= workflowProgress.steps.length ? 'finished' : ''}`} role="status" aria-live="polite"><div className="workflow-progress-head"><span className="workflow-pulse"><i /><i /><i /></span><div><strong>{workflowProgress.active >= workflowProgress.steps.length ? 'Done — ready for you' : workflowProgress.title}</strong><p>{workflowProgress.detail}</p></div><time>{workflowProgress.elapsed}s</time></div><div className="workflow-track"><i style={{ width: `${Math.min(100, ((workflowProgress.active + 1) / workflowProgress.steps.length) * 100)}%` }} /></div><div className="workflow-step-list">{workflowProgress.steps.map((step, index) => <div className={index < workflowProgress.active ? 'done' : index === workflowProgress.active ? 'active' : ''} key={step}><span>{index < workflowProgress.active || workflowProgress.active >= workflowProgress.steps.length ? '✓' : index + 1}</span><p>{step}</p></div>)}</div></aside>}

        {view === 'overview' && <>
          <section className="hero-strip" aria-label="Verified rescue statistics">
            <div className="hero-copy"><span className={`live-pill ${live ? '' : 'offline'}`}><i />{live ? 'Rescue agent online' : 'Connection needed'}</span><h2>From surplus<br />to someone’s table.</h2><p>FoodBridge checks each donation, finds a safe recipient, asks for your approval, and coordinates the pickup.</p></div>
            <div className="hero-metrics">
              <div><strong>{data.metrics.mealsRescued}</strong><span>verified meals rescued</span></div>
              <div><strong>{data.metrics.completedRescues}</strong><span>completed handoffs</span></div>
              <div><strong>{data.metrics.activeRescues}</strong><span>active rescues</span></div>
            </div>
          </section>

          <section className="how-it-works" aria-label="How the agent works">
            {[['1', 'Share the food', 'Type, quantity, area and deadline'], ['2', 'FoodBridge checks', 'Storage, capacity, distance and safety'], ['3', 'You approve', 'Review the match before anyone is contacted'], ['4', 'Pickup is arranged', 'Recipient and volunteer receive the plan']].map(([number, title, text]) => <div key={number}><span>{number}</span><p><strong>{title}</strong><small>{text}</small></p></div>)}
          </section>

          {loading ? <div className="empty-workspace"><span className="loading-orb" /><h2>Loading the rescue desk…</h2></div> : !current ? <section className="empty-workspace">
            <span className="empty-orb">✦</span><p className="eyebrow">Ready for the first rescue</p><h2>No donations yet.</h2><p>Add available food and FoodBridge will guide you from the first safety check to a confirmed handoff. Impact totals increase only after delivery is confirmed.</p><button className="primary-button" onClick={() => setModalOpen(true)}><span>+</span> Start the first rescue</button>
          </section> : partner && <>
            <div className="section-heading"><div><p className="eyebrow">{current.status === 'completed' ? 'Verified handoff' : 'Current rescue'}</p><h2>{current.status === 'approval_required' ? 'The agent paused for your decision.' : current.status === 'scheduled' ? 'Pickup is arranged. Confirm after handoff.' : 'Delivery recorded with an exact timestamp.'}</h2></div><button className="text-button" onClick={() => setView('rescues')}>Open history →</button></div>
            <section className="decision-grid">
              <article className="donation-card">
                <div className="card-head"><div className={`food-visual ${current.status}`}><span>{current.meals}</span><small>meals</small></div><div className="donation-title"><span className={`status-chip ${current.status}`}>{statusLabel(current.status)}</span><h3>{current.foodType}</h3><p>{current.donor} · {current.area} · {current.id}</p></div><span className="deadline"><b>{current.pickupBy}</b><small>{current.status === 'completed' ? `completed ${formatDate(current.completedAt)}` : 'collection deadline'}</small></span></div>
                <div className="route-line"><span className="route-stop done">D</span><i /><span className={`route-stop ${current.status !== 'approval_required' ? 'done' : ''}`}>V</span><i /><span className={`route-stop ${current.status === 'completed' ? 'done' : ''}`}>R</span></div>
                <div className="route-labels"><span>{current.donor}<small>Donor</small></span><span>{driver?.name ?? 'After approval'}<small>Volunteer</small></span><span>{partner.name}<small>Recipient</small></span></div>
                <div className="match-card"><div className="match-rank">1</div><div className="match-info"><div><h4>{partner.name}</h4><span className="fit">{partner.reliability}% reliability</span></div><p>{partner.distanceKm} km · {partner.refrigerated ? 'Cold storage' : 'Ambient only'} · Capacity {partner.capacity}</p></div></div>
                {current.agentSummary && <div className="agent-result"><div><span className="agent-orb small" /><p><strong>FoodBridge recommendation</strong><small>Checked live for this donation</small></p></div><div className="agent-result-copy"><FormattedAgentResponse content={current.agentSummary} /></div></div>}
                <div className="card-actions">
                  {current.status === 'approval_required' && <><button className="approve-button" disabled={busy} aria-busy={busy} onClick={() => void act('approve')}>Approve and arrange pickup →</button><button className="secondary-button" disabled={busy} onClick={() => void act('reroute')}>Show another match</button><span>No recipient is contacted before approval.</span></>}
                  {current.status === 'scheduled' && <><button className="approve-button" disabled={busy} aria-busy={busy} onClick={() => void act('complete')}>Confirm completed handoff</button><span>Only confirm after the food changes hands.</span></>}
                  {current.status === 'completed' && <div className="completion-banner"><span>✓</span><p><strong>{current.meals} meals verified</strong>{formatDate(current.completedAt)}</p></div>}
                </div>
              </article>
              <aside className="agent-card" aria-label="Rescue progress"><div className="agent-head"><div><span className="agent-orb" /><div><p>Rescue progress</p><strong>{current.status === 'completed' ? 'Rescue completed' : current.status === 'scheduled' ? 'Watching the pickup' : 'Waiting for your approval'}</strong></div></div><span className={`running ${current.status === 'completed' ? 'complete' : ''}`}>{current.status === 'completed' ? 'Complete' : 'Live'}</span></div><div className="timeline">{activity.map((item) => <div className={`timeline-item ${item.kind}`} key={item.id}><span className="timeline-marker">{item.kind === 'done' ? '✓' : item.kind === 'warning' ? '!' : ''}</span><div><time>{formatDate(item.createdAt)}</time><h4>{item.title}</h4><p>{item.detail}</p></div></div>)}</div><div className="agent-note"><span>✦</span><p><strong>You stay in control</strong>FoodBridge can check and prepare automatically. A recipient is contacted only after you approve the match.</p></div></aside>
            </section>
          </>}
        </>}

        {view === 'agent' && <section className="agent-workspace">
          <article className="chat-panel">
            <header className="chat-head">
              <span className="agent-orb" />
              <div><strong>FoodBridge Rescue Coordinator</strong><p>Speak or type — I’ll ask for one detail at a time</p></div>
              {voiceSupported && <button className={`voice-reply-toggle ${voiceReplies ? 'on' : ''}`} onClick={toggleVoiceReplies} aria-pressed={voiceReplies} aria-label={voiceReplies ? 'Turn spoken replies off' : 'Turn spoken replies on'}><span>{voiceReplies ? '◖))' : '◖)'}</span>{voiceReplies ? 'Voice on' : 'Voice off'}</button>}
              <span className={`running ${live ? '' : 'offline'}`}>{live ? 'Ready' : 'Offline'}</span>
            </header>
            <div className="chat-messages" aria-live="polite">
              {agentMessages.map((message, index) => <div className={`chat-turn ${message.role}`} key={message.id}>
                <div className={`chat-message ${message.role}`}>
                  <span className="chat-speaker">{message.role === 'assistant' ? 'F' : 'You'}</span>
                  <div>
                    {message.role === 'assistant' ? <FormattedAgentResponse content={message.content} /> : <p>{message.content}</p>}
                    {message.role === 'assistant' && message.provider && <small><i /> Rescue updated{message.fallbackUsed ? ' · backup connection used' : ''}{message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ''}</small>}
                  </div>
                </div>
                {message.role === 'assistant' && index === agentMessages.length - 1 && message.actions && message.actions.length > 0 && <div className="response-actions">{message.actions.map((action) => <button key={action.label} className={action.tone === 'primary' ? 'primary-action' : ''} onClick={() => void handleAgentAction(action)} disabled={agentBusy}>{action.label}<span>→</span></button>)}</div>}
              </div>)}
              {structuredDonation && !agentBusy && <section className="voice-donation-card" aria-label="Donation ready to review">
                <div className="voice-card-head"><span>✓</span><div><p>Ready for your review</p><strong>Start only when these details are correct</strong></div></div>
                <div className="voice-donation-grid">
                  <div><small>Food</small><strong>{structuredDonation.foodType}</strong></div>
                  <div><small>Quantity</small><strong>{structuredDonation.meals} meals</strong></div>
                  <div><small>Pickup area</small><strong>{structuredDonation.area}</strong></div>
                  <div><small>Collect before</small><strong>{structuredDonation.pickupBy}</strong></div>
                  <div><small>Food source</small><strong>{structuredDonation.donor}</strong></div>
                  <div><small>Storage</small><strong>{structuredDonation.refrigerated ? 'Keep refrigerated' : 'Room temperature'}</strong></div>
                </div>
                <p className="voice-card-note">FoodBridge will check capacity, safe storage, distance, and timing. No recipient is contacted until you approve the match.</p>
                <div className="voice-card-actions">
                  <button className="approve-button" onClick={() => void runChatWorkflow('createDonation', 'Start this rescue', structuredDonation)}>Start this rescue →</button>
                  <button className="secondary-button" onClick={reviseDonationDetails}>Change details</button>
                  <button className="text-button" onClick={() => { setStructuredDonation(null); setDonationDraft(null); }}>Cancel</button>
                </div>
              </section>}
              {agentBusy && <div className="agent-progress" role="status">
                <div className="progress-head"><span className="progress-orb"><i /><i /><i /></span><div><strong>FoodBridge is working</strong><small>{agentProgress.steps[agentProgress.active] ?? 'Preparing the next step'}</small></div><time>{agentProgress.elapsed}s</time></div>
                <div className="progress-steps">{agentProgress.steps.map((step, index) => <div className={`${index < agentProgress.active ? 'done' : index === agentProgress.active ? 'active' : 'pending'}`} key={step}><span>{index < agentProgress.active ? '✓' : index + 1}</span><p>{step}</p>{index === agentProgress.active && <i />}</div>)}</div>
              </div>}
              <div ref={chatEndRef} />
            </div>
            <div className="prompt-chips">
              {actionsForRescue(current).slice(0, 3).map((action) => <button key={action.label} onClick={() => void handleAgentAction(action)} disabled={agentBusy}>{action.label}</button>)}
              <button onClick={() => void sendAgentMessage('Explain simply how FoodBridge coordinates a rescue and when you need my approval.')} disabled={agentBusy}>How does FoodBridge work?</button>
            </div>
            <form className={`chat-composer ${listening ? 'listening' : ''}`} onSubmit={(event) => { event.preventDefault(); void sendAgentMessage(); }}>
              <label htmlFor="agent-message">{listening ? 'Listening — speak naturally' : 'Ask FoodBridge'}</label>
              <div>
                <textarea ref={composerRef} id="agent-message" value={agentInput} onChange={(event) => setAgentInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendAgentMessage(); } }} placeholder={micSupported ? 'Type a message or tap the microphone…' : 'Describe the food you want to rescue…'} rows={2} maxLength={2000} />
                {micSupported && <button type="button" className={`mic-button ${listening ? 'active' : ''}`} onClick={toggleDictation} disabled={agentBusy || !live} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Speak to FoodBridge'}><span>{listening ? '■' : '●'}</span></button>}
                <button type="submit" disabled={agentBusy || !agentInput.trim() || !live} aria-label="Send message">→</button>
              </div>
              <small>{listening ? 'Your words will be sent when you finish speaking.' : 'FoodBridge asks for missing details, then shows a review card before starting.'}</small>
            </form>
          </article>
        </section>}

        {view === 'rescues' && <section className="data-section"><div className="data-heading"><p className="eyebrow">Rescue record</p><h2>Every rescue, exactly as it happened.</h2><p>See active pickups, completed handoffs, and the exact number of meals delivered.</p></div><HistoryGroup title={`Active · ${active.length}`} items={active} partners={data.partners} onSelect={(id) => { setSelectedId(id); setView('overview'); }} /><HistoryGroup title={`Completed · ${completed.length}`} items={completed} partners={data.partners} onSelect={(id) => { setSelectedId(id); setView('overview'); }} emptyText="Completed handoffs will appear here with their confirmed time and meal count." /></section>}

        {view === 'network' && <section className="data-section"><div className="data-heading"><p className="eyebrow">Sample partner network</p><h2>Recipients and volunteers FoodBridge can match.</h2><p>These sample records demonstrate how FoodBridge checks location, capacity, safe storage, and volunteer availability.</p></div><h3 className="group-title">Recipient capacity</h3><div className="entity-grid">{data.partners.map((item, index) => <article className="entity-card" key={item.id}><span className="entity-avatar">{String(index + 1).padStart(2, '0')}</span><span className="entity-state">Sample</span><h3>{item.name}</h3><p>{item.area} · {item.distanceKm} km away</p><div><span><b>{item.capacity}</b>meal capacity</span><span><b>{item.reliability}%</b>reliability</span></div><small>{item.refrigerated ? '❄ Refrigerated storage' : '○ Shelf-stable food only'}</small></article>)}</div><h3 className="group-title drivers-title">Volunteer availability</h3><div className="entity-grid">{data.drivers.map((item) => <article className="entity-card" key={item.id}><span className="entity-avatar driver-avatar">{item.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className={`entity-state ${item.status === 'Available' ? 'available' : ''}`}>{item.status}</span><h3>{item.name}</h3><p>{item.area} · {item.vehicle}</p><div><span><b>{item.completedTrips}</b>completed trips</span><span><b>{item.status}</b>today</span></div></article>)}</div></section>}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map(([id, label, icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><span>{icon}</span>{label.split(' ')[0]}</button>)}</nav>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="donation-title"><div className="modal-head"><div><p className="eyebrow">New donation</p><h2 id="donation-title">Tell us about the available food.</h2><p>FoodBridge will check safe storage, capacity, distance, and timing.</p></div><button onClick={() => setModalOpen(false)} aria-label="Close">×</button></div><div className="form-guide" aria-label="Rescue steps"><span className="active"><b>1</b>Add food</span><i /><span><b>2</b>Review match</span><i /><span><b>3</b>Approve pickup</span></div><form onSubmit={submitDonation}><label>Food source<input name="donor" placeholder="Restaurant, hotel, event or kitchen" autoComplete="organization" required /><small className="field-help">Who should the volunteer collect from?</small></label><div className="form-grid"><label>Pickup area<select name="area" defaultValue=""><option value="" disabled>Choose an area</option><option>Salmiya</option><option>Hawally</option><option>Jabriya</option><option>Kuwait City</option></select></label><label>Estimated meals<input name="meals" type="number" min="1" max="1000" placeholder="e.g. 40" required /></label></div><label>What food is available?<input name="foodType" placeholder="e.g. Sealed rice and vegetable meals" required /><small className="field-help">Mention packaging or anything important for safe handling.</small></label><div className="form-grid"><label>Collect before<input name="pickupBy" type="time" required /></label><label className="check-label"><input name="refrigerated" type="checkbox" /><span><b>Keep refrigerated</b><small>Only match with cold storage and transport</small></span></label></div><div className="agent-form-note"><span>✦</span><p><strong>You approve before contact</strong>FoodBridge will show one recommended recipient. Nothing is confirmed until you review and approve it.</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="approve-button" disabled={!live}>Find the best match →</button></div></form></section></div>}
    </main>
  );
}

function HistoryGroup({ title, items, partners, onSelect, emptyText = 'No active rescues.' }: { title: string; items: Donation[]; partners: Partner[]; onSelect: (id: string) => void; emptyText?: string }) {
  return <section className="history-group"><h3 className="group-title">{title}</h3>{items.length ? <div className="history-list">{items.map((item) => { const partner = partners.find((candidate) => candidate.id === item.partnerId); return <button key={item.id} onClick={() => onSelect(item.id)}><span className={`history-icon ${item.status}`}>{item.status === 'completed' ? '✓' : item.meals}</span><span className="history-main"><strong>{item.foodType}</strong><small>{item.donor} · {item.area} · {item.id}</small></span><span><strong>{item.meals} meals</strong><small>{partner?.name ?? 'No match'}</small></span><span><strong>{statusLabel(item.status)}</strong><small>{item.completedAt ? formatDate(item.completedAt) : `Created ${formatDate(item.createdAt)}`}</small></span><b>→</b></button>; })}</div> : <div className="history-empty">{emptyText}</div>}</section>;
}
