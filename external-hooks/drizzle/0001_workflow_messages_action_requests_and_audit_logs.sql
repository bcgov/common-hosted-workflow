CREATE TABLE "action_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"callback_url" text NOT NULL,
	"callback_method" varchar(10) DEFAULT 'POST' NOT NULL,
	"callback_payload_spec" jsonb,
	"actor_id" varchar(50) NOT NULL,
	"actor_type" varchar(50) NOT NULL,
	"workflow_instance_id" varchar(50) NOT NULL,
	"workflow_id" varchar(50),
	"project_id" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"due_date" timestamp with time zone,
	"check_in" timestamp with time zone,
	"metadata" jsonb,
	CONSTRAINT "chk_ar_status" CHECK ("action_requests"."status" IN ('pending', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted')),
	CONSTRAINT "chk_ar_priority" CHECK ("action_requests"."priority" IN ('critical', 'normal')),
	CONSTRAINT "chk_ar_actor_type" CHECK ("action_requests"."actor_type" IN ('user', 'role', 'group', 'system', 'other'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"project_id" varchar(50) NOT NULL,
	"performed_by" varchar(100) NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb,
	CONSTRAINT "chk_audit_action" CHECK ("audit_log"."action" IN ('created', 'updated', 'archived', 'deleted', 'status_changed', 'assigned')),
	CONSTRAINT "chk_audit_entity_type" CHECK ("audit_log"."entity_type" IN ('message', 'action_request'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"actor_id" varchar(50) NOT NULL,
	"actor_type" varchar(50) NOT NULL,
	"workflow_instance_id" varchar(50) NOT NULL,
	"workflow_id" varchar(50),
	"project_id" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "chk_messages_status" CHECK ("messages"."status" IN ('active', 'read')),
	CONSTRAINT "chk_messages_actor_type" CHECK ("messages"."actor_type" IN ('user', 'role', 'group', 'system', 'other'))
);
--> statement-breakpoint
CREATE INDEX "idx_ar_project_created" ON "action_requests" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ar_project_actor_created" ON "action_requests" USING btree ("project_id","actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ar_project_actor_workflow_created" ON "action_requests" USING btree ("project_id","actor_id","workflow_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ar_project_id" ON "action_requests" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "idx_ar_project_actor_id" ON "action_requests" USING btree ("project_id","actor_id","id");--> statement-breakpoint
CREATE INDEX "idx_ar_instance_created" ON "action_requests" USING btree ("workflow_instance_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ar_status" ON "action_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ar_due_date" ON "action_requests" USING btree ("due_date") WHERE "action_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_ar_priority_status" ON "action_requests" USING btree ("priority","status");--> statement-breakpoint
CREATE INDEX "idx_ar_check_in" ON "action_requests" USING btree ("check_in") WHERE "action_requests"."check_in" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_project_entity" ON "audit_log" USING btree ("project_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_performed_at" ON "audit_log" USING btree ("performed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_project_performed_by" ON "audit_log" USING btree ("project_id","performed_by","performed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_project_created" ON "messages" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_project_actor_created" ON "messages" USING btree ("project_id","actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_project_actor_id" ON "messages" USING btree ("project_id","actor_id","id");--> statement-breakpoint
CREATE INDEX "idx_messages_instance_created" ON "messages" USING btree ("workflow_instance_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_messages_status" ON "messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_messages_since" ON "messages" USING btree ("project_id","actor_id","created_at" DESC NULLS LAST) WHERE "messages"."status" = 'active';
