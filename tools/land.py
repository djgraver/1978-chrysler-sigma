import numpy as np, math, sys
from PIL import Image
RAW,OUT=sys.argv[1],sys.argv[2]
LAT0, LON0, R = -42.8826, 147.3290, 6371000.0
KX = math.cos(math.radians(LAT0))*R*math.pi/180; KN = R*math.pi/180
HALF=30720.0; Z=14; X0,Y0=14879,10338
M=np.load(RAW+'/s2mosaic.npy')
def sample(xs, zs):
    lon=LON0+xs/KX; lat=LAT0-zs/KN
    px=((lon+180)/360*2**Z-X0)*256-0.5
    py=((1-np.arcsinh(np.tan(np.radians(lat)))/math.pi)/2*2**Z-Y0)*256-0.5
    PX,PY=np.meshgrid(px,py)
    x0=np.clip(np.floor(PX).astype(int),0,M.shape[1]-2); y0=np.clip(np.floor(PY).astype(int),0,M.shape[0]-2); fx=(PX-x0)[...,None]; fy=(PY-y0)[...,None]
    m=M.astype(np.float32) if False else M
    a=m[y0,x0].astype(np.float32); b=m[y0,x0+1].astype(np.float32); c=m[y0+1,x0].astype(np.float32); d=m[y0+1,x0+1].astype(np.float32)
    return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy
# DEM at 40m from the existing terrain.png
T=np.asarray(Image.open(sys.argv[3]).convert('RGB')).astype(np.int32); DEM=((T[:,:,0]<<8)|T[:,:,1])/4.0-500
DN=DEM.shape[0]
N=3073; CELL=20.0
g=np.arange(N)*CELL-HALF
land=np.zeros((N,N,3),np.uint8); col=np.zeros((DN,DN,3),np.float32)
for r0 in range(0,N,256):
    r1=min(N,r0+256)
    # 10 m samples: 2x2 per 20 m cell
    xs=np.arange(N*2)*10.0-HALF-5; zs=np.arange(r0*2,r1*2)*10.0-HALF-5
    C=sample(xs,zs)                                   # (rows, cols, 3)
    r,gg,b=C[...,0],C[...,1],C[...,2]; lum=0.3*r+0.55*gg+0.15*b
    # dem at these points
    fx=np.clip((xs+HALF)/40,0,DN-1.001); fz=np.clip((zs+HALF)/40,0,DN-1.001)
    FX,FZ=np.meshgrid(fx,fz); ix=FX.astype(int); iz=FZ.astype(int); tx=FX-ix; tz=FZ-iz
    h=(DEM[iz,ix]*(1-tx)+DEM[iz,ix+1]*tx)*(1-tz)+(DEM[iz+1,ix]*(1-tx)+DEM[iz+1,ix+1]*tx)*tz
    blank=(r+gg+b)<3
    water=((h<2.0)&~((r>b+6)&(lum>40))) | ((h<12)&(lum<38)&(b>=r-2)&(gg<r+18)) | (blank&(h<1))
    green=gg-0.5*(r+b)                                # olive/green excess
    canopy=np.clip((92-lum)/48,0,1)*np.clip((green+6)/14,0,1)*np.clip((r+gg+b-30)/30,0,1)
    canopy[water|blank]=0; canopy[(r>gg+12)]*=0.25    # brown paddocks
    def pool(a): return a.reshape(a.shape[0]//2,2,a.shape[1]//2,2).mean(axis=(1,3))
    rows=r1-r0
    land[r0:r1,:,0]=np.round(np.clip(pool(canopy[:rows*2,:N*2]),0,1)*15).astype(np.uint8)*17
    land[r0:r1,:,1]=(pool(water[:rows*2,:N*2].astype(np.float32))>0.5)*255
print('canopy mean',land[:,:,0].mean()/255,'water frac',(land[:,:,1]>0).mean())
Image.fromarray(land).save(OUT+'/land.png',optimize=True)
# ground colour at the DEM grid, 40 m
xs=np.arange(DN)*40.0-HALF; zs=np.arange(DN)*40.0-HALF
G=np.zeros((DN,DN,3),np.float32)
for r0 in range(0,DN,256):
    G[r0:r0+256]=sample(xs,zs[r0:r0+256])
Image.fromarray(np.clip(G,0,255).astype(np.uint8)).save(OUT+'/ground.jpg',quality=82)
prev=land.copy(); prev[:,:,2]=0
Image.fromarray(prev[::4,::4]).save(RAW+'/land_preview.png')
import os; print(os.path.getsize(OUT+'/land.png'),os.path.getsize(OUT+'/ground.jpg'))
