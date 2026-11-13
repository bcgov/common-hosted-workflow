CREATE TABLE "rate_limit_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"request_kind" varchar(30) NOT NULL,
	"extra_runs" integer,
	"period_key" varchar(10),
	"requested_weekly_limit" integer,
	"requested_annual_limit" integer,
	"reason" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"requested_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_rlr_kind" CHECK ("rate_limit_request"."request_kind" IN ('extra_runs', 'limit_increase')),
	CONSTRAINT "chk_rlr_status" CHECK ("rate_limit_request"."status" IN ('pending', 'approved', 'rejected', 'cancelled')),
	CONSTRAINT "chk_rlr_period_key" CHECK ("rate_limit_request"."period_key" ~ '^([0-9]{4}-W[0-9]{2}|[0-9]{4})$'),
	CONSTRAINT "chk_rlr_extra_runs_non_negative" CHECK ("rate_limit_request"."extra_runs" >= 0),
	CONSTRAINT "chk_rlr_limits_positive" CHECK ("rate_limit_request"."requested_weekly_limit" >= 1 AND "rate_limit_request"."requested_annual_limit" >= 1),
	CONSTRAINT "chk_rlr_reason_non_empty" CHECK (length("rate_limit_request"."reason") >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rlr_pending_project" ON "rate_limit_request" USING btree ("project_id") WHERE "rate_limit_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_rlr_project_created" ON "rate_limit_request" USING btree ("project_id","created_at");
