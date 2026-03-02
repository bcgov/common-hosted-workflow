## Microsoft Teams Transformation: Backup Container

This transformation logic maps incoming logs from the **Backup Container** script to **Microsoft Teams** compatible HTML payloads. It is specifically designed to handle lifecycle events (INFO), non-critical alerts (WARN), and job failures (ERROR) with distinct visual cues.

### Data Flow Overview

### Transformation Logic Details

The transformer converts a specific backup payload into a sanitized HTML block optimized for the Teams desktop and mobile clients.

- **Status Mapping:** The logic uses a lookup table to assign colors and icons based on the `statusCode` string:
- **INFO:** Blue (`#007bff`) with an info icon (ℹ️).
- **WARN:** Amber (`#ffc107`) with a warning icon (⚠️).
- **ERROR:** Red (`#dc3545`) with a siren icon (🚨).

- **Project Identification:** Displays the `projectFriendlyName` prominently, while appending the technical `projectName` (ID) in a smaller, muted font.
- **Visual Sidebar:** Implements a `5px` left-border accent using the status-specific color for rapid scanning.
- **Log Formatting:** The `message` field is rendered inside a monospaced block with `white-space: pre-wrap` to preserve log indentation.

---

### Examples

#### 1. Success Notification (INFO)

**Input Payload:**

```json
{
  "projectFriendlyName": "Static Assets S3",
  "projectName": "assets-prod-sync",
  "statusCode": "INFO",
  "message": "Sync completed successfully. 142 files updated."
}
```

**Visual Output:** A **Blue** bordered message with a ℹ️ icon.

#### 2. Partial Success / Warning (WARN)

**Input Payload:**

```json
{
  "projectFriendlyName": "Legacy API Database",
  "projectName": "db-legacy-backup",
  "statusCode": "WARN",
  "message": "Backup finished with warnings: skipped 2 locked temporary tables."
}
```

**Visual Output:** An **Amber** bordered message with a ⚠️ icon.

#### 3. Critical Failure (ERROR)

**Input Payload:**

```json
{
  "projectFriendlyName": "Main PostgreSQL DB",
  "projectName": "pg-cluster-01",
  "statusCode": "ERROR",
  "message": "[!!ERROR!!] - pg_dump: error: connection to server on socket \"/var/run/postgresql/.s.PGSQL.5432\" failed."
}
```

**Visual Output:** A **Red** bordered message with a 🚨 icon.

---

### Input Schema (Backup Container)

```typescript
{
  "projectFriendlyName": string,
  "projectName": string,
  "statusCode": "INFO" | "WARN" | "ERROR",
  "message": string
}

```

### Output Schema (Microsoft Teams)

```json
{
  "body": {
    "contentType": "html",
    "content": "<div style=\"border-left: 5px solid ...\">...</div>"
  },
  "attachments": []
}
```

---

### Technical Constraints & Notes

- **Case Resilience:** The `statusCode` is normalized to uppercase.
- **No Environment Key:** This implementation intentionally omits an "Environment" field as requested; all identifying data is contained within the Project fields.
- **CSS Sanitization:** Teams strips complex CSS; all styling is applied via inline `style` attributes to ensure consistent rendering across the Teams Desktop, Web, and Mobile apps.
