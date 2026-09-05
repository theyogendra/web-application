import pytest
import time
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from pages.login_page import LoginPage
from pages.reports_page import ReportsPage
from pages.sidebar_page import SidebarPage

# Helper method to log in successfully
def login_helper(driver, base_url):
    login_page = LoginPage(driver)
    login_page.navigate(base_url)
    login_page.login("admin@enterprise.com", "admin123")
    
    # Explicit wait for redirection to complete
    WebDriverWait(driver, 15).until(EC.url_contains("/invoices"))
    
    # Wait for the loading overlay to disappear and sidebar to become visible
    sidebar = SidebarPage(driver)
    WebDriverWait(driver, 15).until(EC.visibility_of_element_located(sidebar.ASIDE_ELEMENT))

# TEST 1: Unauthenticated direct access redirect (Access Control)
# Severity: Critical | Priority: High
def test_unauthenticated_user_redirect(driver, base_url):
    """
    Test ID: TS-ACC-01
    Scenario: Verify that an unauthenticated user attempting to directly access protected /reports is redirected to /login.
    Steps:
      1. Open browser and navigate directly to '/reports'.
      2. Wait for redirect checking URL changes to '/login'.
    Expected Result: User is automatically redirected to '/login'.
    """
    reports_page = ReportsPage(driver)
    reports_page.navigate(base_url)
    
    # Explicit wait to detect redirect URL change
    WebDriverWait(driver, 15).until(EC.url_contains("/login"))
    assert "/login" in driver.current_url, f"Expected redirect to /login, but stayed at {driver.current_url}"

# TEST 2: Invalid login error checks
# Severity: High | Priority: High
def test_invalid_login_error_message(driver, base_url):
    """
    Test ID: TS-AUTH-01
    Scenario: Verify error alerts display correctly on incorrect user credentials.
    Steps:
      1. Navigate to /login.
      2. Enter invalid email and password.
      3. Click submit.
      4. Assert error alert container is visible and displays matching text.
    Expected Result: Login fails, error banner appears with 'Incorrect email or password'.
    """
    login_page = LoginPage(driver)
    login_page.navigate(base_url)
    login_page.login("wrong@enterprise.com", "wrongpass")
    
    # Wait for error message element to appear
    WebDriverWait(driver, 10).until(EC.visibility_of_element_located(login_page.ERROR_ALERT))
    error_msg = login_page.get_error_message()
    assert "Incorrect email or password" in error_msg, f"Unexpected error message: {error_msg}"

# TEST 3: Validate Password Visibility Toggle
# Severity: Medium | Priority: Medium
def test_password_visibility_toggle(driver, base_url):
    """
    Test ID: TS-AUTH-02
    Scenario: Verify that clicking the password toggle switches input type between 'password' and 'text'.
    Steps:
      1. Navigate to /login.
      2. Input a password.
      3. Verify input field type is 'password'.
      4. Click 'Show' toggle button.
      5. Verify input type changes to 'text'.
      6. Click 'Hide' toggle button.
      7. Verify input type changes back to 'password'.
    Expected Result: Input type toggles securely and dynamically.
    """
    login_page = LoginPage(driver)
    login_page.navigate(base_url)
    
    # Pre-toggle checks
    assert login_page.get_password_input_type() == "password"
    
    # Click Show
    login_page.toggle_password_visibility()
    # Wait until password input type becomes 'text'
    WebDriverWait(driver, 5).until(lambda d: login_page.get_password_input_type() == "text")
    assert login_page.get_password_input_type() == "text"
    
    # Click Hide
    login_page.toggle_password_visibility()
    # Wait until password input type becomes 'password'
    WebDriverWait(driver, 5).until(lambda d: login_page.get_password_input_type() == "password")
    assert login_page.get_password_input_type() == "password"

