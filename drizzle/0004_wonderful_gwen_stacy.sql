ALTER TABLE "accounts" ADD COLUMN "current_balance" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "balance_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "statement_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_aggregated_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_internal_transfer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_partner_id" uuid;