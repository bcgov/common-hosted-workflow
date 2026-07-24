---
title: Internal Service Agreement
sidebar_label: Service Agreement
sidebar_position: 2
---

# Internal Service Agreement

> **Document classification:** Internal — Restricted
> **Hosting tier:** BC Gov Private Cloud — **Gold** (Kamloops) + **Gold DR** (Calgary)
> **Workload scope:** The Common Hosted Workflow (n8n) platform service offered to tenant project teams.
> **Security classification limit:** Approved for information up to and including **Protected B**.
> **Authority & mandate:** Issued under the BC Gov Private Cloud PaaS terms and aligned with OCIO information-management directives.

---

## 1. Participating Parties

| Role                   | Party                                                                                       | Responsibilities                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Provider**           | Common Hosted Workflow Platform Team (CITZ)                                                 | Operates the workflow engine, its database, and the Gold↔GoldDR failover pipeline.                            |
| **Internal Client**    | Tenant Project Teams consuming the workflow service                                         | Build and own workflow definitions, credentials, and tenant-level integration configuration.                  |
| **Upstream Providers** | Platform Services (SSO/Login Proxy, API Gateway, CSTAR), Object Storage, Email/SMS gateways | Authentication, API routing, role/tenant resolution, backups, and notifications used by the workflow service. |

This ISA covers **only** the Common Hosted Workflow service. Dependencies such as SSO, the API Gateway, CHEFS, BC Notify, and tenant-owned applications are governed by their own ISAs and are **dependencies**, not commitments, of this service.

### 1.1 Tenant and n8n project model

In this service, a **tenant** is implemented as an **n8n project**.

- Tenant users are synchronized into the platform as **n8n project users**.
- Workflows, credentials, and other project-owned resources are logically isolated by that project boundary.
- Access to those resources is controlled through project membership and role assignment, so users see and manage only the resources that belong to their project.
- Execution visibility follows the same project boundary, helping keep one project's operational data separate from another's within the shared platform.

This is **logical isolation within a shared platform**, not dedicated single-tenant infrastructure per project.

---

## 2. Hosting Tier & Cluster Scope

This service runs on the **Gold hosting tier**, which consists of two OpenShift clusters:

- **Gold cluster** — Kamloops government data center (primary, active).
- **Gold DR cluster** — Calgary data center (disaster recovery, warm standby).

The Gold tier is recommended for business-mission-critical government services that require geographic failover. It is accredited up to **Protected B**.

### 2.1 Underlying platform availability (owned by the Platform Services team)

The Gold cluster itself is guaranteed by the Platform Services infrastructure team at **99.5% availability** (annual basis, no total outage exceeding 22 minutes per 30 continuous days, including scheduled maintenance but excluding data-centre operational disruptions). This is the baseline availability of the primary Gold cluster. Higher service availability applies only to workflow types that can safely continue through Gold-tier geographic failover.

Configuring applications for geographic failover is a **requirement** of the Gold tier. The Common Hosted Workflow service satisfies that requirement by maintaining a live (warm) instance in the Calgary Gold DR cluster.

---

## 3. Service Availability Summary

The Common Hosted Workflow service provides **two distinct uptime tiers** depending on how a tenant's workflow is built. Tenants should map their workflows to the correct tier when planning their own commitments downstream.

| Workflow profile                                                                                             | Effective availability            | Reason                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workflows that are both non-trigger-based and do not integrate with the Workflow Interaction Layer (WIL)** | **99.95%**                        | These workflows can continue to be served from either Gold or GoldDR safely through Gold-tier geographic routing, with the understanding that any execution history created on DR is temporary and is not carried back to Gold. |
| **All other workflows** (trigger-based, or any workflow that integrates with WIL)                            | **99.5%** (Gold cluster baseline) | Because of the DR→Gold data-syncing constraint described in §5, these features are placed in read-only / maintenance mode during a failover, so the additional DR uplift does not apply to them.                                |

The 99.95% figure reflects the Gold-tier "multi-node deployment with geographic failover to the Calgary data centre" availability, which the workflow service can earn **only** for workflows that remain safe to run during a DR event.

---

## 4. Behaviour During a Failover

When the Gold cluster becomes unavailable, GSLB automatically routes traffic to the available site, and the always-running Gold DR instance continues supporting the workflows that are safe to run there. The following service posture applies on the DR cluster:

