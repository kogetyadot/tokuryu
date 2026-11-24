"""Playwright E2E, visual screenshot, layout, and performance verification for TOKURYU."""

import json
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path("/home/antigravity/sandbox/20261123_tokuryu")
SHOTS = ROOT / "tests" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)
PORT = 4173
URL = f"http://127.0.0.1:{PORT}"


def wait_for_server(url: str, timeout: float = 20.0) -> None:
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"Preview server at {url} did not become ready in time")


def check_layout_and_assets(page, label: str, issues: list[str]) -> dict:
    metrics = page.evaluate(
        """() => {
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            const canvas = document.querySelector('canvas');
            const canvasInfo = canvas ? {
                w: canvas.width,
                h: canvas.height,
                cssW: canvas.getBoundingClientRect().width,
                cssH: canvas.getBoundingClientRect().height,
            } : null;
            const imgs = Array.from(document.querySelectorAll('img')).map(im => ({
                src: im.getAttribute('src'),
                complete: im.complete,
                naturalWidth: im.naturalWidth,
            }));
            return { docW, winW, canvasInfo, imgs };
        }"""
    )
    if metrics["docW"] > metrics["winW"] + 2:
        issues.append(f"[{label}] Horizontal overflow: scrollWidth={metrics['docW']} > innerWidth={metrics['winW']}")
    if not metrics["canvasInfo"] or metrics["canvasInfo"]["w"] == 0 or metrics["canvasInfo"]["h"] == 0:
        issues.append(f"[{label}] Missing or zero-size WebGL canvas: {metrics['canvasInfo']}")
    broken = [im for im in metrics["imgs"] if not im["complete"] or im["naturalWidth"] == 0]
    if broken:
        issues.append(f"[{label}] Broken images: {broken}")
    return metrics


def measure_fps(page) -> float:
    return page.evaluate(
        """() => new Promise(resolve => {
            let frames = 0;
            const start = performance.now();
            function tick() {
                frames++;
                const elapsed = performance.now() - start;
                if (elapsed >= 1000) {
                    resolve(Number(((frames * 1000) / elapsed).toFixed(1)));
                } else {
                    requestAnimationFrame(tick);
                }
            }
            requestAnimationFrame(tick);
        })"""
    )


