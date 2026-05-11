from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.modules.inventory.models import Product, StockMovement
from app.services import inventory as inventory_service
from app.schemas.inventory import ProductCreate, ProductUpdate, StockAdjustment

router = APIRouter()

@router.get("/", response_model=List[Any])
def read_products(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve products.
    """
    products = db.query(Product).offset(skip).limit(limit).all()
    return products

@router.post("/", response_model=Any)
def create_product(
    *,
    db: Session = Depends(deps.get_db),
    product_in: ProductCreate,
    current_user = Depends(deps.PermissionChecker(["inventory.edit"])),
) -> Any:
    """
    Create new product.
    """
    product = Product(**product_in.dict())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@router.post("/{product_id}/adjust-stock", response_model=Any)
def adjust_product_stock(
    *,
    db: Session = Depends(deps.get_db),
    product_id: int,
    adjustment_in: StockAdjustment,
    current_user = Depends(deps.get_current_user),
) -> Any:
    """
    Adjust product stock level.
    """
    return inventory_service.adjust_stock(
        db,
        product_id=product_id,
        quantity=adjustment_in.quantity,
        movement_type=adjustment_in.type,
        user_id=current_user.id,
        notes=adjustment_in.notes
    )
