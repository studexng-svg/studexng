"""
AI notification system using Groq API (free, no card required).
Generates contextual push messages for students and vendors per campus.
"""
import json
import logging
import requests

logger = logging.getLogger(__name__)

GROQ_MODEL = 'llama-3.3-70b-versatile'
GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

_SYSTEM = (
    'You are a friendly assistant for StudEx, a campus marketplace in Nigeria. '
    'Always respond only with the requested JSON — no markdown, no explanation.'
)

_PROMPTS = {
    'students': (
        'Write a short, friendly push notification to send to students on StudEx, '
        'a Nigerian campus marketplace where students book services from vendors on their campus '
        '(food, laundry, tutoring, haircuts, printing, etc.).\n\n'
        'The message should encourage them to explore services, share a useful tip, or brighten their day.\n\n'
        'Rules:\n'
        '- title: max 55 characters, punchy and specific\n'
        '- message: max 140 characters, warm and actionable\n'
        '- Vary topics: food vendors, laundry, studying, new services, campus life\n'
        '- Natural English; occasional Nigerian flavour is fine (e.g. "sharp sharp", "no cap")\n'
        '- Do NOT mention AI, automation, or that this is a scheduled message\n'
        'Respond ONLY with valid JSON on a single line: {"title": "...", "message": "..."}'
    ),
    'vendors': (
        'Write a short, friendly push notification to send to vendors on StudEx, '
        'a Nigerian campus marketplace where student entrepreneurs sell services to campus mates.\n\n'
        'The message should motivate them, give a practical business tip, or help them grow.\n\n'
        'Rules:\n'
        '- title: max 55 characters, energetic and specific\n'
        '- message: max 140 characters, practical and encouraging\n'
        '- Topics: updating listings, fast order responses, earning badges, pricing, profile tips\n'
        '- Warm entrepreneurial tone for young Nigerian business owners\n'
        '- Do NOT mention AI, automation, or that this is a scheduled message\n'
        'Respond ONLY with valid JSON on a single line: {"title": "...", "message": "..."}'
    ),
    'all': (
        'Write a short, friendly push notification to send to everyone (students and vendors) on StudEx, '
        'a Nigerian campus marketplace.\n\n'
        'The message should celebrate the community, share a platform tip, or be generally uplifting.\n\n'
        'Rules:\n'
        '- title: max 55 characters\n'
        '- message: max 140 characters\n'
        '- Inclusive, community-focused content\n'
        '- Warm Nigerian university campus vibe\n'
        '- Do NOT mention AI or automation\n'
        'Respond ONLY with valid JSON on a single line: {"title": "...", "message": "..."}'
    ),
}

_SCHOOL_NAMES = {
    'pau':  'Pan-Atlantic University (PAU) in Lagos',
    'futo': 'Federal University of Technology Owerri (FUTO)',
    'imsu': 'Imo State University, Owerri (IMSU)',
}


def _call_groq(audience: str, school: str = '') -> dict | None:
    """
    Call Groq API for the given audience and optional campus.
    Returns {'title': str, 'message': str} or None on any failure.
    """
    from django.conf import settings

    api_key = getattr(settings, 'GROQ_API_KEY', '').strip()
    if not api_key:
        logger.warning('groq_notifications: GROQ_API_KEY not set — skipping')
        return None

    prompt = _PROMPTS.get(audience, _PROMPTS['all'])
    if school and school in _SCHOOL_NAMES:
        campus = _SCHOOL_NAMES[school]
        prompt = prompt.replace(
            'Respond ONLY with valid JSON',
            f'The campus is {campus} — mention the campus name once, subtly, where natural.\n'
            'Respond ONLY with valid JSON',
        )

    try:
        resp = requests.post(
            GROQ_API_URL,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': GROQ_MODEL,
                'messages': [
                    {'role': 'system', 'content': _SYSTEM},
                    {'role': 'user',   'content': prompt},
                ],
                'max_tokens': 120,
                'temperature': 0.9,
            },
            timeout=30,
        )
        resp.raise_for_status()

        content = resp.json()['choices'][0]['message']['content'].strip()
        if content.startswith('```'):
            content = content.split('```')[1].lstrip('json').strip()

        data = json.loads(content)
        title   = str(data.get('title',   '')).strip()[:200]
        message = str(data.get('message', '')).strip()

        if not title or not message:
            raise ValueError('Empty title or message from Groq')

        return {'title': title, 'message': message}

    except Exception as e:
        logger.error(f'groq_notifications: Groq API error ({audience}): {e}')
        return None


def _build_recipients(audience: str, school: str):
    """Active user queryset for the given audience and campus filter."""
    from accounts.models import User
    from django.db.models import Q

    qs = User.objects.filter(is_active=True)

    if school == 'pau':
        qs = qs.filter(Q(school__iexact='pau') | Q(school='') | Q(school__isnull=True))
    elif school:
        qs = qs.filter(school__iexact=school)

    if audience == 'students':
        qs = qs.filter(user_type='student')
    elif audience == 'vendors':
        qs = qs.filter(user_type='vendor')

    return qs


def send_groq_notifications(
    audience: str,
    school: str = '',
    triggered_by: str = 'scheduler',
) -> dict:
    """
    Generate a Groq message for the audience and broadcast it.
    Returns {'sent': int, 'title': str, 'message': str} or {'error': str}.
    """
    from accounts.utils import send_notification
    from notifications.models import GrokNotificationLog

    payload = _call_groq(audience, school)
    if not payload:
        return {'error': 'Groq API unavailable or GROQ_API_KEY not configured'}

    title   = payload['title']
    message = payload['message']
    recipients = _build_recipients(audience, school)
    action_url = '/categories' if audience == 'students' else '/vendor/dashboard'

    sent = 0
    for user in recipients.iterator():
        try:
            send_notification(
                recipient=user,
                notification_type='ai_tip',
                title=title,
                message=message,
                action_url=action_url,
            )
            sent += 1
        except Exception as e:
            logger.warning(f'groq_notifications: failed to notify user {user.id}: {e}')

    GrokNotificationLog.objects.create(
        audience=audience,
        school=school,
        title=title,
        message=message,
        sent_count=sent,
        triggered_by=triggered_by,
        grok_model=GROQ_MODEL,
    )

    logger.info(
        f"groq_notifications: '{title}' → {sent} {audience}"
        f"{' (' + school.upper() + ')' if school else ''} via {triggered_by}"
    )
    return {'sent': sent, 'title': title, 'message': message}
