"""Exercise real private quote flows at a project subpath using runner Chrome."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = ROOT / 'browser-checks'
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / 'dist', Path(temporary) / 'renewalbench')
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
                page = browser.new_page(viewport={'width': 1440, 'height': 1080})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/renewalbench/')
                expect(page.locator('#results')).to_be_visible()
                assert page.locator('#comparison-table tbody tr').count() == 2
                assert page.evaluate("localStorage.getItem('coolcode:renewalbench:workspace')") is None
                page.locator('[name=horizonMonths]').fill('48')
                expect(page.locator('#results')).to_be_hidden()
                page.locator('#calculate').click()
                expect(page.locator('#status')).to_contain_text('after its quoted term')
                page.locator('[name=horizonMonths]').fill('36')
                page.locator('#add-quote').click()
                offer = page.locator('.quote').nth(2)
                offer.locator('[name=name]').fill('<img src=x onerror=alert(1)>')
                offer.locator('[name=annualRate]').fill('4.12')
                page.locator('#add-lump').click()
                page.locator('#lumps [name=amount]').fill('1000')
                page.locator('#calculate').click()
                expect(page.locator('#results')).to_be_visible()
                assert page.locator('#comparison-table tbody tr').count() == 3
                assert page.locator('img').count() == 0
                page.locator('#save').click()
                expect(page.locator('#storage-status')).to_contain_text('Saved on this browser')
                page.locator('#example').click()
                assert page.locator('.quote').count() == 2
                page.locator('#load').click()
                assert page.locator('.quote').count() == 3
                page.locator('#calculate').click()
                with page.expect_download() as dl:
                    page.locator('#export').click()
                data_path = Path(temporary) / 'workspace.json'
                dl.value.save_as(data_path)
                exported = json.loads(data_path.read_text())
                assert len(exported['quotes']) == 3
                page.locator('#example').click()
                page.locator('#import').set_input_files(data_path)
                expect(page.locator('#storage-status')).to_contain_text('Workspace imported')
                assert page.locator('.quote').count() == 3
                bad = Path(temporary) / 'invalid.json'
                bad.write_text('{"schema":"bad"}')
                page.locator('#import').set_input_files(bad)
                expect(page.locator('#storage-status')).to_contain_text('Import rejected')
                assert page.locator('.quote').count() == 3
                page.locator('#calculate').click()
                with page.expect_download() as dl:
                    page.locator('#report').click()
                assert dl.value.suggested_filename.endswith('.txt')
                page.screenshot(path=str(screenshots / 'desktop.png'), full_page=True)
                page.locator('[data-view=schedule]').click()
                expect(page.locator('#schedule-content')).to_be_visible()
                assert page.locator('#schedule-body tr').count() == 37
                page.locator('#schedule-quote').select_option('2')
                with page.expect_download() as dl:
                    page.locator('#download-csv').click()
                csv_path = Path(temporary) / 'schedule.csv'
                dl.value.save_as(csv_path)
                assert 'Amount owing CAD' in csv_path.read_text()
                page.locator('#forget').click()
                assert page.evaluate("localStorage.getItem('coolcode:renewalbench:workspace')") is None
                page.set_viewport_size({'width': 390, 'height': 844})
                for view in ['schedule', 'method', 'compare']:
                    page.locator(f'[data-view={view}]').click()
                    page.screenshot(path=str(screenshots / f'mobile-{view}.png'), full_page=True)
                    overflow = page.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,20)")
                    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), (view, overflow)
                page.screenshot(path=str(screenshots / 'mobile.png'), full_page=True)
                assert not errors, errors
                browser.close()
            print('Browser checks passed: quotes, validation, lumps, save/load, JSON/CSV/report, safe text, all mobile views')
        finally:
            server.shutdown()


if __name__ == '__main__':
    main()
