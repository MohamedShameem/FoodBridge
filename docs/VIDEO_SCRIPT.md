# FoodBridge — Submission Video Script

**Target length:** ~4:15 (safe inside the 3–5 minute window)
**Narration pace:** ~140 words/min — the narration below is written to be read as-is.
**Format:** Screen recording of `http://localhost:3000` + narration. One optional cutaway to the AgentCore Inspector and one to the architecture diagram.

---

## Before you record — checklist

- [ ] Fresh dev database (no leftover donations) — `rm -rf .wrangler && npm run dev`
- [ ] AgentCore bridge connected so the agent responds live (the UI must not show "agent unavailable")
- [ ] Second browser tab ready: AgentCore Inspector from `agentcore dev` (for the approval-gate cutaway)
- [ ] `docs/ARCHITECTURE.md` mermaid diagram open in a third tab (for the architecture cutaway)
- [ ] Record at 1080p+, browser zoom ~110%, hide bookmarks bar
- [ ] Do one full dry run with a timer — the clicks below are timed to the narration

---

## 0:00 – 0:20 · The hook — the problem

**On screen:** FoodBridge overview page (do nothing yet, let it breathe for 2 seconds).

**Narration (~45 words):**
> It's 8 PM. A caterer has sixty refrigerated meals left over. They're perfectly good — but in four hours, they're waste. Across town, a community kitchen has space, and a volunteer driver is nearby. The only missing piece is coordination. That's what FoodBridge fixes.

## 0:20 – 0:45 · What it is

**On screen:** Point at the "How it works" strip (Share the food → FoodBridge checks → You approve → Pickup is arranged), then the verified-impact stats.

**Narration (~55 words):**
> FoodBridge is an autonomous food-rescue coordinator, built on Amazon Bedrock AgentCore with the Strands Agents SDK. You tell it what food is available. It checks food-safety rules, capacity, distance, and reliability — then it does the thing that matters most: it stops, and asks a human.

## 0:45 – 1:30 · Create a donation

**On screen:** Click **"+ Start rescue"**. Fill the form slowly enough to read: 60 meals, refrigerated **on**, Salmiya, deadline 9 PM, submit. Let the workflow progress card run its steps on screen.

**Narration (~100 words):**
> I'm creating a donation: sixty refrigerated meals in Salmiya, to be collected before nine PM. That refrigeration toggle isn't a hint for the model — it's a deterministic constraint enforced by the agent's tools. As I submit, watch the progress card: FoodBridge checks storage and capacity, compares nearby recipients, and prepares an approval card. It ranks every eligible community partner by distance and reliability — and only partners with enough remaining capacity and refrigerated storage are even considered. The model can't override that. If I asked for five thousand meals, no recipient would match.

## 1:30 – 2:15 · The human checkpoint (the differentiator)

**On screen:** The approval card — *"The agent paused for your decision."* Hover the line **"No recipient is contacted before approval."**
**Cutaway (10–12 sec):** AgentCore Inspector tab — point at `find_eligible_recipients`, then `request_human_approval`, and note `contact_recipient` hasn't fired. Return to app.

**Narration (~100 words):**
> Here's the moment this project is built around: the agent pauses. "No recipient is contacted before approval" — it's printed right on the card. And this is verifiable, not a promise: in the AgentCore Inspector you can watch the tool sequence — `find_eligible_recipients` runs, then `request_human_approval`, and the `contact_recipient` call simply doesn't exist until I decide. This is the Agents-for-Humans pattern: autonomy up to the line, human judgment at the line. I approve the match.

**Action:** Click **"Approve and arrange pickup →"**.

## 2:15 – 2:50 · Autonomous execution

**On screen:** Progress steps (Reserving recipient capacity → Assigning a suitable volunteer → Sharing the pickup plan), then the scheduled view — recipient, volunteer with vehicle, "Collect before" deadline, live timeline.

**Narration (~85 words):**
> From here, FoodBridge runs without me. It reserves the recipient's capacity, assigns a compatible volunteer — note the vehicle is refrigerated, because the food requires it — and sends the pickup plan to the donor, the recipient, and the driver. The timeline updates live. And if the recipient had declined, the recovery workflow would automatically re-run the safe constraints and pick the next qualified partner — never an unqualified one. One button press replaced a dozen phone calls.

## 2:50 – 3:15 · Voice donation (bonus feature)

**On screen:** **"Ask FoodBridge"** view with voice enabled. Say a donation out loud; let the structured donation card render; hover **"Start this rescue →"** without clicking (or click to start a second rescue if time allows).

**Narration (~55 words):**
> Donors don't always want to fill forms. With voice input, I just say: "I have forty fresh salads to give away in Hawally before seven" — and FoodBridge structures it into a donation card I can review. Same rules, same safety checks — and nothing starts until I press the button.

## 3:15 – 3:50 · Impact receipt + architecture

**On screen:** Back on the rescue: click **"Confirm completed handoff"** → status chip flips to completed, impact receipt with timestamp, hero-strip totals tick up.
**Cutaway (10 sec):** Architecture diagram (Next.js → Cloudflare Worker + D1 → Lambda bridge → AgentCore Runtime → Strands → Groq/GLM/Bedrock fallback chain).

**Narration (~100 words):**
> Once the food changes hands, I confirm the handoff. FoodBridge closes the rescue and writes an impact receipt with an exact timestamp — impact totals only ever increase through completed rescues. Under the hood, each request flows from the Next.js app through a Cloudflare Worker and an authenticated Lambda bridge into Bedrock AgentCore Runtime. A Strands agent routes to Groq's GPT-OSS twenty-B for low latency, falls back to GLM, then to Amazon Nova Micro — every response reports which provider served it. Model credentials live in AgentCore Identity; the browser never sees them.

## 3:50 – 4:15 · Close

**On screen:** Back to the overview page, full-screen for the last line.

**Narration (~40 words):**
> The food existed. The demand existed. The volunteer was nearby. FoodBridge turns that frantic chain of calls, rejections, and handoffs into a single approval — from surplus to support, before time runs out. Thanks for watching.

---

## If you need to trim to ~3:30

- Cut the voice section (2:50–3:15) entirely — saves 25 sec.
- Tighten the Inspector cutaway to a single screen (5 sec).
- Tighten the architecture cutaway to 5 sec and one sentence.

## Recording tips

- Speak the narration first, click second — every click above lands *after* its sentence starts.
- Don't read buttons out loud while hovering; say what they *mean*.
- If a live call is slow on camera, the progress card is designed for that — let it run, keep talking.
- Leave 1 second of silence at the start and end for clean cuts.
