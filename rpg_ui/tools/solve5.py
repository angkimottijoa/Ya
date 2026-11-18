import numpy as np
from scipy.optimize import least_squares
exec(open('fit2.py').read().split('res=[]')[0])
A=np.load('A2.npy'); conv=eval(open('conv2.txt').read())
print('관측별 잔차(px):',[round(float(v*40)) for v in resid(A,conv)])
cfg45=(0.70,[-245.22,159.77,-97.71],0,0,[0.58,-0.69,-3.23])
for nm,v in [('o',(0,0,0)),('tip',LANCE),('butt',BUTT)]: print('V12.45',nm,np.round(proj(chain(v,cfg45,conv),A)[0]))
CR=Rz(A[2])@Ry(A[1])@Rx(A[0]); L=26.9
UPd=np.array([np.sin(np.radians(5)),np.cos(np.radians(5)),0])
def res(q):
    rx,ry,rz,s,px,py,pz=q; cfg=(s,[rx,ry,rz],0,0,[px,py,pz])
    o,_=proj(chain((0,0,0),cfg,conv),A); t,_=proj(chain((0,0,-L),cfg,conv),A)
    M=lambda v:CR@(chain(v,cfg,conv)-chain((0,0,0),cfg,conv))
    dz=M((0,0,-1)); dz/=np.linalg.norm(dz); dy=M((0,-1,0)); dy/=np.linalg.norm(dy)
    return [(o[0]-1625)/30,(o[1]-1140)/30,(t[1]-160)/30,*(dz-UPd)*6,(dy[2]+1)*6]  # 끝을 조금 더 위(크게), -Y(날) 앞
best=None; rng=np.random.default_rng(5)
for i in range(300):
    q0=[*rng.uniform(-180,180,3),rng.uniform(.3,.9),*rng.uniform(-6,6,3)]
    r=least_squares(res,q0,bounds=([-360]*3+[.2,-12,-12,-12],[360]*3+[1.5,12,12,12]))
    c=np.sum(np.square(r.fun))
    if best is None or c<best[0]: best=(c,r.x)
print(best[0],np.round(best[1],2)); np.save('sol5.npy',best[1])
