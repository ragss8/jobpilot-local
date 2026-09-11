"""Opt-in: a terse rental brief through the real UI and the real local model."""
import os, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]; art = root / "artifacts"; art.mkdir(exist_ok=True)
URL = os.environ.get("AANGAN_URL", "http://127.0.0.1:5174")
BRIEF = os.environ.get("AANGAN_BRIEF", "Design a G+3 house on a 30 x 40 ft plot with rental units")
launch = {"headless": True, "args": ["--enable-unsafe-swiftshader"]}
if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
    launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]
with sync_playwright() as pw:
    browser = pw.chromium.launch(**launch)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGE ERROR:", e, flush=True)))
    page.goto(URL)
    page.evaluate("localStorage.clear()")
    page.reload()
    box = page.locator("textarea").first
    box.fill(BRIEF)
    page.get_by_role("button", name="Generate architecture").click()
    print("sent:", BRIEF, flush=True)
    for step in range(40):
        page.wait_for_timeout(5000)
        if errors: break
        if page.get_by_role("button", name="Generate architecture").count(): break
        print("  ...", page.locator(".generation-status").all_text_contents(), flush=True)
    assert not errors, errors
    page.wait_for_timeout(1500)
    page.screenshot(path=str(art / "rental-chat.png"), full_page=False)
    text = page.locator("body").inner_text()
    assert "valid concepts" in text, text[:900]
    floors = re.findall(r"(Ground|First|Second|Third|Fourth|Terrace|Floor \d+|Site masterplan):\s*(.+)", text)
    print("floors understood:", flush=True)
    for name, detail in floors[:8]:
        print(f"   {name}: {detail.strip()[:110]}", flush=True)
    # Each let must be self-contained: its own kitchen and bathroom.
    upper = [d for n, d in floors if n != "Ground"]
    assert upper, "no upper floors described"
    if "rental" in BRIEF.lower() or "let" in BRIEF.lower():
        # Only a lettable brief promises a kitchen and bathroom on every floor.
        for d in upper:
            assert "kitchen" in d.lower(), f"a let needs its own kitchen: {d}"
            assert "bathroom" in d.lower(), f"a let needs its own bathroom: {d}"
        print("OK: every upper floor is a self-contained let", flush=True)
    else:
        print("OK: planned", flush=True)
    browser.close()
