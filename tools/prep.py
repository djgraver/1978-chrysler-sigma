import json, math, sys, struct, glob, os
import numpy as np
from PIL import Image
RAW, OUT = sys.argv[1], sys.argv[2]
LAT0, LON0, R = -42.8826, 147.3290, 6371000.0
KX = math.cos(math.radians(LAT0))*R*math.pi/180; KN = R*math.pi/180
RAD = 30000.0; HALF = 30720.0; CELL = 40.0; N = int(2*HALF/CELL)+1
# ---------- DEM ----------
Z=12
fs=glob.glob(RAW+'/t_*.png'); xs=sorted({int(os.path.basename(f).split('_')[1]) for f in fs}); ys=sorted({int(os.path.basename(f).split('_')[2][:-4]) for f in fs})
mos=np.zeros((len(ys)*256,len(xs)*256),np.float32)
for f in fs:
    b=os.path.basename(f)[:-4].split('_'); x,y=int(b[1]),int(b[2])
    a=np.asarray(Image.open(f).convert('RGB'),np.float32)
    mos[(y-ys[0])*256:(y-ys[0]+1)*256,(x-xs[0])*256:(x-xs[0]+1)*256]=a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768
gx=(np.arange(N)*CELL-HALF); gz=(np.arange(N)*CELL-HALF)        # x east, z south
lon=LON0+gx/KX; lat=LAT0-gz/KN
px=((lon+180)/360*2**Z-xs[0])*256-0.5
py=((1-np.arcsinh(np.tan(np.radians(lat)))/math.pi)/2*2**Z-ys[0])*256-0.5
PX,PY=np.meshgrid(px,py)
x0=np.floor(PX).astype(int); y0=np.floor(PY).astype(int); fx=PX-x0; fy=PY-y0
dem=(mos[y0,x0]*(1-fx)*(1-fy)+mos[y0,x0+1]*fx*(1-fy)+mos[y0+1,x0]*(1-fx)*fy+mos[y0+1,x0+1]*fx*fy)
print('dem',dem.shape,dem.min(),dem.max(),(dem<-60).sum()); dem=np.clip(dem,-30,None)
v=np.clip(np.round((dem+500)*4),0,65535).astype(np.uint16)
img=np.zeros((N,N,3),np.uint8); img[:,:,0]=v>>8; img[:,:,1]=v&255
Image.fromarray(img).save(OUT+'/terrain.png',optimize=True)
print('terrain.png',os.path.getsize(OUT+'/terrain.png'))
# ---------- roads ----------
els=json.load(open(RAW+'/roads.json'))['elements']
CLS={'motorway':0,'trunk':1,'primary':2,'secondary':3,'tertiary':4,'unclassified':5,'residential':6,'living_street':7}
WID=[8.0,8.0,9.0,8.0,7.5,6.5,6.5,5.5]; SPD=[100,90,70,60,50,50,50,20]
ways=[]; use={}
for e in els:
    if e['type']!='way': continue
    t=e.get('tags',{})
    if t.get('area')=='yes' or t.get('access') in ('private','no'): continue
    hw=t['highway']; link=hw.endswith('_link'); c=CLS[hw[:-5] if link else hw]
    pts=[]
    for g in e['geometry']:
        nid=(round(g['lat']*1e7),round(g['lon']*1e7))
        x=(g['lon']-LON0)*KX; z=-(g['lat']-LAT0)*KN
        pts.append((nid,x,z))
    ow=t.get('oneway'); one= ow in ('yes','1','true') or hw=='motorway' or t.get('junction')=='roundabout'
    if ow=='-1': pts.reverse(); one=True
    lanes=None
    try: lanes=int(t.get('lanes','').split(';')[0])
    except: pass
    w=WID[c]
    if link: w=5.5
    elif lanes: w=min(16,max(4.5,lanes*3.3+0.8))
    elif one and c<=2: w=7.4
    sp=SPD[c]
    try: sp=int(t.get('maxspeed','').split()[0])
    except: pass
    if link: sp=min(sp,60)
    fl=(1 if one else 0)|(2 if t.get('bridge') not in (None,'no') else 0)|(4 if t.get('tunnel') not in (None,'no') else 0)|(8 if link else 0)|(16 if t.get('junction')=='roundabout' else 0)
    # split at the 30 km circle
    run=[]
    for p in pts+[None]:
        if p is not None and math.hypot(p[1],p[2])<=RAD: run.append(p)
        else:
            if len(run)>=2: ways.append((run,c,w,sp,fl,t.get('name') or t.get('ref') or ''))
            run=[]