| Service element                                                                   | State during failover                  | Notes                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **n8n instances (UI, API, workers)**                                              | **Running**                            | The DR instance is already running, so eligible workflows do not require manual application startup or an operator-driven traffic switch. Tenants can log in, view workflows, and inspect execution history.                              |
| **Trigger nodes** (schedule, message-broker, IMAP, RSS, database listeners, etc.) | **Read-only / maintenance (disabled)** | Disabled on DR to prevent the same workflow from executing in both clusters, which would cause double-firing and data divergence.                                                                                                         |
| **Workflow Interaction Layer (WIL) and custom integrations**                      | **Read-only / maintenance**            | External write paths into the workflow service are suspended during failover to avoid data inconsistency between Gold and DR.                                                                                                             |
| **Non-trigger, non-WIL workflows**                                                | **Available**                          | These workflows continue to serve traffic from DR and earn the 99.95% availability profile. However, execution history and related data created on DR during the failover are not carried back to Gold once Gold becomes available again. |

> **In plain terms:** during a failover, the DR cluster is "open for viewing and safe workflows, closed for everything that automatically starts things or pushes data in."

---

## 5. The DR→Gold Data-Syncing Constraint

This is the **most important operational constraint** of the service, and it is the reason two availability tiers exist.

- **Gold is the single source of truth.** All workflow definitions, credential changes, and execution history are authored on Gold. Between normal operations, the DR cluster is periodically refreshed from Gold's most recent backup.
- **During a failover**, the DR cluster becomes the live one. Any data created on DR during the failover window — for example, execution history for workflows that ran, or credentials edited by a tenant — is **provisional**.
- **On return-to-Gold (failback), the DR cluster's data is overwritten** by the restored Gold primary. Data that exists _only_ on DR is **discarded** and is not carried back to Gold.

This one-way data flow is what makes trigger nodes and WIL unsafe to run on DR:

- If a trigger fired on DR during failover and created execution records, those records would vanish at failback — yet the external system the trigger acted on (an email sent, a DB row written, an API called) would **not** be rolled back. That divergence between "what the workflow did in the world" and "what our records say it did" is unacceptable for a government service.
- The same applies to WIL and custom integrations that accept inbound writes: any state captured on DR is disposable.

**Client implication:** Tenants must edit workflows and credentials **on Gold only**, and must not assume data created on DR during a failover will persist. Tenants building workflows that depend on trigger nodes or WIL integration should plan for the **99.5%** availability tier, not the 99.95% tier.

When Gold becomes available again, GSLB can automatically return traffic to Gold. Execution history and related data created on DR during the outage are not carried back to Gold.

### 5.1 Execution data redaction and PII minimization

The service uses the **n8n Enterprise execution-data redaction** feature to reduce routine exposure of sensitive workflow data in execution history.

- When redaction is enabled, workflow execution metadata such as status, timing, and node names remains visible for support and monitoring.
- The execution payload itself is redacted in normal viewing, which helps reduce exposure of personal or otherwise sensitive information to users who do not need to see the underlying data.
- This supports least-privilege access and helps project teams operate within PII-minimization expectations.

This control should be understood as a **visibility safeguard**, not as a substitute for careful workflow design and data classification. Project teams remain responsible for ensuring that workflows handle personal information appropriately.

---

## 6. Business Continuity Objectives

| Objective                                | Target                                                                     | Basis                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gold Cluster Availability (baseline)** | 99.5% annual, ≤ 22 min total outage per 30 days                            | Guaranteed by the Platform Services infrastructure team.                                                                                                                                                        |
| **DR Cluster Readiness**                 | Continuous — n8n pods always running in Calgary                            | Warm standby; GSLB automatically routes traffic to the available site.                                                                                                                                          |
| **Recovery Time Objective (RTO)**        | No manual application failover required for non-trigger, non-WIL workflows | The DR instance is already running and GSLB automatically routes traffic to the available site when Gold is unavailable. Investigation, communications, and follow-up remain business-hours support activities. |
| **Failover RPO (Gold → DR)**             | ≤ 15 minutes of workflow-data loss at failover                             | Set by the periodic backup cadence from Gold.                                                                                                                                                                   |
| **Failback data handling (DR → Gold)**   | **DR-only data is overwritten**                                            | On return-to-Gold, the Gold primary is authoritative. Any DR-side writes are discarded and are not carried back to Gold.                                                                                        |

> ⚠️ The **RPO asymmetry** (forward-only replication) is intentional and is the core operational design choice of this service. Gold is the system of record; GoldDR is disposable.

---

## 7. Shared Responsibility

