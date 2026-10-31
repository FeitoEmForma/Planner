/* Feito em Forma — visualizador WebGL2 original.
 * Desenha TODOS os triângulos com depth buffer (sem amostragem/ordenação 2D).
 * Sistema de coordenadas: XY é a mesa, Z é a altura, em milímetros.
 */
(function (global) {
  'use strict';
  let active = null;
  const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const sub = (a,b) => a.map((x,i)=>x-b[i]);
  const add = (a,b) => a.map((x,i)=>x+b[i]);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm = a => {const l=Math.hypot(...a)||1;return a.map(x=>x/l);};
  function multiply(a,b) {
    const result=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)
      for(let k=0;k<4;k++)result[c*4+r]+=a[k*4+r]*b[c*4+k];
    return result;
  }
  function perspective(fov,aspect,near,far) {
    const f=1/Math.tan(fov/2),nf=1/(near-far);
    return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);
  }
  function lookAt(eye,target,up=[0,0,1]) {
    const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);
    return new Float32Array([
      x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,
      -dot(x,eye),-dot(y,eye),-dot(z,eye),1
    ]);
  }
  function rgb(value) {
    const raw=String(value||'#a9d3b8').replace('#','');
    if(!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(raw))return [169,211,184];
    return [0,2,4].map(i=>parseInt(raw.slice(i,i+2),16));
  }
  function compile(gl,type,source) {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);
      throw new Error('Erro no renderizador 3D: '+message);
    }
    return shader;
  }
  function program(gl,vsource,fsource){
    const p=gl.createProgram(),v=compile(gl,gl.VERTEX_SHADER,vsource),f=compile(gl,gl.FRAGMENT_SHADER,fsource);
    gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
    gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
      const message=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw new Error('Erro ao iniciar renderização: '+message);
    }
    return p;
  }
  const vertex=`#version 300 es
    layout(location=0) in vec3 a_pos;
    layout(location=1) in vec3 a_normal;
    layout(location=2) in vec3 a_color;
    uniform mat4 u_matrix;
    uniform float u_scale;
    out vec3 v_normal;
    out vec3 v_color;
    void main(){
      gl_Position=u_matrix*vec4(a_pos*u_scale,1.0);
      v_normal=a_normal;
      v_color=a_color;
    }`;
  const fragment=`#version 300 es
    precision highp float;
    in vec3 v_normal;
    in vec3 v_color;
    out vec4 outColor;
    void main(){
      vec3 n=normalize(gl_FrontFacing?v_normal:-v_normal);
      float key=max(dot(n,normalize(vec3(-0.46,-0.32,0.84))),0.0);
      float fill=max(dot(n,normalize(vec3(0.7,0.42,0.57))),0.0);
      vec3 lit=v_color*(0.58+0.33*key+0.12*fill);
      outColor=vec4(lit,1.0);
    }`;
  const pickVertex=`#version 300 es
    layout(location=0) in vec3 a_pos;
    uniform mat4 u_matrix;
    uniform float u_scale;
    flat out int v_id;
    void main(){
      gl_Position=u_matrix*vec4(a_pos*u_scale,1.0);
      v_id=gl_VertexID/3+1;
    }`;
  const pickFragment=`#version 300 es
    precision highp float;
    flat in int v_id;
    out vec4 outColor;
    void main(){
      outColor=vec4(float(v_id&255)/255.0,float((v_id>>8)&255)/255.0,float((v_id>>16)&255)/255.0,1.0);
    }`;
  const lineVertex=`#version 300 es
    layout(location=0) in vec3 a_pos;
    uniform mat4 u_matrix;
    void main(){gl_Position=u_matrix*vec4(a_pos,1.0);}`;
  const lineFragment=`#version 300 es
    precision highp float;
    uniform vec4 u_color;
    out vec4 outColor;
    void main(){outColor=u_color;}`;
  class Viewer {
    constructor(canvas,state,notify) {
      this.canvas=canvas;this.state=state;this.notify=notify;this.disposed=false;
      const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,depth:true,preserveDrawingBuffer:false});
      if(!gl)throw new Error('A visualização 3D precisa de WebGL2. Habilite aceleração de hardware no navegador.');
      this.gl=gl;
      this.main=program(gl,vertex,fragment);
      this.pickProgram=program(gl,pickVertex,pickFragment);
      this.lineProgram=program(gl,lineVertex,lineFragment);
      this.mesh=state.toolMode==='splitparts'&&Number.isInteger(state.focusPart)?
        state.splitParts?.[state.focusPart]?.mesh||state.model.mesh:state.model.mesh;
      this.model=state.model;
      this.scale=state.model.scale;
      this.count=this.mesh.triangles*3;
      this.bounds=this.boundsFor(this.mesh);
      this.installBuffers();
      this.initGrid();
      this.initPicker();
      this.installEvents();
      this.resizeObserver=new ResizeObserver(()=>this.resize());
      this.resizeObserver.observe(canvas);
      this.resize();
    }
    boundsFor(mesh) {
      const s=this.scale;
      const min=mesh.min.map(x=>x*s),max=mesh.max.map(x=>x*s);
      const center=min.map((x,i)=>(x+max[i])/2);
      const dim=min.map((x,i)=>max[i]-x);
      const diameter=Math.max(1,Math.hypot(...dim));
      return {min,max,center,dim,diameter};
    }
    installBuffers() {
      const gl=this.gl,mesh=this.mesh,vertices=mesh.coords;
      const normals=new Float32Array(vertices.length),colors=new Uint8Array(this.count*3);
      for(let face=0;face<mesh.triangles;face++){
        const off=face*9,a=[vertices[off],vertices[off+1],vertices[off+2]];
        const b=[vertices[off+3],vertices[off+4],vertices[off+5]];
        const c=[vertices[off+6],vertices[off+7],vertices[off+8]];
        const n=norm(cross(sub(b,a),sub(c,a))),color=rgb(mesh.colors?.[face]);
        for(let point=0;point<3;point++){
          normals.set(n,off+point*3);
          colors.set(color,off+point*3);
        }
      }
      this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
      this.posBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
      this.normalBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,normals,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
      this.colorBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,colors,gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.UNSIGNED_BYTE,true,0,0);
      gl.bindVertexArray(null);this.colors=colors;
    }
    initGrid(){
      const gl=this.gl,b=this.bounds;
      const size=Math.max(256,Math.ceil(Math.max(b.dim[0],b.dim[1])*1.15/20)*20);
      const z=Math.min(0,b.min[2])-.5,half=size/2,cx=b.center[0],cy=b.center[1];
      this.plateSize=size;
      const lines=[],outline=[],step=size>1500?100:size>500?50:20;
      for(let offset=-half;offset<=half+.00001;offset+=step){
        lines.push(cx-half,cy+offset,z,cx+half,cy+offset,z);
        lines.push(cx+offset,cy-half,z,cx+offset,cy+half,z);
      }
      outline.push(cx-half,cy-half,z,cx+half,cy-half,z,cx+half,cy-half,z,cx+half,cy+half,z,
        cx+half,cy+half,z,cx-half,cy+half,z,cx-half,cy+half,z,cx-half,cy-half,z);
      this.gridCount=lines.length/3;this.outlineCount=outline.length/3;
      this.gridBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.gridBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(lines),gl.STATIC_DRAW);
      this.outlineBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.outlineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(outline),gl.STATIC_DRAW);
      this.axes=[
        [cx-half,cy-half,z,cx-half+Math.min(65,size/3),cy-half,z],
        [cx-half,cy-half,z,cx-half,cy-half+Math.min(65,size/3),z],
        [cx-half,cy-half,z,cx-half,cy-half,z+Math.min(65,size/3)]
      ];
      this.axesBuffer=this.axes.map(points=>{
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);return buffer;
      });
    }
    initPicker() {
      const gl=this.gl;
      this.framebuffer=gl.createFramebuffer();
      this.pickTexture=gl.createTexture();
      this.pickDepth=gl.createRenderbuffer();
      this.pickWidth=0;this.pickHeight=0;
    }
    sizePicker(w,h) {
      if(this.pickWidth===w&&this.pickHeight===h)return;
      const gl=this.gl;this.pickWidth=w;this.pickHeight=h;
      gl.bindTexture(gl.TEXTURE_2D,this.pickTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.bindRenderbuffer(gl.RENDERBUFFER,this.pickDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.pickTexture,0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.pickDepth);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Seleção de faces indisponível nesta placa gráfica.');
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    camera() {
      const state=this.state,r=state.rotation,center=this.bounds.center;
      const pan=r.pan||[0,0,0],target=add(center,pan),aspect=this.canvas.width/Math.max(this.canvas.height,1);
      const phi=clamp(r.x??.55,-1.52,1.52),theta=r.y??-.75;
      const radius=this.bounds.diameter/2;
      const base=(radius/Math.sin(Math.PI/8))*1.75/Math.min(1,aspect);
      const dist=base/clamp(r.scale||1,.12,40);
      const eye=[target[0]+dist*Math.cos(phi)*Math.sin(theta),
        target[1]-dist*Math.cos(phi)*Math.cos(theta),
        target[2]+dist*Math.sin(phi)];
      const near=Math.max(.005,dist/2000),far=Math.max(dist+this.bounds.diameter*8,dist*25,1000);
      const view=lookAt(eye,target);
      return {matrix:multiply(perspective(Math.PI/4,aspect,near,far),view),dist,eye,target};
    }
    resize(){
      if(this.disposed)return;
      const rect=this.canvas.getBoundingClientRect();
      if(rect.width<1||rect.height<1)return;
      const dpr=Math.min(global.devicePixelRatio||1,1.65),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.sizePicker(w,h);}
      this.draw();
    }
    updateScale(scale){
      if(this.disposed||!Number.isFinite(scale)||scale<=0)return;
      this.scale=scale;
      this.bounds=this.boundsFor(this.mesh);
      const gl=this.gl;
      for(const buffer of [this.gridBuffer,this.outlineBuffer,...this.axesBuffer])if(buffer)gl.deleteBuffer(buffer);
      this.initGrid();
      this.draw();
    }
    useLineBuffer(buffer,camera,color,count,mode){
      const gl=this.gl;
      gl.useProgram(this.lineProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram,'u_matrix'),false,camera.matrix);
      gl.uniform4fv(gl.getUniformLocation(this.lineProgram,'u_color'),color);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
      gl.drawArrays(mode,0,count);
      gl.disableVertexAttribArray(0);
    }
    drawCutPlane(camera){
      if(this.state.toolMode!=='cut')return;
      const gl=this.gl,b=this.bounds,axis=this.state.cutAxis??2;
      const pos=b.min[axis]+b.dim[axis]*this.state.cutPercent/100;
      const other=[0,1,2].filter(i=>i!==axis),corners=[];
      for(const uv of [[0,0],[1,0],[1,1],[0,1]]){
        const p=[0,0,0];p[axis]=pos;p[other[0]]=uv[0]?b.max[other[0]]:b.min[other[0]];
        p[other[1]]=uv[1]?b.max[other[1]]:b.min[other[1]];corners.push(p);
      }
      const flat=[...corners[0],...corners[1],...corners[2],...corners[0],...corners[2],...corners[3]];
      const line=[...corners[0],...corners[1],...corners[1],...corners[2],...corners[2],...corners[3],...corners[3],...corners[0]];
      if(!this.cutBuffer)this.cutBuffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,this.cutBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(flat),gl.DYNAMIC_DRAW);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
      this.useLineBuffer(this.cutBuffer,camera,[.96,.64,.19,.12],6,gl.TRIANGLES);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(line),gl.DYNAMIC_DRAW);
      this.useLineBuffer(this.cutBuffer,camera,[.89,.49,.09,.96],8,gl.LINES);
      gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
    }
    draw(){
      if(this.disposed||!this.canvas.width||!this.canvas.height)return;
      const gl=this.gl,camera=this.camera();
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
      gl.clearColor(.963,.980,.966,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
      this.useLineBuffer(this.gridBuffer,camera,[.84,.89,.85,1],this.gridCount,gl.LINES);
      this.useLineBuffer(this.outlineBuffer,camera,[.43,.61,.48,1],this.outlineCount,gl.LINES);
      [[.86,.31,.28,1],[.32,.66,.41,1],[.3,.48,.88,1]].forEach((color,i)=>
        this.useLineBuffer(this.axesBuffer[i],camera,color,2,gl.LINES));
      gl.useProgram(this.main);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.main,'u_matrix'),false,camera.matrix);
      gl.uniform1f(gl.getUniformLocation(this.main,'u_scale'),this.scale);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES,0,this.count);
      gl.bindVertexArray(null);
      this.drawCutPlane(camera);
    }
    faceAt(e) {
      const gl=this.gl,rect=this.canvas.getBoundingClientRect();
      const x=Math.floor((e.clientX-rect.left)*this.canvas.width/rect.width);
      const y=Math.floor((rect.bottom-e.clientY)*this.canvas.height/rect.height);
      if(x<0||x>=this.canvas.width||y<0||y>=this.canvas.height)return -1;
      const camera=this.camera(),pixel=new Uint8Array(4);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
      gl.viewport(0,0,this.canvas.width,this.canvas.height);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
      gl.useProgram(this.pickProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.pickProgram,'u_matrix'),false,camera.matrix);
      gl.uniform1f(gl.getUniformLocation(this.pickProgram,'u_scale'),this.scale);
      gl.bindVertexArray(this.vao);gl.drawArrays(gl.TRIANGLES,0,this.count);
      gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      const face=(pixel[0]|pixel[1]<<8|pixel[2]<<16)-1;
      return face>=0&&face<this.mesh.triangles?face:-1;
    }
    paint(e) {
      if(this.state.toolMode!=='paint')return;
      const now=performance.now();
      if(this.lastPaint!==undefined&&now-this.lastPaint<50)return;
      this.lastPaint=now;
      const face=this.faceAt(e);
      if(face<0)return;
      const color=this.state.paintColor||'#69ad78',old=this.mesh.colors?.[face]||global.MeshTools.DEFAULT_COLOR;
      if(old.toLowerCase()===color.toLowerCase())return;
      this.mesh.colors ||= [];
      this.mesh.colors[face]=color;
      this.state.paintUndo ||= [];
      this.state.paintUndo.push({index:face,previous:old});
      if(this.state.paintUndo.length>400)this.state.paintUndo.shift();
      const shade=rgb(color),patch=new Uint8Array([...shade,...shade,...shade]);
      this.colors.set(patch,face*9);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.colorBuffer);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER,face*9,patch);
      const value=document.querySelector('#studio-workbench .tool-data');
      if(value)value.textContent=this.mesh.colors.filter(c=>c&&c.toLowerCase()!==global.MeshTools.DEFAULT_COLOR.toLowerCase()).length.toLocaleString('pt-BR');
      this.draw();
    }
    pan(dx,dy) {
      const r=this.state.rotation,camera=this.camera(),scale=2*camera.dist*Math.tan(Math.PI/8)/Math.max(this.canvas.clientHeight,1);
      const forward=norm(sub(camera.target,camera.eye)),right=norm(cross(forward,[0,0,1])),up=norm(cross(right,forward));
      const pan=r.pan||[0,0,0];
      r.pan=add(pan,add(right.map(x=>-x*dx*scale),up.map(x=>x*dy*scale)));
    }
    installEvents() {
      const canvas=this.canvas,state=this.state;
      const pointers=new Map();let mode=null,lastPinch=0,lastCenter=null,startPoint=null;
      const down=e=>{
        if(this.disposed)return;
        canvas.setPointerCapture?.(e.pointerId);
        pointers.set(e.pointerId,[e.clientX,e.clientY]);startPoint=[e.clientX,e.clientY];
        if(pointers.size>=2){mode='pinch';lastPinch=0;lastCenter=null;return;}
        mode=state.toolMode==='paint'&&e.button===0&&!e.shiftKey?'paint':
          state.toolMode==='create'&&state.builder?.mode==='sculpt'&&e.button===0&&!e.shiftKey?'sculpt':
          (e.button===2?'pan':'orbit');
        if(mode==='paint')this.paint(e);
      };
      const move=e=>{
        if(!pointers.has(e.pointerId)||this.disposed)return;
        const prev=pointers.get(e.pointerId);
        pointers.set(e.pointerId,[e.clientX,e.clientY]);
        if(pointers.size>=2){
          const pair=[...pointers.values()],gap=Math.hypot(pair[0][0]-pair[1][0],pair[0][1]-pair[1][1]);
          const center=[(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2];
          if(lastPinch>0)state.rotation.scale=clamp((state.rotation.scale||1)*gap/lastPinch,.12,40);
          if(lastCenter)this.pan(center[0]-lastCenter[0],center[1]-lastCenter[1]);
          lastPinch=gap;lastCenter=center;this.draw();return;
        }
        if(mode==='paint'){this.paint(e);return;}
        if(mode==='sculpt')return;
        if(mode==='pan')this.pan(e.clientX-prev[0],e.clientY-prev[1]);
        else {
          state.rotation.y+=(e.clientX-prev[0])*.009;
          state.rotation.x=clamp(state.rotation.x+(e.clientY-prev[1])*.009,-1.52,1.52);
        }
        this.draw();
      };
      const up=e=>{
        const doSculpt=mode==='sculpt'&&startPoint&&Math.hypot(e.clientX-startPoint[0],e.clientY-startPoint[1])<9;
        pointers.delete(e.pointerId);
        if(pointers.size<2){lastPinch=0;lastCenter=null;mode=null;startPoint=null;}
        if(doSculpt){const face=this.faceAt(e);if(face>=0)state.onSculpt?.(face);}
      };
      canvas.addEventListener('pointerdown',down);
      canvas.addEventListener('pointermove',move);
      canvas.addEventListener('pointerup',up);
      canvas.addEventListener('pointercancel',up);
      canvas.addEventListener('wheel',e=>{
        e.preventDefault();
        state.rotation.scale=clamp((state.rotation.scale||1)*Math.exp(-e.deltaY*.0013),.12,40);
        this.draw();
      },{passive:false});
      canvas.addEventListener('dblclick',()=>{state.rotation={x:.53,y:-.72,scale:1,pan:[0,0,0]};this.draw();});
      canvas.addEventListener('contextmenu',e=>e.preventDefault());
    }
    dispose() {
      if(this.disposed)return;
      this.disposed=true;this.resizeObserver?.disconnect();
      const gl=this.gl;
      for(const b of [this.posBuffer,this.normalBuffer,this.colorBuffer,this.gridBuffer,this.outlineBuffer,this.cutBuffer,...this.axesBuffer])if(b)gl.deleteBuffer(b);
      gl.deleteVertexArray(this.vao);
      for(const p of [this.main,this.pickProgram,this.lineProgram])gl.deleteProgram(p);
      gl.deleteTexture(this.pickTexture);gl.deleteRenderbuffer(this.pickDepth);gl.deleteFramebuffer(this.framebuffer);
      this.canvas.redrawModel=null;
      // O painel troca de canvas ao alternar ferramentas; libera o contexto antigo.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
  function mount(canvas,state,notify){
    dispose();
    if(!canvas||!state.model)return;
    try{
      active=new Viewer(canvas,state,notify);
      canvas.redrawModel=()=>active?.draw();
    }catch(error){
      notify(error.message,true);
      const message=document.createElement('p');
      message.className='studio-render-error';message.textContent=error.message;
      canvas.insertAdjacentElement('afterend',message);
    }
  }
  function updateScale(scale){active?.updateScale(scale);}
  function dispose(){if(active){active.dispose();active=null;}}
  global.Feito3DViewer={mount,dispose,updateScale,
    // Exportadas para teste matemático independente do navegador.
    geometry:{multiply,perspective,lookAt}};
})(typeof window==='undefined'?globalThis:window);
