/* Editor geométrico original da Feito em Forma — medidas em mm.
 * Formas parametrizadas, desenho 2D extrudado e escultura de malha local.
 * Não implementa o núcleo CAD do Fusion 360 nem os modificadores do Blender.
 */
(function(global){
  'use strict';
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
  const vec=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const DEFAULT_POLY=[[0,0],[55,0],[55,20],[35,20],[35,42],[0,42]];
  const SHAPES={box:'Cubo',cylinder:'Cilindro',sphere:'Esfera',cone:'Cone',torus:'Anel',sketch:'Desenho extrudado'};
  function makeObject(type='box'){
    if(!SHAPES[type])throw new Error('Forma não reconhecida.');
    const standard={box:[35,35,25],cylinder:[32,32,35],sphere:[35,35,35],cone:[35,35,35],torus:[55,55,16],sketch:[55,42,12]};
    return {id:'obj-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
      type,name:SHAPES[type],dim:standard[type],pos:[0,0,0],rot:[0,0,0],color:'#69ad78',poly:type==='sketch'?DEFAULT_POLY.map(p=>p.slice()):undefined};
  }
  function triangle(out,a,b,c,normal){
    if(normal&&dot(vec(sub(b,a),sub(c,a)),normal)<0){out.push(...a,...c,...b);return;}
    out.push(...a,...b,...c);
  }
  function quad(out,a,b,c,d,normal){triangle(out,a,b,c,normal);triangle(out,a,c,d,normal);}
  function box(out,w,d,h){
    const bounds=[[0,-w/2,w/2],[1,-d/2,d/2],[2,0,h]];
    for(const axis of [0,1,2])for(const sign of [-1,1]){
      const [u,v]=[0,1,2].filter(x=>x!==axis),steps=12;
      const face=sign<0?bounds[axis][1]:bounds[axis][2],normal=[0,0,0];normal[axis]=sign;
      function point(i,j){const p=[0,0,0];p[axis]=face;p[u]=bounds[u][1]+(bounds[u][2]-bounds[u][1])*i/steps;p[v]=bounds[v][1]+(bounds[v][2]-bounds[v][1])*j/steps;return p;}
      for(let i=0;i<steps;i++)for(let j=0;j<steps;j++)quad(out,point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1),normal);
    }
  }
  function cylinder(out,w,d,h,cone=false){
    const radial=64,stacks=12,radX=w/2,radY=d/2;
    const point=(k,z)=>{const a=(k%radial)/radial*Math.PI*2,scale=cone?1-z/h:1;return [Math.cos(a)*radX*scale,Math.sin(a)*radY*scale,z];};
    for(let k=0;k<radial;k++){
      const b=point(k,0),next=point(k+1,0);
      triangle(out,[0,0,0],next,b,[0,0,-1]);
      for(let j=0;j<stacks;j++){
        const z=h*j/stacks,z2=h*(j+1)/stacks;
        const a=point(k,z),bb=point(k+1,z),c=point(k+1,z2),d2=point(k,z2);
        const ang=(k+.5)/radial*Math.PI*2,normal=[Math.cos(ang)/radX,Math.sin(ang)/radY,cone?Math.max(radX,radY)/h:0];
        if(cone&&j===stacks-1)triangle(out,a,bb,[0,0,h],normal);
        else quad(out,a,bb,c,d2,normal);
      }
      if(!cone)triangle(out,[0,0,h],point(k,h),point(k+1,h),[0,0,1]);
    }
  }
  function sphere(out,w,d,h){
    const slices=64,stacks=32,rx=w/2,ry=d/2,rz=h/2;
    const point=(i,j)=>{if(j===0)return [0,0,0];if(j===stacks)return [0,0,h];const theta=j/stacks*Math.PI,phi=(i%slices)/slices*Math.PI*2;return [rx*Math.sin(theta)*Math.cos(phi),ry*Math.sin(theta)*Math.sin(phi),rz*(1-Math.cos(theta))];};
    for(let j=0;j<stacks;j++)for(let i=0;i<slices;i++){
      const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d2=point(i,j+1);
      const middle=point(i+.5,j+.5),normal=[middle[0]/rx**2,middle[1]/ry**2,(middle[2]-rz)/rz**2];
      if(j===0)triangle(out,a,c,d2,normal);
      else if(j===stacks-1)triangle(out,a,b,c,normal);
      else quad(out,a,b,c,d2,normal);
    }
  }
  function torus(out,w,d,h){
    const wide=64,tube=24,r=h/2,rx=Math.max(r+1,w/2-r),ry=Math.max(r+1,d/2-r);
    const point=(i,j)=>{
      const a=(i%wide)/wide*2*Math.PI,b=(j%tube)/tube*2*Math.PI;
      return [(rx+r*Math.cos(b))*Math.cos(a),(ry+r*Math.cos(b))*Math.sin(a),r+r*Math.sin(b)];
    };
    for(let i=0;i<wide;i++)for(let j=0;j<tube;j++){
      const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d2=point(i,j+1);
      const angle=(i+.5)/wide*2*Math.PI,t=(j+.5)/tube*2*Math.PI;
      quad(out,a,b,c,d2,[Math.cos(angle)*Math.cos(t),Math.sin(angle)*Math.cos(t),Math.sin(t)]);
    }
  }
  function parsePolygon(source){
    const points=String(source).trim().split(/[;\n]+/).filter(Boolean).map(part=>part.trim().split(/[ ,]+/).map(Number));
    if(points.length<3||points.length>60||points.some(p=>p.length!==2||p.some(x=>!Number.isFinite(x)||Math.abs(x)>10000)))
      throw new Error('Informe de 3 a 60 pontos como X,Y; X,Y; X,Y (em mm).');
    if(Math.abs(signedArea(points))<.1)throw new Error('O desenho está vazio ou todos os pontos estão alinhados.');
    return points;
  }
  function signedArea(poly){let sum=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];sum+=p[0]*q[1]-q[0]*p[1];}return sum/2;}
  function intersects(a,b,c,d){
    const det=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    return det(a,b,c)*det(a,b,d)<-1e-7&&det(c,d,a)*det(c,d,b)<-1e-7;
  }
  function triangulate(poly){
    const points=signedArea(poly)<0?poly.slice().reverse():poly.slice();
    for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
      if(i===0&&j===points.length-1)continue;
      if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))throw new Error('O desenho cruza a si mesmo. Corrija os pontos.');
    }
    const pending=points.map((_,i)=>i),tris=[];let guard=0;
    const orient=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    while(pending.length>3&&guard++<200){
      let clipped=false;
      for(let i=0;i<pending.length;i++){
        const a=pending[(i+pending.length-1)%pending.length],b=pending[i],c=pending[(i+1)%pending.length];
        if(orient(points[a],points[b],points[c])<=1e-6)continue;
        const inside=(p,x,y,z)=>{const u=orient(x,y,p),v=orient(y,z,p),w=orient(z,x,p);return u>=-1e-7&&v>=-1e-7&&w>=-1e-7;};
        if(pending.some(k=>k!==a&&k!==b&&k!==c&&inside(points[k],points[a],points[b],points[c])))continue;
        tris.push([a,b,c]);pending.splice(i,1);clipped=true;break;
      }
      if(!clipped)throw new Error('Não foi possível extrudar este desenho. Remova pontos repetidos ou cruzados.');
    }
    if(pending.length===3)tris.push(pending);
    return {points,tris};
  }
  function extrude(out,poly,h){
    const {points,tris}=triangulate(poly);
    for(const [a,b,c] of tris){
      triangle(out,[...points[a],0],[...points[c],0],[...points[b],0],[0,0,-1]);
      triangle(out,[...points[a],h],[...points[b],h],[...points[c],h],[0,0,1]);
    }
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],normal=[b[1]-a[1],a[0]-b[0],0];
      quad(out,[...a,0],[...b,0],[...b,h],[...a,h],normal);
    }
  }
  function transform(p,obj){
    const rot=obj.rot.map(a=>finite(a)*Math.PI/180),[sx,sy,sz]=rot;
    const [cx,cy,cz]=rot.map(Math.cos),[ax,ay,az]=rot.map(Math.sin);
    let [x,y,z]=p;
    [y,z]=[y*cx-z*ax,y*ax+z*cx];
    [x,z]=[x*cy+z*ay,-x*ay+z*cy];
    [x,y]=[x*cz-y*az,x*az+y*cz];
    return [x+obj.pos[0],y+obj.pos[1],z+obj.pos[2]];
  }
  function objectGeometry(object){
    const out=[],[w,d,h]=object.dim.map((x,i)=>clamp(finite(x,20),.5,i===2?2000:5000));
    switch(object.type){
      case 'box':box(out,w,d,h);break;
      case 'cylinder':cylinder(out,w,d,h);break;
      case 'sphere':sphere(out,w,d,h);break;
      case 'cone':cylinder(out,w,d,h,true);break;
      case 'torus':torus(out,w,d,h);break;
      case 'sketch':extrude(out,object.poly||DEFAULT_POLY,h);break;
      default:throw new Error('Objeto desconhecido.');
    }
    for(let i=0;i<out.length;i+=3){const v=transform(out.slice(i,i+3),object);out[i]=v[0];out[i+1]=v[1];out[i+2]=v[2];}
    return out;
  }
  function compose(scene){
    if(!scene?.objects?.length)throw new Error('Adicione uma forma para criar a peça.');
    const coords=[],colors=[],components=[];
    for(const obj of scene.objects){
      const geometry=objectGeometry(obj),count=geometry.length/9;
      if((coords.length+geometry.length)/9>500000)throw new Error('Cena acima do limite de 500 mil triângulos.');
      components.push({name:obj.name,start:coords.length/9,count});
      coords.push(...geometry);
      for(let i=0;i<count;i++)colors.push(obj.color||'#69ad78');
    }
    return global.MeshTools.meshFromCoords(coords,colors,{format:'Feito em Forma CAD',units:'mm',components});
  }
  function sculpt(mesh,face,radius,strength,tool){
    if(!mesh||face<0||face>=mesh.triangles)throw new Error('Clique na superfície para esculpir.');
    if(mesh.triangles>150000)throw new Error('Para esculpir, simplifique a peça para até 150 mil triângulos.');
    const coords=mesh.coords,at=face*9;
    const a=[...coords.slice(at,at+3)],b=[...coords.slice(at+3,at+6)],c=[...coords.slice(at+6,at+9)];
    const center=a.map((n,i)=>(n+b[i]+c[i])/3),normal=vec(sub(b,a),sub(c,a));
    const length=Math.hypot(...normal)||1,unit=normal.map(n=>n/length),groups=new Map();
    for(let k=0;k<coords.length;k+=3){
      const pos=[coords[k],coords[k+1],coords[k+2]],key=pos.map(x=>String(Math.round(x*1e4)/1e4)).join('/');
      if(!groups.has(key))groups.set(key,{pos,indices:[]});groups.get(key).indices.push(k);
    }
    const delta=new Map(),sigma=clamp(finite(radius,10),.25,300),gain=clamp(finite(strength,1),.01,15);
    const neighbors=new Map();
    if(tool==='smooth'){
      for(let i=0;i<coords.length;i+=9){
        const keys=[0,3,6].map(off=>[coords[i+off],coords[i+off+1],coords[i+off+2]].map(n=>String(Math.round(n*1e4)/1e4)).join('/'));
        for(let j=0;j<3;j++){
          if(!neighbors.has(keys[j]))neighbors.set(keys[j],new Set());
          neighbors.get(keys[j]).add(keys[(j+1)%3]);neighbors.get(keys[j]).add(keys[(j+2)%3]);
        }
      }
    }
    for(const [key,v] of groups){
      const distance=Math.hypot(...sub(v.pos,center));if(distance>sigma)continue;
      const falloff=(1-distance/sigma)**2;
      if(tool==='smooth'){
        const adjacent=[...(neighbors.get(key)||[])].map(k=>groups.get(k)?.pos).filter(Boolean);
        if(!adjacent.length)continue;
        const avg=[0,1,2].map(axis=>adjacent.reduce((sum,p)=>sum+p[axis],0)/adjacent.length);
        delta.set(key,sub(avg,v.pos).map(n=>n*Math.min(.85,gain*.12)*falloff));
      }else delta.set(key,unit.map(n=>n*gain*falloff*(tool==='deflate'?-1:1)));
    }
    // Todas as cópias de um vértice recebem o mesmo deslocamento: a malha permanece soldada.
    for(const [key,move] of delta){const item=groups.get(key);for(const i of item.indices)for(let a=0;a<3;a++)coords[i+a]+=move[a];}
    return global.MeshTools.meshFromCoords(coords,mesh.colors,mesh.metadata);
  }
  function validateProject(raw){
    if(!raw||raw.version!==1||!Array.isArray(raw.objects)||raw.objects.length>40)throw new Error('Projeto CAD inválido ou acima de 40 objetos.');
    const objects=raw.objects.map(p=>{
      if(!SHAPES[p.type]||![p.dim,p.pos,p.rot].every(a=>Array.isArray(a)&&a.length===3&&a.every(v=>Number.isFinite(Number(v))&&Math.abs(v)<=10000)))throw new Error('Projeto contém formas ou coordenadas inválidas.');
      return {...makeObject(p.type),name:String(p.name||SHAPES[p.type]).slice(0,65),dim:p.dim.slice(),pos:p.pos.slice(),rot:p.rot.slice(),color:/^#[0-9a-f]{6}$/i.test(p.color)?p.color:'#69ad78',poly:p.type==='sketch'?parsePolygon((p.poly||DEFAULT_POLY).map(pair=>pair.join(',')).join(';')):undefined};
    });
    return {objects,selected:objects[0]?.id||null,mode:'forms',radius:12,strength:1.5,brush:'inflate',sculptUndo:[]};
  }
  global.Feito3DBuilder={SHAPES,makeObject,compose,sculpt,parsePolygon,validateProject,objectGeometry};
})(typeof window==='undefined'?globalThis:window);
