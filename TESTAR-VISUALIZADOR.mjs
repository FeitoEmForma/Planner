import assert from 'node:assert/strict';
import './mesh-viewer.js';
globalThis.MeshTools={DEFAULT_COLOR:'#79ad8b'};

const viewer=globalThis.Feito3DViewer;
assert(viewer&&viewer.geometry&&viewer.updateScale,'Visualizador não foi exportado');
const {multiply,lookAt,perspective}=viewer.geometry;
const matrix=multiply(perspective(Math.PI/4,4/3,.1,1000),lookAt([0,-100,70],[0,0,0]));
const project=p=>{
  const v=[...p,1],result=[0,0,0,0];
  for(let row=0;row<4;row++)for(let col=0;col<4;col++)result[row]+=matrix[col*4+row]*v[col];
  return result.map(x=>x/result[3]);
};
assert(Math.abs(project([0,0,0])[0])<1e-5,'Centro fora da tela');
assert(Math.abs(project([0,0,0])[1])<1e-5,'Centro fora da tela');
assert(project([10,0,0])[0]>project([0,0,0])[0],'Eixo X não aparece à direita');
assert(project([0,0,10])[1]>project([0,0,0])[1],'Eixo Z não sobe na tela');

const calls=[],listeners={};
const gl=new Proxy({
  FRAMEBUFFER_COMPLETE:36053,
  getShaderParameter:()=>true,
  getProgramParameter:()=>true,
  checkFramebufferStatus:()=>36053,
  getUniformLocation:()=>({}),
  getShaderInfoLog:()=>'',
  getProgramInfoLog:()=>'',
  createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),
  createVertexArray:()=>({}),createFramebuffer:()=>({}),
  createTexture:()=>({}),createRenderbuffer:()=>({}),
  drawArrays:(mode,first,count)=>calls.push({mode,first,count}),
  readPixels:(x,y,w,h,format,type,out)=>{out[0]=1;out[1]=0;out[2]=0;out[3]=255;},
  getExtension:()=>null
},{get:(target,name)=>name in target?target[name]:typeof name==='string'&&name===name.toUpperCase()?name:()=>{}});
const canvas={
  width:0,height:0,clientHeight:500,isConnected:true,
  getContext:()=>gl,getBoundingClientRect:()=>({left:0,top:0,bottom:500,width:800,height:500}),
  addEventListener:(type,fn)=>{listeners[type]=fn;},
  setPointerCapture:()=>{},
  insertAdjacentElement:()=>{}
};
globalThis.ResizeObserver=class{observe(){} disconnect(){}};
globalThis.document={querySelector:()=>null,createElement:()=>({})};
const mesh={
  coords:new Float32Array([0,0,0,50,0,0,0,50,0,0,0,10,0,50,10,50,0,10]),
  triangles:2,min:[0,0,0],max:[50,50,10],dimensions:[50,50,10],colors:[]
};
const state={model:{name:'amostra.3mf',mesh,scale:1},rotation:{x:.55,y:-.75,scale:1},toolMode:'paint',paintColor:'#ff0000',paintUndo:[],splitParts:[],cutAxis:2,cutPercent:50};
const notices=[];
viewer.mount(canvas,state,(msg,error)=>notices.push({msg,error}));
assert(!notices.length,'Visualizador não deve relatar erro: '+JSON.stringify(notices));
assert(calls.some(c=>c.mode==='TRIANGLES'&&c.count===mesh.triangles*3),'A geometria completa não foi enviada para renderização');
listeners.pointerdown({pointerId:1,clientX:400,clientY:220,button:0,shiftKey:false});
assert.equal(mesh.colors[0],'#ff0000','Pintura não atingiu a face visível');
assert.equal(state.paintUndo.length,1,'Pintura não foi registrada para desfazer');
viewer.updateScale(1.5);
assert(calls.some(c=>c.mode==='TRIANGLES'&&c.count===6),'Redesenho após escala não ocorreu');
viewer.dispose();
console.log('OK: projeção XYZ, envio de todas as faces à GPU, seleção, pintura e escala.');
