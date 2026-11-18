import numpy as np
from scipy.optimize import least_squares
exec(open('sim.py').read().split('best=None')[0])
A=np.array([-23.33,158.09,-102.8,12.38,-8.38,-23.1,1200.]); conv=(1,-1,1,'xyz',-1)
L=26.9; CR=Rz(A[2])@Ry(A[1])@Rx(A[0])
lean=np.radians(5)
UPd=np.array([np.sin(lean),np.cos(lean),0])  # 긴 축: 화면 위(오른쪽으로 5°), 깊이 없음
def res(q):
    rx,ry,rz,s,px,py,pz=q; cfg=(s,[rx,ry,rz],0,0,[px,py,pz])
    o,_=proj(chain((0,0,0),cfg,conv),A); t,_=proj(chain((0,0,-L),cfg,conv),A)
    M=lambda v: CR@(chain(v,cfg,conv)-chain((0,0,0),cfg,conv))
    dz=M((0,0,-1)); dz/=np.linalg.norm(dz)
    dx=M((0,1,0)); dx/=np.linalg.norm(dx)
    return [(o[0]-1625)/30,(o[1]-1140)/30,(t[1]-290)/30,
            *(dz-UPd)*6, (dx[2]-1)*6]   # 긴 축 = 화면 위, 두께축(+X) = 카메라 쪽 → 넓은 면이 화면과 나란
best=None; rng=np.random.default_rng(3)
for i in range(300):
    q0=[*rng.uniform(-180,180,3), rng.uniform(.3,.9), *rng.uniform(-6,6,3)]
    r=least_squares(res,q0,bounds=([-360]*3+[.2,-12,-12,-12],[360]*3+[1.2,12,12,12]))
    c=np.sum(np.square(r.fun))
    if best is None or c<best[0]: best=(c,r.x)
print(best[0],np.round(best[1],2)); np.save('sol.npy',best[1])
q=best[1]; cfg=(q[3],list(q[:3]),0,0,list(q[4:]))
for nm,v in [('o',(0,0,0)),('tip',(0,0,-L)),('Y',(0,8,0)),('X',(8,0,0))]:
    p,c=proj(chain(v,cfg,conv),A); print(nm,np.round(p),round(float(-c[2]),1))
