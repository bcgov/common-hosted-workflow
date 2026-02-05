CREATE TABLE "user_workflow" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_workflow_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar(255) NOT NULL,
	"workflow_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT '' NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"next_form_id" varchar(255)
);
