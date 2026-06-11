CREATE TABLE "access_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_email" varchar(255) NOT NULL,
	"justification" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"reviewer_email" varchar(255),
	"reviewer_n8n_user_id" varchar(50),
	"deny_reason" text,
	"metadata" jsonb,
	CONSTRAINT "chk_access_request_status" CHECK ("access_request"."status" IN ('pending', 'approved', 'denied'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_access_request_pending_requester_email" ON "access_request" USING btree ("requester_email") WHERE "access_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_access_request_status" ON "access_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_access_request_requester_email" ON "access_request" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "idx_access_request_created_at" ON "access_request" USING btree ("created_at" DESC NULLS LAST);
