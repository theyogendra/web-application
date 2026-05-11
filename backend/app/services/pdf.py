import asyncio
from playwright.async_api import async_playwright
from jinja2 import Environment, FileSystemLoader
import os

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "../templates")
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

async def generate_pdf(template_name: str, data: dict, output_path: str):
    """
    Generates a PDF from an HTML template using Playwright.
    """
    template = env.get_template(template_name)
    html_content = template.render(**data)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(html_content)
        await page.pdf(path=output_path, format="A4")
        await browser.close()
        
    return output_path
