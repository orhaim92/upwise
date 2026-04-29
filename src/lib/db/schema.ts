import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  billingCycleStartDay: integer('billing_cycle_start_day').notNull().default(1),
  currency: text('currency').notNull().default('ILS'),
  timezone: text('timezone').notNull().default('Asia/Jerusalem'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['bank', 'credit_card'] }).notNull(),
  provider: text('provider').notNull(),
  displayName: text('display_name').notNull(),
  accountNumberMasked: text('account_number_masked'),
  encryptedCredentials: text('encrypted_credentials').notNull(),
  lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),
  scrapeStatus: text('scrape_status', {
    enum: ['idle', 'running', 'success', 'error'],
  })
    .notNull()
    .default('idle'),
  scrapeError: text('scrape_error'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
