import math, subprocess, os, sys
OUT=sys.argv[1]; Z=12
def tx(lon): return (lon+180)/360*2**Z
def ty(lat): return (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**Z
x0,x1=int(tx(146.94)),int(tx(147.72)); y0,y1=int(ty(-42.59)),int(ty(-43.18))
print(x0,x1,y0,y1,(x1-x0+1)*(y1-y0+1))
urls=[]
for x in range(x0,x1+1):
    for y in range(y0,y1+1):
        f=f'{OUT}/t_{x}_{y}.png'
        if not os.path.exists(f) or os.path.getsize(f)<200:
            urls.append((f,f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'))
cfg=''.join(f'url = "{u}"\noutput = "{f}"\n' for f,u in urls)
open(OUT+'/cfg.txt','w').write(cfg)
if urls: subprocess.run(['curl','-sS','-m','240','--parallel','--parallel-max','6','-K',OUT+'/cfg.txt'])
print('missing',sum(1 for f,u in urls if not os.path.exists(f)))
