import { env } from 'cloudflare:workers';

type QueryResult<T> = { results?: T[] };

export function database() {
  if (!env.DB) throw new Error('D1 binding `DB` is unavailable.');
  return env.DB;
}

export async function ensureDatabase() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, distance_km REAL NOT NULL,
      capacity INTEGER NOT NULL, refrigerated INTEGER NOT NULL, reliability INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, vehicle TEXT NOT NULL,
      status TEXT NOT NULL, completed_trips INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY, donor TEXT NOT NULL, area TEXT NOT NULL, food_type TEXT NOT NULL,
      meals INTEGER NOT NULL, pickup_by TEXT NOT NULL, refrigerated INTEGER NOT NULL, status TEXT NOT NULL,
      partner_id TEXT REFERENCES partners(id), driver_id TEXT REFERENCES drivers(id),
      agent_summary TEXT, model_provider TEXT, runtime_mode TEXT, created_at TEXT NOT NULL, completed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT, donation_id TEXT NOT NULL REFERENCES donations(id), kind TEXT NOT NULL,
      title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_donations_status_created ON donations(status, created_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_activities_donation_created ON activities(donation_id, created_at)'),
  ]);

  const count = await db.prepare('SELECT COUNT(*) AS count FROM partners').first<{ count: number }>();
  if (!count?.count) await seedDatabase();
}

async function seedDatabase() {
  const db = database();
  await db.batch([
    db.prepare('INSERT INTO partners VALUES (?, ?, ?, ?, ?, ?, ?)').bind('partner-1', 'Bayt Al Khair Community Pantry', 'Salmiya', 2.4, 80, 1, 96),
    db.prepare('INSERT INTO partners VALUES (?, ?, ?, ?, ?, ?, ?)').bind('partner-2', 'Hope Table Food Bank', 'Hawally', 5.1, 140, 1, 93),
    db.prepare('INSERT INTO partners VALUES (?, ?, ?, ?, ?, ?, ?)').bind('partner-3', 'Neighborhood Fridge Collective', 'Shaab', 7.8, 45, 0, 88),
    db.prepare('INSERT INTO partners VALUES (?, ?, ?, ?, ?, ?, ?)').bind('partner-4', 'Al Noor Family Centre', 'Jabriya', 8.6, 110, 1, 91),
    db.prepare('INSERT INTO drivers VALUES (?, ?, ?, ?, ?, ?)').bind('driver-1', 'Omar Al-Sabah', 'Salmiya', 'Refrigerated van', 'Available', 48),
    db.prepare('INSERT INTO drivers VALUES (?, ?, ?, ?, ?, ?)').bind('driver-2', 'Lina Haddad', 'Hawally', 'SUV', 'On delivery', 31),
    db.prepare('INSERT INTO drivers VALUES (?, ?, ?, ?, ?, ?)').bind('driver-3', 'Yousef Karim', 'Jabriya', 'Van', 'Available', 57),
  ]);
}

export async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>() as QueryResult<T>;
  return result.results ?? [];
}
