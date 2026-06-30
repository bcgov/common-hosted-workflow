ALTER TABLE "workflow_trigger" DROP CONSTRAINT "chk_wt_actor_type";--> statement-breakpoint
ALTER TABLE "action_request" ADD COLUMN "action_title" varchar(255);--> statement-breakpoint
ALTER TABLE "tenant_project_relation" ADD COLUMN "project_type" varchar(50);--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD COLUMN "project_id" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD CONSTRAINT "workflow_trigger_project_id_tenant_project_relation_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."tenant_project_relation"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wt_project_id" ON "workflow_trigger" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD CONSTRAINT "chk_wt_trigger_type" CHECK ("workflow_trigger"."trigger_type" IN ('chefs-form', 'button'));
