from playwright.sync_api import sync_playwright
import json
from pathlib import Path

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge',headless=True)
    errors=[]
    for width,height in [(1440,900),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<500,device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        page.goto('http://127.0.0.1:5192/?capturas',wait_until='networkidle')
        page.wait_for_function("window.__co2?.state().autoplay === 'libre'")
        page.wait_for_timeout(600)
        point=page.evaluate('''()=>{const {scene,THREE}=__co2.stage.three;const bag=scene.getObjectByName('papayo');const p=bag.localToWorld(new THREE.Vector3(0,.1,0)).project(__co2.director.getActiveCamera());return {x:(p.x+1)/2*innerWidth,y:(1-p.y)/2*innerHeight}}''')
        old_scroll=page.evaluate('scrollY')
        if width<500: page.touchscreen.tap(point['x'],point['y'])
        else: page.mouse.click(point['x'],point['y'])
        page.wait_for_function("!document.getElementById('producto').hidden && window.__co2ui.producto.state()")
        page.wait_for_timeout(700)
        assert page.locator('#producto-titulo').text_content()=='Papayo'
        page.screenshot(path=f'debug/product-front-{width}.png')
        page.locator('[data-vista="reverso"]').click();page.wait_for_timeout(1100)
        assert abs(page.evaluate('__co2ui.producto.state().yaw')-3.14159)<.03
        page.screenshot(path=f'debug/product-back-{width}.png')
        page.locator('[data-vista="frente"]').click();page.wait_for_timeout(700)
        page.locator('[data-abrir]').click();page.wait_for_timeout(1100)
        assert page.evaluate('__co2ui.producto.state().opened')>.99
        page.screenshot(path=f'debug/product-open-{width}.png')
        box=page.locator('.producto-canvas').bounding_box()
        page.mouse.move(box['x']+box['width']*.4,box['y']+box['height']*.5)
        page.mouse.down();page.mouse.move(box['x']+box['width']*.6,box['y']+box['height']*.6,steps=12);page.mouse.up()
        page.wait_for_timeout(600)
        assert abs(page.evaluate('__co2ui.producto.state().yaw'))>.2
        page.locator('[data-abrir]').click();page.wait_for_timeout(1000)
        assert page.evaluate('__co2ui.producto.state().opened')<.01
        page.keyboard.press('Escape');page.wait_for_timeout(650)
        assert not page.locator('#producto').is_visible()
        assert abs(page.evaluate('scrollY')-old_scroll)<3
        page.evaluate('()=>__co2.go(__co2.map.anclas.tienda)');page.wait_for_timeout(600)
        page.locator('#pestana-geisha').click()
        page.locator('#ficha-geisha .boton-explorar').click()
        page.wait_for_function("!document.getElementById('producto').hidden && window.__co2ui.producto.state()")
        assert page.locator('#producto-titulo').text_content()=='Geisha'
        page.locator('.producto-cerrar').click();page.wait_for_timeout(650)
        if width>500:
            page.evaluate('()=>__co2.go(5)');page.wait_for_timeout(600)
            page.screenshot(path='debug/lighting-soft.png')
        page.close()
        print(f'{width}px: clic real, giro, reverso, apertura/cierre, Escape y Geisha correctos',flush=True)
    browser.close()
    assert not errors,errors
Path('debug/product-verification.json').write_text(json.dumps({'errors':errors,'passed':['1440px','390px','raycast','drag','back','open-close','Escape-scroll','selected-lot']},indent=2),encoding='utf-8')
