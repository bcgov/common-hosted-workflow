import json
import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import main  # noqa: E402

WEBHOOK_URL = "https://n8n.example.com/webhook/dns-alert"  # NOSONAR

EVENT_ARGS = ("1.2.3.4", "5.6.7.8", "primary", "secondary")


@pytest.fixture
def request_mock():
    with patch("urllib.request.urlopen") as urlopen:
        yield urlopen


def call_webhook(request_mock):
    with patch.dict(main.config, {"alert_webhook_url": WEBHOOK_URL}):
        main.send_alert_webhook(*EVENT_ARGS)
    assert request_mock.call_count == 1
    return request_mock.call_args[0][0]


def test_webhook_skipped_when_url_not_configured(request_mock):
    with patch.dict(main.config, {"alert_webhook_url": ""}):
        main.send_alert_webhook(*EVENT_ARGS)
    assert request_mock.call_count == 0


def test_webhook_posts_json_payload(request_mock):
    request = call_webhook(request_mock)

    assert request.get_method() == "POST"
    assert request.full_url == WEBHOOK_URL
    assert request.headers["Content-type"] == "application/json"

    payload = json.loads(request.data.decode("utf-8"))
    assert payload["event"] == "dns_routing_change"
    assert payload["domain"] == main.config["domain_name"]
    assert payload["environment"] == main.config["app_env"]
    assert payload["previous_ip"] == "1.2.3.4"
    assert payload["previous_routing"] == "primary"
    assert payload["current_ip"] == "5.6.7.8"
    assert payload["current_routing"] == "secondary"
    assert payload["detected_at"]


def test_webhook_error_is_swallowed():
    with patch.dict(main.config, {"alert_webhook_url": WEBHOOK_URL}):
        with patch("urllib.request.urlopen", side_effect=OSError("boom")):
            main.send_alert_webhook(*EVENT_ARGS)  # must not raise


def test_on_ip_change_fires_both_channels():
    with patch.object(main, "send_alert_email") as email, patch.object(
        main, "send_alert_webhook"
    ) as webhook:
        main.on_ip_change("1.2.3.4", "5.6.7.8", "primary", "secondary", False)
    assert email.call_count == 1
    assert webhook.call_count == 1


def test_on_ip_change_skips_channels_on_first_resolution():
    with patch.dict(main.config, {"alert_on_startup": False}), patch.object(
        main, "send_alert_email"
    ) as email, patch.object(main, "send_alert_webhook") as webhook:
        main.on_ip_change("unknown", "5.6.7.8", "unknown", "secondary", True)
    assert email.call_count == 0
    assert webhook.call_count == 0
