"""Walk a generated Ground+2+terrace house: orbit each level, then climb the
staircase from the stilt all the way to the roof."""
import json, math, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
art = root / "artifacts"; art.mkdir(exist_ok=True)
base = os.environ.get("AANGAN_URL", "http://127.0.0.1:5174")
project = json.loads(Path(sys.argv[1]).read_text())

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=["--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 1440, "height": 950}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda e: (errors.append(str(e)), print("PAGE ERROR:", e, flush=True)))
    page.goto(base)
    page.evaluate("p => localStorage.setItem('aangan-project-v1', JSON.stringify(p))", project)
    page.reload()
    expect(page.locator(".plan-room").first).to_be_visible(timeout=20_000)

    page.get_by_role("button", name="3D View", exact=True).click()
    expect(page.locator(".viewer canvas")).to_be_visible(timeout=30_000)
    page.wait_for_timeout(6000)
    page.screenshot(path=str(art / "mf-overview.png"))

    # Orbit each storey: the building is cut at the selected floor.
    for i, name in enumerate(f["name"] for f in project["floors"]):
        page.locator(".floor-row").nth(i).click()
        page.wait_for_timeout(1800)
        page.screenshot(path=str(art / f"mf-level-{i}.png"))
        print("orbited", name, flush=True)

    # Start at the bottom and climb.
    page.locator(".floor-row").nth(0).click()
    page.wait_for_timeout(1200)
    page.get_by_role("button", name="Walk", exact=True).click()
    page.wait_for_timeout(2500)

    def level_name():
        return page.locator(".tour-room-badge").inner_text()

    print("start:", level_name(), flush=True)
    page.screenshot(path=str(art / "mf-walk-start.png"))

    canvas = page.locator(".viewer canvas")
    canvas.click()

    def probe():
        return page.evaluate("window.__aangan") or {}

    def hold(key, seconds):
        page.keyboard.down(key)
        page.wait_for_timeout(int(seconds * 1000))
        page.keyboard.up(key)

    def advance(key, limit=25, step=0.5):
        """Hold a key until the walker stops making progress."""
        last = probe()
        for _ in range(limit):
            hold(key, step)
            now = probe()
            moved = (
                abs(now["x"] - last["x"])
                + abs(now["z"] - last["z"])
                + abs(now["walkerY"] - last["walkerY"])
            )
            last = now
            if moved < 0.2:
                break
        return last

    def turn(radians):
        """Turn by dragging to look.

        Arrow-key turning advances per frame, and headless WebGL renders too
        slowly for that to be predictable; a drag is measured in pixels, so
        it turns the same amount however fast the scene is drawing."""
        box = canvas.bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        remaining = -radians / 0.002
        while abs(remaining) > 2:
            step = max(-280, min(280, remaining))
            page.mouse.move(cx, cy)
            page.mouse.down()
            page.mouse.move(cx + step, cy, steps=8)
            page.mouse.up()
            remaining -= step

    def turn_around():
        # A dog-leg doubles back at the half-landing, so the walker turns.
        turn(math.pi)
        return probe()["yaw"]

    start = probe()
    print("start:", {k: round(v, 2) if isinstance(v, float) else v
                     for k, v in start.items() if k in ("x", "z", "walkerY", "level")}, flush=True)
    levels_seen = {start.get("level", 0)}
    peak = start.get("walkerY", 0)
    # One dog-leg per storey: up the first flight, across the half-landing,
    # about turn, then up the second flight and out on to the floor above.
    top = len(project["floors"]) - 1
    # Each dog-leg is: up the first flight, across the half-landing, about
    # turn, up the second flight, out on to the floor above. Arriving leaves
    # the walker facing back down, so the next leg turns first.
    for leg in range(top * 3):
        advance("w")
        advance("d")
        turn_around()
        arrived = advance("w")
        levels_seen.add(arrived["level"])
        peak = max(peak, arrived["walkerY"] or 0)
        print(
            f"  leg {leg}: level={arrived['level']} y={arrived['walkerY']:.2f} "
            f"x={arrived['x']:.1f} z={arrived['z']:.1f}",
            flush=True,
        )
        if arrived["level"] >= top:
            page.screenshot(path=str(art / "mf-terrace.png"))
            break
    print("levels visited:", sorted(levels_seen), flush=True)
    print(f"highest walkerY reached: {peak:.2f}", flush=True)
    assert max(levels_seen) == top, (
        f"expected to climb from the stilt to the terrace (level {top}), "
        f"reached {sorted(levels_seen)}"
    )
    assert levels_seen == set(range(top + 1)), f"skipped a storey: {sorted(levels_seen)}"
    print("climbed the whole house, stilt to terrace", flush=True)
    page.screenshot(path=str(art / "mf-walk-end.png"))
    assert not errors, errors
    browser.close()
