import pytest
import requests
import random

BASE_API_URL = "http://localhost:8000"

@pytest.fixture(scope="session")
def auth_headers():
    # Login to obtain JWT
    login_url = f"{BASE_API_URL}/api/auth/login"
    credentials = {
        "username": "admin@enterprise.com",
        "password": "admin123"
    }
    # Form data login format (multer expects this or standard form encoding)
    res = requests.post(login_url, data=credentials)
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json().get("access_token")
    assert token is not None
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def test_auth_detection_info():
    """
    Test ID: AUTH-DETECT
    Verification of Auth strategy details
    """
    # Verify server health check endpoint is public
    res = requests.get(f"{BASE_API_URL}/health")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "healthy"

def test_security_unauthorized_access():
    """
    Test ID: SEC-AUTH-01
    Verify that protected routes return 401 when accessed without authorization header
    """
    # 1. Access without token
    res = requests.get(f"{BASE_API_URL}/api/auth/me")
    assert res.status_code == 401

    # 2. Access with invalid token
    headers = {"Authorization": "Bearer invalid_token_123"}
    res2 = requests.get(f"{BASE_API_URL}/api/auth/me", headers=headers)
    assert res2.status_code == 401

def test_security_csrf_cookie_enforcement():
    """
    Test ID: SEC-CSRF-02
    Verify double-submit CSRF cookie checks on state-changing requests when authenticated via cookies
    """
    # 1. Establish session via cookies (login)
    session = requests.Session()
    login_url = f"{BASE_API_URL}/api/auth/login"
    login_res = session.post(login_url, data={
        "username": "admin@enterprise.com",
        "password": "admin123"
    })
    assert login_res.status_code == 200
    
    cookies = session.cookies.get_dict()
    assert "token" in cookies
    assert "csrf" in cookies

    # 2. Perform a mutation request (e.g. create a product) without CSRF header
    product_sku = f"CSRF-TEST-{random.randint(1000, 9999)}"
    payload = {
        "name": "CSRF Test Product",
        "sku": product_sku,
        "price": 19.99,
        "stock": 5
    }
    
    headers = {"Content-Type": "application/json"}
    
    # State-changing POST should fail with 403 when CSRF header is missing
    bad_res = session.post(f"{BASE_API_URL}/api/inventory", json=payload, headers=headers)
    assert bad_res.status_code == 403
    assert "Invalid or missing CSRF token" in bad_res.json().get("detail", "")

    # 3. Perform the mutation request with matching CSRF header
    headers["X-CSRF-Token"] = cookies["csrf"]
    good_res = session.post(f"{BASE_API_URL}/api/inventory", json=payload, headers=headers)
    assert good_res.status_code == 201
    assert good_res.json().get("success") is True

