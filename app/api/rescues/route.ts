import { all, database, ensureDatabase } from '@/db/runtime';
import { invokeAgentCoreDetailed, isAgentCoreConfigured } from '@/lib/agentcore';

type Donation = {
  id: string;
  donor: string;
  area: string;
  foodType: string;
  meals: number;
  pickupBy: string;
  refrigerated: number;
  status: string;
  partnerId: string | null;
  driverId: string | null;
  agentSummary: string | null;
  modelProvider: string | null;
  runtimeMode: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Partner = { id: string; name: string; distanceKm: number; capacity: number; refrigerated: number; reliability: number };
type Driver = { id: string; name: string; vehicle: string };

const donationSelect = `SELECT id, donor, area, food_type AS foodType, meals, pickup_by AS pickupBy,
  refrigerated, status, partner_id AS partnerId, driver_id AS driverId, agent_summary AS agentSummary,
  model_provider AS modelProvider, runtime_mode AS runtimeMode, created_at AS createdAt,
  completed_at AS completedAt FROM donations`;

async function runAgent(prompt: string) {
  const response = await invokeAgentCoreDetailed({ prompt });
  if (!response) throw new Error('FoodBridge is not connected right now. Please try again shortly.');
  return response;
}

async function getDonation(id: string) {
  return database().prepare(`${donationSelect} WHERE id = ?`).bind(id).first<Donation>();
}

async function getState() {
  const db = database();
  const donations = await all<Donation>(db.prepare(`${donationSelect} ORDER BY created_at DESC`));
  const activities = await all<Record<string, unknown>>(db.prepare(
    'SELECT id, donation_id AS donationId, kind, title, detail, created_at AS createdAt FROM activities ORDER BY created_at ASC',
  ));
  const partners = await all<Record<string, unknown>>(db.prepare(
    'SELECT id, name, area, distance_km AS distanceKm, capacity, refrigerated, reliability FROM partners ORDER BY reliability DESC',
  ));
  const drivers = await all<Record<string, unknown>>(db.prepare(
    'SELECT id, name, area, vehicle, status, completed_trips AS completedTrips FROM drivers ORDER BY name',
  ));
  const completed = donations.filter((item) => item.status === 'completed');
  const current = donations.find((item) => item.status !== 'completed') ?? donations[0] ?? null;

  return {
    donations,
    activities,
    partners,
    drivers,
    current,
    runtimeMode: isAgentCoreConfigured() ? 'agentcore' : 'unavailable',
    metrics: {
      mealsRescued: completed.reduce((sum, item) => sum + item.meals, 0),
      completedRescues: completed.length,
      activeRescues: donations.length - completed.length,
      totalRescues: donations.length,
    },
  };
}

export async function GET() {
  await ensureDatabase();
  return Response.json(await getState());
}

export async function POST(request: Request) {
  await ensureDatabase();
  const db = database();
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? 'create');
  const now = new Date().toISOString();

  try {
    if (action === 'create') {
      const donor = String(body.donor ?? '').trim();
      const area = String(body.area ?? '').trim();
      const foodType = String(body.foodType ?? '').trim();
      const pickupBy = String(body.pickupBy ?? '').trim();
      const meals = Number(body.meals);
      const refrigerated = body.refrigerated ? 1 : 0;

      if (!donor || !area || !foodType || !pickupBy || !Number.isFinite(meals) || meals < 1 || meals > 1000) {
        return Response.json({ error: 'Complete every donation field and enter between 1 and 1,000 meals.' }, { status: 400 });
      }

      const partner = await db.prepare(`SELECT id, name, distance_km AS distanceKm, capacity, refrigerated, reliability
        FROM partners WHERE capacity >= ? AND (refrigerated = 1 OR ? = 0)
        ORDER BY distance_km ASC, reliability DESC LIMIT 1`).bind(meals, refrigerated).first<Partner>();
      if (!partner) return Response.json({ error: 'No recipient currently meets the capacity and storage requirements.' }, { status: 409 });

      const agent = await runAgent(
        `Coordinate a new donation of ${meals} ${refrigerated ? 'refrigerated' : 'ambient'} meals: "${foodType}" from ${donor} in ${area}, collect before ${pickupBy}. Use the recipient-ranking and approval tools. Recommend the safest eligible recipient, explain the constraint checks briefly, and stop for human approval.`,
      );
      const id = `FB-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      await db.batch([
        db.prepare(`INSERT INTO donations
          (id, donor, area, food_type, meals, pickup_by, refrigerated, status, partner_id, driver_id,
           agent_summary, model_provider, runtime_mode, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, donor, area, foodType, meals, pickupBy, refrigerated, 'approval_required', partner.id, null,
            agent.result, agent.modelProvider, 'agentcore', now, null),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, 'done', 'Donation validated', `${meals} ${refrigerated ? 'chilled ' : ''}meals · collect before ${pickupBy}`, now),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, 'done', 'FoodBridge checked nearby recipients', 'Capacity, storage, distance and reliability checked', new Date(Date.now() + 1).toISOString()),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(id, 'active', 'Your approval is needed', `${partner.name} is the recommended match`, new Date(Date.now() + 2).toISOString()),
      ]);
    } else {
      const id = String(body.id ?? '').trim();
      if (!id) return Response.json({ error: 'Donation id is required.' }, { status: 400 });
      const donation = await getDonation(id);
      if (!donation) return Response.json({ error: 'Donation was not found.' }, { status: 404 });

      if (action === 'approve') {
        if (donation.status !== 'approval_required') return Response.json({ error: 'This match no longer needs approval.' }, { status: 409 });
        const partner = await db.prepare('SELECT id, name FROM partners WHERE id = ?').bind(donation.partnerId).first<{ id: string; name: string }>();
        const driver = await db.prepare(`SELECT id, name, vehicle FROM drivers
          WHERE status = 'Available' AND (lower(vehicle) LIKE '%refrigerated%' OR ? = 0)
          ORDER BY completed_trips DESC LIMIT 1`).bind(donation.refrigerated).first<Driver>();
        if (!partner || !driver) return Response.json({ error: 'A compatible recipient or available driver could not be confirmed.' }, { status: 409 });
        const agent = await runAgent(
          `Human approval has been granted for donation ${donation.id}: ${donation.meals} meals from ${donation.donor} to ${partner.name}. Contact the recipient, assign a ${donation.refrigerated ? 'refrigerated ' : ''}driver for ${donation.area} before ${donation.pickupBy}, notify all parties, and report the scheduled handoff.`,
        );
        await db.batch([
          db.prepare('UPDATE donations SET status = ?, driver_id = ?, agent_summary = ?, model_provider = ?, runtime_mode = ? WHERE id = ?')
            .bind('scheduled', driver.id, agent.result, agent.modelProvider, 'agentcore', id),
          db.prepare("UPDATE activities SET kind = 'done' WHERE donation_id = ? AND kind = 'active'").bind(id),
          db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, 'done', 'Match approved', `${partner.name} capacity reserved`, now),
          db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, 'done', 'Volunteer assigned', `${driver.name} · ${driver.vehicle}`, new Date(Date.now() + 1).toISOString()),
          db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, 'active', 'Pickup scheduled', 'Food source, recipient and volunteer notified', new Date(Date.now() + 2).toISOString()),
        ]);
      } else if (action === 'reroute') {
        const alternative = await db.prepare(`SELECT id, name, distance_km AS distanceKm, capacity, refrigerated, reliability
          FROM partners WHERE id != ? AND capacity >= ? AND (refrigerated = 1 OR ? = 0)
          ORDER BY distance_km ASC, reliability DESC LIMIT 1`)
          .bind(donation.partnerId, donation.meals, donation.refrigerated).first<Partner>();
        if (!alternative) return Response.json({ error: 'No safe alternative recipient is currently available.' }, { status: 409 });
        const agent = await runAgent(
          `The current recipient is unavailable for donation ${donation.id}. Re-rank eligible recipients for ${donation.meals} ${donation.refrigerated ? 'refrigerated' : 'ambient'} meals in ${donation.area} before ${donation.pickupBy}. Recommend the next safe match and pause for human approval.`,
        );
        await db.batch([
          db.prepare('UPDATE donations SET partner_id = ?, status = ?, agent_summary = ?, model_provider = ?, runtime_mode = ? WHERE id = ?')
            .bind(alternative.id, 'approval_required', agent.result, agent.modelProvider, 'agentcore', id),
          db.prepare("UPDATE activities SET kind = 'done' WHERE donation_id = ? AND kind = 'active'").bind(id),
          db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, 'warning', 'Recipient unavailable', 'FoodBridge started checking the next safe match', now),
          db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, 'active', 'Alternative ready for approval', `${alternative.name} can accept the full donation`, new Date(Date.now() + 1).toISOString()),
        ]);
      } else if (action === 'complete') {
        if (donation.status !== 'scheduled') return Response.json({ error: 'Only a scheduled pickup can be completed.' }, { status: 409 });
        const agent = await runAgent(
          `The operator confirms the handoff for donation ${donation.id}. Record delivery of ${donation.meals} meals, close the rescue, and summarize the verified impact.`,
        );
        await db.batch([
          db.prepare('UPDATE donations SET status = ?, completed_at = ?, agent_summary = ?, model_provider = ?, runtime_mode = ? WHERE id = ?')
            .bind('completed', now, agent.result, agent.modelProvider, 'agentcore', id),
          db.prepare("UPDATE activities SET kind = 'done' WHERE donation_id = ? AND kind = 'active'").bind(id),
          db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, 'done', 'Delivery confirmed', `${donation.meals} meals added to the verified impact total`, now),
          db.prepare('UPDATE drivers SET completed_trips = completed_trips + 1 WHERE id = ?').bind(donation.driverId),
        ]);
      } else {
        return Response.json({ error: 'Unknown action.' }, { status: 400 });
      }
    }
  } catch (error) {
    console.error('FoodBridge agent workflow failed', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'The live agent could not complete this step.',
      runtimeMode: 'unavailable',
    }, { status: 502 });
  }

  return Response.json(await getState());
}
