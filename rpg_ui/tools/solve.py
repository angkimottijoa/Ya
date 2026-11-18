import numpy as np
from scipy.optimize import least_squares
exec(open('sim.py').read().split('best=None')[0])
A=np.array([-23.33,158.09,-102.8,12.38,-8.38,-23.1,1200.]); conv=(1,-1,1,'xyz',-1)
L=26.9
def ang(d): return np.degrees(np.arctan2(-d[1],d[0]))
def wrap(a): return (a+180)%360-180
def res(q):
    rx,ry,rz,s,px,py,pz=q; cfg=(s,[rx,ry,rz],0,0,[px,py,pz])
    o,co=proj(chain((0,0,0),cfg,conv),A)
    t,_=proj(chain((0,0,-L),cfg,conv),A)
    y,_=proj(chain((0,8,0),cfg,conv),A)
    x,cx=proj(chain((8,0,0),cfg,conv),A)
    dy=ang(y-o); dx=ang(x-o)
    r=[(o[0]-1625)/30,(o[1]-1140)/30,(t[0]-1700)/30,(t[1]-290)/30,
       min(abs(wrap(dy+3)),abs(wrap(dy-177)))/8,  # 가로축 (어느 쪽이든)
       min(abs(wrap(dx+33)),abs(wrap(dx-147)))/8,  # 두께축 대각선
       max(0,np.linalg.norm(co)-np.linalg.norm(cx)+0.0)*0, ]
    # 두께축이 카메라 쪽(+X 끝이 원점보다 카메라에 가까움) 또는 -X 쪽이 가까움 — 둘 다 넓은 면이 카메라를 봄
    return r
best=None
rng=np.random.default_rng(1)
for i in range(300):
    q0=[*rng.uniform(-180,180,3), rng.uniform(.3,.9), *rng.uniform(-6,6,3)]
    r=least_squares(res,q0,bounds=([-360]*3+[.2,-12,-12,-12],[360]*3+[1.2,12,12,12]))
    c=np.sum(np.square(r.fun))
    if best is None or c<best[0]: best=(c,r.x)
print(best[0], np.round(best[1],2))
q=best[1]; cfg=(q[3],list(q[:3]),0,0,list(q[4:]))
for nm,v in [('o',(0,0,0)),('tip',(0,0,-L)),('Y',(0,8,0)),('X',(8,0,0))]:
    p,c=proj(chain(v,cfg,conv),A); print(nm,np.round(p),round(float(-c[2]),1))
np.save('sol.npy',best[1])
