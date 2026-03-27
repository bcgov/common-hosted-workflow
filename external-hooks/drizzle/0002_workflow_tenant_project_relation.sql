CREATE TABLE "tenant_project_relation" (
	"tenant_id" uuid NOT NULL,
	"project_id" varchar(50) NOT NULL,
	CONSTRAINT "tenant_project_relation_tenant_id_project_id_pk" PRIMARY KEY("tenant_id","project_id")
);
--> statement-breakpoint
CREATE INDEX "idx_tpr_tenant_id" ON "tenant_project_relation" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tpr_project_id" ON "tenant_project_relation" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "action_requests" ADD CONSTRAINT "action_requests_project_id_tenant_project_relation_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."tenant_project_relation"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_project_id_tenant_project_relation_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."tenant_project_relation"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_tenant_project_relation_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."tenant_project_relation"("project_id") ON DELETE no action ON UPDATE no action;
