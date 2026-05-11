from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database.base import Base

class MovementType(str, enum.Enum):
    PURCHASE = "purchase"
    SALE = "sale"
    RETURN = "return"
    ADJUSTMENT = "adjustment"
    DAMAGED = "damaged"

class Product(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    sku = Column(String, unique=True, index=True, nullable=False)
    description = Column(String)
    current_stock = Column(Integer, default=0)
    low_stock_threshold = Column(Integer, default=10)
    price = Column(Float, nullable=False)
    
    movements = relationship("StockMovement", back_populates="product")

class StockMovement(Base):
    __tablename__ = "stock_movement"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("product.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    type = Column(Enum(MovementType), nullable=False)
    reference_id = Column(String, nullable=True) # ID of Invoice, Purchase Order, etc.
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(String)
    
    product = relationship("Product", back_populates="movements")
