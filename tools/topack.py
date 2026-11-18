import numpy as np, zlib, base64, struct, sys, os
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
def save(name, raw):
    z = zlib.compress(raw, 9); b = base64.b64encode(z)
    open(OUT + '/' + name, 'wb').write(b); print(name, len(raw), len(z), len(b))
def blob(png):
    a = np.asarray(Image.open(png).convert('RGB')).reshape(-1).tobytes()
    n = struct.unpack('<I', a[:4])[0]; return a[4:4 + n]
save('roads.txt', blob(SRC + '/roads.png'))
save('buildings.txt', blob(SRC + '/buildings.png'))
t = np.asarray(Image.open(SRC + '/terrain.png').convert('RGB')).astype(np.uint16)
save('terrain.txt', ((t[:, :, 0] << 8) | t[:, :, 1]).astype('<u2').tobytes())
l = np.asarray(Image.open(SRC + '/land.png').convert('RGB'))
save('land.txt', ((l[:, :, 0] // 17) | ((l[:, :, 1] > 127).astype(np.uint8) << 4)).astype(np.uint8).tobytes())