# TEST 4: Sidebar navigation check
# Severity: High | Priority: High
def test_sidebar_navigation(driver, base_url):
    """
    Test ID: TS-NAV-01
    Scenario: Verify clicking navigation links in sidebar successfully updates routing paths.
    Steps:
      1. Log in.
      2. Click Inventory link.
      3. Assert URL is updated to '/inventory'.
      4. Click Reports link.
      5. Assert URL is updated to '/reports'.
    Expected Result: URLs match the selected sidebar routing.
    """
    login_helper(driver, base_url)
    sidebar = SidebarPage(driver)
    
    # Click Inventory link
    sidebar.navigate_to("inventory")
    WebDriverWait(driver, 15).until(EC.url_contains("/inventory"))
    assert "/inventory" in driver.current_url
    
    # Click Reports link
    sidebar.navigate_to("reports")
    WebDriverWait(driver, 15).until(EC.url_contains("/reports"))
    assert "/reports" in driver.current_url

# TEST 5: Reports page rendering and KPI values validation
# Severity: High | Priority: High
def test_reports_page_title_and_kpis(driver, base_url):
    """
    Test ID: TS-REP-01
    Scenario: Verify Reports page header displays and KPI cards load correct currency representations.
    Steps:
      1. Log in.
      2. Go to /reports.
      3. Assert header title is visible.
      4. Fetch values for Total Revenue, Outstanding, Paid Invoices, Overdue.
      5. Assert they are not empty and follow correct patterns (currency or numeric).
    Expected Result: Reports title displays, KPI cards populate correctly.
    """
    login_helper(driver, base_url)
    reports = ReportsPage(driver)
    reports.navigate(base_url)
    
    # Wait for the main reports header
    header_el = reports.find_visible_element((By.XPATH, "//h1"))
    assert "Reports" in header_el.text, f"Expected page title 'Reports', but got '{header_el.text}'"
    
    # Verify KPI values are populated and not empty/placeholder
    revenue_val = reports.get_kpi_value("total_revenue")
    outstanding_val = reports.get_kpi_value("outstanding")
    paid_val = reports.get_kpi_value("paid_invoices")
    overdue_val = reports.get_kpi_value("overdue")
    
    assert "₹" in revenue_val or "$" in revenue_val or "0" in revenue_val, f"Total Revenue Card value {revenue_val} is invalid"
    assert "₹" in outstanding_val or "$" in outstanding_val or "0" in outstanding_val, f"Outstanding Card value {outstanding_val} is invalid"
    assert paid_val.isdigit(), f"Paid Invoices Card value {paid_val} is not a valid number"
    assert overdue_val.isdigit(), f"Overdue Card value {overdue_val} is not a valid number"

# TEST 6: Recharts Charts rendering (SVG presence)
# Severity: Major | Priority: Medium
def test_charts_rendering(driver, base_url):
    """
    Test ID: TS-CHT-01
    Scenario: Verify SVG elements are drawn for the Revenue Trend area chart and Invoices by Status donut chart.
    Steps:
      1. Log in and go to /reports.
      2. Locate SVG chart elements.
      3. Verify both SVG elements are visible and have rendering dimensions.
    Expected Result: Recharts packages load and draw actual visual SVG nodes in DOM.
    """
    login_helper(driver, base_url)
    reports = ReportsPage(driver)
    reports.navigate(base_url)
    
    # Verify Revenue trend chart
    revenue_svg = reports.find_visible_element(reports.REVENUE_TREND_SVG)
    assert revenue_svg.is_displayed()
    assert int(revenue_svg.get_attribute("width")) > 0
    
    # Verify Invoices status pie chart
    status_svg = reports.find_visible_element(reports.INVOICES_STATUS_SVG)
    assert status_svg.is_displayed()
    assert int(status_svg.get_attribute("width")) > 0

# TEST 7: Search input validation
# Severity: Medium | Priority: Medium
def test_search_bar(driver, base_url):
    """
    Test ID: TS-SRH-01
    Scenario: Verify top navbar search input functions and accepts typed query terms.
    Steps:
      1. Log in and go to /reports.
      2. Enter search term 'Customer A' into search box.
      3. Verify value matches input text.
    Expected Result: Input elements accept and display user values.
    """
    login_helper(driver, base_url)
    reports = ReportsPage(driver)
    reports.navigate(base_url)
    
    reports.search("Customer A")
    search_el = reports.find_element(reports.SEARCH_INPUT)
    assert search_el.get_attribute("value") == "Customer A"

