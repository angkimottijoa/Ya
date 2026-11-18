import numpy as np, itertools
from scipy.optimize import least_squares
W,H=2000,1397; CX,CY=W/2,H/2
def Rx(a): a=np.radians(a); c,s=np.cos(a),np.sin(a); return np.array([[1,0,0],[0,c,-s],[0,s,c]])
def Ry(a): a=np.radians(a); c,s=np.cos(a),np.sin(a); return np.array([[c,0,s],[0,1,0],[-s,0,c]])
def Rz(a): a=np.radians(a); c,s=np.cos(a),np.sin(a); return np.array([[c,-s,0],[s,c,0],[0,0,1]])
def brot(r, conv):  # 베드락 뼈 회전 → 행렬
    x,y,z=r; sx,sy,sz,order=conv[:4]
    m={'x':Rx(sx*x),'y':Ry(sy*y),'z':Rz(sz*z)}
    M=np.eye(3)
    for ax in order: M=m[ax]@M   # order 의 앞 축부터 벡터에 먼저 적용
    return M
def chain(off, cfg, conv):
    s,rot,tilt,spin,pos=cfg
    v=brot([0,0,spin],conv)@np.array(off,float)
    v=brot([tilt,0,0],conv)@v
    v=brot(rot,conv)@(s*v)
    return v+np.array(pos,float)*np.array([conv[4],1,1])
def proj(p, A):
    ax,ay,az,tx,ty,tz,f=A
    c=Rz(az)@Ry(ay)@Rx(ax)@p+np.array([tx,ty,tz])
    return np.array([CX+f*c[0]/(-c[2]), CY-f*c[1]/(-c[2])]), c
LANCE=(0,0,-37.4); AXE=(0,0,-26.9)
# 관측 (화면 px): 끝점 · 자루 위 한 점
OBS=[ # (cfg, 끝 off, 끝 화면, 자루 위 점)
 ((0.4,[0,0,0],0,0,[0,0,0]), LANCE, (1900,940), (1300,1400)),
 ((0.38,[0,55,0],0,0,[-1.5,0,0]), LANCE, (1750,280), (1640,1290)),
 ((0.63,[0,55,0],0,0,[0.2,0,0]), AXE, (1700,230), (1600,1340)),
]
def resid(A, conv):
    r=[]
    for cfg,off,tip,pt in OBS:
        p0=chain((0,0,0),cfg,conv); p1=chain(off,cfg,conv)
        s0,c0=proj(p0,A); s1,c1=proj(p1,A)
        r+= list((s1-np.array(tip))/50)
        d=s1-s0; n=np.array([-d[1],d[0]])/ (np.linalg.norm(d)+1e-9)
        r.append(np.dot(np.array(pt)-s1,n)/50)
        r.append(max(0,c0[2]+2)+max(0,c1[2]+2))  # 카메라 앞
    return r
best=None
for sx,sy,sz in itertools.product([1,-1],repeat=3):
  for order in ['xyz','zyx']:
    for px in [1,-1]:
      conv=(sx,sy,sz,order,px)
      for seed in range(14):
        rng=np.random.default_rng(seed)
        A0=[*rng.uniform(-180,180,3),*rng.uniform(-10,10,2),-15,1000]
        try: r=least_squares(resid,A0,args=(conv,),bounds=([-360]*3+[-60,-60,-80,850],[360]*3+[60,60,-1,1200]))
        except Exception as e:
            print(e); raise
        c=np.sum(np.square(r.fun))
        if best is None or c<best[0]: best=(c,conv,r.x)
print('best',best[0],best[1],np.round(best[2],2))
np.save('best.npy',np.array(best[2])); open('conv.txt','w').write(repr(best[1]))
