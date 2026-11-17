import json, math, sys, struct, glob, os, hashlib
import numpy as np
from PIL import Image
RAW, OUT = sys.argv[1], sys.argv[2]
LAT0, LON0, R = -42.8826, 147.3290, 6371000.0
KX = math.cos(math.radians(LAT0))*R*math.pi/180; KN = R*math.pi/180
RAD = 30000.0; HALF = 30720.0
def loc(lat, lon): return ((lon-LON0)*KX, -(lat-LAT0)*KN)
def pack(path, secs, extra):
    hdr=dict(extra); hdr['sec']={}; off=0
    for n,a in secs:
        hdr['sec'][n]=[off,a.size,str(a.dtype)]; off+=a.nbytes; off+=(-off)%4
    hb=json.dumps(hdr,ensure_ascii=False,separators=(',',':')).encode(); hb+=b' '*((-len(hb))%4)
    blob=struct.pack('<I',len(hb))+hb
    parts=[blob]
    for n,a in secs: parts.append(a.tobytes()); parts.append(b'\0'*((-a.nbytes)%4))
    d=b''.join(parts); d=struct.pack('<I',len(d))+d
    W=1024; rows=-(-len(d)//(3*W)); arr=np.zeros(rows*W*3,np.uint8); arr[:len(d)]=np.frombuffer(d,np.uint8)
    Image.fromarray(arr.reshape(rows,W,3)).save(path,optimize=True)
    print(path, len(d), os.path.getsize(path))
def dp(pts,tol):
    if len(pts)<3: return pts
    keep=[False]*len(pts); keep[0]=keep[-1]=True; st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop()
        if b<=a+1: continue
        ax,az=pts[a][-2],pts[a][-1]; bx,bz=pts[b][-2],pts[b][-1]; dx,dz=bx-ax,bz-az; L=math.hypot(dx,dz) or 1e-9
        m=-1;mi=-1
        for i in range(a+1,b):
            d=abs((pts[i][-2]-ax)*dz-(pts[i][-1]-az)*dx)/L
            if d>m: m=d;mi=i
        if m>tol: keep[mi]=True; st.append((a,mi)); st.append((mi,b))
    return [p for p,k in zip(pts,keep) if k]
def dpring(ring,tol):
    j=max(range(len(ring)),key=lambda i:(ring[i][0]-ring[0][0])**2+(ring[i][1]-ring[0][1])**2)
    if j==0: return ring
    a=dp(ring[:j+1],tol); b=dp(ring[j:]+[ring[0]],tol)
    return a[:-1]+b[:-1]
def chaikin(pts, it=2):
    # keep first and last, cut interior corners; pts are (x,z)
    for _ in range(it):
        if len(pts)<3: return pts
        out=[pts[0]]
        for i in range(len(pts)-1):
            a,b=pts[i],pts[i+1]
            q=(0.75*a[0]+0.25*b[0],0.75*a[1]+0.25*b[1]); r=(0.25*a[0]+0.75*b[0],0.25*a[1]+0.75*b[1])
            if i>0: out.append(q)
            if i<len(pts)-2: out.append(r)
        out.append(pts[-1]); pts=out
    return pts

# ================= ROADS =================
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
        nid=(round(g['lat']*1e7),round(g['lon']*1e7)); x,z=loc(g['lat'],g['lon']); pts.append((nid,x,z))
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
    sw=t.get('sidewalk') or t.get('sidewalk:both') or ''
    swf=0 if sw in ('no','none') else (1 if sw in ('both','left','right','separate','yes') else 2)  # 1 known yes, 2 unknown
    fl=(1 if one else 0)|(2 if t.get('bridge') not in (None,'no') else 0)|(4 if t.get('tunnel') not in (None,'no') else 0)|(8 if link else 0)|(16 if t.get('junction')=='roundabout' else 0)|(32 if swf==1 else 0)|(64 if swf==0 else 0)
    run=[]
    for p in pts+[None]:
        if p is not None and math.hypot(p[1],p[2])<=RAD: run.append(p)
        else:
            if len(run)>=2: ways.append((run,c,w,sp,fl,t.get('name') or t.get('ref') or ''))
            run=[]
for run,*_ in ways:
    for i,p in enumerate(run): use[p[0]]=use.get(p[0],0)+(2 if i in (0,len(run)-1) else 1)
vid={}; edges=[]; names={'':0}; nameList=['']
for run,c,w,sp,fl,nm in ways:
    cut=[0]+[i for i in range(1,len(run)-1) if use[run[i][0]]>=2]+[len(run)-1]
    for a,b in zip(cut[:-1],cut[1:]):
        seg=dp(run[a:b+1],0.4)
        xz=chaikin([(p[1],p[2]) for p in seg], 3 if c>=2 else 2)
        xz=dp(xz,0.15)
        L=sum(math.hypot(xz[i+1][0]-xz[i][0],xz[i+1][1]-xz[i][1]) for i in range(len(xz)-1))
        if L<0.5: continue
        va=vid.setdefault(seg[0][0],len(vid)); vb=vid.setdefault(seg[-1][0],len(vid))
        if nm not in names: names[nm]=len(nameList); nameList.append(nm)
        edges.append((va,vb,xz,c,w,sp,fl,names[nm],L))
E_=len(edges); print('edges',E_,'verts',len(vid),'km',sum(e[8] for e in edges)/1000)
A=np.array([e[0] for e in edges],np.uint32); B=np.array([e[1] for e in edges],np.uint32)
NP=np.array([len(e[2]) for e in edges],np.uint16); P0=np.zeros(E_,np.uint32); X0=np.zeros(E_,np.int32); Z0=np.zeros(E_,np.int32); deltas=[]; k=0
for i,e in enumerate(edges):
    q=[(int(round(p[0]*10)),int(round(p[1]*10))) for p in e[2]]
    X0[i],Z0[i]=q[0]; P0[i]=k
    for j in range(1,len(q)):
        deltas+=[q[j][0]-q[j-1][0],q[j][1]-q[j-1][1]]; k+=1
D=np.array(deltas,np.int16)
W=np.array([int(round(e[4]*10)) for e in edges],np.uint8); C=np.array([e[3] for e in edges],np.uint8)
F=np.array([e[6] for e in edges],np.uint8); SP=np.array([min(255,e[5]) for e in edges],np.uint8); NM=np.array([e[7] for e in edges],np.uint16)
# points: signals and trees
pts=json.load(open(RAW+'/osm/pts.json'))['elements']
sig=[];tre=[]
for p in pts:
    x,z=loc(p['lat'],p['lon'])
    if math.hypot(x,z)>RAD: continue
    t=p.get('tags',{})
    if t.get('natural')=='tree': tre+= [int(round(x*10)),int(round(z*10))]
    elif t.get('highway')=='traffic_signals' or t.get('crossing')=='traffic_signals': sig+=[int(round(x*10)),int(round(z*10))]
SG=np.array(sig,np.int32); TR=np.array(tre,np.int32)
print('signals',len(sig)//2,'trees',len(tre)//2)
pack(OUT+'/roads.png',[('A',A),('B',B),('P0',P0),('X0',X0),('Z0',Z0),('D',D),('NP',NP),('NM',NM),('W',W),('C',C),('F',F),('S',SP),('SG',SG),('TR',TR)],
     {'E':E_,'V':len(vid),'M':k,'names':nameList})

# ================= BUILDINGS =================
M=np.load(RAW+'/s2mosaic.npy'); Z=14; MX0,MY0=14879,10338
def img_rgb(lat,lon):
    px=int(((lon+180)/360*2**Z-MX0)*256); py=int(((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**Z-MY0)*256)
    if 0<=px<M.shape[1] and 0<=py<M.shape[0]: return M[py,px].astype(float)
    return None
def H(*a):
    h=hashlib.md5(('|'.join(map(str,a))).encode()).digest(); return int.from_bytes(h[:4],'little')/2**32
# palettes (sRGB hex); indices are shared with the page
ROOF=['#9b3a2a','#b4523a','#7a3328','#5d6366','#3e4447','#4a5a4c','#6f8a8e','#8c8f8d','#b9bcb8','#a8a194','#6b4a3a','#2f3336','#80553f','#c26a43','#55606b','#3b5a74']
#      0 terracotta 1 light terracotta 2 dark red tile 3 grey iron 4 charcoal 5 green iron 6 pale teal 7 zincalume dull 8 zinc light 9 concrete 10 brown tile 11 black 12 brown 13 orange tile 14 slate 15 blue iron
WALL=['#c9a77a','#b98d5a','#a2593f','#8f4c38','#c7b089','#e9e2d0','#dfe3d4','#cfd9da','#f0e6c8','#d7c3a0','#9c7a5a','#b9b4aa','#e6e1d8','#8a8f93','#6d7376','#7c5a44','#c4ad8e','#a8b4a0']
#      0 sandstone 1 dark sandstone 2 red brick 3 dark brick 4 cream brick 5 white board 6 pale green board 7 pale blue board 8 cream board 9 tan render 10 brown brick 11 grey render 12 white render 13 grey concrete 14 dark glass/concrete 15 liver brick 16 beige brick 17 sage board
def hx(c): return np.array([int(c[i:i+2],16) for i in (1,3,5)],float)
ROOFV=[hx(c) for c in ROOF]
STY={'GEORG':1,'FED':2,'WB':3,'VEN':4,'SHED':5,'IND':6,'CBD':7,'COM':8,'MOD':9,'APT':10,'CHURCH':11}
# roof shapes: 0 flat 1 gabled 2 hipped 3 skillion 4 pyramidal 5 gambrel-ish (half-hip)
STYLEDEF={
 1:dict(roof=[3,14,4,2],wall=[0,1],shape=[2,2,1],pitch=(32,40)),
 2:dict(roof=[0,1,2,13,3],wall=[2,3,15,2],shape=[2,2,5,1],pitch=(28,36)),
 3:dict(roof=[0,5,3,15,2,6],wall=[5,6,7,8,12,17],shape=[1,1,2,5],pitch=(24,32)),
 4:dict(roof=[10,0,4,12,1,3],wall=[4,10,16,2,15,0],shape=[2,2,2,1],pitch=(18,24)),
 5:dict(roof=[7,8,3,0,5],wall=[13,11,7],shape=[1,1,3],pitch=(10,16)),
 6:dict(roof=[7,8,3,9],wall=[13,11,9],shape=[1,1,0],pitch=(5,9)),
 7:dict(roof=[9,4,3],wall=[11,13,14,0,4,12,9,1],shape=[0],pitch=(0,0)),
 8:dict(roof=[9,7,3,4],wall=[11,4,9,12,13],shape=[0,0,1],pitch=(4,8)),
 9:dict(roof=[4,3,11,8],wall=[12,11,13,9],shape=[3,3,0,1],pitch=(6,12)),
 10:dict(roof=[4,10,3,9],wall=[4,10,16,2,11],shape=[2,0,2],pitch=(14,20)),
 11:dict(roof=[14,3,4],wall=[0,1,2],shape=[1],pitch=(42,50)),
}
SHAPE_TAG={'flat':0,'gabled':1,'hipped':2,'skillion':3,'pyramidal':4,'half-hipped':5,'gambrel':5,'mansard':2,'saltbox':1,'side_hipped':2,'round':0,'dome':0,'onion':4}
CNAMES={'red':0,'darkred':2,'brown':12,'grey':3,'gray':3,'darkgrey':4,'darkgray':4,'black':11,'green':5,'darkgreen':5,'blue':15,'white':8,'silver':8,'orange':13}
recs=[]; seen=set(); bpS=(-42.8895,147.3330)
for f in sorted(glob.glob(RAW+'/osm/b_*.json')):
    for e in json.load(open(f))['elements']:
        if e['type']!='way' or e['id'] in seen or 'geometry' not in e: continue
        seen.add(e['id'])
        t=e.get('tags',{}); bt=t.get('building','yes')
        if bt in ('no','construction','ruins','collapsed'): continue
        g=e['geometry']
        if len(g)<4: continue
        ring=[loc(p['lat'],p['lon']) for p in g]
        if ring[0]==ring[-1]: ring=ring[:-1]
        cx=sum(p[0] for p in ring)/len(ring); cz=sum(p[1] for p in ring)/len(ring)
        rc=math.hypot(cx,cz)
        if rc>RAD-50: continue
        # signed area in map orientation (x east, north = -z)
        a2=sum(ring[i][0]*(-ring[(i+1)%len(ring)][1])-ring[(i+1)%len(ring)][0]*(-ring[i][1]) for i in range(len(ring)))
        if a2<0: ring=ring[::-1]
        area=abs(a2)/2
        if area<9: continue
        ring=dpring(ring,0.25)
        if len(ring)<3: continue
        if len(ring)>200: ring=dpring(ring,1.0)
        if len(ring)>250 or len(ring)<3: continue
        hid=e['id']; h1,h2,h3,h4,h5=(H(hid,k) for k in range(5))
        lat=LAT0-cz/KN; lon=LON0+cx/KX
        bp=math.hypot((lat-bpS[0])*KN,(lon-bpS[1])*KX)<650
        levels=None
        try: levels=float(t.get('building:levels','').split(';')[0])
        except: pass
        height=None
        try: height=float(t.get('height','').split()[0].replace('m',''))
        except: pass
        # ---- style ----
        if bt in ('shed','garage','garages','carport','roof','greenhouse','hut','shelter','cabin','boathouse','farm_auxiliary','barn','stable'): st=5
        elif bt in ('industrial','warehouse','factory','manufacture','hangar','storage_tank'): st=6
        elif bt in ('church','cathedral','chapel'): st=11
        elif bt in ('commercial','retail','office','hotel','hospital','university','college','school','civic','public','government','train_station','supermarket','kindergarten','sports_hall','fire_station','transportation','parking'):
            st=7 if rc<1100 else 8
        elif bt in ('apartments','flats','dormitory') or (levels and levels>=3 and rc>1100): st=10 if rc>=1100 else 7
        elif bt=='yes' and rc<1050 and area>220: st=7
        elif bt=='yes' and area>1600: st=6 if rc>3000 else 8
        else:
            if area<28 and bt=='yes': st=5
            elif bp: st=1 if h1<0.55 else (3 if h1<0.8 else 2)
            elif rc<2400: st=[2,3,3,1,4][int(h1*5)]
            elif rc<6500: st=[2,3,4,4,4,3,9][int(h1*7)]
            else: st=[4,4,4,3,3,9,9][int(h1*7)]
        d=STYLEDEF[st]
        shape=d['shape'][int(h2*len(d['shape']))]
        if t.get('roof:shape') in SHAPE_TAG: shape=SHAPE_TAG[t['roof:shape']]
        if area>3500 and st not in (6,): shape=0
        pitch=d['pitch'][0]+(d['pitch'][1]-d['pitch'][0])*h3
        if shape==0: pitch=0
        # ---- colours ----
        rcol=d['roof'][int(h4*len(d['roof']))]
        if t.get('roof:colour','').lower() in CNAMES: rcol=CNAMES[t['roof:colour'].lower()]
        elif area>=150:
            s=img_rgb(lat,lon)
            if s is not None and s.sum()>40:
                # nudge toward the palette entry closest to what the satellite sees, among this style's options
                best=min(d['roof'],key=lambda i: np.sum((ROOFV[i]*0.55-s)**2))
                if area>=600 or h5<0.6: rcol=best
        wcol=d['wall'][int(h5*len(d['wall']))]
        # ---- height ----
        if height: hgt=height
        else:
            if levels is None:
                if st==7:
                    levels=2+int(h3*h3*12) if rc<700 else 2+int(h3*5)
                    levels=min(levels, max(2,int(area/60)))
                elif st==10: levels=3+int(h3*2)
                elif st in (1,2,3,4,9): levels=2 if h3>0.86 else 1
                elif st==11: levels=2
                elif st==8: levels=1+int(h3*2)
                else: levels=1
            lh=3.6 if st in (7,8) else 3.0 if st not in (5,6) else 3.2
            if st==6: lh=5.5
            if st==5: lh=2.6
            hgt=levels*lh+(0.4 if st not in (5,6) else 0)
        hgt=max(2.2,min(hgt,120))
        recs.append((ring,st,shape,int(round(pitch)),rcol,wcol,hgt,cx,cz,area,1 if (st in (1,2) and h2>0.35) else 0))
print('buildings',len(recs))
import collections; print(collections.Counter(r[1] for r in recs))
GN=240
def tile(cx,cz): return min(GN-1,max(0,int((cz+HALF)//256)))*GN+min(GN-1,max(0,int((cx+HALF)//256)))
recs.sort(key=lambda r: tile(r[7],r[8]))
TS=np.zeros(GN*GN+1,np.uint32)
for r in recs: TS[tile(r[7],r[8])+1]+=1
TS=np.cumsum(TS).astype(np.uint32)
N=len(recs); BN=np.zeros(N,np.uint8); BS=np.zeros(N,np.uint8); BR=np.zeros(N,np.uint8); BP=np.zeros(N,np.uint8); BRC=np.zeros(N,np.uint8); BWC=np.zeros(N,np.uint8); BH=np.zeros(N,np.uint16)
V=[]
for i,r in enumerate(recs):
    ring,st,shape,pitch,rcol,wcol,hgt,cx,cz,area,chim=r
    ti=tile(cx,cz); ox=(ti%GN)*256-HALF; oz=(ti//GN)*256-HALF
    BN[i]=len(ring); BS[i]=st; BR[i]=shape|(chim<<4); BP[i]=pitch; BRC[i]=rcol; BWC[i]=wcol; BH[i]=int(round(hgt*10))
    for p in ring:
        V+=[int(round((p[0]-ox)*10)),int(round((p[1]-oz)*10))]
V=np.array(V,np.int16)
pack(OUT+'/buildings.png',[('TS',TS),('BN',BN),('BS',BS),('BR',BR),('BP',BP),('BRC',BRC),('BWC',BWC),('BH',BH),('V',V)],{'N':N,'ROOF':ROOF,'WALL':WALL})
