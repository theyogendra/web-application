from selenium.webdriver.common.by import By
from pages.base_page import BasePage

class LoginPage(BasePage):
    EMAIL_INPUT = (By.CSS_SELECTOR, "input[type='email']")
    # Using autocomplete attribute instead of type="password" so the toggle from type="password" to type="text" doesn't break the locator
    PASSWORD_INPUT = (By.CSS_SELECTOR, "input[autocomplete='current-password']")
    SUBMIT_BUTTON = (By.CSS_SELECTOR, "button[type='submit']")
    ERROR_ALERT = (By.CSS_SELECTOR, "div.bg-red-50")
    SHOW_HIDE_PASSWORD_BUTTON = (By.XPATH, "//button[contains(text(), 'Show') or contains(text(), 'Hide')]")

    def navigate(self, base_url):
        self.driver.get(f"{base_url}/login")

    def login(self, email, password):
        self.fill(self.EMAIL_INPUT, email)
        self.fill(self.PASSWORD_INPUT, password)
        self.click(self.SUBMIT_BUTTON)

    def get_error_message(self):
        return self.get_text(self.ERROR_ALERT)

    def toggle_password_visibility(self):
        self.click(self.SHOW_HIDE_PASSWORD_BUTTON)

    def get_password_input_type(self):
        input_el = self.find_element(self.PASSWORD_INPUT)
        return input_el.get_attribute("type")
