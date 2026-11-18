import numpy as np
exec(open('sim.py').read().split('best=None')[0])
A=np.array([-23.33,158.09,-102.8,12.38,-8.38,-23.1,1200.]); conv=(1,-1,1,'xyz',-1)
def gizmo(cfg,L=14):
    o,_=proj(chain((0,0,0),cfg,conv),A)
    out={'원점':np.round(o)}
    for nm,v in [('긴축(-Z)',(0,0,-L)),('둘째(+Y)',(0,L,0)),('셋째(+X)',(L,0,0))]:
        e,_=proj(chain(v,cfg,conv),A); d=e-o
        out[nm]=(np.round(e), round(float(np.degrees(np.arctan2(-d[1],d[0]))),1))
    return out
print('V12.39', gizmo((0.63,[0,55,0],0,0,[0.2,0,0])))
print('V12.40', gizmo((0.45,[0,55,0],-45,0,[0.2,0,0])))
