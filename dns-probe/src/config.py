import os


def get_config():
    return {
        'app_env': os.environ.get('APP_ENV', 'development'),
        'domain_name': os.environ.get('DOMAIN_NAME', ''),
        'primary_ips': [ip.strip() for ip in os.environ.get('PRIMARY_IPS', '').split(',') if ip.strip()],
        'secondary_ips': [ip.strip() for ip in os.environ.get('SECONDARY_IPS', '').split(',') if ip.strip()],
        'alert_email_recipients': [e.strip() for e in os.environ.get('ALERT_EMAIL_RECIPIENTS', '').split(',') if e.strip()],
        'smtp_host': os.environ.get('SMTP_HOST', 'apps.smtp.gov.bc.ca'),
        'smtp_port': int(os.environ.get('SMTP_PORT', '25')),
        'smtp_sender': os.environ.get('SMTP_SENDER', 'DoNotReplyCITZ@gov.bc.ca'),
        'poll_interval': int(os.environ.get('POLL_INTERVAL', '5')),
        'alert_on_startup': os.environ.get('ALERT_ON_STARTUP', 'false').lower() == 'true',
    }