| Platform Team Responsibility                                                                                        | Tenant Project Team Responsibility                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Operate the workflow engine, its database, Redis cache, and the backup/failover pipeline on Gold and GoldDR.        | Build and own workflow definitions, credentials, and tenant-specific configuration.                      |
| Maintain the warm DR instance and support GSLB-based service continuity, incident response, and recovery follow-up. | Support continuity validation and confirm their workflows recover correctly on DR.                       |
| Disable trigger nodes and WIL on DR to prevent data divergence.                                                     | Design workflows to be aware that trigger-based and WIL-integrated workflows are paused during failover. |
| Apply cluster upgrades, patches, and maintenance per the Gold-tier schedule.                                        | Plan downstream commitments using the correct availability tier (§3) for each workflow.                  |
| Provide telemetry & incident communications during a failover.                                                      | Consume status updates and refrain from editing workflows on DR during a failover.                       |

---

## 8. Support Availability

Support for the Common Hosted Workflow service is provided during **business hours only**:

- **Coverage window:** Monday to Friday, **9:00 AM to 5:00 PM Pacific Time**.
- **Exclusions:** Weekends, statutory holidays, and outside-business-hours periods are not covered by this support commitment.
- **Support model:** This service does **not** provide 24x7 operational support or an after-hours incident-response commitment.

All support response targets in this document apply **within the business-hours window above**. Issues reported outside that window are treated as received at the start of the **next business day**.

For clarity, this section describes **support-team availability**, not platform uptime. The service may continue to run outside business hours, but incident acknowledgement, investigation, and recovery follow-up activities are only committed during business hours.

---

## 9. Incident Severity Matrix

| Severity          | Definition                                                                                                                                                                     | Target response                    | Escalation                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| **P1 — Critical** | Both Gold and GoldDR clusters inaccessible, or a total outage of the workflow service affecting all tenants.                                                                   | ≤ 15 minutes during business hours | Major Incident Bridge; Platform Director + service support leads engaged. |
| **P2 — High**     | Gold cluster down, with service continuing from GoldDR for eligible workflows. Platform running **without redundancy**; trigger-based and WIL-integrated workflows are paused. | ≤ 1 hour during business hours     | Service support team + all impacted project leads notified.               |
| **P3 — Medium**   | A single project is experiencing a service issue, but the broader platform remains healthy.                                                                                    | ≤ 4 business hours                 | Project lead + platform support ticket.                                   |
| **P4 — Low**      | Non-urgent issues such as routine maintenance, minor service concerns, or documentation updates.                                                                               | ≤ 1 business day                   | Standard ticket queue.                                                    |

---

## 10. "Penalties" & Remedies (Government Substitute)

Internal government ISAs cannot levy financial service credits. The equivalent enforcement mechanism on this service is **governance accountability**:

- **Mishap attribution (tenant-caused):** If an incident is caused by a tenant violating service boundaries — for example, editing workflows on DR during a failover, or building a workflow that depends on a trigger type known to be disabled on DR — the Platform Team's SLA targets do not apply to that incident. The tenant's steering-committee representative is named in the incident retrospective.
- **Mishap attribution (platform-caused):** If an incident is caused by Platform Team error (misconfiguration, failed backup, failed restore), the Platform Team owns the corrective action plan and incident follow-up.

---

## Appendix A — Glossary

- **Gold cluster** — Primary OpenShift cluster, Kamloops government data center. Active; receives all production traffic under normal operation.
- **Gold DR cluster** — Disaster-recovery OpenShift cluster, Calgary data center. Warm standby; kept running so it can continue supporting eligible workflows when Gold is unavailable.
- **Tenant / n8n project** — In this service, a tenant is implemented as an n8n project. Tenant users are synchronized as project users, and workflows, credentials, and execution visibility are scoped to that project boundary.
- **GSLB** — Global Server Load Balancer. The DNS-level mechanism that automatically routes traffic to whichever site is available.
- **Trigger node** — A type of workflow starting point that fires automatically based on external events: schedules, message-broker messages, emails, RSS feeds, database changes, etc. These are **disabled on DR**.
- **WIL (Workflow Interaction Layer)** — The custom integration layer that allows external systems to push data into or invoke workflows. Placed in **read-only / maintenance** on DR during failover.
- **Failover** — The service transition from Gold to GoldDR when Gold is unavailable. For non-trigger, non-WIL workflows, the DR instance is already running and GSLB automatically routes traffic to the available site.
- **Failback** — The return of traffic to Gold when Gold becomes available again. This traffic return is automatic through GSLB, but DR-only data is still **overwritten** and is not carried back to Gold.
- **RTO / RPO** — Recovery Time Objective / Recovery Point Objective (see §6).
