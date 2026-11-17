import numpy as np, glob, os, math, sys
from PIL import Image
RAW=sys.argv[1]; OUT=sys.argv[2]
fs=glob.glob(RAW+'/s_*.jpg'); X0,Y0=14879,10338; nx,ny=36,37
M=np.zeros((ny*256,nx*256,3),np.uint8)
for f in fs:
    b=os.path.basename(f)[2:-4].split('_'); x,y=int(b[0]),int(b[1])
    try: M[(y-Y0)*256:(y-Y0+1)*256,(x-X0)*256:(x-X0+1)*256]=np.asarray(Image.open(f).convert('RGB'))
    except Exception as e: print('bad',f,e)
np.save(OUT+'/s2mosaic.npy',M)
Image.fromarray(M[::6,::6]).save(OUT+'/s2_preview.jpg',quality=85)
print(M.shape)
