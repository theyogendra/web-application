from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database.base import Base

class ProposalStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    REVISION_REQUESTED = "revision_requested"
    APPROVED = "approved"
    REJECTED = "rejected"

class InvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"

class Proposal(Base):
    id = Column(Integer, primary_key=True, index=True)
    client_name = Column(String, nullable=False)
    client_email = Column(String, nullable=False)
    status = Column(Enum(ProposalStatus), default=ProposalStatus.DRAFT)
    total_amount = Column(Float, default=0.0)
    version = Column(Integer, default=1)
    content = Column(JSON) # Detailed structure of the proposal
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    quotations = relationship("Quotation", back_populates="proposal")

class Quotation(Base):
    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(Integer, ForeignKey("proposal.id"))
    status = Column(String, default="pending")
    items = Column(JSON) # List of products, quantities, prices, taxes
    total_amount = Column(Float, nullable=False)
    valid_until = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    proposal = relationship("Proposal", back_populates="quotations")
    invoices = relationship("Invoice", back_populates="quotation")

class Invoice(Base):
    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotation.id"))
    invoice_number = Column(String, unique=True, index=True)
    status = Column(Enum(InvoiceStatus), default=InvoiceStatus.DRAFT)
    total_amount = Column(Float, nullable=False)
    due_date = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    quotation = relationship("Quotation", back_populates="invoices")
    payments = relationship("Payment", back_populates="invoice")

class Payment(Base):
    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoice.id"))
    amount = Column(Float, nullable=False)
    method = Column(String) # cash, bank_transfer, card
    transaction_reference = Column(String)
    status = Column(String, default="completed")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    invoice = relationship("Invoice", back_populates="payments")
