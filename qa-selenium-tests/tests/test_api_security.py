import re
import pytest
import requests

# Endpoint definitions
LOGIN_URL = "/api/auth/login"
ME_URL = "/api/auth/me"
USERS_URL = "/api/users"
INVENTORY_URL = "/api/inventory"

def get_api_base(base_url):
    # Dynamically point to backend port 8000
    return re.sub(r':\d+', ':8000', base_url)

def test_login_sql_injection(base_url):
    """
    Test ID: SEC-SQLI-01
    Scenario: Verify that SQL injection payloads in auth parameters are safely handled and do not result in a login bypass or server errors.
    """
    api_base = get_api_base(base_url)
    url = f"{api_base}{LOGIN_URL}"
    # Payload A: Standard SQL Injection
    payload_a = {
        "username": "admin@enterprise.com' OR '1'='1",
        "password": "randompassword"
    }
    # Payload B: Union-based injection attempt
    payload_b = {
        "username": "admin@enterprise.com' UNION SELECT NULL, NULL, NULL--",
        "password": "wrong"
    }

    # Run tests on SQLi inputs
    for payload in [payload_a, payload_b]:
        res = requests.post(url, data=payload)
        # Expected: 401 Unauthorized (safe reject) and NOT 500 Internal Server Error
        assert res.status_code == 401, f"Expected 401 for SQLi payload, but got {res.status_code}"
        assert "Incorrect email or password" in res.json().get("detail", "")

def test_no_credential_leakage(base_url):
    """
    Test ID: SEC-LEAK-01
    Scenario: Verify that endpoints exposing user profiles do not leak passwords or password hashes.
    """
    api_base = get_api_base(base_url)
    session = requests.Session()
    # Log in to get token
    login_res = session.post(f"{api_base}{LOGIN_URL}", data={
        "username": "admin@enterprise.com",
        "password": "admin123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    
    # 1. Check Me endpoint
    headers = {"Authorization": f"Bearer {token}"}
    me_res = requests.get(f"{api_base}{ME_URL}", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert "password" not in me_data, "Data leak: 'password' field found in Me response!"
    assert "password_hash" not in me_data, "Data leak: 'password_hash' field found in Me response!"

    # 2. Check Users List endpoint
    users_res = requests.get(f"{api_base}{USERS_URL}", headers=headers)
    assert users_res.status_code == 200
    users_list = users_res.json().get("data", [])
    assert len(users_list) > 0
    for u in users_list:
        assert "password" not in u, "Data leak: 'password' field found in User List response!"
        assert "password_hash" not in u, "Data leak: 'password_hash' field found in User List response!"

def test_csrf_cookie_protection(base_url):
    """
    Test ID: SEC-CSRF-01
    Scenario: Verify Double-Submit CSRF cookie checks enforce safety on mutation requests.
    """
    api_base = get_api_base(base_url)
    url = f"{api_base}{INVENTORY_URL}"
    
    # Get standard session
    session = requests.Session()
    login_res = session.post(f"{api_base}{LOGIN_URL}", data={
        "username": "admin@enterprise.com",
        "password": "admin123"
    })
    assert login_res.status_code == 200
    
    # Verify that session has cookies
    cookies = session.cookies.get_dict()
    assert "token" in cookies
    assert "csrf" in cookies
    
    # Omit CSRF header to simulate CSRF cross-origin attack
    headers = {
        "Content-Type": "application/json"
    }
    # Generate unique SKU to avoid unique constraint violations
    import random
    unique_sku = f"MAL-PROD-{random.randint(100000, 999999)}"
    # Attempt POST request
    payload = {
        "name": "Malicious Product",
        "sku": unique_sku,
        "price": 10.0,
        "stock": 10
    }
    # We clear the session headers to only send cookies
    bad_res = session.post(url, json=payload, headers=headers)
    # Expected: 403 Forbidden due to CSRF check failing
    assert bad_res.status_code == 403, f"Expected 403 Forbidden without CSRF header, but got {bad_res.status_code}"
    assert "Invalid or missing CSRF token" in bad_res.json().get("detail", "")
    
    # Provide valid CSRF header to match the cookie
    headers["X-CSRF-Token"] = cookies["csrf"]
    good_res = session.post(url, json=payload, headers=headers)
    # Expected: 201 Created or 200 OK
    assert good_res.status_code in [200, 201], f"Expected 200/201 with matching CSRF header, but got {good_res.status_code}: {good_res.text}"

def test_cors_origin_control(base_url):
    """
    Test ID: SEC-CORS-01
    Scenario: Verify that CORS whitelist rules block unauthorized origins.
    """
    api_base = get_api_base(base_url)
    # Allowed origin check
    res_allowed = requests.options(f"{api_base}{INVENTORY_URL}", headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET"
    })
    # If the CORS check passes, it should allow or response correctly
    assert res_allowed.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"
    assert res_allowed.headers.get("Access-Control-Allow-Credentials") == "true"

    # Malicious origin check
    res_blocked = requests.options(f"{api_base}{INVENTORY_URL}", headers={
        "Origin": "http://evil-attacker.site",
        "Access-Control-Request-Method": "GET"
    })
    # ATTENTION: If it is blocked, Access-Control-Allow-Origin must NOT be echoed, or it should return error/empty
    assert res_blocked.headers.get("Access-Control-Allow-Origin") != "http://evil-attacker.site"

def test_idor_invoice_access(base_url):
    """
    Test ID: SEC-IDOR-01
    Scenario: Verify that direct object references to private invoices block unauthenticated users.
    """
    api_base = get_api_base(base_url)
    # Attempt to read invoices list without token
    res = requests.get(f"{api_base}/api/invoices")
    # Expected: 401 Unauthorized or redirection
    assert res.status_code in [401, 403], f"Expected 401/403 for anonymous API access, got {res.status_code}"
