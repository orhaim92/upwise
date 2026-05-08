import { sql } from 'drizzle-orm';
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

// Per-request password reset tokens. The plaintext token is sent in the
// reset link; only its hash lives in the DB so a leaked DB row can't be
// used directly. Tokens are single-use (cleared on successful reset) and
// short-lived (~1 hour) — same shape as householdInvitations below.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  // Fallback / "expected" cycle start day. Used directly when
  // autoDetectCycleStart is false; otherwise used as the anchor day around
  // which we look for the actual landing date of the first income tx of
  // the month.
  billingCycleStartDay: integer('billing_cycle_start_day').notNull().default(1),
  // When true, the active cycle starts on the earliest linked income tx
  // date that lands within ±10 days of billingCycleStartDay. This handles
  // households where payday slides ±a few days month-to-month (holidays,
  // weekend shifts) — the cycle follows the actual salary instead of
  // splitting it across two cycles.
  autoDetectCycleStart: boolean('auto_detect_cycle_start')
    .notNull()
    .default(false),
  // List of card-last-four values that are immediate-charge (debit-style)
  // cards — דיירקט and similar. The bank scraper still reports them under
  // the CC issuer account, but their charge hits the bank account on the
  // purchase date, not on the monthly bill date. Charts treat them as if
  // their effective cycle date IS the purchase date.
  immediateChargeCards: text('immediate_charge_cards')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
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
  // Phase 6: opt-in for high-urgency advisor insight alerts (urgency >= 8
  // pushes a WhatsApp message in addition to landing on the dashboard).
  insightAlertsEnabled: boolean('insight_alerts_enabled')
    .notNull()
    .default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Phase 6: scheduled financial events the user has flagged (vacation,
// large purchase, income change). Currently used as a record only — the
// advisor's `simulateEvent` tool computes impact ad-hoc. May feed
// future planning views.
export const financialEvents = pgTable('financial_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventType: text('event_type', {
    enum: ['vacation', 'large_purchase', 'income_change', 'one_time_expense'],
  }).notNull(),
  date: date('date').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Phase 6: chat sessions with the AI advisor. One conversation aggregates
// many messages; first user message becomes the title.
export const advisorConversations = pgTable(
  'advisor_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('idx_advisor_conv_user').on(t.userId, t.lastMessageAt.desc()),
  ],
);

export const advisorMessages = pgTable(
  'advisor_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => advisorConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('idx_advisor_msg_conv').on(t.conversationId, t.createdAt)],
);

// Phase 7: per-device PushSubscription records for native web push.
// One row per (user, device/browser endpoint). Endpoint is unique because
// the browser's PushManager assigns a globally-unique URL per subscription.
//
// `failureCount` tracks consecutive send failures; once it hits 5 (or we
// see a 404/410 from the push service), the row is deleted. This auto-
// prunes stale subscriptions without needing an external sweep.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    deviceLabel: text('device_label'),
    // Per-device notification preferences. Default-on for the digest +
    // alerts (intent: most users want them) and default-off for sync
    // completion (less universally wanted, can be noisy after every sync).
    dailyDigestEnabled: boolean('daily_digest_enabled').notNull().default(true),
    lowBalanceEnabled: boolean('low_balance_enabled').notNull().default(true),
    insightsEnabled: boolean('insights_enabled').notNull().default(true),
    syncCompletionEnabled: boolean('sync_completion_enabled')
      .notNull()
      .default(false),
    sendTimeLocal: time('send_time_local').notNull().default('09:00:00'),
    lastDigestSentAt: timestamp('last_digest_sent_at', {
      withTimezone: true,
    }),
    failureCount: integer('failure_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique('push_sub_endpoint_unique').on(t.endpoint),
    index('idx_push_user').on(t.userId),
  ],
);

// Phase 6: proactive findings produced by the daily insights cron.
export const advisorInsights = pgTable(
  'advisor_insights',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    urgency: integer('urgency').notNull().default(5),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status', { enum: ['new', 'dismissed', 'acted_on'] })
      .notNull()
      .default('new'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('idx_advisor_insights_household').on(
      t.householdId,
      t.status,
      t.createdAt.desc(),
    ),
  ],
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

// Phase 9: WebAuthn / Passkey credentials. One row per (user, authenticator).
// `credentialId` is the unique identifier the browser hands back; we look up
// by it during signin. `publicKey` and `counter` are the verifier inputs for
// every assertion; counter is bumped after each successful auth (replay
// defense). `transports` is a comma-joined hint list ('internal,hybrid'...)
// surfaced back to navigator.credentials.get to speed device picker.
//
// `label` is a user-friendly name like "iPhone Touch ID" so the settings UI
// can list multiple devices clearly.
export const authenticators = pgTable(
  'authenticators',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    deviceType: text('device_type'),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: text('transports'),
    label: text('label'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('idx_authenticators_user').on(t.userId)],
);