for run,*_ in ways:
    for i,p in enumerate(run):
        use[p[0]]=use.get(p[0],0)+(2 if i in (0,len(run)-1) else 1)
def dp(pts,tol):
    keep=[False]*len(pts); keep[0]=keep[-1]=True; st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop()
        if b<=a+1: continue
        ax,az=pts[a][1],pts[a][2]; bx,bz=pts[b][1],pts[b][2]; dx,dz=bx-ax,bz-az; L=math.hypot(dx,dz) or 1e-9
        m=-1;mi=-1
        for i in range(a+1,b):
            d=abs((pts[i][1]-ax)*dz-(pts[i][2]-az)*dx)/L
            if d>m: m=d;mi=i
        if m>tol: keep[mi]=True; st.append((a,mi)); st.append((mi,b))
    return [p for p,k in zip(pts,keep) if k]
vid={}; edges=[]; names={'':0}; nameList=['']
for run,c,w,sp,fl,nm in ways:
    cut=[0]+[i for i in range(1,len(run)-1) if use[run[i][0]]>=2]+[len(run)-1]
    for a,b in zip(cut[:-1],cut[1:]):
        seg=dp(run[a:b+1],0.6)
        L=sum(math.hypot(seg[i+1][1]-seg[i][1],seg[i+1][2]-seg[i][2]) for i in range(len(seg)-1))
        if L<0.5: continue
        va=vid.setdefault(seg[0][0],len(vid)); vb=vid.setdefault(seg[-1][0],len(vid))
        if nm not in names: names[nm]=len(nameList); nameList.append(nm)
        edges.append((va,vb,seg,c,w,sp,fl,names[nm],L))
E=len(edges); print('edges',E,'verts',len(vid),'names',len(nameList),'km',sum(e[8] for e in edges)/1000)
A=np.array([e[0] for e in edges],np.uint32); B=np.array([e[1] for e in edges],np.uint32)
NP=np.array([len(e[2]) for e in edges],np.uint16); P0=np.zeros(E,np.uint32)
X0=np.zeros(E,np.int32); Z0=np.zeros(E,np.int32); deltas=[]
k=0
for i,e in enumerate(edges):
    q=[(int(round(p[1]*10)),int(round(p[2]*10))) for p in e[2]]
    X0[i],Z0[i]=q[0]; P0[i]=k
    for j in range(1,len(q)):
        dx,dz=q[j][0]-q[j-1][0],q[j][1]-q[j-1][1]
        assert abs(dx)<32768 and abs(dz)<32768
        deltas+= [dx,dz]; k+=1
D=np.array(deltas,np.int16)
W=np.array([int(round(e[4]*10)) for e in edges],np.uint8); C=np.array([e[3] for e in edges],np.uint8)
F=np.array([e[6] for e in edges],np.uint8); S=np.array([min(255,e[5]) for e in edges],np.uint8); NM=np.array([e[7] for e in edges],np.uint16)
secs=[('A',A),('B',B),('P0',P0),('X0',X0),('Z0',Z0),('D',D),('NP',NP),('NM',NM),('W',W),('C',C),('F',F),('S',S)]
hdr={'E':E,'V':len(vid),'M':k,'names':nameList,'sec':{}}
off=0
for n,a in secs:
    hdr['sec'][n]=[off,a.size]; off+=a.nbytes; off+=(-off)%4
hb=json.dumps(hdr,ensure_ascii=False,separators=(',',':')).encode(); hb+=b' '*((-len(hb))%4)
with open(OUT+'/roads.bin','wb') as f:
    f.write(struct.pack('<I',len(hb))); f.write(hb)
    for n,a in secs:
        f.write(a.tobytes()); f.write(b'\0'*((-a.nbytes)%4))
print('roads.bin',os.path.getsize(OUT+'/roads.bin'),'points',k+E)