def test_e2e_complete_workflow(auth_headers):
    """
    Test ID: E2E-WORKFLOW-01
    Verify the complete workflow:
    Create Product -> Create Proposal -> Convert to Quotation -> Convert to Invoice -> Validate/Submit -> Payment -> Approve
    """
    # --- STEP 1: Create Product (Inventory) ---
    product_sku = f"WF-PROD-{random.randint(10000, 99999)}"
    product_payload = {
        "name": "Workflow Automation Product",
        "sku": product_sku,
        "category": "Software",
        "price": 100.0,
        "stock": 50,
        "unit": "license"
    }
    
    # Negative test case: missing name
    bad_prod_res = requests.post(f"{BASE_API_URL}/api/inventory", json={"sku": product_sku}, headers=auth_headers)
    assert bad_prod_res.status_code == 400
    
    # Positive test case: create valid product
    prod_res = requests.post(f"{BASE_API_URL}/api/inventory", json=product_payload, headers=auth_headers)
    assert prod_res.status_code == 201
    prod_data = prod_res.json().get("data")
    product_id = prod_data.get("id")
    assert product_id is not None

    # --- STEP 2: Create Proposal ---
    proposal_payload = {
        "customer_name": "Acme Global Industries",
        "customer_email": "billing@acmeglobal.com",
        "notes": "E2E Automated Proposal",
        "items": [
            {
                "product_id": product_id,
                "description": "Workflow Software License Integration",
                "quantity": 5,
                "unit_price": 100.0,
                "discount": 10,  # 10% discount
                "tax_rate": 18   # 18% GST
            }
        ]
    }
    
    prop_res = requests.post(f"{BASE_API_URL}/api/proposals", json=proposal_payload, headers=auth_headers)
    assert prop_res.status_code == 201
    prop_data = prop_res.json()
    assert prop_data.get("success") is True
    
    proposal = prop_data.get("data")
    proposal_id = proposal.get("id")
    
    # Auto-converted quotation details from the response
    quotation = prop_data.get("quotation")
    assert quotation is not None
    quotation_id = quotation.get("id")
    assert proposal_id is not None
    assert quotation_id is not None

    # --- STEP 3: Accept Quotation (Convert to Invoice) ---
    accept_res = requests.post(f"{BASE_API_URL}/api/quotations/{quotation_id}/mark-accepted", json={}, headers=auth_headers)
    assert accept_res.status_code == 200
    accept_data = accept_res.json()
    assert accept_data.get("success") is True
    
    invoice = accept_data.get("invoice")
    assert invoice is not None
    invoice_id = invoice.get("id")
    assert invoice_id is not None

    # --- STEP 4: Validate & Submit Invoice ---
    # Retrieve invoice to have items for validation payload if required
    inv_get = requests.get(f"{BASE_API_URL}/api/invoices/{invoice_id}", headers=auth_headers)
    assert inv_get.status_code == 200
    inv_data = inv_get.json()
    
    # Negative check for validation (simulate validation error)
    # Put a negative quantity on update
    neg_payload = {
        **inv_data,
        "items": [
            {
                "description": "Validation Fail Line",
                "quantity": -5,
                "unit_price": 100.0
            }
        ]
    }
    neg_put = requests.put(f"{BASE_API_URL}/api/invoices/{invoice_id}", json=neg_payload, headers=auth_headers)
    # The put succeeds because it's a draft update, but it registers validation_status = 'failed'
    assert neg_put.status_code == 200
    assert neg_put.json().get("data").get("validation_status") == "failed"
    
    # Submitting it now must fail with 400 Bad Request due to negative quantity validation error
    submit_fail = requests.post(f"{BASE_API_URL}/api/invoices/{invoice_id}/submit", headers=auth_headers)
    assert submit_fail.status_code == 400
    
    # Reset back to correct validation payload
    pos_payload = {
        **inv_data,
        "items": [
            {
                "product_id": product_id,
                "description": "Workflow Software License Integration",
                "quantity": 5,
                "unit_price": 100.0,
                "discount": 10,
                "tax_rate": 18
            }
        ]
    }
    pos_put = requests.put(f"{BASE_API_URL}/api/invoices/{invoice_id}", json=pos_payload, headers=auth_headers)
    assert pos_put.status_code == 200
    assert pos_put.json().get("data").get("validation_status") == "passed"
    
    # Positive validation check
    val_res = requests.post(f"{BASE_API_URL}/api/invoices/{invoice_id}/validate", headers=auth_headers)
    assert val_res.status_code == 200
    assert val_res.json().get("success") is True
    
    # Positive submit check
    submit_res = requests.post(f"{BASE_API_URL}/api/invoices/{invoice_id}/submit", headers=auth_headers)
    assert submit_res.status_code == 200
    assert submit_res.json().get("data").get("status") == "submitted"

    # --- STEP 5: Record Payment & Approve ---
    grand_total = submit_res.json().get("data").get("grand_total")
    assert grand_total > 0
    
    payment_payload = {
        "invoice_id": invoice_id,
        "amount": grand_total,
        "payment_method": "bank_transfer",
        "payment_date": "2026-05-26",
        "reference_number": "TXN-E2E-12345",
        "notes": "E2E Automated Payment Check"
    }
    
    pay_res = requests.post(f"{BASE_API_URL}/api/payments", json=payment_payload, headers=auth_headers)
    assert pay_res.status_code == 201
    pay_data = pay_res.json()
    assert pay_data.get("success") is True
    payment_id = pay_data.get("data").get("id")
    assert payment_id is not None
    
    # Approve Payment (credits invoice and updates status to 'paid')
    app_res = requests.post(f"{BASE_API_URL}/api/payments/{payment_id}/approve", json={}, headers=auth_headers)
    assert app_res.status_code == 200
    app_data = app_res.json()
    assert app_data.get("success") is True
    assert app_data.get("invoice").get("status") == "paid"
    assert app_data.get("invoice").get("balance_due") == 0
