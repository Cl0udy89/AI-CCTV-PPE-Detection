"""Notification configuration and dispatch (email SMTP + Slack + MS Teams webhook)."""
import os, json, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import urllib.request, urllib.error

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'notifications.json')

_DEFAULT = {
    "email_enabled": False,
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_password": "",
    "smtp_from": "",
    "email_recipients": [],
    "slack_enabled": False,
    "slack_webhook_url": "",
    "teams_enabled": False,
    "teams_webhook_url": "",
    "notify_on_new_incident": True,
    "daily_digest_enabled": False,
    "daily_digest_hour": 8,
}


def load() -> dict:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH) as f:
                cfg = json.load(f)
            # Merge with defaults for new keys
            merged = {**_DEFAULT, **cfg}
            return merged
        except Exception:
            pass
    return dict(_DEFAULT)


def save(config: dict):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=2)


def send_email(subject: str, body: str, cfg: dict = None) -> str:
    if cfg is None:
        cfg = load()
    if not cfg.get('email_enabled') or not cfg.get('smtp_host'):
        return "Email wyłączony lub brak konfiguracji SMTP"
    recipients = cfg.get('email_recipients', [])
    if not recipients:
        return "Brak odbiorców email"
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = cfg['smtp_from'] or cfg['smtp_user']
        msg['To'] = ', '.join(recipients)
        msg.attach(MIMEText(body, 'html', 'utf-8'))
        with smtplib.SMTP(cfg['smtp_host'], cfg['smtp_port'], timeout=10) as server:
            server.ehlo()
            if cfg['smtp_port'] in (587, 465):
                server.starttls()
            if cfg['smtp_user']:
                server.login(cfg['smtp_user'], cfg['smtp_password'])
            server.sendmail(msg['From'], recipients, msg.as_string())
        return "ok"
    except Exception as e:
        return str(e)


def send_slack(text: str, cfg: dict = None) -> str:
    if cfg is None:
        cfg = load()
    if not cfg.get('slack_enabled') or not cfg.get('slack_webhook_url'):
        return "Slack wyłączony lub brak webhook URL"
    payload = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        cfg['slack_webhook_url'],
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode()
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read().decode()}"
    except Exception as e:
        return str(e)


def send_teams(text: str, cfg: dict = None) -> str:
    """Send notification via MS Teams Incoming Webhook."""
    if cfg is None:
        cfg = load()
    if not cfg.get('teams_enabled') or not cfg.get('teams_webhook_url'):
        return "Teams wyłączony lub brak webhook URL"
    payload = json.dumps({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "f97316",
        "summary": text,
        "sections": [{"activityText": text}],
    }).encode()
    req = urllib.request.Request(
        cfg['teams_webhook_url'],
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode() or "ok"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read().decode()}"
    except Exception as e:
        return str(e)


def dispatch_incident_alert(incident_id: int, violations: list, zone_name: str = ""):
    """Called from incident_manager after new incident is created."""
    cfg = load()
    if not cfg.get('notify_on_new_incident'):
        return
    subject = f"[PPE Alert] Naruszenie #{incident_id}: {', '.join(violations)}"
    zone_info = f" w strefie <b>{zone_name}</b>" if zone_name else ""
    body = (
        f"<p>Wykryto nowe naruszenie PPE#{incident_id}{zone_info}.</p>"
        f"<p>Typ: <b>{', '.join(violations)}</b></p>"
        f"<p>Zaloguj się do systemu aby sprawdzić szczegóły.</p>"
    )
    webhook_text = f"⚠️ Naruszenie PPE #{incident_id}: {', '.join(violations)}{(' — ' + zone_name) if zone_name else ''}"
    if cfg.get('email_enabled'):
        send_email(subject, body, cfg)
    if cfg.get('slack_enabled'):
        send_slack(webhook_text, cfg)
    if cfg.get('teams_enabled'):
        send_teams(webhook_text, cfg)
