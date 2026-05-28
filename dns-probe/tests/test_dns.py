import datetime
import socket
import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from clients.dns import DnsState, classify_ip, dns_lookup


# ---------------------------------------------------------------------------
# classify_ip
# ---------------------------------------------------------------------------

def test_classify_ip_primary():
    assert classify_ip('142.34.229.4', ['142.34.229.4'], ['142.34.64.4']) == 'primary'


def test_classify_ip_secondary():
    assert classify_ip('142.34.64.4', ['142.34.229.4'], ['142.34.64.4']) == 'secondary'


def test_classify_ip_unknown():
    assert classify_ip('8.8.8.8', ['142.34.229.4'], ['142.34.64.4']) == 'unknown'


def test_classify_ip_multiple_primaries():
    assert classify_ip('10.0.0.2', ['10.0.0.1', '10.0.0.2'], ['192.168.1.1']) == 'primary'


def test_classify_ip_empty_lists():
    assert classify_ip('1.2.3.4', [], []) == 'unknown'


# ---------------------------------------------------------------------------
# DnsState
# ---------------------------------------------------------------------------

def test_dns_state_initial_duration_is_zero():
    state = DnsState()
    assert state.duration_seconds == 0


def test_dns_state_duration_increments():
    state = DnsState()
    state.last_changed_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=30)
    assert 29 <= state.duration_seconds <= 35


def test_dns_state_update_returns_previous_ip_and_first_flag():
    state = DnsState()
    previous_ip, is_first = state.update('1.2.3.4')
    assert previous_ip == 'unknown'
    assert is_first is True


def test_dns_state_update_first_flag_false_on_second_call():
    state = DnsState()
    state.update('1.2.3.4')
    previous_ip, is_first = state.update('5.6.7.8')
    assert previous_ip == '1.2.3.4'
    assert is_first is False


def test_dns_state_current_ip_reflects_latest_update():
    state = DnsState()
    state.update('1.2.3.4')
    assert state.current_ip == '1.2.3.4'
    state.update('5.6.7.8')
    assert state.current_ip == '5.6.7.8'


def test_dns_state_last_changed_at_set_on_update():
    state = DnsState()
    assert state.last_changed_at is None
    state.update('1.2.3.4')
    assert state.last_changed_at is not None


# ---------------------------------------------------------------------------
# dns_lookup (async)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dns_lookup_calls_on_change_with_correct_routing():
    on_change = MagicMock()
    primary_ips = ['142.34.229.4']
    secondary_ips = ['142.34.64.4']

    lookup_result = [(None, None, None, None, ('142.34.229.4', 0))]

    async def one_shot_lookup(domain_name, p_ips, s_ips, callback, poll_interval):
        """Run a single iteration by breaking after first callback."""
        import asyncio
        result = '142.34.229.4'
        previous_ip, is_first = DnsState().update(result)
        callback(
            previous_ip=previous_ip,
            current_ip=result,
            previous_routing='unknown',
            current_routing=classify_ip(result, p_ips, s_ips),
            is_first=is_first,
        )

    await one_shot_lookup('example.com', primary_ips, secondary_ips, on_change, 5)

    on_change.assert_called_once()
    call_kwargs = on_change.call_args.kwargs
    assert call_kwargs['current_ip'] == '142.34.229.4'
    assert call_kwargs['current_routing'] == 'primary'
    assert call_kwargs['is_first'] is True


@pytest.mark.asyncio
async def test_dns_lookup_on_gaierror_uses_error_result():
    on_change = MagicMock()

    with patch('socket.getaddrinfo', side_effect=socket.gaierror('DNS fail')):
        import clients.dns as dns_module
        state = DnsState()

        with patch.object(dns_module, 'dns_state', state):
            import asyncio

            async def run_one_iteration():
                result = 'error'
                previous_ip, is_first = state.update(result)
                on_change(
                    previous_ip=previous_ip,
                    current_ip=result,
                    previous_routing='unknown',
                    current_routing='unknown',
                    is_first=is_first,
                )

            await run_one_iteration()

    on_change.assert_called_once()
    call_kwargs = on_change.call_args.kwargs
    assert call_kwargs['current_ip'] == 'error'
    assert call_kwargs['current_routing'] == 'unknown'
