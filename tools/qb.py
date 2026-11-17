import subprocess, sys, os
OUT=sys.argv[1]
S,W,N,E=-43.156,146.957,-42.609,147.701
qs={}
mid_lat=-42.88; mid_lon=147.33
# 9 tiles for buildings
lats=[S,-42.97,-42.84,N]; lons=[W,147.24,147.42,E]
for i in range(3):
    for j in range(3):
        bb=f'{lats[i]},{lons[j]},{lats[i+1]},{lons[j+1]}'
        qs[f'b_{i}{j}']=f'[out:json][timeout:280][bbox:{bb}];way["building"];out geom tags;'
qs['pts']=f'[out:json][timeout:280][bbox:{S},{W},{N},{E}];(node["natural"="tree"];node["highway"~"^(traffic_signals|street_lamp|stop|give_way)$"];node["crossing"="traffic_signals"];);out body;'
for k,q in qs.items():
    f=f'{OUT}/{k}.json'
    if os.path.exists(f) and os.path.getsize(f)>1000: continue
    r=subprocess.run(['curl','-sS','-m','300','-A','sigma-sim-build/1.0','--data-urlencode','data='+q,'https://maps.mail.ru/osm/tools/overpass/api/interpreter','-o',f,'-w','%{http_code} %{size_download}'],capture_output=True,text=True)
    print(k,r.stdout,r.stderr[:200],flush=True)
