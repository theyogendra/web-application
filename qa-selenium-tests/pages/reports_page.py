from selenium.webdriver.common.by import By
from pages.base_page import BasePage

class ReportsPage(BasePage):
    EXPORT_SUMMARY_BUTTON = (By.XPATH, "//button[contains(., 'Export summary')]")
    
    TOTAL_REVENUE_VAL = (By.XPATH, "//p[contains(text(), 'Total Revenue')]/following-sibling::p")
    OUTSTANDING_VAL = (By.XPATH, "//p[contains(text(), 'Outstanding')]/following-sibling::p")
    PAID_VAL = (By.XPATH, "//p[contains(text(), 'Paid Invoices')]/following-sibling::p")
    OVERDUE_VAL = (By.XPATH, "//p[contains(text(), 'Overdue')]/following-sibling::p")
    
    STOCK_VALUE_VAL = (By.XPATH, "//p[contains(text(), 'Stock value')]/following-sibling::p")
    RETAIL_VALUE_VAL = (By.XPATH, "//p[contains(text(), 'Retail value')]/following-sibling::p")
    ACTIVE_PRODUCTS_VAL = (By.XPATH, "//p[contains(text(), 'Active products')]/following-sibling::p")
    LOW_STOCK_VAL = (By.XPATH, "//p[contains(text(), 'Low stock')]/following-sibling::p")
    
    REVENUE_CSV_BUTTON = (By.XPATH, "//h2[contains(text(), 'Revenue trend')]/ancestor::div[contains(@class, 'p-5')]//button[contains(., 'CSV')]")
    PAYMENTS_CSV_BUTTON = (By.XPATH, "//h2[contains(text(), 'Payment methods')]/ancestor::div[contains(@class, 'p-5')]//button[contains(., 'CSV')]")
    CUSTOMERS_CSV_BUTTON = (By.XPATH, "//h2[contains(text(), 'Top customers')]/ancestor::div[contains(@class, 'p-5')]//button[contains(., 'CSV')]")
    TAX_CSV_BUTTON = (By.XPATH, "//h2[contains(text(), 'Tax summary')]/ancestor::div[contains(@class, 'p-5')]//button[contains(., 'CSV')]")
    
    REVENUE_TREND_SVG = (By.XPATH, "//h2[contains(text(), 'Revenue trend')]/ancestor::div[contains(@class, 'p-5')]//*[local-name()='svg']")
    INVOICES_STATUS_SVG = (By.XPATH, "//h2[contains(text(), 'Invoices by status')]/ancestor::div[contains(@class, 'p-5')]//*[local-name()='svg']")
    
    SEARCH_INPUT = (By.CSS_SELECTOR, "header input[type='search']")
    THEME_TOGGLE_BUTTON = (By.XPATH, "//header//button[contains(@aria-label, 'Switch to')]")
    NOTIFICATIONS_BUTTON = (By.XPATH, "//header//button[contains(@aria-label, 'Notifications')]")
    USER_MENU_BUTTON = (By.XPATH, "//header//button[contains(@class, 'p-1')]")
    
    USER_NAME_MENU = (By.XPATH, "//header//button[contains(@class, 'p-1')]/span[2]/span[1]")
    PROFILE_MENU_ITEM = (By.XPATH, "//button[contains(., 'Profile')]")
    SIGN_OUT_BUTTON = (By.XPATH, "//button[contains(., 'Sign out')]")

    def navigate(self, base_url):
        self.driver.get(f"{base_url}/reports")

    def get_kpi_value(self, card_name):
        locators = {
            "total_revenue": self.TOTAL_REVENUE_VAL,
            "outstanding": self.OUTSTANDING_VAL,
            "paid_invoices": self.PAID_VAL,
            "overdue": self.OVERDUE_VAL,
            "stock_value": self.STOCK_VALUE_VAL,
            "retail_value": self.RETAIL_VALUE_VAL,
            "active_products": self.ACTIVE_PRODUCTS_VAL,
            "low_stock": self.LOW_STOCK_VAL
        }
        return self.get_text(locators[card_name.lower().replace(" ", "_")])

    def export_summary(self):
        self.click(self.EXPORT_SUMMARY_BUTTON)

    def search(self, query):
        self.fill(self.SEARCH_INPUT, query)

    def toggle_theme(self):
        self.click(self.THEME_TOGGLE_BUTTON)

    def is_dark_mode(self):
        html_class = self.driver.find_element(By.TAG_NAME, "html").get_attribute("class")
        return "dark" in html_class if html_class else False

    def open_user_menu(self):
        self.click(self.USER_MENU_BUTTON)

    def sign_out(self):
        self.open_user_menu()
        self.click(self.SIGN_OUT_BUTTON)
