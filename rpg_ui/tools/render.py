import numpy as np, json
from PIL import Image, ImageDraw
exec(open('sim.py').read().split('best=None')[0])
A=np.array([-23.33,158.09,-102.8,12.38,-8.38,-23.1,1200.]); conv=(1,-1,1,'xyz',-1)
RP='/home/user/Ya/rpg_ui/resource_pack'
g=json.load(open(f'{RP}/models/entity/rpg_w3d_baekho_axe.geo.json'))['minecraft:geometry'][0]['bones'][-1]['cubes']
tex=Image.open(f'{RP}/textures/models/rpg_w3d_baekho_axe.png').convert('RGB')
HAND=np.array([-6,12.5,-1])
def draw(cfg, bg, title):
    im=bg.copy(); d=ImageDraw.Draw(im); faces=[]
    for c in g:
        o=np.array(c['origin'])-HAND; s=np.array(c['size'])
        uv=c['uv']['east']['uv']; col=tex.getpixel((min(tex.width-1,int(uv[0])),min(tex.height-1,int(uv[1]))))
        V=[o+s*np.array([a,b,e]) for a in(0,1) for b in(0,1) for e in(0,1)]
        P=[proj(chain(v,cfg,conv),A) for v in V]
        for f,sh in [([0,1,3,2],.7),([4,5,7,6],1),([0,1,5,4],.8),([2,3,7,6],1.1),([0,2,6,4],.9),([1,3,7,5],.9)]:
            dep=np.mean([-P[i][1][2] for i in f])
            faces.append((dep,[tuple(P[i][0]) for i in f],tuple(min(255,int(v*sh)) for v in col)))
    for dep,poly,col in sorted(faces,key=lambda x:-x[0]): d.polygon(poly,fill=col)
    for a,b in [((1610,1340),(1700,290)),((1380,1160),(2000,1125)),((1440,1020),(2000,1380))]: d.line([a,b],fill=(255,0,0),width=6)
    d.text((40,40),title,fill=(0,0,0))
    return im
bg=Image.new('RGB',(W,H),(135,175,235)); ImageDraw.Draw(bg).rectangle([0,H*0.45,W,H],fill=(95,140,60))
a=draw((0.63,[0,55,0],0,0,[0.2,0,0]),bg,'V12.39 (now)')
q=np.load('sol.npy'); b=draw((q[3],list(q[:3]),0,0,list(q[4:])),bg,'solution')
out=Image.new('RGB',(W,H*2)); out.paste(a,(0,0)); out.paste(b,(0,H)); out.resize((1000,1397)).save('compare.png')
