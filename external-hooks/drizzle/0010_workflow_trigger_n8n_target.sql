ALTER TABLE "workflow_trigger" ADD COLUMN "target_kind" varchar(20) DEFAULT 'url' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD COLUMN "target_workflow_id" varchar(36);--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD COLUMN "target_node_id" varchar(36);--> statement-breakpoint
ALTER TABLE "workflow_trigger" ALTER COLUMN "trigger_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_trigger" ALTER COLUMN "trigger_method" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_wt_target_workflow" ON "workflow_trigger" USING btree ("target_workflow_id");--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD CONSTRAINT "chk_wt_target_kind" CHECK ("workflow_trigger"."target_kind" IN ('url', 'n8n-node'));--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD CONSTRAINT "chk_wt_target_shape" CHECK (("workflow_trigger"."target_kind" = 'url' AND "workflow_trigger"."trigger_url" IS NOT NULL AND "workflow_trigger"."trigger_method" IS NOT NULL)
        OR ("workflow_trigger"."target_kind" = 'n8n-node' AND "workflow_trigger"."target_workflow_id" IS NOT NULL AND "workflow_trigger"."target_node_id" IS NOT NULL));
