import math, subprocess, os, sys
OUT=sys.argv[1]; Z=14
LAT0, LON0 = -42.8826, 147.3290
def tx(lon): return (lon+180)/360*2**Z
def ty(lat): return (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**Z
x0,x1=int(tx(146.94)),int(tx(147.72)); y0,y1=int(ty(-42.59)),int(ty(-43.18))
urls=[]
KX=math.cos(math.radians(LAT0))*111195; KN=111195
for x in range(x0,x1+1):
    for y in range(y0,y1+1):
        # tile centre distance from GPO
        lon=(x+0.5)/2**Z*360-180; lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*(y+0.5)/2**Z))))
        if math.hypot((lon-LON0)*KX,(lat-LAT0)*KN)>32500: continue
        f=f'{OUT}/s_{x}_{y}.jpg'
        if not os.path.exists(f) or os.path.getsize(f)<500:
            urls.append((f,f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{Z}/{y}/{x}.jpg'))
print('fetch',len(urls),'range',x0,x1,y0,y1)
open(OUT+'/cfg.txt','w').write(''.join(f'url = "{u}"\noutput = "{f}"\n' for f,u in urls))
if urls: subprocess.run(['curl','-sS','-m','600','--retry','3','--parallel','--parallel-max','8','-K',OUT+'/cfg.txt'])
print('have',len([f for f in os.listdir(OUT) if f.endswith('.jpg')]))
