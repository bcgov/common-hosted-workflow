CREATE TABLE "chefs_submission_webhook" (
	"execution_id" varchar(50) NOT NULL,
	"webhook_url" text NOT NULL,
	"form_id" varchar(255) NOT NULL,
	"submission_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_chefs_submission_webhook" PRIMARY KEY("form_id","submission_id"),
	CONSTRAINT "chk_chefs_submission_webhook_status" CHECK ("chefs_submission_webhook"."status" IN ('pending', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "action_request" DROP CONSTRAINT "chk_action_request_status";--> statement-breakpoint
ALTER TABLE "action_request" ADD COLUMN "claimed_by" varchar(255);--> statement-breakpoint
ALTER TABLE "action_request" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "action_request" ADD COLUMN "completed_by" varchar(255);--> statement-breakpoint
ALTER TABLE "action_request" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_chefs_submission_webhook_pending" ON "chefs_submission_webhook" USING btree ("form_id","submission_id","status");--> statement-breakpoint
CREATE INDEX "idx_ar_pending_claims" ON "action_request" USING btree ("id","status") WHERE "action_request"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "chk_action_request_status" CHECK ("action_request"."status" IN ('pending', 'claimed', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted'));
