/* Interface do laboratório 3D. Nenhum arquivo de modelo é enviado para a API. */
(function(global){
  'use strict';
  const M=()=>global.MeshTools;
  const R=name=>name.replace(/\.(stl|3mf|obj)$/i,'').replace(/[^\wÀ-ÿ -]/g,'').slice(0,65)||'modelo';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pBtn=(text,action,style='primary')=>'<button class="btn '+style+'" data-action="tool:'+action+'">'+text+'</button>';
  const tab=(id,label,active)=>'<button class="tool-tab '+(active===id?'active':'')+'" data-action="tool:mode-'+id+'">'+label+'</button>';
  const input=(id,title,value,type='number',attrs='')=>'<div class="form-field"><label for="'+id+'">'+title+'</label><input id="'+id+'" class="input" type="'+type+'" value="'+esc(value)+'" '+attrs+'></div>';
  const select=(id,title,value,values)=>'<div class="form-field"><label for="'+id+'">'+title+'</label><select id="'+id+'" class="select">'+values.map(v=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></div>';
  const size=n=>Number(n||0).toFixed(1);
  function suggestedProfile(p){
    const setting={Detalhado:{layer:.12,walls:3,speed:'Moderada',description:'Peças decorativas com detalhes finos'},Equilibrado:{layer:.2,walls:3,speed:'Padrão',description:'Boa relação entre qualidade e tempo'},Rápido:{layer:.28,walls:2,speed:'Rápida',description:'Protótipos com detalhes menos críticos'}}[p.quality];
    return {printer:p.printer,material:p.material,layerHeightMm:setting.layer,wallLoops:setting.walls,infillPercent:Number(p.infill),infillPattern:p.pattern,supports:p.support,speedGuidance:setting.speed,description:setting.description,notice:'Ficha orientativa. Ajuste temperaturas, fluxo, retração, velocidade volumétrica e ventilação no perfil de filamento calibrado do Bambu Studio. Não é um perfil nativo importável.'};
  }
  function renderPreset(state){
    const p=state.profile,s=suggestedProfile(p);
    return '<div class="panel"><div class="panel-head"><div><h3 class="panel-title">Ficha de impressão</h3><p class="panel-sub">Referência editável para Bambu Studio</p></div><span class="tag">A1 / P1S</span></div>'+
      '<div class="form-grid">'+select('tool-printer','Impressora',p.printer,['A1','P1S'])+select('tool-material','Material',p.material,['PLA','PETG','ABS','TPU'])+
      select('tool-quality','Prioridade',p.quality,['Detalhado','Equilibrado','Rápido'])+select('tool-support','Suportes',p.support,['Automático','Nenhum','Árvore'])+
      input('tool-infill','Preenchimento (%)',p.infill,'number','min="0" max="100" step="1"')+select('tool-pattern','Padrão de preenchimento',p.pattern,['Gyroid','Grid','Cubic'])+'</div>'+
      '<div class="tools-note mt-20">Os parâmetros abaixo são pontos de partida. Use o perfil do fabricante do filamento e faça calibração antes de produzir uma encomenda.</div>'+
      '<div class="dimension-grid mt-20"><div class="dimension-cell"><span>Camada</span><strong>'+s.layerHeightMm.toFixed(2)+' mm</strong></div><div class="dimension-cell"><span>Paredes</span><strong>'+s.wallLoops+'</strong></div><div class="dimension-cell"><span>Infill</span><strong>'+s.infillPercent+'%</strong></div></div>'+
      '<p class="calc-note">'+esc(s.description)+' · Velocidade sugerida: '+esc(s.speedGuidance)+'.</p>'+
      '<div class="form-actions mt-20">'+pBtn('Baixar ficha JSON ↓','download-preset','primary wide')+'</div></div>';
  }
  function render(state,H){
    const model=state.model;
    const head=H.heading('SEU LABORATÓRIO DIGITAL','Ferramentas 3D','Abra modelos STL e 3MF, pinte faces, divida malhas e prepare seus projetos.');
    const drop='<div class="tool-drop" id="tool-drop"><div class="drop-icon">⬡</div><strong>Importar STL ou 3MF</strong><p>Arraste um modelo até aqui ou escolha um arquivo do seu dispositivo</p>'+
      '<label class="btn primary selectable">Escolher modelo<input id="stl-file" type="file" accept=".stl,.3mf,model/stl,model/3mf" hidden></label><p class="micro">O arquivo é processado no navegador — não enviado ao servidor</p><p class="micro">3MF com vários componentes internos, como projetos Bambu Studio, pode ser aberto como geometria.</p></div>';
    const tabs='<div class="tool-tabs">'+[
      ['inspect','◎ Analisar'],['paint','◈ Pintar faces'],['cut','✂ Dividir'],['convert','⇄ Converter'],['profile','⚙ Perfis A1/P1S']
    ].map(x=>tab(x[0],x[1],state.toolMode)).join('')+'</div>';
    let side='',workspace='';
    if(model){
      const mesh=model.mesh,painted=mesh.colors?.filter(c=>c&&c.toLowerCase()!==M().DEFAULT_COLOR.toLowerCase()).length||0;
      const info='<div class="dimension-grid mt-20">'+['X • largura','Y • profundidade','Z • altura'].map((l,i)=>'<div class="dimension-cell"><span>'+l+'</span><strong>'+size(mesh.dimensions[i]*model.scale)+' mm</strong></div>').join('')+'</div>';
      const measurements='<div class="breakdown mt-20"><div class="breakdown-row"><span>Triângulos</span><b>'+mesh.triangles.toLocaleString('pt-BR')+'</b></div>'+
        '<div class="breakdown-row"><span>Volume geométrico*</span><b>'+size(mesh.volume*Math.pow(model.scale,3)/1000)+' cm³</b></div>'+
        '<div class="breakdown-row"><span>Arquivo original</span><b>'+esc(mesh.metadata?.format||'Malha')+'</b></div></div>';
      if(state.toolMode==='inspect'){
        side='<div class="panel"><h3 class="panel-title">Dimensões da peça</h3><p class="panel-sub">Comprimento, largura e altura em milímetros</p>'+info+measurements+
          input('model-scale','Escala uniforme (%)',Math.round(model.scale*100),'number','min="1" max="1000" step="1"')+
          '<div class="form-actions mt-20">'+pBtn('Exportar STL','export-stl','light')+pBtn('Exportar 3MF','export-3mf')+'</div><p class="calc-note">*Volume aproximado válido apenas em malhas fechadas e orientadas.</p></div>';
      }else if(state.toolMode==='paint'){
        const swatches=['#ffffff','#222222','#ec6d4e','#ffb74f','#f4dd73','#69ad78','#57acd2','#4c68ae','#aa78c5','#df87ab'];
        side='<div class="panel"><h3 class="panel-title">Pintura por faces</h3><p class="panel-sub">Clique ou arraste para pintar · Shift + arraste para girar</p>'+
          '<div class="paint-swatches">'+swatches.map(c=>'<button type="button" class="paint-swatch '+(state.paintColor===c?'active':'')+'" style="background:'+c+'" aria-label="Cor '+c+'" data-action="tool:color-'+c+'"></button>').join('')+'</div>'+
          '<div class="form-grid mt-20"><div class="form-field"><label for="paint-color">Cor personalizada</label><input type="color" id="paint-color" class="color-input" value="'+esc(state.paintColor)+'"></div><div class="form-field"><label>Faces pintadas</label><strong class="tool-data">'+painted.toLocaleString('pt-BR')+'</strong></div></div>'+
          '<div class="form-actions mt-20">'+pBtn('Desfazer','undo-paint','light')+pBtn('Limpar cores','clear-paint','ghost')+'</div><hr class="divider">'+pBtn('Exportar 3MF colorido ↓','export-3mf','primary wide')+
          '<p class="calc-note">A pintura é aplicada por triângulo visível; em malhas densas a visualização é amostrada (até 10 mil faces). STL não armazena cores. O Bambu Studio pode pedir associação das cores aos filamentos do AMS.</p></div>';
      }else if(state.toolMode==='cut'){
        const result=state.cutResult;
        side='<div class="panel"><h3 class="panel-title">Corte por plano</h3><p class="panel-sub">Divida a geometria em duas partes separadas</p>'+
          select('cut-axis','Eixo de corte',['X','Y','Z'][state.cutAxis],['X','Y','Z'])+
          '<div class="form-field mt-20"><label>Posição do corte: <strong id="cut-label">'+state.cutPercent+'%</strong> · <span id="cut-mm">'+size(mesh.min[state.cutAxis]+mesh.dimensions[state.cutAxis]*state.cutPercent/100)+' mm</span></label><input id="cut-position" type="range" min="1" max="99" step="1" value="'+state.cutPercent+'" style="width:100%"></div>'+
          '<div class="form-actions mt-20">'+pBtn('Gerar duas partes →','split','primary wide')+'</div>'+
          (result?'<hr class="divider"><div class="tools-note"><strong>Corte gerado:</strong> Parte A com '+result.left.triangles.toLocaleString('pt-BR')+' triângulos e B com '+result.right.triangles.toLocaleString('pt-BR')+'.</div>'+
            (result.warning?'<div class="notice mt-20">'+esc(result.warning)+'</div>':'')+
            '<div class="form-actions mt-20">'+pBtn('A · STL','part-a-stl','light')+pBtn('B · STL','part-b-stl','light')+'</div>'+
            '<div class="form-actions mt-20">'+pBtn('A · 3MF','part-a-3mf','light')+pBtn('B · 3MF','part-b-3mf','light')+'</div>'+pBtn('Baixar ambas em ZIP ↓','parts-zip','primary wide'):'')+
          '<p class="calc-note">O corte cria tampas nos contornos encontrados. Malhas abertas, ocas ou com furos internos precisam de inspeção e reparo antes da impressão.</p></div>';
      }else if(state.toolMode==='convert'){
        side='<div class="panel"><h3 class="panel-title">Conversor 3D</h3><p class="panel-sub">Mantenha a geometria em um formato compatível</p>'+info+
          '<div class="tools-note mt-20">A conversão usa apenas a geometria e as cores simples reconhecidas. Perfis de impressora, suportes, placas e outros dados exclusivos do projeto original não são preservados.</div>'+
          '<div style="display:grid;gap:10px;margin-top:20px">'+pBtn('Baixar STL binário ↓','export-stl','light wide')+pBtn('Baixar 3MF padrão ↓','export-3mf','primary wide')+'</div></div>';
      }else if(state.toolMode==='profile'){side=renderPreset(state);}
      workspace='<div class="tool-workspace"><section class="panel"><div class="panel-head"><div><h3 class="panel-title">'+esc(model.name)+'</h3><p class="panel-sub">Arraste para girar · role para ampliar'+(state.toolMode==='paint'?' · clique para pintar':'')+'</p></div><span class="tag">'+esc(mesh.metadata?.format||'3D')+'</span></div>'+
        '<canvas id="model-canvas" class="model-canvas" aria-label="Pré-visualização tridimensional da peça"></canvas>'+
        '<p class="micro mt-20">'+(mesh.metadata?.warning?esc(mesh.metadata.warning):'Visualização 3D local; não substitui a verificação no fatiador.')+'</p></section>'+
        '<aside>'+side+'</aside></div>';
    }else{
      workspace=state.toolMode==='profile'?'<div class="tool-workspace"><div class="panel"><h3 class="panel-title">Perfis de produção</h3><p class="panel-sub">Prepare uma ficha de impressão antes de importar seu modelo no Bambu Studio.</p><div class="tools-note mt-20">Selecione a impressora, o material e a qualidade para obter uma referência inicial.</div></div><aside>'+renderPreset(state)+'</aside></div>':
        '<div class="feature-grid"><div class="panel"><h3 class="panel-title">◎ Análise e escala</h3><p class="panel-sub">Medidas em mm, volume e exportação de modelos.</p></div><div class="panel"><h3 class="panel-title">◈ Pintura</h3><p class="panel-sub">Colorização de faces e saída em 3MF padrão.</p></div><div class="panel"><h3 class="panel-title">✂ Divisão</h3><p class="panel-sub">Corte planar em duas partes para imprimir separadas.</p></div><div class="panel"><h3 class="panel-title">⇄ Conversão</h3><p class="panel-sub">Geometria STL ↔ 3MF, sem depender de upload.</p></div></div>';
    }
    return head+drop+tabs+workspace;
  }
  function bindCanvas(state,notify,render){
    state.onSculpt=face=>{
      if(state.toolMode!=='create'||state.builder?.mode!=='sculpt'||!state.model)return;
      const scene=state.builder;
      try{
        const previous=state.model.mesh.coords.slice();
        const modified=builder().sculpt(state.model.mesh,face,scene.radius,scene.strength,scene.brush);
        scene.sculptUndo.push(previous);
        if(scene.sculptUndo.length>8)scene.sculptUndo.shift();
        state.model.mesh=modified;scene.sculpted=true;
        render();
      }catch(error){notify(error.message,true);}
    };
    global.Feito3DViewer?.mount(document.querySelector('#model-canvas'),state,notify);
  }
  async function loadModel(file,state,render,notify){
    if(!file)return;
    if(!/\.(stl|3mf|obj)$/i.test(file.name)){notify('Selecione um arquivo STL, 3MF ou OBJ.',true);return;}
    if(file.size>100*1024*1024){notify('O limite por arquivo é de 100 MB.',true);return;}
    try{
      notify('Abrindo arquivo '+file.name+'...');
      const bytes=await file.arrayBuffer(),mesh=/\.3mf$/i.test(file.name)?await M().parse3MF(bytes):/\.obj$/i.test(file.name)?M().parseOBJ(bytes):M().parseSTL(bytes);
      state.builder=null;state.model={name:file.name,mesh,scale:1};state.rotation={x:.55,y:-.75,scale:1,pan:[0,0,0]};
      state.toolMode='splitparts';state.cutResult=null;state.paintUndo=[];state.focusPart=null;state.splitMode='auto';
      state.splitWarning='';
      try{state.splitParts=M().separateMesh(mesh,'auto');}catch(e){state.splitParts=[];state.splitWarning=e.message;}
      render();notify('Modelo carregado: '+mesh.triangles.toLocaleString('pt-BR')+' triângulos'+(state.splitParts.length?', '+state.splitParts.length+' peças identificadas.':'.'));
    }catch(e){notify(e.message||'Falha ao abrir modelo.',true);}
  }
  function download(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  const builder=()=>global.Feito3DBuilder;
  const currentObject=state=>state.builder?.objects.find(o=>o.id===state.builder.selected);
  function buildScene(state){
    if(!state.builder?.objects.length){state.model=null;return;}
    const mesh=builder().compose(state.builder);
    state.model={name:'Meu projeto 3D',mesh,scale:1};
    state.splitParts=[];state.cutResult=null;state.focusPart=null;
  }
  function snapshot(state){
    const scene=state.builder;if(!scene)return;
    scene.undo||=[];scene.undo.push(JSON.stringify({objects:scene.objects,selected:scene.selected}));
    if(scene.undo.length>16)scene.undo.shift();
  }
  function beginScene(state){
    const obj=builder().makeObject('box');
    state.builder={objects:[obj],selected:obj.id,mode:'forms',radius:12,strength:1.5,brush:'inflate',undo:[],sculptUndo:[],sculpted:false};
    state.rotation={x:.55,y:-.75,scale:1,pan:[0,0,0]};
    buildScene(state);
  }
  function renderCreateControls(state){
    const scene=state.builder,obj=currentObject(state),mode=scene?.mode||'forms';
    let html='<div class="studio-section-title"><h2>Criar e modelar peças</h2><p>Formas paramétricas, desenho 2D extrudado e pincel de escultura. Medidas reais em milímetros.</p></div>'+
      (scene?.imported?'<p class="studio-hint">Você está esculpindo um modelo STL/3MF/OBJ importado. As formas paramétricas ficam disponíveis em um novo projeto.</p>':'')+
      '<div class="create-subnav">'+[['forms','Formas 3D'],['sketch','Desenho 2D'],['sculpt','Esculpir']].map(([key,label])=>'<button class="'+(mode===key?'active':'')+'" data-action="tool:create-sub-'+key+'">'+label+'</button>').join('')+'</div>';
    if(mode==='forms'||mode==='sketch'){
      if(mode==='forms')html+='<div class="create-primitives">'+[['box','▣ Cubo'],['cylinder','◉ Cilindro'],['sphere','● Esfera'],['cone','▲ Cone'],['torus','◎ Anel']].map(([id,label])=>'<button data-action="tool:create-add-'+id+'">+ '+label+'</button>').join('')+'</div>';
      else html+='<p class="studio-hint">Crie um perfil 2D digitando os pontos X,Y em sequência. O contorno será extrudado na altura escolhida.</p>'+pBtn('+ Extrudar desenho','create-add-sketch','primary wide');
      html+='<div class="studio-part-title"><strong>Objetos da cena</strong><span>'+(scene?.objects?.length||0)+'</span></div><div class="create-object-list">'+(scene?.objects||[]).map(o=>'<button class="'+(scene.selected===o.id?'selected':'')+'" data-action="tool:create-select-'+o.id+'"><span style="background:'+esc(o.color)+'" class="create-object-color"></span><span>'+esc(o.name)+'</span></button>').join('')+'</div>';
      if(obj){
        html+='<div class="create-properties"><strong>Editar objeto selecionado</strong>'+input('create-name','Nome do objeto',obj.name,'text','maxlength="65"')+
          '<div class="create-prop-grid">'+['Largura X','Profundidade Y','Altura Z'].map((label,i)=>input('create-dim-'+i,label+' (mm)',obj.dim[i],'number','min="0.5" max="5000" step="0.5"')).join('')+'</div>'+
          '<div class="create-prop-grid">'+['Posição X','Posição Y','Posição Z'].map((label,i)=>input('create-pos-'+i,label+' (mm)',obj.pos[i],'number','step="0.5"')).join('')+'</div>'+
          '<div class="create-prop-grid">'+['Girar X','Girar Y','Girar Z'].map((label,i)=>input('create-rot-'+i,label+' (°)',obj.rot[i],'number','step="5"')).join('')+'</div>'+
          '<label class="create-color">Cor do objeto <input id="create-color" type="color" value="'+esc(obj.color)+'"></label>';
        if(obj.type==='sketch')html+='<div class="form-field"><label for="create-poly">Pontos do contorno (X,Y separados por ;)</label><textarea class="create-poly" id="create-poly" rows="4">'+esc(obj.poly.map(p=>p.join(',')).join('; '))+'</textarea></div><p class="studio-hint">Exemplo: 0,0; 40,0; 40,25; 0,25. Sem cruzar linhas.</p>';
        html+='<div class="studio-inline-actions">'+pBtn('Duplicar','create-duplicate','light')+pBtn('Excluir','create-delete','ghost')+'</div></div>';
      }
    }else{
      html+='<div class="create-sculpt-tools"><p class="studio-hint">Clique na superfície para deformar a malha. Quanto maior o raio, maior a área de influência. Girar: Shift + arrastar.</p>'+
        '<div class="create-primitives">'+[['inflate','Elevar'],['deflate','Afundar'],['smooth','Suavizar']].map(([id,label])=>'<button class="'+(scene.brush===id?'active':'')+'" data-action="tool:create-brush-'+id+'">'+label+'</button>').join('')+'</div>'+
        input('create-radius','Raio do pincel (mm)',scene.radius,'number','min="1" max="300" step="1"')+
        input('create-strength','Intensidade (mm)',scene.strength,'number','min="0.1" max="15" step="0.5"')+
        pBtn('↶ Desfazer pincel','create-sculpt-undo','light wide')+
        '<p class="studio-hint">Após esculpir, altere a cena pela exportação da malha. Editar dimensões paramétricas recria a geometria e remove os traços de escultura.</p></div>';
    }
    html+='<div class="create-save-tools"><div class="studio-inline-actions">'+(scene?.imported?'':pBtn('↶ Desfazer edição','create-undo','light'))+pBtn('Novo projeto','create-new','ghost')+'</div>'+(scene?.imported?'':pBtn('↓ Salvar projeto editável','create-save','light wide'))+
      '<label class="btn light wide create-project-upload">↑ Abrir projeto editável (.json)<input id="project-file" type="file" accept=".json,application/json" hidden></label>'+
      '<div class="studio-inline-actions">'+pBtn('↓ STL','export-stl','light')+pBtn('↓ 3MF','export-3mf','primary')+'</div>'+
      '<p class="studio-hint">Ferramenta inicial de modelagem original. Não inclui ainda operações booleanas ou superfícies NURBS. Valide a peça no Bambu Studio antes de imprimir.</p></div>';
    return html;
  }
  function applyCreateChange(el,state,render,notify){
    if(!state.builder)return false;
    const scene=state.builder,obj=currentObject(state),id=el.id;
    if(id==='create-radius'||id==='create-strength'){
      scene[id==='create-radius'?'radius':'strength']=Math.max(.1,Number(el.value)||1);return true;
    }
    if(!obj||!id.startsWith('create-'))return false;
    if(scene.sculpted&&!confirm('Esta edição recriará a malha e descartará os traços de escultura. Continuar?')){render();return true;}
    const before=JSON.stringify({objects:scene.objects,selected:scene.selected});
    const match=id.match(/^create-(dim|pos|rot)-(\d)$/);
    try{
      if(match){
        const group=match[1],i=Number(match[2]),value=Number(el.value);
        if(!Number.isFinite(value)||Math.abs(value)>10000||(group==='dim'&&(value<.5||value>5000)))throw new Error('Use uma medida válida em milímetros.');
        obj[group][i]=value;
      }else if(id==='create-name')obj.name=el.value.trim().slice(0,65)||obj.name;
      else if(id==='create-color')obj.color=el.value;
      else if(id==='create-poly'){obj.poly=builder().parsePolygon(el.value);const xs=obj.poly.map(p=>p[0]),ys=obj.poly.map(p=>p[1]);obj.dim[0]=Math.max(...xs)-Math.min(...xs);obj.dim[1]=Math.max(...ys)-Math.min(...ys);}
      else return false;
      buildScene(state);scene.sculpted=false;scene.sculptUndo=[];
      scene.undo.push(before);if(scene.undo.length>16)scene.undo.shift();
      render();return true;
    }catch(e){const old=JSON.parse(before);scene.objects=old.objects;scene.selected=old.selected;notify(e.message,true);render();return true;}
  }
  async function loadProject(file,state,render,notify){
    if(!file)return;
    if(file.size>2*1024*1024){notify('Projeto JSON acima de 2 MB.',true);return;}
    try{
      const parsed=JSON.parse(await file.text());
      const scene=builder().validateProject(parsed);
      if(!scene.objects.length)throw new Error('O projeto está sem objetos.');
      state.builder=scene;state.toolMode='create';state.rotation={x:.55,y:-.75,scale:1,pan:[0,0,0]};
      buildScene(state);render();notify('Projeto editável carregado.');
    }catch(e){notify('Não foi possível abrir o projeto: '+e.message,true);}
  }
  async function action(name,state,render,notify){
    if(name.startsWith('mode-')){
      const requested=name.slice(5);
      if(requested==='create'&&!state.builder){
        if(state.model){
          state.builder={objects:[],selected:null,mode:'sculpt',imported:true,radius:12,strength:1.5,brush:'inflate',undo:[],sculptUndo:[],sculpted:false};
        }else beginScene(state);
      }
      state.toolMode=requested;render();return;
    }
    if(name.startsWith('create-')){
      const scene=state.builder;
      if(!scene){notify('Abra a ferramenta Criar peças para começar.',true);return;}
      if(name.startsWith('create-sub-')){
        const desired=name.slice('create-sub-'.length);
        if(scene.imported&&desired!=='sculpt'){
          if(!confirm('Para criar formas paramétricas, comece um novo projeto. Seu arquivo importado não será alterado no dispositivo. Continuar?'))return;
          beginScene(state);
        }
        state.builder.mode=desired;render();return;
      }
      if(name.startsWith('create-brush-')){scene.brush=name.slice('create-brush-'.length);render();return;}
      if(name.startsWith('create-select-')){scene.selected=name.slice('create-select-'.length);render();return;}
      if(name.startsWith('create-add-')){
        if(scene.imported){notify('Inicie um novo projeto para adicionar formas paramétricas.',true);return;}
        if(scene.objects.length>=40){notify('Limite de 40 objetos por projeto.',true);return;}
        if(scene.sculpted&&!confirm('Adicionar uma forma recriará a malha e removerá as alterações de escultura. Continuar?'))return;
        snapshot(state);const obj=builder().makeObject(name.slice('create-add-'.length));
        scene.objects.push(obj);scene.selected=obj.id;scene.sculpted=false;scene.sculptUndo=[];
        try{buildScene(state);render();notify(obj.name+' adicionado.');}catch(e){scene.objects.pop();notify(e.message,true);}return;
      }
      if(name==='create-duplicate'){
        const selected=currentObject(state);if(!selected||scene.objects.length>=40)return;
        if(scene.sculpted&&!confirm('Duplicar recriará a malha. Continuar?'))return;
        snapshot(state);const copy=JSON.parse(JSON.stringify(selected));copy.id=builder().makeObject().id;copy.name=selected.name+' (cópia)';copy.pos[0]+=Math.max(5,selected.dim[0]*.7);
        scene.objects.push(copy);scene.selected=copy.id;scene.sculpted=false;scene.sculptUndo=[];buildScene(state);render();return;
      }
      if(name==='create-delete'){
        if(scene.objects.length<=1){notify('O projeto precisa ter pelo menos uma peça. Use “Novo projeto” para reiniciar.',true);return;}
        if(!confirm('Excluir o objeto selecionado?'))return;
        snapshot(state);scene.objects=scene.objects.filter(o=>o.id!==scene.selected);scene.selected=scene.objects[0].id;
        scene.sculpted=false;scene.sculptUndo=[];buildScene(state);render();return;
      }
      if(name==='create-new'){
        if(!confirm('Iniciar projeto novo? Exporte o projeto atual antes de continuar.'))return;
        beginScene(state);render();return;
      }
      if(name==='create-undo'){
        const last=scene.undo?.pop();if(!last){notify('Nenhuma edição para desfazer.');return;}
        const result=JSON.parse(last);scene.objects=result.objects;scene.selected=result.selected;
        scene.sculpted=false;scene.sculptUndo=[];buildScene(state);render();return;
      }
      if(name==='create-sculpt-undo'){
        const previous=scene.sculptUndo?.pop();if(!previous){notify('Nenhuma escultura para desfazer.');return;}
        state.model.mesh=global.MeshTools.meshFromCoords(previous,state.model.mesh.colors,state.model.mesh.metadata);
        if(!scene.sculptUndo.length)scene.sculpted=false;
        render();return;
      }
      if(name==='create-save'){
        if(scene.imported){notify('Exporte este modelo modificado em STL ou 3MF. O projeto paramétrico é exclusivo das formas criadas no editor.',true);return;}
        const file={version:1,app:'Feito em Forma Modelador 3D',objects:scene.objects};
        download(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}),'feito-em-forma-projeto-editavel.json');return;
      }
    }
    if(name.startsWith('color-')){state.paintColor=name.slice(6);render();return;}
    if(name.startsWith('axis-')){state.cutAxis=Number(name.slice(5));state.cutResult=null;render();return;}
    if(name==='reset-view'||name==='view-iso'){state.rotation={x:.55,y:-.75,scale:1,pan:[0,0,0]};render();return;}
    if(name==='view-top'){state.rotation={...state.rotation,x:1.51,y:-.75,pan:[0,0,0]};render();return;}
    if(name==='view-front'){state.rotation={...state.rotation,x:0,y:0,pan:[0,0,0]};render();return;}
    if(name==='view-side'){state.rotation={...state.rotation,x:0,y:Math.PI/2,pan:[0,0,0]};render();return;}
    if(name==='zoom-in'||name==='zoom-out'){
      state.rotation.scale=Math.max(.12,Math.min(40,(state.rotation.scale||1)*(name==='zoom-in'?1.25:.8)));
      document.querySelector('#model-canvas')?.redrawModel?.();return;
    }
    if(name==='focus-all'){state.focusPart=null;state.rotation.pan=[0,0,0];state.rotation.scale=1;render();return;}
    if(name.startsWith('focus-')){state.focusPart=Number(name.slice(6));state.rotation.pan=[0,0,0];state.rotation.scale=1;render();return;}
    if(name==='reset-model'){state.model=null;state.builder=null;state.splitParts=[];state.splitWarning='';state.cutResult=null;state.focusPart=null;render();return;}
    const model=state.model;
    if(name==='download-preset'){
      const p=suggestedProfile(state.profile);
      download(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),'feito-em-forma-'+p.printer+'-'+p.material+'-'+state.profile.quality+'.json');return;
    }
    if(!model){notify('Importe um modelo STL ou 3MF primeiro.',true);return;}
    const mesh=model.mesh,stem=R(model.name);
    if(name==='identify-parts'){
      try{state.splitParts=M().separateMesh(mesh,state.splitMode||'auto');state.splitWarning='';state.focusPart=null;render();notify(state.splitParts.length+' peças identificadas.');}
      catch(e){state.splitWarning=e.message;render();notify(e.message,true);}return;
    }
    if(name==='pieces-zip'){
      if(!state.splitParts?.length){notify('Identifique as peças antes de baixar.',true);return;}
      const files={};for(let i=0;i<state.splitParts.length;i++){
        const part=state.splitParts[i];files[stem+'-peca-'+String(i+1).padStart(2,'0')+'.stl']=new Uint8Array(await M().exportSTL(part.mesh,model.scale).arrayBuffer());
      }
      download(M().zipFiles(files),stem+'-pecas-separadas.zip');return;
    }
    const piece=name.match(/^piece-(\d+)-(stl|3mf)$/);
    if(piece){
      const part=state.splitParts?.[Number(piece[1])];if(!part){notify('Peça não encontrada.',true);return;}
      const format=piece[2];download(format==='stl'?M().exportSTL(part.mesh,model.scale):M().export3MF(part.mesh,model.scale),stem+'-peca-'+(Number(piece[1])+1)+'.'+format);return;
    }
    if(name==='export-stl'){
      if(mesh.colors?.some(c=>c&&c!==M().DEFAULT_COLOR)&&!confirm('STL não preserva as cores da pintura. Deseja exportar mesmo assim?'))return;
      download(M().exportSTL(mesh,model.scale),stem+'-feito-em-forma.stl');return;
    }
    if(name==='export-3mf'){download(M().export3MF(mesh,model.scale),stem+'-feito-em-forma.model.3mf');return;}
    if(name==='undo-paint'){
      const last=state.paintUndo?.pop();if(last){mesh.colors[last.index]=last.previous;render();}else notify('Nenhuma pintura para desfazer.');return;
    }
    if(name==='clear-paint'){
      if(!confirm('Remover a pintura desta versão do modelo?'))return;mesh.colors=[];state.paintUndo=[];render();return;
    }
    if(name==='split'){
      try{
        notify('Calculando corte e superfícies de fechamento...');
        const result=M().cutMesh(mesh,state.cutAxis,state.cutPercent/100);
        state.cutResult=result;render();notify('Duas partes preparadas para exportação.');
      }catch(e){notify(e.message,true);}return;
    }
    const cut=state.cutResult;if(!cut){notify('Gere o corte primeiro.',true);return;}
    if(name==='parts-zip'){
      const files={};
      files[stem+'-parte-A.stl']=new Uint8Array(await M().exportSTL(cut.left,model.scale).arrayBuffer());
      files[stem+'-parte-B.stl']=new Uint8Array(await M().exportSTL(cut.right,model.scale).arrayBuffer());
      download(M().zipFiles(files),stem+'-duas-partes.zip');return;
    }
    const found=name.match(/^part-([ab])-(stl|3mf)$/);
    if(found){const part=found[1]==='a'?cut.left:cut.right,format=found[2];download(format==='stl'?M().exportSTL(part,model.scale):M().export3MF(part,model.scale),stem+'-parte-'+found[1].toUpperCase()+'.'+format);return;}
  }
  function handleInput(e,state,render){
    const el=e.target;
    if(state.builder&&el.id.startsWith('create-'))return false; // Edição commitada em change, preservando o foco do campo.
    if(el.id==='model-scale'&&state.model){
      state.model.scale=Math.min(10,Math.max(.01,Number(el.value||100)/100));
      document.querySelectorAll('.studio-size strong').forEach((t,i)=>{if(i<3)t.innerHTML=size(state.model.mesh.dimensions[i]*state.model.scale)+' <i>mm</i>';});
      global.Feito3DViewer?.updateScale(state.model.scale);
      const volume=document.querySelector('.studio-measure span:nth-child(2) strong');if(volume)volume.textContent=size(state.model.mesh.volume*Math.pow(state.model.scale,3)/1000)+' cm³';return true;
    }
    if(el.id==='cut-position'){
      state.cutPercent=Number(el.value);state.cutResult=null;
      const label=document.querySelector('#cut-label');if(label)label.textContent=state.cutPercent+'%';
      const mm=document.querySelector('#cut-mm');if(mm&&state.model)mm.textContent=size((state.model.mesh.min[state.cutAxis]+state.model.mesh.dimensions[state.cutAxis]*state.cutPercent/100)*state.model.scale)+' mm';
      document.querySelector('#model-canvas')?.redrawModel?.();return true;
    }
    if(el.id==='paint-color'){state.paintColor=el.value;return true;}
    if(el.id==='tool-infill'){state.profile.infill=Math.min(100,Math.max(0,Number(el.value)));return true;}
    return false;
  }
  function handleChange(e,state,render,notify=()=>{}){
    if(state.toolMode==='create'&&e.target.id.startsWith('create-'))return applyCreateChange(e.target,state,render,notify);
    const map={'cut-axis':'cutAxis','tool-printer':'printer','tool-material':'material','tool-quality':'quality','tool-support':'support','tool-pattern':'pattern'};
    if(e.target.id==='cut-position'||e.target.id==='tool-infill'){render();return true;}
    if(e.target.id==='split-mode'){state.splitMode=e.target.value;state.splitParts=[];state.splitWarning='';state.focusPart=null;render();return true;}
    if(!map[e.target.id])return false;
    const key=map[e.target.id];
    if(key==='cutAxis'){state.cutAxis=['X','Y','Z'].indexOf(e.target.value);state.cutResult=null;}
    else state.profile[key]=e.target.value;
    render();return true;
  }
  function renderWorkbench(state,H){
    const model=state.model,mesh=model?.mesh,parts=state.splitParts||[];
    const mode=state.toolMode==='create'?'create':state.toolMode==='inspect'?'inspect':state.toolMode==='paint'?'paint':state.toolMode==='cut'?'cut':state.toolMode==='convert'?'convert':state.toolMode==='profile'?'profile':'splitparts';
    const nav=[['create','✦','Criar peças'],['splitparts','⬡','Separar'],['cut','✂','Cortar'],['paint','◈','Pintar'],['inspect','⌗','Analisar'],['convert','⇄','Converter'],['profile','⚙','Perfis']];
    const intro='<div class="studio-intro"><div class="studio-intro-icon">⬡</div><div><span class="studio-kicker">FEITO EM FORMA · WORKSPACE</span><h1>Laboratório 3D</h1><p>Prepare, separe e exporte seus modelos com precisão.</p></div><span class="studio-private">◉ Processamento local</span></div>';
    const uploader='<label class="studio-import"><span class="studio-upload-icon">⇧</span><span><strong>'+(model?'Trocar modelo':'Importar modelo 3D')+'</strong><small>STL, 3MF ou OBJ · até 100 MB</small></span><span class="studio-import-arrow">→</span><input id="stl-file" type="file" accept=".stl,.3mf,.obj,model/stl,model/3mf" hidden></label>';
    const tabs='<div class="studio-menu">'+nav.map(([id,ic,title])=>'<button class="studio-menu-item '+(mode===id?'is-active':'')+'" data-action="tool:mode-'+id+'"><span>'+ic+'</span>'+title+'</button>').join('')+'</div>';
    const info=mesh?'<div class="studio-size-grid">'+['Largura (X)','Profundidade (Y)','Altura (Z)'].map((label,i)=>'<div class="studio-size"><small>'+label+'</small><strong>'+size(mesh.dimensions[i]*model.scale)+' <i>mm</i></strong></div>').join('')+'</div>':'';
    let controls='';
    if(mode==='create'){
      controls=renderCreateControls(state);
    }else if(mode==='splitparts'){
      const selectMode=state.splitMode||'auto';
      controls='<div class="studio-section-title"><h2>Separar componentes</h2><p>Extraia peças individuais de um projeto ou de uma malha.</p></div><div class="form-field"><label for="split-mode">Método de separação</label><select id="split-mode" class="select"><option value="auto" '+(selectMode==='auto'?'selected':'')+'>Peças e volumes</option><option value="color" '+(selectMode==='color'?'selected':'')+'>Agrupar por cor</option></select></div>'+
        '<p class="studio-hint">'+(selectMode==='color'?'Separa as faces pela cor reconhecida no arquivo 3MF.':'Em 3MF e OBJ, mantém os componentes individuais; em STL, identifica volumes conectados.')+'</p>'+
        pBtn('⬡ Identificar peças','identify-parts','primary wide')+
        '<div class="studio-part-title"><strong>Peças encontradas</strong><span>'+parts.length+'</span></div>'+
        (parts.length?'<div class="studio-part-list"><button class="studio-part '+(state.focusPart===null?'selected':'')+'" data-action="tool:focus-all"><span class="studio-part-dot">◎</span><span><strong>Modelo completo</strong><small>'+mesh.triangles.toLocaleString('pt-BR')+' triângulos</small></span></button>'+parts.map((p,i)=>'<div class="studio-part-line"><button class="studio-part '+(state.focusPart===i?'selected':'')+'" data-action="tool:focus-'+i+'"><span class="studio-part-dot">'+(i+1)+'</span><span><strong>'+esc(p.name)+'</strong><small>'+p.mesh.triangles.toLocaleString('pt-BR')+' triângulos</small></span></button><button class="studio-part-download" title="Baixar STL desta peça" aria-label="Baixar '+esc(p.name)+' em STL" data-action="tool:piece-'+i+'-stl">↓</button></div>').join('')+'</div>':'<div class="studio-empty-parts">'+(state.splitWarning?esc(state.splitWarning):model?'Clique em “Identificar peças” para preparar os componentes.':'Importe um modelo para identificar peças.')+'</div>')+
        (parts.length?pBtn('↓ Baixar peças em ZIP','pieces-zip','primary wide'):'')+
        '<p class="studio-hint">Cada peça é exportada como um arquivo independente. Confira a orientação e a escala no Bambu Studio.</p>';
    }else if(mode==='cut'){
      const a=state.cutAxis,result=state.cutResult;
      controls='<div class="studio-section-title"><h2>Corte manual</h2><p>Escolha um plano e divida o modelo em duas partes.</p></div><label class="studio-field-label">Direção do corte</label><div class="studio-axis">'+['X','Y','Z'].map((axis,i)=>'<button class="'+(a===i?'active':'')+'" data-action="tool:axis-'+i+'">'+axis+'</button>').join('')+'</div>'+
        '<div class="studio-slider-head"><label for="cut-position">Posição do plano</label><strong id="cut-label">'+state.cutPercent+'%</strong></div><input class="studio-range" id="cut-position" type="range" min="1" max="99" value="'+state.cutPercent+'" step="1">'+
        '<div class="studio-range-scale"><span>Início</span><span id="cut-mm">'+(mesh?size((mesh.min[a]+mesh.dimensions[a]*state.cutPercent/100)*model.scale):'—')+' mm</span><span>Fim</span></div>'+
        pBtn('✂ Gerar corte em duas partes','split','primary wide')+
        (result?'<div class="studio-result"><strong>✓ Corte gerado</strong><span>A · '+result.left.triangles.toLocaleString('pt-BR')+' faces</span><span>B · '+result.right.triangles.toLocaleString('pt-BR')+' faces</span></div>'+(result.warning?'<p class="studio-hint studio-warning">'+esc(result.warning)+'</p>':'')+pBtn('↓ Baixar as duas partes (ZIP)','parts-zip','primary wide')+'<div class="studio-inline-actions">'+pBtn('Parte A · 3MF','part-a-3mf','light')+pBtn('Parte B · 3MF','part-b-3mf','light')+'</div>':'')+
        '<p class="studio-hint">Este é um corte plano com tampas simples. Não inclui conectores ou cortes desenhados à mão; malhas ocas precisam de inspeção.</p>';
    }else if(mode==='paint'){
      const swatches=['#ffffff','#222222','#ec6d4e','#ffb74f','#f4dd73','#69ad78','#57acd2','#4c68ae','#aa78c5','#df87ab'];
      controls='<div class="studio-section-title"><h2>Pintar superfícies</h2><p>Escolha uma cor e clique na face desejada.</p></div><div class="paint-swatches">'+swatches.map(c=>'<button class="paint-swatch '+(state.paintColor===c?'active':'')+'" style="background:'+c+'" aria-label="Cor '+c+'" data-action="tool:color-'+c+'"></button>').join('')+'</div><div class="studio-form-row"><label>Cor personalizada <input id="paint-color" type="color" class="color-input" value="'+esc(state.paintColor)+'"></label><span>Faces pintadas <strong class="tool-data">'+(mesh?.colors||[]).filter(c=>c&&c.toLowerCase()!==M().DEFAULT_COLOR.toLowerCase()).length+'</strong></span></div><div class="studio-inline-actions">'+pBtn('↶ Desfazer','undo-paint','light')+pBtn('Limpar','clear-paint','ghost')+'</div>'+pBtn('↓ Exportar 3MF colorido','export-3mf','primary wide')+'<p class="studio-hint">Clique para pintar; Shift + arrastar gira o modelo. Em malhas densas, a prévia mostra até 10 mil triângulos.</p>';
    }else if(mode==='inspect'){
      controls='<div class="studio-section-title"><h2>Inspecionar modelo</h2><p>Confira medidas e redimensione a peça.</p></div>'+info+input('model-scale','Escala uniforme (%)',model?Math.round(model.scale*100):100,'number','min="1" max="1000" step="1"')+'<div class="studio-measure"><span>Triângulos <strong>'+((mesh?.triangles||0).toLocaleString('pt-BR'))+'</strong></span><span>Volume geométrico* <strong>'+(mesh?size(mesh.volume*Math.pow(model.scale,3)/1000):'—')+' cm³</strong></span></div><div class="studio-inline-actions">'+pBtn('↓ STL','export-stl','light')+pBtn('↓ 3MF','export-3mf','primary')+'</div><p class="studio-hint">*Volume confiável para malhas fechadas e orientadas. Não corresponde ao consumo de filamento.</p>';
    }else if(mode==='convert'){
      controls='<div class="studio-section-title"><h2>Converter formato</h2><p>Exporte a geometria da peça para o fatiador.</p></div><div class="studio-format">'+(mesh?esc(mesh.metadata?.format||'Modelo 3D'):'STL / 3MF / OBJ')+' <span>→</span> STL / 3MF</div>'+pBtn('↓ Baixar STL','export-stl','light wide')+pBtn('↓ Baixar 3MF','export-3mf','primary wide')+'<p class="studio-hint">A conversão mantém a geometria e cores simples (no 3MF), mas não preserva as configurações particulares do projeto Bambu Studio.</p>';
    }else if(mode==='profile'){controls=renderPreset(state);}
    const sidebar='<aside class="studio-controls">'+uploader+tabs+'<div class="studio-controls-body">'+controls+'</div><div class="studio-controls-foot">♧ Arquivos processados somente neste dispositivo.</div></aside>';
    const title=model?esc(model.name):'Nenhum modelo carregado';
    const center=model?'<canvas id="model-canvas" class="model-canvas" aria-label="Pré-visualização tridimensional"></canvas>':
      '<div class="studio-canvas-empty"><div class="studio-empty-symbol">⬡</div><h2>Crie ou importe sua peça.</h2><p>Comece modelando uma forma 3D ou abra um STL, 3MF ou OBJ.</p>'+pBtn('✦ Criar minha primeira peça','mode-create','primary')+'<small>Seus arquivos não são enviados a nenhum servidor.</small></div>';
    const status=model?'<div class="studio-view-meta"><span class="studio-status-dot"></span> Modelo carregado <span>·</span> '+mesh.triangles.toLocaleString('pt-BR')+' triângulos <span>·</span> '+size(Math.max(...mesh.dimensions)*model.scale)+' mm máx.</div>':'<div class="studio-view-meta"><span class="studio-status-dot"></span> Aguardando importação</div>';
    const viewer='<section class="studio-viewer"><header class="studio-view-head"><div><small>ÁREA DE TRABALHO / MODELO</small><strong>'+title+'</strong></div><div class="studio-view-actions">'+(mesh?'<span class="studio-format-tag">'+esc(mesh.metadata?.format||'3D')+'</span>'+pBtn('↓ Exportar 3MF','export-3mf','light')+pBtn('✕','reset-model','ghost'):'<span class="studio-format-tag">3D WORKSPACE</span>')+'</div></header><div class="studio-view-stage" id="tool-drop">'+center+
      (mesh?'<div class="studio-view-toolbox" aria-label="Controles da câmera">'+pBtn('+','zoom-in','light')+pBtn('−','zoom-out','light')+pBtn('⌖','reset-view','light')+'</div>'+
      '<div class="studio-camera-views">'+pBtn('Iso','view-iso','light')+pBtn('Topo','view-top','light')+pBtn('Frente','view-front','light')+pBtn('Lado','view-side','light')+'</div>'+
      '<div class="studio-view-axis"><span style="color:#da534e">X</span> · <span style="color:#419d66">Y</span> · <span style="color:#597dd9">Z</span> <small>mesa de impressão · 256 × 256 mm</small></div>':'')+
      '</div><footer class="studio-view-footer">'+status+'<span class="studio-view-hint">'+(mesh?(mode==='paint'?'Clique para pintar · Shift + arraste gira · roda amplia':mode==='create'&&state.builder?.mode==='sculpt'?'Clique para esculpir · Shift + arraste gira': 'Arraste para girar · roda amplia · botão direito desloca · duplo clique ajusta'):'STL · 3MF · OBJ')+'</span></footer></section>';
    return '<div id="studio-workbench">'+intro+'<div class="studio-layout">'+sidebar+viewer+'</div></div>';
  }
  global.Feito3DPanel={render:renderWorkbench,bindCanvas,loadModel,loadProject,action,handleInput,handleChange,suggestedProfile};
})(typeof window==='undefined'?globalThis:window);
