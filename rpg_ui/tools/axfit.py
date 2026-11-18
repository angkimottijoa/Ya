import numpy as np
exec(open('sim.py').read().split('LANCE=')[0])
A=np.array([-23.33,158.09,-102.8,12.38,-8.38,-23.1,1200.]); conv=(1,-1,1,'xyz',-1)
def ang(d): return float(np.degrees(np.arctan2(-d[1],d[0])))
def axes(ty,s=0.63):
    def ch(v):  # 자리(Y55) ∘ 기울이기(Y ty) ∘ 모델
        w=brot([0,ty,0],conv)@np.array(v,float)
        return brot([0,55,0],conv)@(s*w)+np.array([0.2,0,0])*np.array([conv[4],1,1])
    o,co=proj(ch((0,0,0)),A); out={}
    for nm,v in [('L(-Z)',(0,0,-14)),('B(+X)',(14,0,0)),('C(+Y)',(0,14,0))]:
        e,ce=proj(ch(v),A); out[nm]=(round(ang(e-o),1), round(float(-ce[2]+co[2]),1))
    return out
print('목표: L≈80°, B≈136°(화살표 왼쪽 위), C≈수평')
for ty in range(-90,91,15): print(ty, axes(ty))
