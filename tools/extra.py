import json, math, sys
RAW, OUT = sys.argv[1], sys.argv[2]
LAT0, LON0, R = -42.8826, 147.3290, 6371000.0
KX = math.cos(math.radians(LAT0))*R*math.pi/180; KN = R*math.pi/180
fuel=[]; bus=[]
for e in json.load(open(RAW))['elements']:
    lat = e.get('lat') or e.get('center',{}).get('lat'); lon = e.get('lon') or e.get('center',{}).get('lon')
    if lat is None: continue
    x=(lon-LON0)*KX; z=-(lat-LAT0)*KN
    if math.hypot(x,z)>29900: continue
    t=e['tags']
    if t.get('amenity')=='fuel':
        nm=t.get('name') or t.get('brand') or 'Service station'
        sub=t.get('addr:suburb') or ''
        fuel.append([round(x,1),round(z,1),nm])
    else:
        bus.append([round(x,1),round(z,1)])
json.dump({'fuel':fuel,'bus':bus},open(OUT,'w'),separators=(',',':'))
print(len(fuel),len(bus))
