CREATE TABLE "project_rate_limit_default" (
	"project_kind" varchar(10) PRIMARY KEY NOT NULL,
	"weekly_rate_limit" integer,
	"yearly_rate_limit" integer,
	"updated_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_prld_project_kind" CHECK ("project_rate_limit_default"."project_kind" IN ('team', 'personal')),
	CONSTRAINT "chk_prld_weekly_non_negative" CHECK ("project_rate_limit_default"."weekly_rate_limit" IS NULL OR "project_rate_limit_default"."weekly_rate_limit" >= 0),
	CONSTRAINT "chk_prld_yearly_non_negative" CHECK ("project_rate_limit_default"."yearly_rate_limit" IS NULL OR "project_rate_limit_default"."yearly_rate_limit" >= 0)
);
