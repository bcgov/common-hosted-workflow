209 results - 207 files

github-webhooks/payload-schemas/api.github.com/branch_protection_configuration/disabled.schema.json:
5 "properties": {
6: "action": { "type": "string", "enum": ["disabled"] },
7 "installation": { "$ref": "common/installation-lite.schema.json" },

github-webhooks/payload-schemas/api.github.com/branch_protection_configuration/enabled.schema.json:
5 "properties": {
6: "action": { "type": "string", "enum": ["enabled"] },
7 "installation": { "$ref": "common/installation-lite.schema.json" },

github-webhooks/payload-schemas/api.github.com/branch_protection_rule/created.schema.json:
7 "properties": {
8: "action": { "type": "string", "enum": ["created"] },
9 "rule": { "$ref": "common/branch-protection-rule.schema.json" },

github-webhooks/payload-schemas/api.github.com/branch_protection_rule/deleted.schema.json:
7 "properties": {
8: "action": { "type": "string", "enum": ["deleted"] },
9 "rule": { "$ref": "common/branch-protection-rule.schema.json" },

github-webhooks/payload-schemas/api.github.com/branch_protection_rule/edited.schema.json:
7 "properties": {
8: "action": { "type": "string", "enum": ["edited"] },
9 "rule": { "$ref": "common/branch-protection-rule.schema.json" },

github-webhooks/payload-schemas/api.github.com/check_run/completed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["completed"] },
8 "check_run": {

github-webhooks/payload-schemas/api.github.com/check_run/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "check_run": {

github-webhooks/payload-schemas/api.github.com/check_run/requested_action.schema.json:
12 "properties": {
13: "action": { "type": "string", "enum": ["requested_action"] },
14 "check_run": {

github-webhooks/payload-schemas/api.github.com/check_run/rerequested.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["rerequested"] },
8 "check_run": {

github-webhooks/payload-schemas/api.github.com/check_suite/completed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["completed"] },
8 "check_suite": {

github-webhooks/payload-schemas/api.github.com/check_suite/requested.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["requested"] },
8 "check_suite": {

github-webhooks/payload-schemas/api.github.com/check_suite/rerequested.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["rerequested"] },
8 "check_suite": {

github-webhooks/payload-schemas/api.github.com/code_scanning_alert/appeared_in_branch.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["appeared_in_branch"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/code_scanning_alert/closed_by_user.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["closed_by_user"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/code_scanning_alert/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/code_scanning_alert/fixed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["fixed"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/code_scanning_alert/reopened_by_user.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reopened_by_user"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/code_scanning_alert/reopened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reopened"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/custom_property/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "definition": { "$ref": "common/org-custom-property.schema.json" },

github-webhooks/payload-schemas/api.github.com/custom_property/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "definition": {

github-webhooks/payload-schemas/api.github.com/custom_property_values/updated.schema.json:
5 "properties": {
6: "action": { "type": "string", "enum": ["updated"] },
7 "installation": { "$ref": "common/installation-lite.schema.json" },

github-webhooks/payload-schemas/api.github.com/dependabot_alert/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/dependabot_alert/dismissed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["dismissed"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/dependabot_alert/fixed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["fixed"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/dependabot_alert/reintroduced.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reintroduced"] },
8 "alert": { "$ref": "common/dependabot-alert.schema.json" },

github-webhooks/payload-schemas/api.github.com/dependabot_alert/reopened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reopened"] },
8 "alert": { "$ref": "common/dependabot-alert.schema.json" },

github-webhooks/payload-schemas/api.github.com/deploy_key/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "key": {

github-webhooks/payload-schemas/api.github.com/deploy_key/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "key": {

github-webhooks/payload-schemas/api.github.com/deployment/created.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["created"] },
15 "deployment": { "$ref": "common/deployment.schema.json" },

github-webhooks/payload-schemas/api.github.com/deployment_protection_rule/requested.schema.json:
7 "properties": {
8: "action": { "type": "string", "enum": ["requested"] },
9 "environment": {

github-webhooks/payload-schemas/api.github.com/deployment_review/approved.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["approved"] },
15 "workflow_run": { "$ref": "common/workflow-run.schema.json" },

github-webhooks/payload-schemas/api.github.com/deployment_review/rejected.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["rejected"] },
15 "workflow_run": { "$ref": "common/workflow-run.schema.json" },

github-webhooks/payload-schemas/api.github.com/deployment_review/requested.schema.json:
17 "properties": {
18: "action": { "type": "string", "enum": ["requested"] },
19 "workflow_run": {

github-webhooks/payload-schemas/api.github.com/deployment_status/created.schema.json:
12 "properties": {
13: "action": { "type": "string", "enum": ["created"] },
14 "deployment_status": {

github-webhooks/payload-schemas/api.github.com/discussion/answered.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["answered"] },
8 "discussion": {

github-webhooks/payload-schemas/api.github.com/discussion/category_changed.schema.json:
21 },
22: "action": { "type": "string", "enum": ["category_changed"] },
23 "discussion": { "$ref": "common/discussion.schema.json" },

github-webhooks/payload-schemas/api.github.com/discussion/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "discussion": {

github-webhooks/payload-schemas/api.github.com/discussion/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "discussion": { "$ref": "common/discussion.schema.json" },

github-webhooks/payload-schemas/api.github.com/discussion/edited.schema.json:
24 },
25: "action": { "type": "string", "enum": ["edited"] },
26 "discussion": { "$ref": "common/discussion.schema.json" },

github-webhooks/payload-schemas/api.github.com/discussion/labeled.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["labeled"] },
8 "discussion": { "$ref": "common/discussion.schema.json" },

github-webhooks/payload-schemas/api.github.com/discussion/locked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["locked"] },
8 "discussion": {

github-webhooks/payload-schemas/api.github.com/discussion/pinned.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["pinned"] },
8 "discussion": { "$ref": "common/discussion.schema.json" },

github-webhooks/payload-schemas/api.github.com/discussion/transferred.schema.json:
15 },
16: "action": { "type": "string", "enum": ["transferred"] },
17 "discussion": { "$ref": "common/discussion.schema.json" },

github-webhooks/payload-schemas/api.github.com/discussion/unanswered.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unanswered"] },
8 "discussion": {

github-webhooks/payload-schemas/api.github.com/discussion/unlabeled.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unlabeled"] },
8 "discussion": { "$ref": "common/discussion.schema.json" },

github-webhooks/payload-schemas/api.github.com/discussion/unlocked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unlocked"] },
8 "discussion": {

github-webhooks/payload-schemas/api.github.com/discussion/unpinned.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unpinned"] },
8 "discussion": { "$ref": "common/discussion.schema.json" },

github-webhooks/payload-schemas/api.github.com/discussion_comment/created.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["created"] },
15 "comment": {

github-webhooks/payload-schemas/api.github.com/discussion_comment/deleted.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["deleted"] },
15 "comment": {

github-webhooks/payload-schemas/api.github.com/discussion_comment/edited.schema.json:
27 },
28: "action": { "type": "string", "enum": ["edited"] },
29 "comment": {

github-webhooks/payload-schemas/api.github.com/github_app_authorization/revoked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["revoked"] },
8 "sender": { "$ref": "common/user.schema.json" }

github-webhooks/payload-schemas/api.github.com/installation/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "installation": { "$ref": "common/installation.schema.json" },

github-webhooks/payload-schemas/api.github.com/installation/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "installation": { "$ref": "common/installation.schema.json" },

github-webhooks/payload-schemas/api.github.com/installation/new_permissions_accepted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["new_permissions_accepted"] },
8 "installation": { "$ref": "common/installation.schema.json" },

github-webhooks/payload-schemas/api.github.com/installation/suspend.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["suspend"] },
8 "installation": {

github-webhooks/payload-schemas/api.github.com/installation/unsuspend.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unsuspend"] },
8 "installation": {

github-webhooks/payload-schemas/api.github.com/installation_repositories/added.schema.json:
14 "properties": {
15: "action": { "type": "string", "enum": ["added"] },
16 "installation": { "$ref": "common/installation.schema.json" },

github-webhooks/payload-schemas/api.github.com/installation_repositories/removed.schema.json:
14 "properties": {
15: "action": { "type": "string", "enum": ["removed"] },
16 "installation": { "$ref": "common/installation.schema.json" },

github-webhooks/payload-schemas/api.github.com/installation_target/renamed.schema.json:
24 },
25: "action": { "type": "string", "enum": ["renamed"] },
26 "account": {

github-webhooks/payload-schemas/api.github.com/issue_comment/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "issue": {

github-webhooks/payload-schemas/api.github.com/issue_comment/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "issue": {

github-webhooks/payload-schemas/api.github.com/issue_comment/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/issues/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "issue": { "$ref": "common/issue.schema.json" },

github-webhooks/payload-schemas/api.github.com/issues/demilestoned.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["demilestoned"] },
8 "issue": {

github-webhooks/payload-schemas/api.github.com/issues/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "issue": { "$ref": "common/issue.schema.json" },

github-webhooks/payload-schemas/api.github.com/issues/labeled.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["labeled"] },
8 "issue": { "$ref": "common/issue.schema.json" },

github-webhooks/payload-schemas/api.github.com/issues/locked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["locked"] },
8 "issue": {

github-webhooks/payload-schemas/api.github.com/issues/milestoned.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["milestoned"] },
8 "issue": {

github-webhooks/payload-schemas/api.github.com/issues/opened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["opened"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/issues/pinned.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["pinned"] },
8 "issue": { "$ref": "common/issue.schema.json" },

github-webhooks/payload-schemas/api.github.com/issues/reopened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reopened"] },
8 "issue": {

github-webhooks/payload-schemas/api.github.com/issues/transferred.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["transferred"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/issues/unlabeled.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unlabeled"] },
8 "issue": { "$ref": "common/issue.schema.json" },

github-webhooks/payload-schemas/api.github.com/issues/unlocked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unlocked"] },
8 "issue": {

github-webhooks/payload-schemas/api.github.com/issues/unpinned.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unpinned"] },
8 "issue": { "$ref": "common/issue.schema.json" },

github-webhooks/payload-schemas/api.github.com/label/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "label": {

github-webhooks/payload-schemas/api.github.com/label/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "label": {

github-webhooks/payload-schemas/api.github.com/label/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "label": {

github-webhooks/payload-schemas/api.github.com/marketplace_purchase/cancelled.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["cancelled"] },
8 "effective_date": { "type": "string", "format": "date-time" },

github-webhooks/payload-schemas/api.github.com/marketplace_purchase/changed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["changed"] },
8 "effective_date": { "type": "string", "format": "date-time" },

github-webhooks/payload-schemas/api.github.com/marketplace_purchase/pending_change_cancelled.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["pending_change_cancelled"] },
8 "effective_date": { "type": "string", "format": "date-time" },

github-webhooks/payload-schemas/api.github.com/marketplace_purchase/pending_change.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["pending_change"] },
8 "effective_date": { "type": "string", "format": "date-time" },

github-webhooks/payload-schemas/api.github.com/marketplace_purchase/purchased.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["purchased"] },
8 "effective_date": { "type": "string", "format": "date-time" },

github-webhooks/payload-schemas/api.github.com/member/added.schema.json:
7 "properties": {
8: "action": { "type": "string", "enum": ["added"] },
9 "changes": {

github-webhooks/payload-schemas/api.github.com/member/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "member": {

github-webhooks/payload-schemas/api.github.com/member/removed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["removed"] },
8 "member": {

github-webhooks/payload-schemas/api.github.com/membership/added.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["added"] },
8 "scope": {

github-webhooks/payload-schemas/api.github.com/membership/removed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["removed"] },
8 "scope": {

github-webhooks/payload-schemas/api.github.com/merge_group/checks_requested.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["checks_requested"] },
8 "merge_group": {

github-webhooks/payload-schemas/api.github.com/merge_group/destroyed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["destroyed"] },
8 "merge_group": {

github-webhooks/payload-schemas/api.github.com/meta/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "hook_id": {

github-webhooks/payload-schemas/api.github.com/milestone/closed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["closed"] },
8 "milestone": {

github-webhooks/payload-schemas/api.github.com/milestone/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "milestone": {

github-webhooks/payload-schemas/api.github.com/milestone/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "milestone": { "$ref": "common/milestone.schema.json" },

github-webhooks/payload-schemas/api.github.com/milestone/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/milestone/opened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["opened"] },
8 "milestone": {

github-webhooks/payload-schemas/api.github.com/org_block/blocked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["blocked"] },
8 "blocked_user": {

github-webhooks/payload-schemas/api.github.com/org_block/unblocked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unblocked"] },
8 "blocked_user": {

github-webhooks/payload-schemas/api.github.com/organization/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "membership": { "$ref": "common/membership.schema.json" },

github-webhooks/payload-schemas/api.github.com/organization/member_added.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["member_added"] },
8 "membership": { "$ref": "common/membership.schema.json" },

github-webhooks/payload-schemas/api.github.com/organization/member_invited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["member_invited"] },
8 "invitation": {

github-webhooks/payload-schemas/api.github.com/organization/member_removed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["member_removed"] },
8 "membership": { "$ref": "common/membership.schema.json" },

github-webhooks/payload-schemas/api.github.com/organization/renamed.schema.json:
19 },
20: "action": { "type": "string", "enum": ["renamed"] },
21 "sender": { "$ref": "common/user.schema.json" },

github-webhooks/payload-schemas/api.github.com/package/published.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["published"] },
8 "package": {

github-webhooks/payload-schemas/api.github.com/package/updated.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["updated"] },
8 "package": {

github-webhooks/payload-schemas/api.github.com/project/closed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["closed"] },
8 "project": { "$ref": "common/project.schema.json" },

github-webhooks/payload-schemas/api.github.com/project/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "project": { "$ref": "common/project.schema.json" },

github-webhooks/payload-schemas/api.github.com/project/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "project": { "$ref": "common/project.schema.json" },

github-webhooks/payload-schemas/api.github.com/project/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/project/reopened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reopened"] },
8 "project": { "$ref": "common/project.schema.json" },

github-webhooks/payload-schemas/api.github.com/project_card/converted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["converted"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/project_card/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "project_card": { "$ref": "common/project-card.schema.json" },

github-webhooks/payload-schemas/api.github.com/project_card/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "project_card": { "$ref": "common/project-card.schema.json" },

github-webhooks/payload-schemas/api.github.com/project_card/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/project_card/moved.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["moved"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/project_column/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "project_column": { "$ref": "common/project-column.schema.json" },

github-webhooks/payload-schemas/api.github.com/project_column/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "project_column": { "$ref": "common/project-column.schema.json" },

github-webhooks/payload-schemas/api.github.com/project_column/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/project_column/moved.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["moved"] },
8 "project_column": { "$ref": "common/project-column.schema.json" },

github-webhooks/payload-schemas/api.github.com/projects_v2_item/archived.schema.json:
22 },
23: "action": { "type": "string", "enum": ["archived"] },
24 "projects_v2_item": {

github-webhooks/payload-schemas/api.github.com/projects_v2_item/converted.schema.json:
22 },
23: "action": { "type": "string", "enum": ["converted"] },
24 "projects_v2_item": {

github-webhooks/payload-schemas/api.github.com/projects_v2_item/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "projects_v2_item": {

github-webhooks/payload-schemas/api.github.com/projects_v2_item/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "projects_v2_item": { "$ref": "common/projects_v2_item.schema.json" },

github-webhooks/payload-schemas/api.github.com/projects_v2_item/edited.schema.json:
25 },
26: "action": { "type": "string", "enum": ["edited"] },
27 "projects_v2_item": { "$ref": "common/projects_v2_item.schema.json" },

github-webhooks/payload-schemas/api.github.com/projects_v2_item/reordered.schema.json:
22 },
23: "action": { "type": "string", "enum": ["reordered"] },
24 "projects_v2_item": { "$ref": "common/projects_v2_item.schema.json" },

github-webhooks/payload-schemas/api.github.com/projects_v2_item/restored.schema.json:
22 },
23: "action": { "type": "string", "enum": ["restored"] },
24 "projects_v2_item": {

github-webhooks/payload-schemas/api.github.com/pull_request/assigned.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["assigned"] },
15 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/auto_merge_disabled.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["auto_merge_disabled"] },
15 "number": { "type": "integer" },

github-webhooks/payload-schemas/api.github.com/pull_request/auto_merge_enabled.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["auto_merge_enabled"] },
15 "number": { "type": "integer" },

github-webhooks/payload-schemas/api.github.com/pull_request/closed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["closed"] },
8 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/converted_to_draft.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["converted_to_draft"] },
8 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/demilestoned.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["demilestoned"] },
15 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/dequeued.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["dequeued"] },
15 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/edited.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["edited"] },
15 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/enqueued.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["enqueued"] },
8 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/labeled.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["labeled"] },
15 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/locked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["locked"] },
8 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/milestoned.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["milestoned"] },
15 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/opened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["opened"] },
8 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/ready_for_review.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["ready_for_review"] },
8 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/reopened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reopened"] },
8 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/review_request_removed.schema.json:
15 "properties": {
16: "action": { "type": "string", "enum": ["review_request_removed"] },
17 "number": {

40 "properties": {
41: "action": { "type": "string", "enum": ["review_request_removed"] },
42 "number": {

github-webhooks/payload-schemas/api.github.com/pull_request/review_requested.schema.json:
15 "properties": {
16: "action": { "type": "string", "enum": ["review_requested"] },
17 "number": {

40 "properties": {
41: "action": { "type": "string", "enum": ["review_requested"] },
42 "number": {

github-webhooks/payload-schemas/api.github.com/pull_request/synchronize.schema.json:
14 "properties": {
15: "action": { "type": "string", "enum": ["synchronize"] },
16 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/unassigned.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["unassigned"] },
15 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/unlabeled.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["unlabeled"] },
15 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request/unlocked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unlocked"] },
8 "number": { "type": "integer", "description": "The pull request number." },

github-webhooks/payload-schemas/api.github.com/pull_request_review/dismissed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["dismissed"] },
8 "review": {

github-webhooks/payload-schemas/api.github.com/pull_request_review/edited.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["edited"] },
15 "changes": {

github-webhooks/payload-schemas/api.github.com/pull_request_review/submitted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["submitted"] },
8 "review": { "$ref": "common/pull-request-review.schema.json" },

github-webhooks/payload-schemas/api.github.com/pull_request_review_comment/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "comment": { "$ref": "common/pull-request-review-comment.schema.json" },

github-webhooks/payload-schemas/api.github.com/pull_request_review_comment/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "comment": { "$ref": "common/pull-request-review-comment.schema.json" },

github-webhooks/payload-schemas/api.github.com/pull_request_review_comment/edited.schema.json:
13 "properties": {
14: "action": { "type": "string", "enum": ["edited"] },
15 "changes": {

github-webhooks/payload-schemas/api.github.com/pull_request_review_thread/resolved.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["resolved"] },
8 "thread": {

github-webhooks/payload-schemas/api.github.com/pull_request_review_thread/unresolved.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unresolved"] },
8 "thread": {

github-webhooks/payload-schemas/api.github.com/registry_package/published.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["published"] },
8 "registry_package": {

github-webhooks/payload-schemas/api.github.com/registry_package/updated.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["updated"] },
8 "registry_package": {

github-webhooks/payload-schemas/api.github.com/release/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "release": { "$ref": "common/release.schema.json" },

github-webhooks/payload-schemas/api.github.com/release/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "release": { "$ref": "common/release.schema.json" },

github-webhooks/payload-schemas/api.github.com/release/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/release/prereleased.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["prereleased"] },
8 "release": {

github-webhooks/payload-schemas/api.github.com/release/published.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["published"] },
8 "release": {

github-webhooks/payload-schemas/api.github.com/release/released.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["released"] },
8 "release": { "$ref": "common/release.schema.json" },

github-webhooks/payload-schemas/api.github.com/release/unpublished.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unpublished"] },
8 "release": {

github-webhooks/payload-schemas/api.github.com/repository/archived.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["archived"] },
8 "repository": {

github-webhooks/payload-schemas/api.github.com/repository/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "repository": { "$ref": "common/repository.schema.json" },

github-webhooks/payload-schemas/api.github.com/repository/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "repository": { "$ref": "common/repository.schema.json" },

github-webhooks/payload-schemas/api.github.com/repository/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/repository/privatized.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["privatized"] },
8 "repository": {

github-webhooks/payload-schemas/api.github.com/repository/publicized.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["publicized"] },
8 "repository": {

github-webhooks/payload-schemas/api.github.com/repository/renamed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["renamed"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/repository/transferred.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["transferred"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/repository/unarchived.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["unarchived"] },
8 "repository": {

github-webhooks/payload-schemas/api.github.com/repository_vulnerability_alert/create.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["create"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/repository_vulnerability_alert/dismiss.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["dismiss"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/repository_vulnerability_alert/reopen.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reopen"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/repository_vulnerability_alert/resolve.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["resolve"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/secret_scanning_alert/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/secret_scanning_alert/reopened.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["reopened"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/secret_scanning_alert/resolved.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["resolved"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/secret_scanning_alert/revoked.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["revoked"] },
8 "alert": {

github-webhooks/payload-schemas/api.github.com/secret_scanning_alert_location/created.schema.json:
7 "properties": {
8: "action": { "type": "string", "enum": ["created"] },
9 "alert": { "$ref": "common/secret-scanning-alert.schema.json" },

github-webhooks/payload-schemas/api.github.com/security_advisory/performed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["performed"] },
8 "security_advisory": {

github-webhooks/payload-schemas/api.github.com/security_advisory/published.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["published"] },
8 "security_advisory": {

github-webhooks/payload-schemas/api.github.com/security_advisory/updated.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["updated"] },
8 "security_advisory": {

github-webhooks/payload-schemas/api.github.com/security_advisory/withdrawn.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["withdrawn"] },
8 "security_advisory": {

github-webhooks/payload-schemas/api.github.com/sponsorship/cancelled.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["cancelled"] },
8 "sponsorship": {

github-webhooks/payload-schemas/api.github.com/sponsorship/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "sponsorship": {

github-webhooks/payload-schemas/api.github.com/sponsorship/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "sponsorship": {

github-webhooks/payload-schemas/api.github.com/sponsorship/pending_cancellation.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["pending_cancellation"] },
8 "sponsorship": {

github-webhooks/payload-schemas/api.github.com/sponsorship/pending_tier_change.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["pending_tier_change"] },
8 "sponsorship": {

github-webhooks/payload-schemas/api.github.com/sponsorship/tier_changed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["tier_changed"] },
8 "sponsorship": {

github-webhooks/payload-schemas/api.github.com/star/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "starred_at": {

github-webhooks/payload-schemas/api.github.com/star/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "starred_at": {

github-webhooks/payload-schemas/api.github.com/team/added_to_repository.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["added_to_repository"] },
8 "team": { "$ref": "common/team.schema.json" },

github-webhooks/payload-schemas/api.github.com/team/created.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["created"] },
8 "team": { "$ref": "common/team.schema.json" },

github-webhooks/payload-schemas/api.github.com/team/deleted.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["deleted"] },
8 "team": { "$ref": "common/team.schema.json" },

github-webhooks/payload-schemas/api.github.com/team/edited.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["edited"] },
8 "changes": {

github-webhooks/payload-schemas/api.github.com/team/removed_from_repository.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["removed_from_repository"] },
8 "team": { "$ref": "common/team.schema.json" },

github-webhooks/payload-schemas/api.github.com/watch/started.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["started"] },
8 "repository": { "$ref": "common/repository.schema.json" },

github-webhooks/payload-schemas/api.github.com/workflow_job/completed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["completed"] },
8 "organization": { "$ref": "common/organization.schema.json" },

github-webhooks/payload-schemas/api.github.com/workflow_job/in_progress.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["in_progress"] },
8 "organization": { "$ref": "common/organization.schema.json" },

github-webhooks/payload-schemas/api.github.com/workflow_job/queued.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["queued"] },
8 "organization": { "$ref": "common/organization.schema.json" },

github-webhooks/payload-schemas/api.github.com/workflow_job/waiting.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["waiting"] },
8 "organization": { "$ref": "common/organization.schema.json" },

github-webhooks/payload-schemas/api.github.com/workflow_run/completed.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["completed"] },
8 "organization": { "$ref": "common/organization.schema.json" },

github-webhooks/payload-schemas/api.github.com/workflow_run/in_progress.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["in_progress"] },
8 "organization": { "$ref": "common/organization.schema.json" },

github-webhooks/payload-schemas/api.github.com/workflow_run/requested.schema.json:
6 "properties": {
7: "action": { "type": "string", "enum": ["requested"] },
8 "organization": { "$ref": "common/organization.schema.json" },
