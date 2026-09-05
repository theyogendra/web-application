from selenium.webdriver.common.by import By
from pages.base_page import BasePage

class SidebarPage(BasePage):
    COLLAPSE_TOGGLE = (By.XPATH, "//button[contains(@title, 'Collapse sidebar') or contains(@title, 'Expand sidebar')]")
    BRAND_TEXT = (By.XPATH, "//span[contains(text(), 'InvoicePro')]")
    ASIDE_ELEMENT = (By.TAG_NAME, "aside")
    
    REPORTS_LINK = (By.XPATH, "//nav//a[contains(@href, '/reports')]")
    INVENTORY_LINK = (By.XPATH, "//nav//a[contains(@href, '/inventory')]")
    PROPOSALS_LINK = (By.XPATH, "//nav//a[contains(@href, '/proposals')]")
    QUOTATIONS_LINK = (By.XPATH, "//nav//a[contains(@href, '/quotations')]")
    INVOICES_LINK = (By.XPATH, "//nav//a[contains(@href, '/invoices')]")
    PAYMENTS_LINK = (By.XPATH, "//nav//a[contains(@href, '/payments')]")
    AUDIT_LOGS_LINK = (By.XPATH, "//nav//a[contains(@href, '/audit-logs')]")
    USERS_LINK = (By.XPATH, "//nav//a[contains(@href, '/users')]")

    def toggle_collapse(self):
        self.click(self.COLLAPSE_TOGGLE)

    def is_collapsed(self):
        aside = self.find_element(self.ASIDE_ELEMENT)
        button = self.find_element(self.COLLAPSE_TOGGLE)
        title = button.get_attribute("title")
        return "Expand sidebar" in title

    def navigate_to(self, target):
        links = {
            "reports": self.REPORTS_LINK,
            "inventory": self.INVENTORY_LINK,
            "proposals": self.PROPOSALS_LINK,
            "quotations": self.QUOTATIONS_LINK,
            "invoices": self.INVOICES_LINK,
            "payments": self.PAYMENTS_LINK,
            "audit_logs": self.AUDIT_LOGS_LINK,
            "users": self.USERS_LINK
        }
        self.click(links[target.lower().replace(" ", "_")])
