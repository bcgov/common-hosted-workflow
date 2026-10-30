CREATE TABLE "project_topup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"period_key" varchar(10) NOT NULL,
	"amount" integer NOT NULL,
	"admin_comment" text NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_ptu_amount_positive" CHECK ("project_topup"."amount" > 0),
	CONSTRAINT "chk_ptu_period_key" CHECK ("project_topup"."period_key" ~ '^[0-9]{4}-W[0-9]{2}$')
);
--> statement-breakpoint
CREATE INDEX "idx_ptu_project_period" ON "project_topup" USING btree ("project_id","period_key");
