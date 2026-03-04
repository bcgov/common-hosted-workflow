## Microsoft Teams Transformation: Rocket.Chat

This transformation logic maps incoming **Rocket.Chat** message structures to **Microsoft Teams** compatible HTML payloads. It replicates the classic "attachment" aesthetic (colored sidebar, structured fields, and linked titles) within the Teams chat interface.

### Data Flow Overview

### Transformation Logic Details

The transformer takes a standard Rocket.Chat JSON payload and converts it into an `html` content body.

- **Primary Text:** The top-level `text` field is rendered as a standard paragraph.
- **Color Coding:** Uses the `color` hex value from each attachment to create a `4px` left-border accent. Defaults to grey (`#ccc`) if not provided.
- **Titles:** Renders as an `<h3>` header. If `title_link` is present, it wraps the header in a hyperlink.
- **Fields:** Converts the `fields` array into a bulletless `<ul>` list with bolded labels for high readability.
- **Images:** Supports both `image_url` and `thumb_url`, rendering them with a maximum width of `300px` to maintain layout stability in Teams.

---

### Examples

#### 1. Standard Notification with Fields

**Input Payload:**

```json
{
  "text": "New Deployment Alert",
  "attachments": [
    {
      "title": "Service: Auth-API",
      "text": "Deployment successful to production cluster.",
      "color": "#28a745",
      "fields": [
        { "title": "Version", "value": "v2.4.1", "short": true },
        { "title": "Cluster", "value": "us-east-1", "short": true }
      ]
    }
  ]
}
```

**Visual Output:** A message with a **Green** sidebar and a list of key-value pairs below the description.

#### 2. Visual Alert with Image

**Input Payload:**

```json
{
  "text": "Monitoring Dashboard Snippet",
  "attachments": [
    {
      "title": "CPU Usage Spike",
      "title_link": "https://grafana.internal/d/cpu-metrics",
      "text": "Core-01 exceeded 90% threshold.",
      "color": "#dc3545",
      "image_url": "https://grafana.internal/render/dashboard-screenshot.png"
    }
  ]
}
```

**Visual Output:** A **Red** sidebar alert where the title is a clickable link, followed by the rendered image.

---

### Input Schema (Rocket.Chat)

The expected input is a JSON object with the following structure:

```typescript
{
  "text": "Main message body",
  "attachments": [
    {
      "title": "Attachment Title",
      "title_link": "https://example.com", // Optional
      "text": "Description text",
      "color": "#764FA5", // Optional hex code
      "image_url": "https://link-to-image.png", // Optional
      "fields": [  // Optional
        {
          "title": "Label",
          "value": "Value",
          "short": boolean
        }
      ]
    }
  ]
}

```

### Output Schema (Microsoft Teams)

The node outputs a format compatible with the [Microsoft Graph API for Chat Messages](https://learn.microsoft.com/en-us/graph/api/chatmessage-post):

```json
{
  "body": {
    "contentType": "html",
    "content": "<div><p>Main message body</p><div style=\"border-left: 4px solid #764FA5; ...\">...</div></div>"
  },
  "attachments": []
}
```

### Technical Constraints & Notes

- **HTML Support:** Teams uses a sanitized HTML renderer. This transformer uses inline styles exclusively, as Teams ignores `<style>` blocks and external CSS.
- **Image Rendering:** Images are set to `max-width: 300px`. If images appear too small or large, adjust the `img` tag style in `rocketChatTransform.ts`.
- **Empty Attachments:** If the `attachments` array is empty or undefined, the transformer safely returns only the primary text.
