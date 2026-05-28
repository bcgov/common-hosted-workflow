import socket
import asyncio
import logging
import datetime
import threading
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class DnsState:
    def __init__(self):
        self._lock = threading.Lock()
        self.resolved_ip: str = 'unknown'
        self.last_changed_at: Optional[datetime.datetime] = None
        self.is_first_resolution: bool = True

    def update(self, ip: str) -> tuple[str, bool]:
        """Update state with newly resolved IP. Returns (previous_ip, is_first)."""
        with self._lock:
            previous_ip = self.resolved_ip
            is_first = self.is_first_resolution
            self.resolved_ip = ip
            self.last_changed_at = datetime.datetime.utcnow()
            self.is_first_resolution = False
            return previous_ip, is_first

    @property
    def duration_seconds(self) -> int:
        with self._lock:
            if self.last_changed_at is None:
                return 0
            return int((datetime.datetime.utcnow() - self.last_changed_at).total_seconds())

    @property
    def current_ip(self) -> str:
        with self._lock:
            return self.resolved_ip


dns_state = DnsState()


def classify_ip(ip: str, primary_ips: list, secondary_ips: list) -> str:
    if ip in primary_ips:
        return 'primary'
    if ip in secondary_ips:
        return 'secondary'
    return 'unknown'


def dns_watch(domain_name: str, primary_ips: list, secondary_ips: list, on_change: Callable, poll_interval: int = 5):
    new_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(new_loop)
    new_loop.run_until_complete(
        dns_lookup(domain_name, primary_ips, secondary_ips, on_change, poll_interval)
    )


async def dns_lookup(domain_name: str, primary_ips: list, secondary_ips: list, on_change: Callable, poll_interval: int = 5):
    logger.info("DNS Inspection %s" % domain_name)
    last_result = None

    while True:
        result = 'error'
        try:
            lookup = socket.getaddrinfo(domain_name, 0)
            logger.debug("DNS %s", lookup)
            if len(lookup) > 0:
                ip = lookup[0][4][0]
                logger.debug("IP => %s" % ip)
                result = ip
        except socket.gaierror:
            logger.error("No DNS response for %s" % domain_name)
            result = 'error'

        if last_result != result:
            last_result = result
            previous_ip, is_first = dns_state.update(result)

            previous_routing = classify_ip(previous_ip, primary_ips, secondary_ips) if previous_ip and previous_ip not in ('unknown', 'error') else 'unknown'
            current_routing = classify_ip(result, primary_ips, secondary_ips) if result != 'error' else 'unknown'

            on_change(
                previous_ip=previous_ip,
                current_ip=result,
                previous_routing=previous_routing,
                current_routing=current_routing,
                is_first=is_first,
            )

        await asyncio.sleep(poll_interval)
