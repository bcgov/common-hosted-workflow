CREATE TABLE "workflow_trigger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_type" varchar(100) NOT NULL,
	"trigger_url" text NOT NULL,
	"trigger_method" varchar(50) NOT NULL,
	"metadata" jsonb NOT NULL,
	"allowed_actors_type" varchar(100) NOT NULL,
	"allowed_actors" varchar(50)[] NOT NULL,
	"auth_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(100),
	"updated_by" varchar(100),
	CONSTRAINT "chk_wt_actor_type" CHECK ("workflow_trigger"."trigger_type" IN ('chefs', 'button'))
);
--> statement-breakpoint
CREATE TABLE "credential_entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" varchar(128) NOT NULL,
	"data" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(100),
	"updated_by" varchar(100),
	CONSTRAINT "chk_cred_type" CHECK ("credential_entity"."type" IN ('chefs_api_key', 'webhook_auth_header'))
);
--> statement-breakpoint
CREATE TABLE "trigger_credential_relation" (
	"trigger_id" uuid NOT NULL,
	"credential_id" uuid NOT NULL,
	CONSTRAINT "trigger_credential_relation_trigger_id_credential_id_pk" PRIMARY KEY("trigger_id","credential_id")
);
--> statement-breakpoint
ALTER TABLE "action_requests" RENAME TO "action_request";--> statement-breakpoint
ALTER TABLE "messages" RENAME TO "message";--> statement-breakpoint
ALTER TABLE "action_request" DROP CONSTRAINT "chk_ar_status";--> statement-breakpoint
ALTER TABLE "action_request" DROP CONSTRAINT "chk_ar_priority";--> statement-breakpoint
ALTER TABLE "action_request" DROP CONSTRAINT "chk_ar_actor_type";--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "chk_messages_status";--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "chk_messages_actor_type";--> statement-breakpoint
ALTER TABLE "action_request" DROP CONSTRAINT "action_requests_project_id_tenant_project_relation_project_id_fk";
--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "messages_project_id_tenant_project_relation_project_id_fk";
--> statement-breakpoint
DROP INDEX "idx_messages_project_created";--> statement-breakpoint
DROP INDEX "idx_messages_project_actor_created";--> statement-breakpoint
DROP INDEX "idx_messages_project_actor_id";--> statement-breakpoint
DROP INDEX "idx_messages_instance_created";--> statement-breakpoint
DROP INDEX "idx_messages_status";--> statement-breakpoint
DROP INDEX "idx_messages_since";--> statement-breakpoint
DROP INDEX "idx_ar_due_date";--> statement-breakpoint
DROP INDEX "idx_ar_check_in";--> statement-breakpoint
ALTER TABLE "trigger_credential_relation" ADD CONSTRAINT "trigger_credential_relation_trigger_id_workflow_trigger_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."workflow_trigger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_credential_relation" ADD CONSTRAINT "trigger_credential_relation_credential_id_credential_entity_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credential_entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ce_type" ON "credential_entity" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_tcr_trigger_id" ON "trigger_credential_relation" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "idx_tcr_credential_id" ON "trigger_credential_relation" USING btree ("credential_id");--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "action_request_project_id_tenant_project_relation_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."tenant_project_relation"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_project_id_tenant_project_relation_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."tenant_project_relation"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_message_project_created" ON "message" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_message_project_actor_created" ON "message" USING btree ("project_id","actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_message_project_actor_id" ON "message" USING btree ("project_id","actor_id","id");--> statement-breakpoint
CREATE INDEX "idx_message_instance_created" ON "message" USING btree ("workflow_instance_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_message_status" ON "message" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_message_since" ON "message" USING btree ("project_id","actor_id","created_at" DESC NULLS LAST) WHERE "message"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_ar_due_date" ON "action_request" USING btree ("due_date") WHERE "action_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_ar_check_in" ON "action_request" USING btree ("check_in") WHERE "action_request"."check_in" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "chk_action_request_status" CHECK ("action_request"."status" IN ('pending', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted'));--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "chk_ar_priority" CHECK ("action_request"."priority" IN ('critical', 'normal'));--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "chk_ar_actor_type" CHECK ("action_request"."actor_type" IN ('user', 'role', 'group', 'system', 'other'));--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "chk_message_status" CHECK ("message"."status" IN ('active', 'read'));--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "chk_message_actor_type" CHECK ("message"."actor_type" IN ('user', 'role', 'group', 'system', 'other'));
