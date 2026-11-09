import sys
if '--shop' in sys.argv:
    import runpy
    runpy.run_path('scripts/check-shop-browser.py', run_name='__main__')
    raise SystemExit
if '--product' in sys.argv:
    import runpy
    runpy.run_path('scripts/check-product-browser.py', run_name='__main__')
    raise SystemExit
from playwright.sync_api import sync_playwright
import json
from pathlib import Path

BASE = 'http://127.0.0.1:5192/'
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.goto(BASE + '?capturas', wait_until='networkidle')
    page.wait_for_function("window.__co2?.state().autoplay === 'libre'")
    page.wait_for_timeout(800)
    assert page.evaluate('__co2.state().modules.vitrina && __co2.state().modules.inmersion && __co2.state().modules.post')
    assert abs(page.evaluate('__co2.state().G') - 2.4) < .02
    page.screenshot(path='debug/desktop.png')
    results.append('Arranque completo y autoplay entrega el control en G=2.4')
    for g in [2.8, 3.1, 7, 12.8, 13.6, 14.5, 17, 18.6, 22.5]:
        page.evaluate('(g) => __co2.go(g)', g)
        page.wait_for_timeout(450)
        assert abs(page.evaluate('__co2.state().G') - g) < .02
        page.screenshot(path=f'debug/desktop-{g}.png')
    total = page.evaluate('__co2.map.total')
    page.evaluate('(g) => __co2.go(g)', total)
    page.wait_for_timeout(500)
    before = page.evaluate('__co2.state().G')
    page.wait_for_timeout(1300)
    assert abs(page.evaluate('__co2.state().G') - before) < .001
    results.append('Recorrido completo, transiciones y final sin reinicio')
    page.evaluate('() => __co2.go(7)'); page.wait_for_timeout(500)
    assert abs(page.evaluate('__co2.state().G') - 7) < .02
    page.locator('.nav-acciones a[href="#tienda"]').click()
    page.wait_for_timeout(1800)
    page.locator('#pestana-geisha').click()
    assert page.locator('#ficha-geisha').is_visible()
    assert page.evaluate('__co2.director.getSeleccion()') == 3
    href = page.locator('#ficha-geisha .boton--pedir').get_attribute('href')
    assert href.startswith('https://wa.me/573152292036?text=') and 'Geisha' in href
    page.screenshot(path='debug/shop-desktop.png')
    results.append('Scroll reversible, enlace a tienda, selección Geisha y WhatsApp correctos')
    page.locator('#buscar-boton').click()
    page.locator('#buscador-campo').fill('Bourbon')
    page.wait_for_timeout(200)
    assert 'Bourbon' in page.locator('#buscador-resultados').text_content()
    page.locator('#buscador-campo').press('Escape')
    results.append('Buscador encuentra el lote')
    assert not errors, errors
    page.close()
    for width, height in [(390,844), (768,1024)]:
        page = browser.new_page(viewport={'width':width, 'height':height}, device_scale_factor=1, is_mobile=width<500, has_touch=True)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.goto(BASE + '?capturas', wait_until='networkidle')
        page.wait_for_function("window.__co2?.state().autoplay === 'libre'")
        page.wait_for_timeout(500)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=f'debug/mobile-{width}.png')
        page.locator('.nav-acciones a[href="#tienda"]').click(); page.wait_for_timeout(1800)
        page.locator('#pestana-geisha').click()
        page.locator('#ficha-geisha .boton--pedir').scroll_into_view_if_needed()
        page.wait_for_timeout(350)
        assert page.locator('#ficha-geisha .boton--pedir').is_visible()
        rect = page.locator('#ficha-geisha .boton--pedir').bounding_box()
        assert rect['y'] >= 0 and rect['y'] + rect['height'] <= height, rect
        page.screenshot(path=f'debug/shop-{width}.png')
        page.locator('a[data-nav="laboratorio"]').evaluate('(el)=>el.click()')
        page.wait_for_timeout(1800)
        assert page.locator('#laboratorio-titulo').is_visible()
        results.append(f'{width}px sin desbordamiento; selección y pedido accesibles')
        page.close()
    page = browser.new_page(viewport={'width':390,'height':844}, reduced_motion='reduce')
    page.goto(BASE, wait_until='networkidle')
    assert not page.evaluate("document.documentElement.classList.contains('scrub')")
    assert page.locator('#pestana-geisha').is_enabled()
    page.locator('#pestana-geisha').click()
    assert page.locator('#ficha-geisha .boton--pedir').is_visible()
    results.append('Movimiento reducido: catálogo y pedido utilizables sin animación')
    page.screenshot(path='debug/reduced.png')
    page.close()
    browser.close()
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width':1440,'height':900})
    page.goto(BASE+'?capturas&forzar=sinassets',wait_until='networkidle')
    assert page.locator('#precarga-error').is_visible()
    page.locator('#precarga-saltar').click()
    page.wait_for_timeout(900)
    assert not page.evaluate("document.documentElement.classList.contains('scrub')")
    assert page.locator('#pestana-geisha').is_enabled()
    results.append('Fallo de carga: ofrece reintentar y versión estática funcional')
    page.close()
    browser.close()
assert not errors, errors
Path('debug/verification.json').write_text(json.dumps({'passed':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
