import os
import pytest
from selenium import webdriver
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

def pytest_addoption(parser):
    parser.addoption(
        "--base-url",
        action="store",
        default="http://localhost:3000",
        help="Base URL of the web application under test"
    )
    parser.addoption(
        "--headless",
        action="store",
        default="true",
        help="Run chrome in headless mode (true/false)"
    )

@pytest.fixture(scope="session")
def base_url(request):
    return request.config.getoption("--base-url")

@pytest.fixture(scope="function")
def driver(request):
    headless_opt = request.config.getoption("--headless").lower() == "true"
    
    chrome_options = Options()
    if headless_opt:
        chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-notifications")
    chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    
    request.node.driver = driver
    
    yield driver
    
    driver.quit()

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    
    if rep.when == "call" and rep.failed:
        driver = getattr(item, "driver", None)
        if driver:
            reports_dir = os.path.join(os.path.dirname(__file__), "reports")
            screenshots_dir = os.path.join(reports_dir, "screenshots")
            os.makedirs(screenshots_dir, exist_ok=True)
            
            test_name = item.nodeid.replace("::", "_").replace(".py", "").replace("/", "_").replace("\\", "_")
            screenshot_filename = f"{test_name}.png"
            screenshot_path = os.path.join(screenshots_dir, screenshot_filename)
            
            driver.save_screenshot(screenshot_path)
            
            pytest_html = item.config.pluginmanager.getplugin("html")
            if pytest_html is not None:
                extra = getattr(rep, "extra", [])
                img_html = f'<div><img src="screenshots/{screenshot_filename}" alt="screenshot" style="width:600px;height:350px;" ' \
                           f'onclick="window.open(this.src)" align="right"/></div>'
                extra.append(pytest_html.extras.html(img_html))
                rep.extra = extra
