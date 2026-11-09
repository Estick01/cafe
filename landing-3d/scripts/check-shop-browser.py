from playwright.sync_api import sync_playwright
from pathlib import Path
import json
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True)
 errors=[]
 for w,h in [(1440,900),(390,844)]:
  page=b.new_page(viewport={'width':w,'height':h},has_touch=w<500,device_scale_factor=1)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  page.goto('http://127.0.0.1:5192/?capturas',wait_until='networkidle')
  page.wait_for_function('window.__co2')
  page.evaluate('()=>__co2.go(__co2.map.anclas.tienda)');page.wait_for_timeout(600)
  names="()=>__co2.stage.three.scene.getObjectByName('vitrina').children.filter(o=>['papayo','bourbon-amarillo','pacamara-rojo','geisha'].includes(o.name)&&o.visible).map(o=>o.name)"
  assert page.evaluate(names)==['papayo']
  page.locator('#pestana-geisha').click();page.wait_for_timeout(220)
  assert page.evaluate('__co2.director.shopInteraction().active')
  assert len(page.evaluate(names))==1
  page.wait_for_timeout(1000)
  assert page.evaluate(names)==['geisha']
  surface=page.locator('[data-shop-drag]');box=surface.bounding_box()
  assert box and box['width']>0
  x=box['x']+box['width']/2;y=box['y']+box['height']/2
  before=page.evaluate('__co2.director.shopInteraction().yaw');sy=page.evaluate('scrollY')
  if w<500:
   cdp=page.context.new_cdp_session(page)
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
   for i in range(1,7):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+i*7,'y':y+i*2}]})
   cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  else:
   page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+65,y+20,steps=10);page.mouse.up()
  page.wait_for_timeout(250)
  assert abs(page.evaluate('__co2.director.shopInteraction().yaw')-before)>.2
  assert abs(page.evaluate('scrollY')-sy)<3
  assert page.locator('#producto').is_hidden()
  surface.focus();page.keyboard.press('Home');page.wait_for_timeout(100)
  assert abs(page.evaluate('__co2.director.shopInteraction().yaw')-.15)<.001
  beans="()=>__co2.stage.three.scene.getObjectByName('vitrina').children.filter(o=>o.geometry?.type==='SphereGeometry').map(o=>o.position.y)"
  first=page.evaluate(beans);page.wait_for_timeout(450);second=page.evaluate(beans)
  assert first and first!=second
  page.evaluate('()=>__co2.go(__co2.map.total)');page.wait_for_timeout(200)
  first=page.evaluate(beans);page.wait_for_timeout(500);assert first!=page.evaluate(beans)
  assert abs(page.evaluate('__co2.state().G-__co2.map.total'))<.02
  page.evaluate('()=>__co2.go(__co2.map.anclas.tienda)');page.wait_for_timeout(300)
  page.screenshot(path=f'debug/shop-single-{w}.png')
  page.locator('#pestana-papayo').click();page.wait_for_timeout(100);page.locator('#pestana-bourbon-amarillo').click();page.wait_for_timeout(100);page.locator('#pestana-geisha').click();page.wait_for_timeout(1100)
  assert page.evaluate(names)==['geisha']
  page.locator('#ficha-geisha .boton-explorar').click();page.wait_for_function('window.__co2ui.producto.state()');page.wait_for_timeout(900)
  assert page.locator('#producto-titulo').text_content()=='Geisha'
  page.locator('.producto-cerrar').click();page.wait_for_timeout(600)
  print(f'{w}px: un producto, cambio con giro, arrastre, granos continuos y visor OK',flush=True)
  page.close()
 b.close()
assert not errors,errors
Path('debug/shop-verification.json').write_text(json.dumps({'passed':True,'errors':errors}),encoding='utf-8')
