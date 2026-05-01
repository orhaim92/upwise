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
  time,
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
  // Phase 4.5: bank-reported balance (source of truth for daily allowance)
  currentBalance: numeric('current_balance', { precision: 14, scale: 2 }),
  balanceUpdatedAt: timestamp('balance_updated_at', { withTimezone: true }),
  // Phase 4.5: link a credit card to the bank account that pays its statement.
  // Self-reference; no FK enforced at DB level (drizzle limitation).
  statementAccountId: uuid('statement_account_id'),
  // Phase 4.7: last 4 digits of the card. Used to match aggregate bank charges
  // to specific cards by substring of the bank's transaction description.
  lastFourDigits: text('last_four_digits'),
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

export const recurringRules = pgTable('recurring_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  expectedAmount: numeric('expected_amount', { precision: 12, scale: 2 }).notNull(),
  amountTolerancePct: numeric('amount_tolerance_pct', { precision: 5, scale: 2 })
    .notNull()
    .default('15'),
  frequency: text('frequency', {
    enum: [
      'weekly',
      'monthly',
      'bimonthly',
      'quarterly',
      'semiannual',
      'yearly',
      'custom',
    ],
  }).notNull(),
  customIntervalDays: integer('custom_interval_days'),
  matchPattern: text('match_pattern'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  remainingOccurrences: integer('remaining_occurrences'),
  isActive: boolean('is_active').notNull().default(true),
  detectionSource: text('detection_source', { enum: ['auto', 'user'] })
    .notNull()
    .default('user'),
  detectionStatus: text('detection_status', {
    enum: ['pending', 'confirmed', 'rejected'],
  })
    .notNull()
    .default('confirmed'),
  categoryId: uuid('category_id').references(() => categories.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const savingsGoals = pgTable('savings_goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetAmount: numeric('target_amount', { precision: 12, scale: 2 }).notNull(),
  currentAmount: numeric('current_amount', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  targetDate: date('target_date'),
  monthlyContribution: numeric('monthly_contribution', {
    precision: 12,
    scale: 2,
  }),
  icon: text('icon'),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Phase 4.6: user-marked skip — "this rule will not charge this cycle, ignore it."
export const cycleSkips = pgTable(
  'cycle_skips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    recurringRuleId: uuid('recurring_rule_id')
      .notNull()
      .references(() => recurringRules.id, { onDelete: 'cascade' }),
    cycleStartDate: date('cycle_start_date').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [unique('cycle_skips_unique').on(t.recurringRuleId, t.cycleStartDate)],
);

// Phase 4.6: user-entered one-time income or expense for the current cycle.
export const manualCycleItems = pgTable('manual_cycle_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  cycleStartDate: date('cycle_start_date').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  name: text('name').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Phase 5: pending invitations to join a household. Token is sent to recipient
// via copy-paste; only the SHA-256 hash is persisted server-side.
export const householdInvitations = pgTable(
  'household_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    invitedEmail: text('invited_email').notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique('household_invitations_token_hash_unique').on(t.tokenHash),
    index('idx_household_invitations_household').on(t.householdId),
  ],
);

// Phase 5: per-user WhatsApp opt-in for the daily digest.
// One row per user (PK = userId). Code is hashed; raw code never persisted.
export const whatsappSubscriptions = pgTable('whatsapp_subscriptions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  phoneE164: text('phone_e164').notNull(),
  isVerified: boolean('is_verified').notNull().default(false),
  verificationCodeHash: text('verification_code_hash'),
  verificationExpiresAt: timestamp('verification_expires_at', {
    withTimezone: true,
  }),
  dailySummaryEnabled: boolean('daily_summary_enabled').notNull().default(true),
  sendTimeLocal: time('send_time_local').notNull().default('09:00:00'),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
    recurringRuleId: uuid('recurring_rule_id').references(
      () => recurringRules.id,
      { onDelete: 'set null' },
    ),
    installmentNumber: integer('installment_number'),
    installmentTotal: integer('installment_total'),
    isUserModified: boolean('is_user_modified').notNull().default(false),
    notes: text('notes'),
    // Phase 4.5: marked when this is a credit-card statement charge in the bank
    // account that aggregates a card's individual transactions. Excluded from math.
    isAggregatedCharge: boolean('is_aggregated_charge').notNull().default(false),
    // Phase 4.5: marked when this is one side of a household-internal transfer.
    // Both sides reference each other via transferPartnerId. Excluded from math.
    isInternalTransfer: boolean('is_internal_transfer').notNull().default(false),
    transferPartnerId: uuid('transfer_partner_id'),
    // Phase 4.8: last 4 digits of the physical card. Populated per-tx during
    // CC scrape (israeli-bank-scrapers returns one sub-account per physical
    // card). Also populated on bank-side aggregate charges when the user
    // manually links them to a specific card via the mark-as-CC dialog.
    cardLastFour: text('card_last_four'),
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