def main() -> int:
    server = subprocess.Popen(
        ["node", "./node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", str(PORT), "--strictPort"],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    console_errors: list[str] = []
    page_errors: list[str] = []
    http_errors: list[str] = []
    issues: list[str] = []
    report: dict = {}

    try:
        wait_for_server(URL)
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/google-chrome",
                headless=True,
                args=[
                    "--use-gl=angle",
                    "--use-angle=swiftshader",
                    "--enable-webgl",
                    "--ignore-gpu-blocklist",
                    "--no-sandbox",
                ],
            )

            # ===================== DESKTOP 1280x800 =====================
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
            page = ctx.new_page()
            page.on("console", lambda m: console_errors.append(f"[desktop] {m.type}: {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda err: page_errors.append(f"[desktop] {err}"))
            page.on("response", lambda r: http_errors.append(f"[desktop] {r.status} {r.url}") if r.status >= 400 else None)

            page.goto(URL, wait_until="domcontentloaded")
            page.wait_for_timeout(1200)
            check_layout_and_assets(page, "desktop_title", issues)
            page.screenshot(path=str(SHOTS / "desktop_01_title.png"))

            # Start new game
            page.get_by_role("button", name="運営を開始する").click()
            page.wait_for_timeout(900)
            check_layout_and_assets(page, "desktop_play", issues)
            report["desktop_fps_swiftshader"] = measure_fps(page)
            page.screenshot(path=str(SHOTS / "desktop_02_city_play.png"))

            # Open Operation List -> click first operation to open full Dispatch Briefing
            page.locator("nav.tactical-dock button", has_text="案件一覧").click()
            page.wait_for_timeout(450)
            first_op = page.locator(".side-drawer .drawer-body button").first
            if first_op.count() > 0:
                first_op.click()
                page.wait_for_timeout(450)
            # Switch to Delegate mode (指示役へ委任) so Himuro executes and may trigger a lie!
            delegate_btn = page.locator(".side-drawer button", has_text="指示役へ委任")
            if delegate_btn.count() > 0:
                delegate_btn.first.click()
                page.wait_for_timeout(250)
            check_layout_and_assets(page, "desktop_ops", issues)
            page.screenshot(path=str(SHOTS / "desktop_03_operation_drawer.png"))

            # Dispatch the delegated op!
            dispatch_btn = page.locator(".side-drawer button", has_text="案件を実行する")
            if dispatch_btn.count() > 0 and dispatch_btn.first.is_enabled():
                dispatch_btn.first.click()
                page.wait_for_timeout(450)
                report["dispatched_op"] = True
            else:
                report["dispatched_op"] = False

            # Open Crew Panel
            page.locator("nav.tactical-dock button", has_text="人員・委任").click()
            page.wait_for_timeout(500)
            check_layout_and_assets(page, "desktop_crew", issues)
            page.screenshot(path=str(SHOTS / "desktop_05_crew_panel.png"))

            # Open Network Graph Modal
            page.locator("nav.tactical-dock button", has_text="関係網").click()
            page.wait_for_timeout(500)
            check_layout_and_assets(page, "desktop_network_graph", issues)
            page.screenshot(path=str(SHOTS / "desktop_04_network_graph.png"))
            page.keyboard.press("Escape")
            page.wait_for_timeout(350)

            # Fast forward to Evening (triggers delegated op completion & report!)
            page.locator("button", has_text="夜へ進む").first.click()
            page.wait_for_timeout(700)
            check_layout_and_assets(page, "desktop_evening", issues)
            page.screenshot(path=str(SHOTS / "desktop_07_evening_report.png"))

            # Proceed to Day 2 (triggers Day 2 autonomous events + reports!)
            page.locator("button", has_text="翌日へ進む").first.click()
            page.wait_for_timeout(700)

            # Open Encrypted Phone Terminal & test Audit / Lie Detection!
            page.locator("nav.tactical-dock button", has_text="暗号端末").click()
            page.wait_for_timeout(500)
            audit_btn = page.locator(".side-drawer button", has_text="裏取り調査")
            if audit_btn.count() > 0 and audit_btn.first.is_enabled():
                audit_btn.first.click()
                page.wait_for_timeout(450)
                report["audited_message"] = True
            else:
                # Select second message if first is system/join message
                msg_items = page.locator(".phone-list button")
                for i in range(min(msg_items.count(), 4)):
                    msg_items.nth(i).click()
                    page.wait_for_timeout(200)
                    if page.locator(".side-drawer button", has_text="裏取り調査").count() > 0:
                        page.locator(".side-drawer button", has_text="裏取り調査").first.click()
                        page.wait_for_timeout(400)
                        report["audited_message"] = True
                        break
            check_layout_and_assets(page, "desktop_phone", issues)
            page.screenshot(path=str(SHOTS / "desktop_06_phone_audit.png"))

            # Close drawer & advance through remaining days to verify Result Dossier ending
            page.keyboard.press("Escape")
            page.wait_for_timeout(250)
            for _ in range(20):
                if page.locator("button", has_text="別の方針で再挑戦").count() > 0:
                    break
                if page.locator("button", has_text="翌日へ進む").count() > 0:
                    page.locator("button", has_text="翌日へ進む").first.click()
                    page.wait_for_timeout(220)
                elif page.locator("button", has_text="夜へ進む").count() > 0:
                    page.locator("button", has_text="夜へ進む").first.click()
                    page.wait_for_timeout(220)
                else:
                    page.wait_for_timeout(220)

            page.wait_for_timeout(500)
            if page.locator("button", has_text="別の方針で再挑戦").count() > 0:
                check_layout_and_assets(page, "desktop_result", issues)
                page.screenshot(path=str(SHOTS / "desktop_08_result_dossier.png"))
                report["ending_reached"] = True
            else:
                issues.append("[desktop_result] Did not reach ResultDossier")
                report["ending_reached"] = False

            ctx.close()

            # ===================== MOBILE 390x844 =====================
            mctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                device_scale_factor=2,
                has_touch=True,
                is_mobile=True,
            )
            mpage = mctx.new_page()
            mpage.on("console", lambda m: console_errors.append(f"[mobile] {m.type}: {m.text}") if m.type == "error" else None)
            mpage.on("pageerror", lambda err: page_errors.append(f"[mobile] {err}"))
            mpage.on("response", lambda r: http_errors.append(f"[mobile] {r.status} {r.url}") if r.status >= 400 else None)

            mpage.goto(URL, wait_until="domcontentloaded")
            mpage.wait_for_timeout(900)
            check_layout_and_assets(mpage, "mobile_title", issues)
            mpage.screenshot(path=str(SHOTS / "mobile_01_title.png"))

            mpage.get_by_role("button", name="運営を開始する").click()
            mpage.wait_for_timeout(800)
            check_layout_and_assets(mpage, "mobile_play", issues)
            mpage.screenshot(path=str(SHOTS / "mobile_02_play.png"))

            mpage.locator("nav.tactical-dock button", has_text="案件一覧").click()
            mpage.wait_for_timeout(500)
            check_layout_and_assets(mpage, "mobile_drawer", issues)
            mpage.screenshot(path=str(SHOTS / "mobile_03_drawer.png"))

            mctx.close()
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except Exception:
            server.kill()

    report["console_errors"] = console_errors
    report["page_errors"] = page_errors
    report["http_errors"] = http_errors
    report["issues"] = issues
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if (console_errors or page_errors or http_errors or issues) else 0


if __name__ == "__main__":
    sys.exit(main())
