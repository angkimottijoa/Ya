import numpy as np, itertools, sys
from scipy.optimize import least_squares
exec(open('sim.py').read().split('LANCE=')[0])
LANCE=(0,0,-37.4); AXE=(0,0,-26.9); BUTT=(0,0,16.3)
OBS=[ # cfg, [(오프셋, 화면점, 종류)]  종류 p=점, l=선 위
 ((0.4,[0,0,0],0,0,[0,0,0]), [(LANCE,(1900,940),'p'),((0,0,0),(1300,1400),'l')]),
 ((0.38,[0,55,0],0,0,[-1.5,0,0]), [(LANCE,(1750,280),'p'),((0,0,0),(1640,1290),'l')]),
 ((0.63,[0,55,0],0,0,[0.2,0,0]), [(AXE,(1700,230),'p'),((0,0,0),(1600,1340),'l')]),
 ((0.70,[-245.22,159.77,-97.71],0,0,[0.58,-0.69,-3.23]), [((0,0,-8),(1250,1110),'l2'),((0,0,-20),(1480,1000),'l2'),(BUTT,(690,1275),'p')]),
]
def resid(A,conv):
    r=[]
    for cfg,items in OBS:
        o,co=proj(chain((0,0,0),cfg,conv),A)
        t,ct=proj(chain(LANCE if cfg[0]!=0.63 else AXE,cfg,conv),A)
        d=t-o; n=np.array([-d[1],d[0]])/(np.linalg.norm(d)+1e-9)
        for off,sp,k in items:
            if k=='p':
                p,_=proj(chain(off,cfg,conv),A); r+=list((p-np.array(sp))/40)
            else:
                r.append(np.dot(np.array(sp)-o,n)/40)
        if cfg[0]==0.70: r.append(max(0,o[0]-t[0])/40)  # 끝이 오른쪽
        r.append(max(0,co[2]+2)+max(0,ct[2]+2))
    return r
res=[]
for sx,sy,sz in itertools.product([1,-1],repeat=3):
  for order in itertools.permutations('xyz'):
    for px in [1,-1]:
      conv=(sx,sy,sz,''.join(order),px); best=None
      for seed in range(5):
        rng=np.random.default_rng(seed)
        A0=[*rng.uniform(-180,180,3),*rng.uniform(-10,10,2),-20,1100]
        r=least_squares(resid,A0,args=(conv,),bounds=([-360]*3+[-60,-60,-80,900],[360]*3+[60,60,-1,1300]),max_nfev=400)
        c=np.sum(np.square(r.fun))
        if best is None or c<best[0]: best=(c,r.x)
      res.append((best[0],conv,best[1]))
res.sort(key=lambda x:x[0])
for c,conv,x in res[:5]: print(round(c,3),conv,np.round(x,2))
np.save('A2.npy',res[0][2]); open('conv2.txt','w').write(repr(res[0][1]))
