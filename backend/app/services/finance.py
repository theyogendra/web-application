from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.modules.invoices.models import Invoice, InvoiceStatus
from app.services.inventory import adjust_stock, MovementType
from app.services.audit import log_action
from app.core.events import emit_event

def confirm_invoice(db: Session, invoice_id: int, user_id: int):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    if invoice.status != InvoiceStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Invoice already confirmed or processed")
        
    # Reduction of inventory
    # For each item in invoice.quotation.items, reduce stock
    for item in invoice.quotation.items:
        adjust_stock(
            db, 
            product_id=item['product_id'],
            quantity=-item['quantity'],
            movement_type=MovementType.SALE,
            user_id=user_id,
            reference_id=str(invoice.id),
            notes=f"Sale from Invoice #{invoice.invoice_number}"
        )
        
    invoice.status = InvoiceStatus.CONFIRMED
    db.commit()
    
    log_action(db, user_id, "INVOICE_CONFIRMED", "Invoice", invoice.id)
    emit_event("invoice.confirmed", {"invoice_id": invoice.id, "total": invoice.total_amount})
    
    return invoice
