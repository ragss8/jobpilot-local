"""Drive the describe-your-home flow in a real browser, including a live
Ollama extraction. Skips the model call if Ollama is not running."""
import os, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
art = root / "artifacts"; art.mkdir(exist_ok=True)
base = os.environ.get("AANGAN_URL", "http://127.0.0.1:5174")

def ollama_up():
    try:
        urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=3)
        return True
    except Exception:
        return False

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=["--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGE ERROR:", e, flush=True)))
    page.goto(base)
    page.get_by_role("button", name="Describe your home", exact=True).click()
    expect(page.locator(".chat")).to_be_visible()
    page.get_by_role("button", name="Use the example brief", exact=True).click()
    page.screenshot(path=str(art / "chat-brief.png"))

    if not ollama_up():
        print("SKIP: Ollama is not running; stopped after the brief screen.")
    else:
        page.get_by_role("button", name="Understand my brief", exact=True).click()
        # A local model needs a while; the button reports elapsed seconds.
        expect(page.locator(".chat-floors")).to_be_visible(timeout=180_000)
        floors = page.locator(".chat-floor").count()
        assert floors >= 3, f"expected the levels to be understood, got {floors}"
        print("understood floors:", floors, flush=True)
        page.screenshot(path=str(art / "chat-understood.png"))

        # Correct the program by hand, the way a user would.
        first = page.locator(".chat-floor").nth(1).locator(".chat-space").first
        first.get_by_role("button", name="Spacious", exact=True).click()
        page.get_by_role("button", name="Design my house", exact=True).click()
        expect(page.locator(".design-option").first).to_be_visible(timeout=30_000)
        assert page.locator(".design-option").count() == 3
        # Every option previews each level, not just the ground floor.
        assert page.locator(".design-option").first.locator(".mini-plan").count() >= 3
        page.screenshot(path=str(art / "chat-options.png"))

        page.locator(".design-option").first.click()
        expect(page.locator(".plan-room").first).to_be_visible(timeout=30_000)
        page.screenshot(path=str(art / "chat-plan.png"))
        # Page through every generated level in 2D.
        names = page.locator(".floor-row, .level-row").count()
        print("levels listed in the studio:", names, flush=True)

    assert not errors, errors
    print("OK")
    browser.close()
