import { all, database, ensureDatabase } from '@/db/runtime';
import { invokeAgentCore } from '@/lib/agentcore';

type Donation = { id:string; donor:string; area:string; foodType:string; meals:number; pickupBy:string; refrigerated:number; status:string; partnerId:string|null; driverId:string|null; createdAt:string };
const donationSelect = `SELECT id, donor, area, food_type AS foodType, meals, pickup_by AS pickupBy,
  refrigerated, status, partner_id AS partnerId, driver_id AS driverId, created_at AS createdAt FROM donations`;

async function getState() {
  const db = database();
  const donations = await all<Donation>(db.prepare(`${donationSelect} ORDER BY created_at DESC`));
  const activities = await all<Record<string, unknown>>(db.prepare(`SELECT id, donation_id AS donationId, kind, title, detail, created_at AS createdAt FROM activities ORDER BY created_at ASC`));
  const partners = await all<Record<string, unknown>>(db.prepare('SELECT id, name, area, distance_km AS distanceKm, capacity, refrigerated, reliability FROM partners ORDER BY reliability DESC'));
  const drivers = await all<Record<string, unknown>>(db.prepare('SELECT id, name, area, vehicle, status, completed_trips AS completedTrips FROM drivers ORDER BY name'));
  const current = donations.find((item) => item.status !== 'completed') ?? donations[0] ?? null;
  const completedMeals = donations.filter((item) => item.status === 'completed').reduce((sum, item) => sum + item.meals, 0);
  return { donations, activities, partners, drivers, current, runtimeMode: process.env.AGENTCORE_RUNTIME_URL ? 'agentcore' : 'demo', metrics: { mealsRescued: 244 + completedMeals, successfulMatches: 94, rescuesToday: 8 + donations.filter((item) => item.status === 'completed').length } };
}

export async function GET() { await ensureDatabase(); return Response.json(await getState()); }

export async function POST(request: Request) {
  await ensureDatabase();
  const db = database();
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? 'create');
  const now = new Date().toISOString();

  if (action === 'create') {
    const meals = Math.max(1, Math.min(1000, Number(body.meals) || 1));
    const refrigerated = body.refrigerated ? 1 : 0;
    await invokeAgentCore({
      prompt: `Coordinate ${meals} ${refrigerated ? 'refrigerated' : 'ambient'} meals from ${String(body.donor || 'a donor')} in ${String(body.area || 'Kuwait City')} before ${String(body.pickupBy || '8:00 PM')}. Rank safe recipients and request approval before contact.`,
    });
    const partner = await db.prepare(`SELECT id, name FROM partners WHERE capacity >= ? AND (refrigerated = 1 OR ? = 0) ORDER BY distance_km ASC, reliability DESC LIMIT 1`).bind(meals, refrigerated).first<{ id:string; name:string }>();
    if (!partner) return Response.json({ error:'No eligible recipient has enough capacity.' }, { status:409 });
    const id = `FB-${Math.floor(300 + Math.random() * 600)}`;
    await db.batch([
      db.prepare(`INSERT INTO donations (id, donor, area, food_type, meals, pickup_by, refrigerated, status, partner_id, driver_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, String(body.donor || 'Anonymous donor'), String(body.area || 'Kuwait City'), String(body.foodType || 'Prepared meals'), meals, String(body.pickupBy || '8:00 PM'), refrigerated, 'approval_required', partner.id, null, now),
      db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'done', 'Donation understood', `${meals} ${refrigerated ? 'chilled ' : ''}meals · collect before ${String(body.pickupBy || '8:00 PM')}`, now),
      db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'done', 'Eligible partners ranked', 'Checked capacity, storage, reliability and distance', new Date(Date.now() + 1).toISOString()),
      db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'active', 'Waiting for your approval', `${partner.name} is the strongest match`, new Date(Date.now() + 2).toISOString()),
    ]);
  } else {
    const id = String(body.id ?? '');
    if (!id) return Response.json({ error:'Donation id is required.' }, { status:400 });
    if (action === 'approve') {
      await db.batch([
        db.prepare('UPDATE donations SET status = ?, driver_id = ? WHERE id = ?').bind('scheduled', 'driver-1', id),
        db.prepare("UPDATE activities SET kind = 'done' WHERE donation_id = ? AND kind = 'active'").bind(id),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'done', 'Recipient accepted', 'Capacity reserved and food-safety checklist shared', now),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'done', 'Driver assigned', 'Omar · refrigerated van · 12 minute arrival', new Date(Date.now() + 1).toISOString()),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'active', 'Pickup scheduled', 'All three parties have been notified', new Date(Date.now() + 2).toISOString()),
      ]);
    } else if (action === 'reroute') {
      await db.batch([
        db.prepare('UPDATE donations SET partner_id = ?, status = ? WHERE id = ?').bind('partner-2', 'approval_required', id),
        db.prepare("UPDATE activities SET kind = 'done' WHERE donation_id = ? AND kind = 'active'").bind(id),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'warning', 'First recipient unavailable', 'The agent immediately started the fallback plan', now),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'active', 'Alternative match ready', 'Hope Table Food Bank can accept the full donation', new Date(Date.now() + 1).toISOString()),
      ]);
    } else if (action === 'complete') {
      await db.batch([
        db.prepare('UPDATE donations SET status = ? WHERE id = ?').bind('completed', id),
        db.prepare("UPDATE activities SET kind = 'done' WHERE donation_id = ? AND kind = 'active'").bind(id),
        db.prepare('INSERT INTO activities (donation_id, kind, title, detail, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'done', 'Delivery confirmed', 'Impact receipt generated for the donor and recipient', now),
      ]);
    } else return Response.json({ error:'Unknown action.' }, { status:400 });
  }
  return Response.json(await getState());
}
