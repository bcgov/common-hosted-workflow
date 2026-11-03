CREATE TABLE "rate_limit_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"period_key" varchar(10) NOT NULL,
	"event_kind" varchar(30) NOT NULL,
	"usage_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_rln_project_period_kind" UNIQUE("project_id","period_key","event_kind")
);
--> statement-breakpoint
ALTER TABLE "rate_limit_notification" ADD CONSTRAINT "chk_rln_period_key" CHECK ("rate_limit_notification"."period_key" ~ '^([0-9]{4}-W[0-9]{2}|[0-9]{4})$');
--> statement-breakpoint
ALTER TABLE "rate_limit_notification" ADD CONSTRAINT "chk_rln_event_kind" CHECK ("rate_limit_notification"."event_kind" IN ('weekly_near_50', 'weekly_near_80', 'weekly_reached_soft', 'weekly_reached_hard', 'yearly_near_50', 'yearly_near_80', 'yearly_reached_soft', 'yearly_reached_hard'));
--> statement-breakpoint
ALTER TABLE "rate_limit_notification" ADD CONSTRAINT "chk_rln_usage_non_negative" CHECK ("rate_limit_notification"."usage_count" >= 0);
--> statement-breakpoint
CREATE INDEX "idx_rln_created_at" ON "rate_limit_notification" USING btree ("created_at");
