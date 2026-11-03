ALTER TABLE "project_rate_limit" ADD "uses_default_limits" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- Rows that predate the flag were created because an admin saved explicit
-- custom values for the project, so they keep enforcing those values (custom
-- mode). New rows default to true (follow the scope defaults).
UPDATE "project_rate_limit" SET "uses_default_limits" = false;
