ALTER TABLE "action_request" ADD COLUMN "claimed_by" varchar(255);--> statement-breakpoint
ALTER TABLE "action_request" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "action_request" ADD COLUMN "completed_by" varchar(255);--> statement-breakpoint
ALTER TABLE "action_request" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "action_request" DROP CONSTRAINT "chk_action_request_status";--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "chk_action_request_status" CHECK ("action_request"."status" IN ('pending', 'claimed', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted'));--> statement-breakpoint
CREATE INDEX "idx_ar_pending_claims" ON "action_request" USING btree ("id","status") WHERE "action_request"."status" = 'pending';
