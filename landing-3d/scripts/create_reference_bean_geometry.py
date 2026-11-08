import bpy, math, json
import numpy as np
from pathlib import Path

OUT = Path(r'C:/Users/ccsb1/OneDrive/Escritorio/cafe-3d/landing-3d/production/coffee-bean-reference')
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
assert set(o.name for o in scene.objects) <= {'Cube', 'Camera', 'Light'}, 'Expected isolated factory scene'
for o in list(scene.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene.name = 'Coffee bean - reference reconstruction'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 0.004
scene.unit_settings.length_unit = 'MILLIMETERS'
collection = bpy.data.collections.new('COL-coffee_bean')
scene.collection.children.link(collection)

# A single closed surface: broad back, narrow asymmetric cleft on the front.
N, M = 320, 512
lat = np.linspace(0, np.pi, N + 1)[1:-1, None]
theta = np.linspace(-np.pi, np.pi, M, endpoint=False)[None, :]
t = np.cos(lat) + np.zeros_like(theta)
r = np.sin(lat)**0.78 + np.zeros_like(theta)
th = theta + np.zeros_like(lat)
z = 1.6*t
width = 0.99*(1 - 0.045*t + 0.025*np.sin(3*t))
x = width*r*np.sin(th)
x *= 1 + 0.045*np.sin(th) + 0.018*np.sin(3*th + 2*t)
x += 0.035*t + 0.025*np.sin(3*t)
y = -r*np.cos(th)*(0.61 - 0.09*np.cos(th))

# Curving central cleft; independently varying width and depth.
center = 0.055*np.sin(4*t) + 0.03*np.sin(9*t+0.7) + 0.035*t
d = th - center
w = 0.125 + 0.025*np.sin(5*t+0.6) + 0.012*np.sin(13*t)
core = np.exp(-(d/w)**4)
shoulder = np.exp(-(d/(w*1.85))**2)
y += r*(0.31*core + 0.16*shoulder)
fold = np.sin(45*t + 8*np.sin(9*t) + d*30)*np.sin(13*t-d*25)
y += 0.024*r*core*fold
x += 0.016*r*core*np.sin(36*t + 3*np.sin(11*t))

# Small irregularities preserve the recognizable outline without a lumpy silhouette.
noise = (np.sin(x*17+z*11+y*19)*np.sin(z*23-y*13)
         + 0.45*np.sin(x*39-y*31+z*24)*np.sin(z*33+x*28))
amount = 0.0025*noise*r
x += amount*np.sin(th)
y -= amount*np.cos(th)
z += amount*t

# Reference landmarks: top branches and two short lower side fissures.
paths = [
    [(0.04,1.31),(0.24,1.29),(0.46,1.35),(0.64,1.31)],
    [(0.03,1.31),(-0.11,1.42),(-0.15,1.56)],
    [(-0.07,1.22),(-0.26,1.32),(-0.37,1.43)],
    [(-0.08,-0.82),(-0.26,-0.78),(-0.45,-0.86)],
    [(0.08,-1.12),(0.30,-1.04),(0.51,-1.02),(0.60,-0.96)],
    [(0.03,-1.41),(0.12,-1.51),(0.11,-1.59)],
]
crack = np.zeros_like(x)
for path in paths:
    for a,b in zip(path[:-1], path[1:]):
        ax,az=a; bx,bz=b
        u=np.clip(((x-ax)*(bx-ax)+(z-az)*(bz-az))/((bx-ax)**2+(bz-az)**2),0,1)
        dist=np.sqrt((x-(ax+u*(bx-ax)))**2+(z-(az+u*(bz-az)))**2)
        crack=np.maximum(crack,np.exp(-(dist/0.012)**2))
front=np.clip(np.cos(th),0,1)**8
crack *= front
y += 0.035*crack
dark=np.clip(0.78*core + 0.65*crack,0,1)
coords=np.stack((x,y,z+1.62),axis=-1).reshape(-1,3)
verts=coords.tolist()+[[0.035,0,3.22],[-0.035,0,0.02]]
top,bottom=len(verts)-2,len(verts)-1
faces=[]
for j in range(N-2):
    for k in range(M):
        a=j*M+k; b=j*M+(k+1)%M
        faces.append((a,b,b+M,a+M))
for k in range(M):
    kn=(k+1)%M
    faces.append((top,kn,k))
    a=(N-2)*M
    faces.append((bottom,a+k,a+kn))
mesh=bpy.data.meshes.new('GEO-coffee_bean_surface')
mesh.from_pydata(verts,[],faces)
mesh.update()
obj=bpy.data.objects.new('GEO-coffee_bean',mesh)
collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj
obj.select_set(True)
# Recalculate normals so pole caps and ring strips share an outward convention.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
for p in mesh.polygons: p.use_smooth=True
attr=mesh.attributes.new('RoastCleft','FLOAT','POINT')
attr.data.foreach_set('value',np.concatenate((dark.ravel(),[0.55,0.55])).astype(np.float32))
obj['reference_source']='User photos cafe (1)..(18).png; reconstructed, not original scan'
obj['nominal_length_mm']=12.8
obj['surface']='Closed continuous surface with integrated cleft and fissures'
sub=obj.modifiers.new('Surface refinement','SUBSURF')
sub.levels=1; sub.render_levels=1
bpy.context.view_layer.update()
manifest={'sources':[{'file':f'cafe ({i}).png','role':'render reference' if i<17 else 'texture preview' if i==17 else 'wireframe preview'} for i in range(1,19)],'canonical_front':4,'backend':'official MCP localhost:9877','blender':bpy.app.version_string}
(OUT/'reference_manifest.json').write_text(json.dumps(manifest,indent=2))
result={'vertices':len(mesh.vertices),'faces':len(mesh.polygons),'dimensions':list(obj.dimensions),'output':str(OUT)}
