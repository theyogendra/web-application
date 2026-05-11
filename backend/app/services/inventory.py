from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.modules.inventory.models import Product, StockMovement, MovementType
from app.services.audit import log_action
from app.core.events import emit_event

def adjust_stock(
    db: Session,
    product_id: int,
    quantity: int,
    movement_type: MovementType,
    user_id: int,
    reference_id: str = None,
    notes: str = None
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    old_stock = product.current_stock
    product.current_stock += quantity
    
    if product.current_stock < 0:
        raise HTTPException(status_code=400, detail="Insufficient stock")
        
    movement = StockMovement(
        product_id=product_id,
        quantity=quantity,
        type=movement_type,
        reference_id=reference_id,
        user_id=user_id,
        notes=notes
    )
    db.add(movement)
    
    # Audit logging
    log_action(
        db, user_id, "STOCK_ADJUSTMENT", "Product", product_id,
        {"stock": old_stock}, {"stock": product.current_stock}
    )
    
    # Check for low stock
    if product.current_stock <= product.low_stock_threshold:
        emit_event("stock.low", {
            "product_id": product.id,
            "product_name": product.name,
            "current_stock": product.current_stock
        })
        
    db.commit()
    db.refresh(product)
    return product
