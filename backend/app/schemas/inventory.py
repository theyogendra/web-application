from typing import Optional
from pydantic import BaseModel
from app.modules.inventory.models import MovementType

class ProductBase(BaseModel):
    name: str
    sku: str
    description: Optional[str] = None
    price: float
    low_stock_threshold: int = 10

class ProductCreate(ProductBase):
    pass

class ProductUpdate(ProductBase):
    name: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[float] = None

class StockAdjustment(BaseModel):
    quantity: int
    type: MovementType
    notes: Optional[str] = None
