import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const partners = sqliteTable('partners', {
  id: text('id').primaryKey(), name: text('name').notNull(), area: text('area').notNull(),
  distanceKm: real('distance_km').notNull(), capacity: integer('capacity').notNull(),
  refrigerated: integer('refrigerated', { mode: 'boolean' }).notNull(), reliability: integer('reliability').notNull(),
});

export const drivers = sqliteTable('drivers', {
  id: text('id').primaryKey(), name: text('name').notNull(), area: text('area').notNull(),
  vehicle: text('vehicle').notNull(), status: text('status').notNull(), completedTrips: integer('completed_trips').notNull(),
});

export const donations = sqliteTable('donations', {
  id: text('id').primaryKey(), donor: text('donor').notNull(), area: text('area').notNull(),
  foodType: text('food_type').notNull(), meals: integer('meals').notNull(), pickupBy: text('pickup_by').notNull(),
  refrigerated: integer('refrigerated', { mode: 'boolean' }).notNull(), status: text('status').notNull(),
  partnerId: text('partner_id').references(() => partners.id), driverId: text('driver_id').references(() => drivers.id),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_donations_status_created').on(table.status, table.createdAt)]);

export const activities = sqliteTable('activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  donationId: text('donation_id').notNull().references(() => donations.id),
  kind: text('kind').notNull(), title: text('title').notNull(), detail: text('detail').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [index('idx_activities_donation_created').on(table.donationId, table.createdAt)]);
