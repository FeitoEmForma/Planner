/* Original geometry utilities for Feito em Forma Studio.
 * Supports STL, 3MF core meshes, planar cutting, and standard colored 3MF output.
 * Files are parsed entirely on the user's device.
 */
(function (global) {
  'use strict';
  const DEFAULT_COLOR = '#79ad8b';
  const CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
  const MATERIAL_NS = 'http://schemas.microsoft.com/3dmanufacturing/material/2015/02';
  const PRODUCTION_NS = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';
  const MAX_TRIANGLES = 500000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const xml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function meshFromCoords(coords, colors=[], metadata={}) {
    if(!coords || coords.length<9 || coords.length%9!==0 || coords.length/9>MAX_TRIANGLES)throw new Error('Malha vazia ou acima do limite de 500 mil triângulos.');
    const pts=coords instanceof Float32Array?coords:new Float32Array(coords);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let signed=0;
    for(let i=0;i<pts.length;i+=3)for(let a=0;a<3;a++){
      if(!Number.isFinite(pts[i+a]))throw new Error('A malha contém coordenadas inválidas.');
      min[a]=Math.min(min[a],pts[i+a]);max[a]=Math.max(max[a],pts[i+a]);
    }
    for(let i=0;i<pts.length;i+=9) {
      const ax=pts[i],ay=pts[i+1],az=pts[i+2],bx=pts[i+3],by=pts[i+4],bz=pts[i+5],cx=pts[i+6],cy=pts[i+7],cz=pts[i+8];
      signed+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;
    }
    return {coords:pts,triangles:pts.length/9,min,max,dimensions:max.map((x,i)=>x-min[i]),volume:Math.abs(signed),colors:colors.length?colors.slice():[],metadata};
  }
  function parseSTL(buffer) {
    const view=new DataView(buffer),binary=buffer.byteLength>=84 && 84+view.getUint32(80,true)*50===buffer.byteLength;
    let coords;
    if(binary){
      const count=view.getUint32(80,true);if(count>MAX_TRIANGLES)throw new Error('STL com triângulos demais.');
      coords=new Float32Array(count*9);
      for(let i=0;i<count;i++)for(let j=0;j<9;j++)coords[i*9+j]=view.getFloat32(84+i*50+12+j*4,true);
    }else {
      if(buffer.byteLength>32*1024*1024)throw new Error('STL ASCII muito grande.');
      const found=[],re=/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
      let m;const raw=dec.decode(buffer);
      while((m=re.exec(raw))!==null) {
        found.push(Number(m[1]),Number(m[2]),Number(m[3]));
        if(found.length>MAX_TRIANGLES*9)throw new Error('STL com triângulos demais.');
      }
      coords=new Float32Array(found);
    }
    return meshFromCoords(coords,[],{format:'STL',units:'mm presumidos'});
  }
  function parseOBJ(buffer){
    if(buffer.byteLength>100*1024*1024)throw new Error('O arquivo OBJ excede 100 MB.');
    const lines=dec.decode(buffer).split(/\r?\n/),vertices=[],coords=[],groups=[];
    let current='Peça 1',start=0;
    const finish=()=>{const count=coords.length/9-start;if(count>0)groups.push({name:current,start,count});start=coords.length/9;};
    for(const raw of lines){
      const line=raw.trim();if(!line||line.startsWith('#'))continue;
      if(line.startsWith('v ')){
        const v=line.split(/\s+/).slice(1,4).map(Number);
        if(v.length!==3||v.some(n=>!Number.isFinite(n)))throw new Error('Vértice OBJ inválido.');
        vertices.push(v);
      }else if(line.startsWith('o ')||line.startsWith('g ')){
        finish();current=line.slice(2).trim().slice(0,75)||('Peça '+(groups.length+1));
      }else if(line.startsWith('f ')){
        const ids=line.split(/\s+/).slice(1).map(part=>{
          const value=Number(part.split('/')[0]);return value<0?vertices.length+value:value-1;
        });
        if(ids.length<3||ids.some(n=>!Number.isInteger(n)||n<0||n>=vertices.length))throw new Error('Face OBJ inválida.');
        for(let i=1;i<ids.length-1;i++){
          coords.push(...vertices[ids[0]],...vertices[ids[i]],...vertices[ids[i+1]]);
          if(coords.length/9>MAX_TRIANGLES)throw new Error('OBJ acima do limite de 500 mil triângulos.');
        }
      }
    }
    finish();return meshFromCoords(coords,[],{format:'OBJ',units:'mm presumidos',components:groups});
  }
  function exportSTL(mesh,scale=1){
    const out=new ArrayBuffer(84+mesh.triangles*50),v=new DataView(out);
    new Uint8Array(out).set(enc.encode('Feito em Forma Studio — malha').subarray(0,80));
    v.setUint32(80,mesh.triangles,true);
    for(let t=0;t<mesh.triangles;t++) {
      const i=t*9,ax=mesh.coords[i],ay=mesh.coords[i+1],az=mesh.coords[i+2],bx=mesh.coords[i+3],by=mesh.coords[i+4],bz=mesh.coords[i+5],cx=mesh.coords[i+6],cy=mesh.coords[i+7],cz=mesh.coords[i+8];
      const u=[bx-ax,by-ay,bz-az],w=[cx-ax,cy-ay,cz-az];
      let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot(...n)||1;
      n=n.map(x=>x/length);
      for(let j=0;j<3;j++)v.setFloat32(84+t*50+j*4,n[j],true);
      for(let j=0;j<9;j++)v.setFloat32(84+t*50+12+j*4,mesh.coords[i+j]*scale,true);
    }
    return new Blob([out],{type:'model/stl'});
  }
  function checksum(data){
    let c=0xffffffff;
    for(const x of data){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}
    return (c^0xffffffff)>>>0;
  }
  function zipFiles(files) {
    const chunks=[],central=[];let offset=0;
    const w16=(b,p,n)=>{b[p]=n&255;b[p+1]=(n>>>8)&255;};
    const w32=(b,p,n)=>{w16(b,p,n);w16(b,p+2,n>>>16);};
    for(const [path,value] of Object.entries(files)){
      const name=enc.encode(path),data=value instanceof Uint8Array?value:enc.encode(value),crc=checksum(data);
      const local=new Uint8Array(30+name.length+data.length);
      w32(local,0,0x04034b50);w16(local,4,20);w16(local,6,0x0800);w32(local,14,crc);
      w32(local,18,data.length);w32(local,22,data.length);w16(local,26,name.length);local.set(name,30);local.set(data,30+name.length);chunks.push(local);
      const entry=new Uint8Array(46+name.length);
      w32(entry,0,0x02014b50);w16(entry,4,20);w16(entry,6,20);w16(entry,8,0x0800);
      w32(entry,16,crc);w32(entry,20,data.length);w32(entry,24,data.length);w16(entry,28,name.length);
      w32(entry,42,offset);entry.set(name,46);central.push(entry);offset+=local.length;
    }
    const size=central.reduce((sum,x)=>sum+x.length,0),end=new Uint8Array(22);
    w32(end,0,0x06054b50);w16(end,8,central.length);w16(end,10,central.length);w32(end,12,size);w32(end,16,offset);
    return new Blob([...chunks,...central,end],{type:'application/zip'});
  }
  async function unzip3MF(buffer){
    if(buffer.byteLength>100*1024*1024)throw new Error('O arquivo 3MF excede 100 MB.');
    const data=new Uint8Array(buffer),v=new DataView(buffer);let eocd=-1;
    for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){eocd=i;break;}
    if(eocd<0)throw new Error('Arquivo 3MF inválido: estrutura ZIP não encontrada.');
    const count=v.getUint16(eocd+10,true),start=v.getUint32(eocd+16,true);
    if(count>2000)throw new Error('3MF com mais de 2.000 arquivos internos; simplifique o projeto antes de importar.');
    const files=new Map();let at=start,total=0;
    for(let i=0;i<count;i++){
      if(at+46>data.length||v.getUint32(at,true)!==0x02014b50)throw new Error('3MF ZIP corrompido.');
      const method=v.getUint16(at+10,true),compressed=v.getUint32(at+20,true),uncompressed=v.getUint32(at+24,true);
      const namelen=v.getUint16(at+28,true),extra=v.getUint16(at+30,true),comment=v.getUint16(at+32,true),local=v.getUint32(at+42,true);
      const name=dec.decode(data.subarray(at+46,at+46+namelen)).replaceAll('\\','/');
      at+=46+namelen+extra+comment;
      if(name.includes('..')||name.startsWith('/'))continue;
      if(local+30>data.length||v.getUint32(local,true)!==0x04034b50)throw new Error('Entrada ZIP inválida.');
      const offset=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
      if(offset+compressed>data.length)throw new Error('Entrada 3MF truncada.');
      total+=uncompressed;if(total>160*1024*1024)throw new Error('Conteúdo 3MF descompactado muito grande.');
      if(!name.toLowerCase().endsWith('.model')&&!name.endsWith('.rels')&&!name.endsWith('[Content_Types].xml'))continue;
      let contents;
      if(method===0)contents=data.slice(offset,offset+compressed);
      else if(method===8){
        if(typeof DecompressionStream!=='function')throw new Error('O navegador não suporta descompactar este 3MF.');
        const stream=new Blob([data.slice(offset,offset+compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        contents=new Uint8Array(await new Response(stream).arrayBuffer());
      }else throw new Error('3MF usa uma compactação ZIP não suportada.');
      if(contents.length!==uncompressed)throw new Error('Arquivo 3MF com tamanho interno inconsistente.');
      files.set(name,dec.decode(contents));
    }
    return files;
  }
  const direct=(parent,name)=>[...(parent?.children||[])].filter(n=>n.localName===name);
  const first=(parent,name)=>direct(parent,name)[0]||null;
  function applyTransform(p,m){
    if(!m)return p;
    return [p[0]*m[0]+p[1]*m[3]+p[2]*m[6]+m[9],p[0]*m[1]+p[1]*m[4]+p[2]*m[7]+m[10],p[0]*m[2]+p[1]*m[5]+p[2]*m[8]+m[11]];
  }
  function parseTransform(text,factor=1){
    if(!text)return null;
    const nums=text.trim().split(/\s+/).map(Number);
    if(nums.length!==12||nums.some(n=>!Number.isFinite(n)))throw new Error('Transformação 3MF inválida.');
    for(let i=9;i<12;i++)nums[i]*=factor;
    return nums;
  }
  async function parse3MF(buffer) {
    const files=await unzip3MF(buffer);
    const parts=new Map([...files.keys()].filter(p=>p.toLowerCase().endsWith('.model')).map(p=>[p.replace(/^\/+/, '').toLowerCase(),p]));
    const path=parts.get('3d/3dmodel.model')||parts.values().next().value;
    if(!path)throw new Error('O 3MF não possui modelo 3D acessível.');
    if(typeof DOMParser==='undefined')throw new Error('Este navegador não suporta a leitura de XML.');
    const units={micron:.001,millimeter:1,centimeter:10,meter:1000,inch:25.4,foot:304.8};
    const cache=new Map();
    const parsePart=(file)=>{
      if(cache.has(file))return cache.get(file);
      const doc=new DOMParser().parseFromString(files.get(file),'application/xml');
      if(doc.getElementsByTagName('parsererror').length)throw new Error('XML do modelo 3MF inválido: '+file);
      const root=doc.documentElement;
      if(root.localName!=='model')throw new Error('O 3MF contém um modelo incompatível: '+file);
      const unit=root.getAttribute('unit')||'millimeter',factor=units[unit];
      if(!factor)throw new Error('Unidade 3MF não reconhecida em '+file);
      const objects=new Map(),groups=new Map();
      for(const el of first(root,'resources')?.children||[]){
        if(el.localName==='colorgroup')groups.set(el.getAttribute('id'),direct(el,'color').map(x=>x.getAttribute('color')||DEFAULT_COLOR));
        if(el.localName==='basematerials')groups.set(el.getAttribute('id'),direct(el,'base').map(x=>x.getAttribute('displaycolor')||DEFAULT_COLOR));
        if(el.localName==='object')objects.set(el.getAttribute('id'),el);
      }
      const result={root,unit,factor,objects,groups};cache.set(file,result);return result;
    };
    const getPath=element=>element.getAttributeNS?.(PRODUCTION_NS,'path')||element.getAttribute('p:path')||element.getAttribute('path');
    const resolvePart=(reference,current)=>{
      if(!reference)return current;
      const name=reference.replaceAll('\\','/').replace(/^\/+/,''),folder=current.slice(0,current.lastIndexOf('/')+1);
      const possibilities=[name,folder+name,'3D/'+name];
      for(const candidate of possibilities){const match=parts.get(candidate.toLowerCase());if(match)return match;}
      throw new Error('O projeto 3MF referencia uma peça interna ausente: '+name);
    };
    const main=parsePart(path),coords=[],colors=[],components=[];let faces=0,textured=false;
    const emit=(id,file,chain=[],depth=0,visited=new Set())=>{
      if(depth>20)throw new Error('3MF com componentes recursivos demais.');
      const part=parsePart(file),obj=part.objects.get(String(id)),key=file+'#'+id;
      if(!obj)throw new Error('Peça '+id+' não encontrada dentro de '+file+'.');
      if(visited.has(key))throw new Error('Referência circular entre peças do 3MF.');
      const nextVisited=new Set(visited);nextVisited.add(key);
      const mesh=first(obj,'mesh');
      if(mesh){
        const start=faces;
        const vertices=direct(first(mesh,'vertices'),'vertex').map(v=>[Number(v.getAttribute('x'))*part.factor,Number(v.getAttribute('y'))*part.factor,Number(v.getAttribute('z'))*part.factor]);
        for(const tri of direct(first(mesh,'triangles'),'triangle')){
          const ids=['v1','v2','v3'].map(k=>Number(tri.getAttribute(k)));
          if(ids.some(n=>!Number.isInteger(n)||n<0||n>=vertices.length))throw new Error('Índice de vértice 3MF inválido.');
          for(const k of ids){let p=vertices[k].slice();for(let j=chain.length-1;j>=0;j--)p=applyTransform(p,chain[j]);coords.push(...p);}
          const pid=tri.getAttribute('pid')||obj.getAttribute('pid'),pi=Number(tri.getAttribute('p1')??obj.getAttribute('pindex')??0);
          colors.push(part.groups.get(pid)?.[pi]||DEFAULT_COLOR);
          if(pid&&!part.groups.has(pid))textured=true;
          if(++faces>MAX_TRIANGLES)throw new Error('3MF acima do limite de 500 mil triângulos.');
        }
        if(faces>start)components.push({name:obj.getAttribute('name')||'Peça '+(components.length+1),start,count:faces-start,source:file});
      }
      for(const component of direct(first(obj,'components'),'component')){
        const target=resolvePart(getPath(component),file);
        emit(component.getAttribute('objectid'),target,[...chain,parseTransform(component.getAttribute('transform'),part.factor)].filter(Boolean),depth+1,nextVisited);
      }
    };
    const items=direct(first(main.root,'build'),'item');
    if(items.length)for(const item of items)emit(item.getAttribute('objectid'),resolvePart(getPath(item),path),[parseTransform(item.getAttribute('transform'),main.factor)].filter(Boolean));
    else for(const obj of main.objects.values())if(obj.getAttribute('type')!=='support')emit(obj.getAttribute('id'),path);
    if(!coords.length)throw new Error('O 3MF não contém triângulos importáveis.');
    return meshFromCoords(coords,colors,{format:'3MF',originalUnits:main.unit,parts:items.length||main.objects.size,components,warning:textured?'Materiais avançados e texturas de projeto não são preservados.':''});
  }
  function separateMesh(mesh,mode='auto'){
    const n=mesh.triangles;
    let groups=[];
    const parts=mesh.metadata?.components||[];
    if(mode==='auto'&&parts.length>1){
      groups=parts.map(p=>({name:p.name,indices:Array.from({length:p.count},(_,i)=>p.start+i)}));
    }else if(mode==='color'){
      const byColor=new Map();
      for(let i=0;i<n;i++){
        const key=(mesh.colors?.[i]||DEFAULT_COLOR).slice(0,7).toLowerCase();
        if(!byColor.has(key))byColor.set(key,[]);byColor.get(key).push(i);
      }
      groups=[...byColor].map(([color,indices],i)=>({name:'Cor '+(i+1)+' · '+color,indices}));
    }else{
      if(n>160000)throw new Error('Separação automática de malhas limitada a 160 mil triângulos. Para 3MF, use a separação por componentes.');
      const parent=Int32Array.from({length:n},(_,i)=>i),rank=new Uint8Array(n);
      const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
      const join=(a,b)=>{a=root(a);b=root(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;};
      const ids=new Map(),edgeOwner=new Map();
      for(let i=0;i<n;i++){
        const keys=[];
        for(let v=0;v<3;v++){
          const at=i*9+v*3,key=[0,1,2].map(j=>Math.round(mesh.coords[at+j]*10000)).join(',');
          if(!ids.has(key))ids.set(key,ids.size);keys.push(ids.get(key));
        }
        for(let j=0;j<3;j++){
          const a=keys[j],b=keys[(j+1)%3],edge=a<b?a+'|'+b:b+'|'+a;
          if(edgeOwner.has(edge))join(i,edgeOwner.get(edge));else edgeOwner.set(edge,i);
        }
      }
      const mapped=new Map();for(let i=0;i<n;i++){const r=root(i);if(!mapped.has(r))mapped.set(r,[]);mapped.get(r).push(i);}
      groups=[...mapped.values()].map((indices,i)=>({name:'Peça '+(i+1),indices}));
    }
    if(groups.length>250)throw new Error('Mais de 250 peças identificadas. Simplifique o modelo antes da exportação.');
    return groups.map(({name,indices},i)=>{
      const coords=new Float32Array(indices.length*9),colors=[];
      indices.forEach((tri,j)=>{coords.set(mesh.coords.subarray(tri*9,tri*9+9),j*9);colors.push(mesh.colors?.[tri]||DEFAULT_COLOR);});
      return {name:name||'Peça '+(i+1),mesh:meshFromCoords(coords,colors,{format:'Peça separada'}),sourceTriangles:indices};
    }).sort((a,b)=>b.mesh.triangles-a.mesh.triangles);
  }
  function export3MF(mesh,scale=1){
    if(mesh.triangles>MAX_TRIANGLES)throw new Error('Modelo muito grande para exportação.');
    const vertices=[],triangles=[],lookup=new Map(),palette=[],colorIds=new Map();
    for(let i=0;i<mesh.triangles;i++){
      const ids=[];
      for(let j=0;j<3;j++){
        const p=[mesh.coords[i*9+j*3]*scale,mesh.coords[i*9+j*3+1]*scale,mesh.coords[i*9+j*3+2]*scale];
        const key=p.map(x=>x.toFixed(5)).join('|');
        let id=lookup.get(key);
        if(id===undefined){id=vertices.length;vertices.push(p);lookup.set(key,id);}
        ids.push(id);
      }
      const hex=String(mesh.colors?.[i]||DEFAULT_COLOR).slice(0,7).toUpperCase();
      let ci=colorIds.get(hex);if(ci===undefined){ci=palette.length;palette.push(hex);colorIds.set(hex,ci);}
      triangles.push([ids[0],ids[1],ids[2],ci]);
    }
    const vert=vertices.map(p=>'<vertex x="'+p[0]+'" y="'+p[1]+'" z="'+p[2]+'"/>').join('');
    const tris=triangles.map(t=>'<triangle v1="'+t[0]+'" v2="'+t[1]+'" v3="'+t[2]+'" pid="2" p1="'+t[3]+'"/>').join('');
    const model='<?xml version="1.0" encoding="UTF-8"?>'+
      '<model unit="millimeter" xml:lang="pt-BR" xmlns="'+CORE_NS+'" xmlns:m="'+MATERIAL_NS+'" requiredextensions="m">'+
      '<resources><m:colorgroup id="2">'+palette.map(c=>'<m:color color="'+c+'FF"/>').join('')+'</m:colorgroup>'+
      '<object id="1" type="model" pid="2" pindex="0"><mesh><vertices>'+vert+'</vertices><triangles>'+tris+'</triangles></mesh></object></resources>'+
      '<build><item objectid="1"/></build></model>';
    const files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
      '3D/3dmodel.model':model
    };
    return zipFiles(files);
  }
  function cutMesh(mesh,axis=2,percent=.5){
    if(mesh.triangles>150000)throw new Error('Para corte, utilize modelos com até 150 mil triângulos.');
    axis=clamp(Number(axis)||0,0,2);percent=clamp(Number(percent)||.5,.01,.99);
    const position=mesh.min[axis]+mesh.dimensions[axis]*percent,negative=[],positive=[],negColors=[],posColors=[],segments=[],EPS=1e-5;
    const projected=p=>axis===0?[p[1],p[2]]:axis===1?[p[2],p[0]]:[p[0],p[1]];
    const clip=(poly,sign)=>{
      const result=[];
      for(let j=0;j<poly.length;j++){
        const a=poly[j],b=poly[(j+1)%poly.length],da=(a[axis]-position)*sign,db=(b[axis]-position)*sign;
        if(da<=EPS)result.push(a);
        if((da< -EPS&&db>EPS)||(da>EPS&&db< -EPS)){
          const t=(position-a[axis])/(b[axis]-a[axis]);
          const p=a.map((x,k)=>x+(b[k]-x)*t);p[axis]=position;result.push(p);
        }
      }
      return result;
    };
    const triangulate=(poly,target,colors,color)=>{
      for(let j=1;j<poly.length-1;j++){
        const a=poly[0],b=poly[j],c=poly[j+1];
        if(Math.hypot(...a.map((x,k)=>x-b[k]))<EPS||Math.hypot(...a.map((x,k)=>x-c[k]))<EPS)continue;
        target.push(...a,...b,...c);colors.push(color);
      }
    };
    for(let i=0;i<mesh.triangles;i++){
      const points=[0,1,2].map(j=>Array.from(mesh.coords.slice(i*9+j*3,i*9+j*3+3))),color=mesh.colors?.[i]||DEFAULT_COLOR;
      triangulate(clip(points,1),negative,negColors,color);
      triangulate(clip(points,-1),positive,posColors,color);
      const intersections=[];
      for(let j=0;j<3;j++){
        const a=points[j],b=points[(j+1)%3],da=a[axis]-position,db=b[axis]-position;
        if(Math.abs(da)<=EPS)intersections.push(a.map((x,k)=>k===axis?position:x));
        if((da< -EPS&&db>EPS)||(da>EPS&&db< -EPS)){
          const t=-da/(db-da),p=a.map((x,k)=>x+(b[k]-x)*t);p[axis]=position;intersections.push(p);
        }
      }
      const unique=new Map(intersections.map(p=>[p.map(x=>Math.round(x*10000)).join(','),p]));
      if(unique.size===2)segments.push([...unique.values()]);
    }
    if(!negative.length||!positive.length||!segments.length)throw new Error('O plano não atravessa o interior desta malha.');
    const quant=p=>p.map(x=>Math.round(x*10000)).join(',');
    const points=new Map(),neighbors=new Map(),edges=[],edgeKeys=new Set();
    for(const [a,b] of segments){
      const k1=quant(a),k2=quant(b);if(k1===k2)continue;
      points.set(k1,a);points.set(k2,b);
      const key=[k1,k2].sort().join('~');
      if(edgeKeys.has(key))continue;
      edgeKeys.add(key);
      edges.push({a:k1,b:k2,key});
      if(!neighbors.has(k1))neighbors.set(k1,[]);if(!neighbors.has(k2))neighbors.set(k2,[]);
      neighbors.get(k1).push(k2);neighbors.get(k2).push(k1);
    }
    const used=new Set(),loops=[];let openLoops=0;
    for(const edge of edges){
      if(used.has(edge.key))continue;
      const loop=[edge.a],start=edge.a;let previous=edge.a,current=edge.b;used.add(edge.key),loop.push(current);
      while(current!==start&&loop.length<200000){
        const next=(neighbors.get(current)||[]).find(k=>k!==previous&&!used.has([k,current].sort().join('~')));
        if(!next)break;
        used.add([current,next].sort().join('~'));previous=current;current=next;loop.push(current);
      }
      if(current===start&&loop.length>3){loop.pop();loops.push(loop.map(k=>points.get(k)));}
      else openLoops++;
    }
    function earClip(loop,desiredPositive,target,colors){
      const verts=loop.slice(),uv=verts.map(projected);
      const area=uv.reduce((s,p,i)=>{const n=uv[(i+1)%uv.length];return s+p[0]*n[1]-n[0]*p[1];},0);
      if(area<0){verts.reverse();uv.reverse();}
      const indices=verts.map((_,i)=>i),out=[];
      const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const inside=(p,a,b,c)=>{
        const c1=cross(a,b,p),c2=cross(b,c,p),c3=cross(c,a,p);
        return c1>=-EPS&&c2>=-EPS&&c3>=-EPS;
      };
      let safety=0;
      while(indices.length>2&&safety++<verts.length*verts.length){
        let found=false;
        for(let i=0;i<indices.length;i++){
          const ia=indices[(i+indices.length-1)%indices.length],ib=indices[i],ic=indices[(i+1)%indices.length];
          if(cross(uv[ia],uv[ib],uv[ic])<=EPS)continue;
          if(indices.some(j=>j!==ia&&j!==ib&&j!==ic&&inside(uv[j],uv[ia],uv[ib],uv[ic])))continue;
          if(desiredPositive)out.push(...verts[ia],...verts[ib],...verts[ic]);
          else out.push(...verts[ia],...verts[ic],...verts[ib]);
          indices.splice(i,1);found=true;break;
        }
        if(!found)return false;
      }
      for(let i=0;i<out.length;i+=9){target.push(...out.slice(i,i+9));colors.push('#e6d38d');}
      return true;
    }
    let capFailures=0;
    for(const loop of loops){if(!earClip(loop,true,negative,negColors))capFailures++;if(!earClip(loop,false,positive,posColors))capFailures++;}
    const left=meshFromCoords(negative,negColors,{format:'STL',part:'A'}),right=meshFromCoords(positive,posColors,{format:'STL',part:'B'});
    return {left,right,loops:loops.length,openLoops,capFailures,warning:(openLoops||capFailures)?'Alguns contornos não puderam ser tampados; revise as duas partes no fatiador.':loops.length>1?'Atenção: cortes com furos internos ou múltiplos contornos devem ser verificados no fatiador.':''};
  }
  global.MeshTools={meshFromCoords,parseSTL,parseOBJ,parse3MF,separateMesh,exportSTL,export3MF,cutMesh,zipFiles,DEFAULT_COLOR};
})(typeof window==='undefined'?globalThis:window);
