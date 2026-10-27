CREATE TABLE "project_rate_limit" (
	"project_id" varchar(50) PRIMARY KEY NOT NULL,
	"weekly_rate_limit" integer,
	"yearly_rate_limit" integer,
	"last_admin_comment" text,
	"stop_behavior" varchar(20) DEFAULT 'hard_stop' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_prl_stop_behavior" CHECK ("project_rate_limit"."stop_behavior" IN ('hard_stop', 'soft_stop'))
);
--> statement-breakpoint
CREATE TABLE "project_execution_usage" (
	"project_id" varchar(50) NOT NULL,
	"period_type" varchar(10) NOT NULL,
	"period_key" varchar(10) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_project_execution_usage" PRIMARY KEY("project_id","period_type","period_key"),
	CONSTRAINT "chk_peu_period_type" CHECK ("project_execution_usage"."period_type" IN ('weekly', 'yearly'))
);
