ALTER TABLE "chefs_submission_webhook" DROP CONSTRAINT "chk_chefs_submission_webhook_status";--> statement-breakpoint
DROP INDEX "idx_chefs_submission_webhook_pending";--> statement-breakpoint
CREATE INDEX "idx_chefs_submission_webhook_pending" ON "chefs_submission_webhook" USING btree ("form_id","submission_id");--> statement-breakpoint
ALTER TABLE "chefs_submission_webhook" DROP COLUMN "status";
