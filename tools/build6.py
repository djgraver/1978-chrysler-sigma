import re, shutil, glob
S='/tmp/claude-0/-home-claude/3c6accd4-a5e1-5a61-990c-b3b8de5bdc1a/scratchpad/'
car=open(S+'v2/car.js').read().split('\n')
a=next(i for i,l in enumerate(car) if 'small maths helpers' in l); b=next(i for i,l in enumerate(car) if '---------- ground ----------' in l)
model='\n'.join(car[a:b])
assert 'scene.add(car);' in model
model=model.replace('  scene.add(car);\n','')
old="  makeWheel(AX_F, TRACK_F / 2, 1); makeWheel(AX_F, -TRACK_F / 2, -1);\n  makeWheel(AX_R, TRACK_R / 2, 1); makeWheel(AX_R, -TRACK_R / 2, -1);"
assert old in model
model=model.replace(old,"  var WHEELS = [makeWheel(AX_F, TRACK_F / 2, 1), makeWheel(AX_F, -TRACK_F / 2, -1), makeWheel(AX_R, TRACK_R / 2, 1), makeWheel(AX_R, -TRACK_R / 2, -1)];")
k="var lensMat = new THREE.MeshStandardMaterial({ map: lensTexture()"
assert model.count(k)==1
model=model.replace(k,"var lensMat = SIG_LENS = new THREE.MeshStandardMaterial({ map: lensTexture()")
k2="var sw = add(new THREE.TorusGeometry(0.185"
assert model.count(k2)==1
model=model.replace(k2,"var sw = SIG_SW = add(new THREE.TorusGeometry(0.185")
for bad in ('scene.','renderer.','stage.','camera.'):
    assert bad not in model, bad
model='  function buildSigma() {\n    var SIG_LENS = null, SIG_SW = null;\n'+model+'\n    return { group: car, wheels: WHEELS, tyreR: TYRE_R, axF: AX_F, axR: AX_R, lens: SIG_LENS, tail: redLens, sw: SIG_SW };\n  }\n'
parts=[open(f).read() for f in sorted(glob.glob(S+'sim/src6/*.js'))]
js=parts[0]+'\n'+model+'\n'+''.join(parts[1:])
head=open(S+'sim/src6/head.html').read()
libs='<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>\n'
open(S+'sim/site6/sigma.html','w').write(head+libs+js+'</script>\n')
t=re.sub(r'<link[^>]*>\n','',head)
open(S+'sim/site6/test.html','w').write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n'+t+'<script src="three.min.js"></script>\n<script>\n'+js+'</script>\n')
open(S+'sim/site6/page.js','w').write(js)
shutil.copy(S+'shots/three.min.js',S+'sim/site6/three.min.js')
