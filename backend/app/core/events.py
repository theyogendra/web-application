import json
import redis
from app.core.config import settings

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

def emit_event(event_name: str, data: dict):
    """
    Emits an event to Redis Pub/Sub.
    """
    payload = {
        "event": event_name,
        "data": data
    }
    redis_client.publish("enterprise_events", json.dumps(payload))

def subscribe_to_events():
    """
    Example of how to subscribe (usually run in a separate worker)
    """
    pubsub = redis_client.pubsub()
    pubsub.subscribe("enterprise_events")
    for message in pubsub.listen():
        if message['type'] == 'message':
            print(f"Received event: {message['data']}")
            # Handle event (e.g., trigger n8n, update other modules)
