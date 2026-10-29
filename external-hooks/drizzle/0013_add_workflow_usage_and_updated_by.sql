CREATE TABLE "workflow_execution_usage" (
	"project_id" varchar(50) NOT NULL,
	"workflow_id" varchar(50) NOT NULL,
	"period_type" varchar(10) NOT NULL,
	"period_key" varchar(10) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_workflow_execution_usage" PRIMARY KEY("project_id","workflow_id","period_type","period_key"),
	CONSTRAINT "chk_weu_period_type" CHECK ("workflow_execution_usage"."period_type" IN ('weekly', 'yearly'))
);
--> statement-breakpoint
CREATE INDEX "idx_weu_workflow_id" ON "workflow_execution_usage" ("workflow_id");
--> statement-breakpoint
ALTER TABLE "project_rate_limit" ADD COLUMN "updated_by" varchar(255);
