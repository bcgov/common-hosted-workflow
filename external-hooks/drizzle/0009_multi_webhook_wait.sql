CREATE TABLE "multi_webhook_wait" (
	"execution_id" varchar(50) PRIMARY KEY NOT NULL,
	"resume_url" text NOT NULL,
	"total_expected" integer NOT NULL,
	"total_received" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multi_webhook_wait_call" (
	"execution_id" varchar(50) NOT NULL,
	"match_key" varchar(500) NOT NULL,
	"received" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_multi_webhook_wait_call" PRIMARY KEY("execution_id","match_key")
);
--> statement-breakpoint
ALTER TABLE "multi_webhook_wait_call" ADD CONSTRAINT "fk_multi_webhook_wait_call_execution" FOREIGN KEY ("execution_id") REFERENCES "public"."multi_webhook_wait"("execution_id") ON DELETE cascade ON UPDATE no action;
