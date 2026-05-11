from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Table, DateTime, func
from sqlalchemy.orm import relationship
from app.database.base import Base

# Association table for Role-Permission (Many-to-Many)
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("role.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permission.id", ondelete="CASCADE"), primary_key=True),
)

class User(Base):
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    
    # RBAC Relationship
    role_id = Column(Integer, ForeignKey("role.id", ondelete="SET NULL"), nullable=True)
    role = relationship("Role", back_populates="users")
    
    # Timestamps & Tracking
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Role(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False) # Human readable: "Super Admin"
    slug = Column(String, unique=True, index=True, nullable=False) # Machine: "super_admin"
    description = Column(String, nullable=True)
    
    users = relationship("User", back_populates="role")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")

class Permission(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False) # Human: "Can Create Invoice"
    slug = Column(String, unique=True, index=True, nullable=False) # Machine: "can_create_invoice"
    
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")
