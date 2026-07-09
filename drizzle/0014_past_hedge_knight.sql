ALTER TABLE "households" ALTER COLUMN "auto_detect_cycle_start" SET DEFAULT true;--> statement-breakpoint
UPDATE "households" SET "auto_detect_cycle_start" = true;
