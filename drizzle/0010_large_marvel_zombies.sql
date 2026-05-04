CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"device_label" text,
	"daily_digest_enabled" boolean DEFAULT true NOT NULL,
	"low_balance_enabled" boolean DEFAULT true NOT NULL,
	"insights_enabled" boolean DEFAULT true NOT NULL,
	"sync_completion_enabled" boolean DEFAULT false NOT NULL,
	"send_time_local" time DEFAULT '09:00:00' NOT NULL,
	"last_digest_sent_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_sub_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_push_user" ON "push_subscriptions" USING btree ("user_id");