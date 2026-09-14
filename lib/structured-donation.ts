export type StructuredDonation = {
  donor: string;
  area: string;
  foodType: string;
  meals: number;
  pickupBy: string;
  refrigerated: boolean;
};

export type DonationDraft = {
  donor: string | null;
  area: string | null;
  foodType: string | null;
  meals: number | null;
  pickupBy: string | null;
  refrigerated: boolean | null;
};

// Searches rather than full-matches so leftover words the model didn't strip (e.g. "before 9pm") still resolve.
function normalizePickupTime(value: unknown) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase().replace(/\./g, '');
  const twelveHour = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3] === 'pm') hour += 12;
    const minute = Number(twelveHour[2] ?? '0');
    if (minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const twentyFourHour = clean.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!twentyFourHour) return null;
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function jsonObjectAfter(result: string, end: number) {
  const afterMarker = result.slice(end).trim();
  const fenced = afterMarker.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const source = fenced ?? afterMarker;
  const start = source.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index2 = start; index2 < source.length; index2 += 1) {
    const character = source[index2];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index2 + 1);
    }
  }
  return null;
}

// Tolerates the model wrapping the marker in markdown emphasis, e.g. "**DRAFT**:".
const MARKER_PATTERN = /\*{0,2}(READY|DRAFT)\*{0,2}\s*:/g;

/** The last marker line the model actually ended its answer with, and where its payload starts. */
function lastMarker(result: string): { kind: 'READY' | 'DRAFT'; index: number; end: number } | null {
  let found: { kind: 'READY' | 'DRAFT'; index: number; end: number } | null = null;
  for (const match of result.matchAll(MARKER_PATTERN)) {
    found = { kind: match[1] as 'READY' | 'DRAFT', index: match.index, end: match.index + match[0].length };
  }
  return found;
}

export function parseReadyDonation(result: string): StructuredDonation | null {
  const marker = lastMarker(result);
  if (!marker || marker.kind !== 'READY') return null;
  const candidate = jsonObjectAfter(result, marker.end);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const donor = typeof parsed.donor === 'string' && parsed.donor.trim() ? parsed.donor.trim() : 'Community donor';
    const area = typeof parsed.area === 'string' ? parsed.area.trim() : '';
    const foodType = typeof parsed.foodType === 'string' ? parsed.foodType.trim() : '';
    const meals = Number(parsed.meals);
    const pickupBy = normalizePickupTime(parsed.pickupBy);
    const refrigerated = parsed.refrigerated;
    if (!area || !foodType || !pickupBy || !Number.isInteger(meals) || meals < 1 || meals > 1000 || typeof refrigerated !== 'boolean') return null;
    return { donor, area, foodType, meals, pickupBy, refrigerated };
  } catch {
    return null;
  }
}

function normalizeDraftFields(parsed: Record<string, unknown>): DonationDraft {
  const donor = typeof parsed.donor === 'string' && parsed.donor.trim() ? parsed.donor.trim() : null;
  const area = typeof parsed.area === 'string' && parsed.area.trim() ? parsed.area.trim() : null;
  const foodType = typeof parsed.foodType === 'string' && parsed.foodType.trim() ? parsed.foodType.trim() : null;
  const mealsNumber = Number(parsed.meals);
  const meals = Number.isInteger(mealsNumber) && mealsNumber >= 1 && mealsNumber <= 1000 ? mealsNumber : null;
  const pickupBy = normalizePickupTime(parsed.pickupBy);
  const refrigerated = typeof parsed.refrigerated === 'boolean' ? parsed.refrigerated : null;
  return { donor, area, foodType, meals, pickupBy, refrigerated };
}

/** Parses the model's running DRAFT (partial, nullable fields) or a completed READY line. */
export function parseDonationDraft(result: string): DonationDraft | null {
  const marker = lastMarker(result);
  if (!marker) return null;
  const candidate = jsonObjectAfter(result, marker.end);
  if (!candidate) return null;
  try {
    return normalizeDraftFields(JSON.parse(candidate) as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Normalizes a draft object the client already holds (not marker text) for reuse as prompt context. */
export function normalizeDraft(value: unknown): DonationDraft | null {
  if (!value || typeof value !== 'object') return null;
  return normalizeDraftFields(value as Record<string, unknown>);
}

export function stripDonationMarker(result: string) {
  const marker = lastMarker(result);
  if (!marker) return result.trim();
  return result.slice(0, marker.index).trim();
}

/** Combines this turn's parsed facts with what was already known, so one turn where the model omits or
 * drops a field never erases previously confirmed facts. */
export function mergeDraft(base: DonationDraft | null, update: DonationDraft | null): DonationDraft | null {
  if (!base) return update;
  if (!update) return base;
  return {
    donor: update.donor ?? base.donor,
    area: update.area ?? base.area,
    foodType: update.foodType ?? base.foodType,
    meals: update.meals ?? base.meals,
    pickupBy: update.pickupBy ?? base.pickupBy,
    refrigerated: update.refrigerated ?? base.refrigerated,
  };
}

export function isCompleteDraft(draft: DonationDraft | null): boolean {
  return Boolean(draft && draft.area && draft.foodType && draft.meals != null && draft.pickupBy && draft.refrigerated !== null);
}

/** Turns a complete draft into the strict shape the rescue workflow expects. */
export function finalizeDraft(draft: DonationDraft): StructuredDonation {
  return {
    donor: draft.donor?.trim() || 'Community donor',
    area: draft.area!,
    foodType: draft.foodType!,
    meals: draft.meals!,
    pickupBy: draft.pickupBy!,
    refrigerated: draft.refrigerated!,
  };
}
