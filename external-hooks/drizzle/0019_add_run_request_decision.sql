ALTER TABLE "rate_limit_request" ADD COLUMN "granted_runs" integer;--> statement-breakpoint
ALTER TABLE "rate_limit_request" ADD COLUMN "decided_weekly_limit" integer;--> statement-breakpoint
ALTER TABLE "rate_limit_request" ADD COLUMN "decided_annual_limit" integer;--> statement-breakpoint
ALTER TABLE "rate_limit_request" ADD COLUMN "decision_note" varchar(500);--> statement-breakpoint
ALTER TABLE "rate_limit_request" ADD COLUMN "decided_by" varchar(255);--> statement-breakpoint
ALTER TABLE "rate_limit_request" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rate_limit_request" ADD CONSTRAINT "chk_rlr_granted_runs_positive" CHECK ("rate_limit_request"."granted_runs" >= 1);--> statement-breakpoint
ALTER TABLE "rate_limit_request" ADD CONSTRAINT "chk_rlr_decided_limits_positive" CHECK ("rate_limit_request"."decided_weekly_limit" >= 1 AND "rate_limit_request"."decided_annual_limit" >= 1);