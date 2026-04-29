import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  primaryKey,
  numeric,
  date,
  index,
  unique,
  type AnyPgColumn,
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

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id').references(() => households.id, {
      onDelete: 'cascade',
    }),
    key: text('key').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    icon: text('icon'),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [unique('categories_household_key_unique').on(t.householdId, t.key)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    externalId: text('external_id'),
    date: date('date').notNull(),
    processedDate: date('processed_date'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    description: text('description').notNull(),
    rawDescription: text('raw_description'),
    normalizedDescription: text('normalized_description'),
    categoryId: uuid('category_id').references(() => categories.id),
    installmentNumber: integer('installment_number'),
    installmentTotal: integer('installment_total'),
    isUserModified: boolean('is_user_modified').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique('transactions_account_external_unique').on(
      t.accountId,
      t.externalId,
    ),
    index('idx_tx_household_date').on(t.householdId, t.date.desc()),
    index('idx_tx_normalized').on(t.householdId, t.normalizedDescription),
  ],
);
