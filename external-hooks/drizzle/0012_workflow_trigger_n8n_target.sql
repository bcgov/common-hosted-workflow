-- The WIL Trigger node is the only supported target. Legacy URL triggers cannot satisfy the
-- node-only shape constraint below, so remove exactly those rows (identified by trigger_url,
-- which still exists at this point). Scoped rather than unconditional so any row that already
-- has a node target survives and nothing outside the legacy shape is silently lost.
DELETE FROM "workflow_trigger" WHERE "trigger_url" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD COLUMN "target_kind" varchar(20) DEFAULT 'n8n-node' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD COLUMN "target_workflow_id" varchar(36);--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD COLUMN "target_node_id" varchar(36);--> statement-breakpoint
ALTER TABLE "workflow_trigger" DROP COLUMN IF EXISTS "trigger_url";--> statement-breakpoint
ALTER TABLE "workflow_trigger" DROP COLUMN IF EXISTS "trigger_method";--> statement-breakpoint
CREATE INDEX "idx_wt_target_workflow" ON "workflow_trigger" USING btree ("target_workflow_id");--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD CONSTRAINT "chk_wt_target_kind" CHECK ("workflow_trigger"."target_kind" IN ('n8n-node'));--> statement-breakpoint
ALTER TABLE "workflow_trigger" ADD CONSTRAINT "chk_wt_target_shape" CHECK ("workflow_trigger"."target_kind" = 'n8n-node' AND "workflow_trigger"."target_workflow_id" IS NOT NULL AND "workflow_trigger"."target_node_id" IS NOT NULL);
