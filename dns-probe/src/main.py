import json
import logging
import smtplib
import sys
import threading
import urllib.request
from datetime import datetime, timezone
from email.mime.text import MIMEText

import uvicorn
from fastapi import FastAPI

from clients.dns import classify_ip, dns_state, dns_watch
from config import get_config

logging.basicConfig(
    stream=sys.stdout,
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)-5s] %(name)-20s %(message)s",
)
logging.getLogger("uvicorn").setLevel(logging.WARNING)
logging.getLogger("fastapi").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

config = get_config()

app = FastAPI()


def send_alert_email(
    previous_ip: str, current_ip: str, previous_routing: str, current_routing: str
):
    recipients = config["alert_email_recipients"]
    if not recipients:
        logger.warning("No ALERT_EMAIL_RECIPIENTS configured, skipping email")
        return

    app_env = config["app_env"]
    subject = (
        f"[{app_env}] Domain routing change: {previous_routing} -> {current_routing}"
    )
    body = (
        f"Domain:      {config['domain_name']}\n"
        f"Environment: {app_env}\n\n"
        f"Previous IP: {previous_ip or 'none'} ({previous_routing})\n"
        f"Current IP:  {current_ip} ({current_routing})\n\n"
        f"The domain has shifted from {previous_routing} to {current_routing}."
    )

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = config["smtp_sender"]
        msg["To"] = ", ".join(recipients)

        with smtplib.SMTP(config["smtp_host"], config["smtp_port"]) as smtp:
            smtp.sendmail(config["smtp_sender"], recipients, msg.as_string())

        logger.info("Alert email sent to %s", recipients)
    except Exception:
        logger.exception("Failed to send alert email")


def send_alert_webhook(
    previous_ip: str, current_ip: str, previous_routing: str, current_routing: str
):
    url = config["alert_webhook_url"]
    if not url:
        return

    payload = {
        "event": "dns_routing_change",
        "domain": config["domain_name"],
        "environment": config["app_env"],
        "previous_ip": previous_ip or None,
        "previous_routing": previous_routing,
        "current_ip": current_ip,
        "current_routing": current_routing,
        "detected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    try:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            logger.info("Alert webhook sent (HTTP %s)", response.status)
    except Exception:
        logger.exception("Failed to send alert webhook")


def on_ip_change(
    previous_ip: str,
    current_ip: str,
    previous_routing: str,
    current_routing: str,
    is_first: bool,
):
    logger.info(
        "DNS change detected: %s (%s) -> %s (%s)",
        previous_ip,
        previous_routing,
        current_ip,
        current_routing,
    )

    if is_first and not config["alert_on_startup"]:
        logger.info(
            "Skipping alert on first resolution (set ALERT_ON_STARTUP=true to override)"
        )
        return

    send_alert_email(previous_ip, current_ip, previous_routing, current_routing)
    send_alert_webhook(previous_ip, current_ip, previous_routing, current_routing)


@app.get("/health")
def check_health():
    return {"status": "healthy"}


@app.get("/status")
def get_status():
    resolved_ip = dns_state.current_ip
    routing = (
        classify_ip(resolved_ip, config["primary_ips"], config["secondary_ips"])
        if resolved_ip not in ("unknown", "error")
        else "unknown"
    )

    return {
        "current_routing": routing,
        "resolved_ip": resolved_ip,
        "duration_seconds": dns_state.duration_seconds,
    }


if __name__ == "__main__":
    domain_name = config["domain_name"]
    if not domain_name:
        logger.error("DOMAIN_NAME environment variable is required")
        sys.exit(1)

    watcher = threading.Thread(
        target=dns_watch,
        args=(
            domain_name,
            config["primary_ips"],
            config["secondary_ips"],
            on_ip_change,
            config["poll_interval"],
        ),
        daemon=True,
        name="dns-watcher",
    )
    watcher.start()
    logger.info("DNS watcher started for domain: %s", domain_name)

    uvicorn.run(app, host=config["host"], port=8000, log_level="warning")
