import os
from sqlalchemy.orm import Session
from app.database.session import SessionLocal, engine
from app.database.base import Base
from app.modules.users.models import User, Role, Permission
from app.modules.audit.models import AuditLog
from app.core.security import get_password_hash

def seed_db():
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. Create Permissions
        permissions_list = [
            ("Manage Users", "can_manage_users"),
            ("View Reports", "can_view_reports"),
            ("Create Invoice", "can_create_invoice"),
            ("Edit Invoice", "can_edit_invoice"),
            ("Delete Invoice", "can_delete_invoice"),
            ("Edit Inventory", "can_edit_inventory"),
            ("View Inventory", "can_view_inventory"),
            ("Manage Payments", "can_manage_payments"),
            ("View Audit Logs", "can_view_audit_logs"),
        ]
        
        perms_map = {}
        for name, slug in permissions_list:
            perm = db.query(Permission).filter(Permission.slug == slug).first()
            if not perm:
                perm = Permission(name=name, slug=slug)
                db.add(perm)
                db.flush()
            perms_map[slug] = perm

        # 2. Create Roles
        roles_data = [
            ("Super Admin", "super_admin", list(perms_map.values())),
            ("Admin", "admin", [perms_map[s] for s in ["can_manage_users", "can_view_inventory", "can_edit_inventory", "can_view_reports"]]),
            ("Finance", "finance", [perms_map[s] for s in ["can_create_invoice", "can_edit_invoice", "can_manage_payments", "can_view_reports"]]),
            ("Inventory Manager", "inventory_manager", [perms_map[s] for s in ["can_view_inventory", "can_edit_inventory"]]),
            ("Sales", "sales", [perms_map[s] for s in ["can_create_invoice", "can_view_inventory"]]),
            ("Viewer", "viewer", [perms_map[s] for s in ["can_view_inventory"]]),
        ]

        roles_map = {}
        for name, slug, perms in roles_data:
            role = db.query(Role).filter(Role.slug == slug).first()
            if not role:
                role = Role(name=name, slug=slug)
                db.add(role)
                db.flush()
            role.permissions = perms
            roles_map[slug] = role

        # 3. Create Initial Admin
        admin_email = os.getenv("ADMIN_EMAIL", "admin@enterprise.com")
        admin_pass = os.getenv("ADMIN_PASSWORD", "password")
        admin_name = os.getenv("ADMIN_FULL_NAME", "System Administrator")

        admin_user = db.query(User).filter(User.email == admin_email).first()
        if not admin_user:
            admin_user = User(
                email=admin_email,
                full_name=admin_name,
                hashed_password=get_password_hash(admin_pass),
                is_active=True,
                is_superuser=True,
                role=roles_map["super_admin"]
            )
            db.add(admin_user)
            print(f"Created admin user: {admin_email}")
        
        db.commit()
        print("Database seeding completed successfully.")
        
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