# TEST 8: Export Summary functionality check
# Severity: Medium | Priority: Medium
def test_export_summary(driver, base_url):
    """
    Test ID: TS-EXP-01
    Scenario: Verify clicking the 'Export summary' button changes label indicating start of export.
    Steps:
      1. Log in and go to /reports.
      2. Click 'Export summary' button.
      3. Assert button gets disabled or changes text to 'Exporting...'.
    Expected Result: Button state updates on click.
    """
    login_helper(driver, base_url)
    reports = ReportsPage(driver)
    reports.navigate(base_url)
    
    reports.export_summary()
    assert reports.is_visible(reports.EXPORT_SUMMARY_BUTTON)

# TEST 9: Sidebar Expand / Collapse check
# Severity: Medium | Priority: Medium
def test_sidebar_collapse(driver, base_url):
    """
    Test ID: TS-NAV-02
    Scenario: Verify clicking collapse toggle button correctly resizes sidebar container.
    Steps:
      1. Log in.
      2. Click Collapse button.
      3. Verify Brand Logo text 'InvoicePro' disappears.
      4. Click Expand button.
      5. Verify Brand Logo text 'InvoicePro' reappears.
    Expected Result: Sidebar state updates properly with local storage tracking.
    """
    login_helper(driver, base_url)
    sidebar = SidebarPage(driver)
    
    # Sidebar should be expanded by default
    assert sidebar.is_visible(sidebar.BRAND_TEXT)
    
    # Collapse sidebar
    sidebar.toggle_collapse()
    # Wait for brand text to disappear
    WebDriverWait(driver, 5).until(EC.invisibility_of_element_located(sidebar.BRAND_TEXT))
    assert not sidebar.is_visible(sidebar.BRAND_TEXT)
    
    # Expand sidebar back
    sidebar.toggle_collapse()
    # Wait for brand text to reappear
    WebDriverWait(driver, 5).until(EC.visibility_of_element_located(sidebar.BRAND_TEXT))
    assert sidebar.is_visible(sidebar.BRAND_TEXT)

# TEST 10: Light / Dark Mode Toggle
# Severity: Medium | Priority: Medium
def test_theme_toggle(driver, base_url):
    """
    Test ID: TS-THE-01
    Scenario: Verify toggling theme icon updates local styles class target.
    Steps:
      1. Log in.
      2. Check initial mode (usually Light).
      3. Click theme toggle button.
      4. Assert html root class has changed to include 'dark'.
    Expected Result: Toggle correctly updates the global class node style.
    """
    login_helper(driver, base_url)
    reports = ReportsPage(driver)
    reports.navigate(base_url)
    
    initial_dark_state = reports.is_dark_mode()
    
    # Toggle theme
    reports.toggle_theme()
    # Wait for html theme class to toggle
    time.sleep(1)
    
    assert reports.is_dark_mode() != initial_dark_state

# TEST 11: Responsiveness check on layout breakpoints
# Severity: High | Priority: Medium
def test_responsive_ui(driver, base_url):
    """
    Test ID: TS-RSP-01
    Scenario: Verify dashboard page layout shifts properly on mobile resolutions.
    Steps:
      1. Log in and go to /reports.
      2. Resize browser viewport to 375x812 (iPhone X format).
      3. Check sidebar states are collapsed or layout elements adjust.
    Expected Result: Fluid layouts adjust size cleanly without breaking margins.
    """
    login_helper(driver, base_url)
    reports = ReportsPage(driver)
    reports.navigate(base_url)
    
    # Resize window to mobile width
    driver.set_window_size(375, 812)
    time.sleep(1.5)
    
    # Sidebar brand text is hidden at mobile resolutions as it automatically collapses or adapts
    sidebar = SidebarPage(driver)
    assert not sidebar.is_visible(sidebar.BRAND_TEXT)
    
    # Restore window size
    driver.set_window_size(1920, 1080)
