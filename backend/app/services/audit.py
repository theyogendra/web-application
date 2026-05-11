from sqlalchemy.orm import Session
from app.modules.audit.models import AuditLog
import json

def log_action(
    db: Session,
    user_id: int,
    action: str,
    entity_type: str,
    entity_id: int = None,
    old_value: dict = None,
    new_value: dict = None,
    ip_address: str = None
):
    log_entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=json.dumps(old_value) if old_value else None,
        new_value=json.dumps(new_value) if new_value else None,
        ip_address=ip_address
    )
    db.add(log_entry)
    db.commit()
