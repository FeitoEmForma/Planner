import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const path=new URL('.',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,path),'utf8');
const context={Float32Array,Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,Blob,Map,Set,Math,JSON,Number,confirm:()=>true};
context.globalThis=context;vm.createContext(context);
vm.runInContext(read('mesh-tools.js'),context);
vm.runInContext(read('model-builder.js'),context);
vm.runInContext(read('tool-panel.js'),context);
const {Feito3DBuilder:B,MeshTools:M}=context;
function countEdges(coords){
  const edges=new Map();
  const key=(c,i)=>Array.from(c.slice(i,i+3)).map(n=>String(Math.round(n*1e3)/1e3)).join('|');
  for(let i=0;i<coords.length;i+=9){
    const p=[key(coords,i),key(coords,i+3),key(coords,i+6)];
    assert.equal(new Set(p).size,3,'Triângulo degenerado');
    for(let j=0;j<3;j++){
      const edge=[p[j],p[(j+1)%3]].sort().join('>');
      edges.set(edge,(edges.get(edge)||0)+1);
    }
  }
  for(const uses of edges.values())assert.equal(uses,2,'A malha deveria ser fechada (duas faces por aresta).');
}
for(const shape of Object.keys(B.SHAPES)){
  const shapeObject=B.makeObject(shape),mesh=B.compose({objects:[shapeObject]});
  assert.ok(mesh.volume>0&&mesh.triangles>0,shape+' deve ter volume positivo.');
  assert.ok(mesh.dimensions.every(x=>x>0),shape+' deve ter dimensões.');
  assert.equal(mesh.colors.length,mesh.triangles);
  countEdges(mesh.coords);
  const stl=M.exportSTL(mesh);
  const restored=M.parseSTL(await stl.arrayBuffer());
  assert.equal(restored.triangles,mesh.triangles);
  assert.equal(Math.round(restored.volume),Math.round(mesh.volume));
  const output=M.export3MF(mesh);
  assert.equal((await output.arrayBuffer()).byteLength>100,true);
}
const p=B.parsePolygon('0,0; 60,0; 60,25; 32,25; 32,50; 0,50');
assert.equal(p.length,6);
assert.throws(()=>B.parsePolygon('0,0; 10,10; 0,10; 10,0'),/vazio|alinhados/);
const objs=[B.makeObject('box'),B.makeObject('sphere')];
objs[1].pos=[44,0,0];objs[1].rot=[12,23,37];
const composite=B.compose({objects:objs});
assert.equal(composite.metadata.components.length,2);
countEdges(composite.coords);
for(const tool of ['inflate','deflate','smooth']){
  const sculpted=B.sculpt(M.meshFromCoords(composite.coords.slice(),composite.colors,composite.metadata),20,18,2,tool);
  assert.equal(sculpted.triangles,composite.triangles);
  countEdges(sculpted.coords);
}
const clean=B.validateProject({version:1,objects:objs});
assert.equal(clean.objects.length,2);
assert.throws(()=>B.validateProject({version:2,objects:objs}));
const state={model:null,builder:null,toolMode:'splitparts',rotation:{x:.5,y:-.7,scale:1,pan:[0,0,0]},splitParts:[],paintUndo:[],paintColor:'#69ad78',cutAxis:2,cutPercent:50,profile:{printer:'A1',material:'PLA',quality:'Equilibrado',infill:15,pattern:'Gyroid',support:'Automático'}};
const P=context.Feito3DPanel;
let notices=[],renders=0;const render=()=>renders++,notify=(s,b)=>notices.push([s,b]);
await P.action('mode-create',state,render,notify);
assert.equal(state.builder.objects.length,1);
await P.action('create-add-sphere',state,render,notify);
assert.equal(state.builder.objects.length,2);
assert.match(P.render(state,{}),/Criar e modelar peças/);
assert.match(P.render(state,{}),/model-canvas/);
P.handleChange({target:{id:'create-dim-0',value:'55'}},state,render,notify);
assert.equal(state.builder.objects[1].dim[0],55);
await P.action('create-sub-sculpt',state,render,notify);
P.bindCanvas(state,notify,render);
state.onSculpt(10);
assert.equal(state.builder.sculptUndo.length,1);
await P.action('create-sculpt-undo',state,render,notify);
assert.equal(state.builder.sculptUndo.length,0);
await P.action('create-undo',state,render,notify);
assert.equal(state.builder.objects[1].dim[0],35);
const index=read('index.html'),app=read('app.js'),calc=read('calculadora/assets/js/app.js');
assert.doesNotMatch(index,/id="guestAccess"/);
assert.doesNotMatch(index,/id="authSignup"/);
assert.doesNotMatch(index,/id="guestCalculator"/);
assert.doesNotMatch(index,/model-builder\.js/);
assert.doesNotMatch(app,/function showGuest\(/);
assert.doesNotMatch(app,/db\.auth\.signUp/);
assert.match(calc,/location\.replace\('\.\.\/index\.html'\)/);
console.log('OK: laboratório 3D preservado mas fora do menu, login sem visitante e rota de convidado desativada.');
