/* Feito em Forma — Catálogo online de produtos frequentes.
   Plugin independente: não modifica o código da calculadora nem os orçamentos.
   Segurança: Supabase Auth + Row Level Security por owner_id. */
(() => {
  'use strict';
  const FIELDS=[
    'prod_nome','prod_material','prod_custo_filamento','prod_quantidade','prod_peso',
    'prod_temp_imp','prod_temp_prep','prod_emb','prod_extras','prod_descricao',
    'prod_canal','prod_margem_pct','prod_taxa_pct','prod_taxa_fixa',
    'prod_preco_manual','vendas_qtd'
  ];
  const $ = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
  let db=null,userId=null,products=[],busy=false,editingId=null,channel=null,reloadTimer=null;
  const VALID_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function status(message,error=false){
    const el=$('catalogStatus');if(!el)return;
    el.textContent=message;el.classList.toggle('catalog-error',error);
  }
  function getFields(){
    const data={};
    for(const id of FIELDS){const input=$(id);if(input)data[id]=String(input.value??'').slice(0,180);}
    return data;
  }
  function validFields(data){
    const name=String(data.prod_nome||'').trim();
    if(!name)return 'Informe o nome da peça na calculadora antes de salvar.';
    if(name.length>120)return 'O nome do produto deve ter no máximo 120 caracteres.';
    if(!['PLA','PETG','ABS','TPU','Outro'].includes(data.prod_material))return 'Selecione um tipo de filamento válido.';
    const qty=Number(data.prod_quantidade);
    if(!Number.isInteger(qty)||qty<1||qty>100000)return 'Informe uma quantidade válida.';
    for(const id of FIELDS){
      if(['prod_nome','prod_material','prod_descricao','prod_canal'].includes(id))continue;
      const str=String(data[id]??'').trim();if(!str)continue;
      if(!Number.isFinite(Number(str))||Number(str)<0)return 'Confira os campos numéricos da calculadora.';
    }
    return '';
  }
  function applyFields(fields){
    if(!fields||typeof fields!=='object')return;
    for(const id of FIELDS){
      const input=$(id);
      if(input && Object.hasOwn(fields,id) && typeof fields[id]!=='object'){
        input.value=String(fields[id]).slice(0,180);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        if(input.tagName==='SELECT')input.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
  }
  function showTab(){
    document.querySelectorAll('.panel').forEach(el=>el.classList.toggle('active',el.id==='panel-catalogo'));
    document.querySelectorAll('.nav-link,.embedded-nav [data-tab]').forEach(el=>{
      const active=el.dataset.tab==='catalogo';el.classList.toggle('active',active);
      if(el.classList.contains('nav-link')){
        if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
      }
    });
    if($('breadcrumbSection'))$('breadcrumbSection').textContent='PRODUTOS CADASTRADOS';
    window.scrollTo({top:0,behavior:'auto'});
    reportHeight();
    refresh();
  }
  function reportHeight(){
    if(window.parent!==window){
      try{window.parent.postMessage({type:'FEF_CALCULATOR_RESIZE',height:document.body.scrollHeight},location.origin)}catch(e){}
    }
  }
  function noticeEditing(){
    const area=$('catalogEditBanner');if(!area)return;
    const product=products.find(p=>p.id===editingId);
    area.hidden=!product;
    if(product)$('catalogEditingName').textContent=product.name;
    reportHeight();
  }
  function navigateCalculator(){
    // O menu existente é a única autoridade para calcular e mudar de aba.
    const btn=document.querySelector('[data-tab="calculadora"]');
    btn?.click();
  }
  function render(){
    const area=$('catalogList');if(!area)return;
    area.replaceChildren();
    const query=String($('catalogSearch').value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const matches=products.filter(p=>[p.name,p.material,p.description].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));
    $('catalogCount').textContent=String(products.length);
    if(!matches.length){
      const empty=document.createElement('div');empty.className='catalog-empty';
      empty.textContent=products.length?'Nenhum produto corresponde à pesquisa.':'Nenhuma peça cadastrada ainda. Configure uma peça na Calculadora e clique em “Salvar no catálogo”.';
      area.append(empty);reportHeight();return;
    }
    for(const item of matches){
      const card=document.createElement('article');card.className='catalog-card';
      const header=document.createElement('div');header.className='catalog-card-head';
      const info=document.createElement('div');
      const name=document.createElement('h3');name.textContent=item.name;
      const desc=document.createElement('p');desc.textContent=item.description || 'Peça personalizada para impressão 3D';
      info.append(name,desc);
      const tag=document.createElement('span');tag.className='catalog-tag';tag.textContent=item.material;
      header.append(info,tag);
      const attrs=document.createElement('div');attrs.className='catalog-attrs';
      const data=item.data||{};
      const attrItems=[['Peso',`${data.prod_peso||'0'} g`],['Impressão',`${data.prod_temp_imp||'0'} h`],['Preço',data.prod_preco_manual?money(data.prod_preco_manual):'Calculado na hora']];
      for(const [label,value] of attrItems){const block=document.createElement('div');const caption=document.createElement('small');caption.textContent=label;const amount=document.createElement('strong');amount.textContent=value;block.append(caption,amount);attrs.append(block);}
      const actions=document.createElement('div');actions.className='catalog-actions';
      const action=(text,cls,handler)=>{const button=document.createElement('button');button.type='button';button.className=cls;button.textContent=text;button.addEventListener('click',handler);actions.append(button);};
      action('+ Adicionar ao orçamento','catalog-btn primary',()=>useItem(item,true));
      action('Carregar / editar','catalog-btn subtle',()=>useItem(item,false));
      action('Excluir','catalog-btn delete',()=>removeItem(item));
      card.append(header,attrs,actions);area.append(card);
    }
    reportHeight();
  }
  function makeRow(row){
    if(!row||!VALID_ID.test(row.id))return null;
    return {
      id:row.id,name:String(row.name||''),material:String(row.material||'PLA'),
      description:String(row.description||''),data:row.product_data&&typeof row.product_data==='object'?row.product_data:{},
      updatedAt:row.updated_at
    };
  }
  function friendlyError(error){
    const message=String(error?.message||error||'Falha de comunicação');
    if(error?.code==='42P01'||error?.code==='PGRST205'||/relation .*catalog_products.* does not exist/i.test(message))return 'É preciso executar o SQL do catálogo no Supabase antes de usar esta aba.';
    if(error?.code==='42501')return 'Acesso negado: confira as políticas RLS no banco do catálogo.';
    if(/failed to fetch|network|offline/i.test(message))return 'Não foi possível comunicar com o Supabase. Verifique a conexão.';
    return message;
  }
  async function refresh(){
    if(!db||!userId||busy)return;
    const current=userId;
    try{
      const {data,error}=await db.from('catalog_products')
        .select('id,name,material,description,product_data,updated_at')
        .eq('owner_id',current).order('updated_at',{ascending:false}).limit(500);
      if(error)throw error;
      if(current!==userId)return;
      products=(data||[]).map(makeRow).filter(Boolean);
      status(`${products.length} produto(s) sincronizado(s) na sua conta.`);render();noticeEditing();
    }catch(error){status(friendlyError(error),true);}
  }
  function scheduleRefresh(){clearTimeout(reloadTimer);reloadTimer=setTimeout(refresh,350);}
  async function saveCurrent(){
    if(!db||!userId){status('Conecte sua conta do Planner para salvar produtos.',true);return;}
    if(busy)return;
    const fields=getFields(),problem=validFields(fields);
    if(problem){status(problem,true);return;}
    const row={owner_id:userId,name:fields.prod_nome.trim(),material:fields.prod_material,
      description:String(fields.prod_descricao||'').slice(0,180),product_data:fields};
    busy=true;status(editingId?'Atualizando produto na nuvem...':'Salvando produto na nuvem...');
    try{
      if(editingId){
        const existing=products.find(p=>p.id===editingId);
        if(!existing)throw new Error('Produto não encontrado. Atualize a lista antes de editar.');
        const {data,error}=await db.from('catalog_products').update(row).eq('owner_id',userId)
          .eq('id',editingId).eq('updated_at',existing.updatedAt).select('id').maybeSingle();
        if(error)throw error;
        if(!data)throw new Error('Este produto foi alterado em outro dispositivo. Atualize e revise antes de salvar.');
      }else{
        const {error}=await db.from('catalog_products').insert(row);
        if(error)throw error;
      }
      const wasEdit=!!editingId;editingId=null;
      status(wasEdit?'Produto atualizado na nuvem!':'Produto cadastrado na nuvem!');
      $('catalogSaveCalc').textContent='☆ Salvar produto no catálogo';
      noticeEditing();
    }catch(error){status(friendlyError(error),true);}
    finally{busy=false;await refresh();}
  }
  function useItem(item,addToQuote){
    if(!item?.data)return;
    applyFields(item.data);
    editingId=addToQuote?null:item.id;
    $('catalogSaveCalc').textContent=editingId?'✓ Atualizar produto no catálogo':'☆ Salvar produto no catálogo';
    noticeEditing();
    navigateCalculator();
    if(addToQuote){
      const button=$('addItemBtn');
      if(!button||button.disabled){showTab();status(`Revise o preço da peça “${item.name}” na calculadora.`,true);return;}
      const previous=Number($('itemCount')?.textContent||0);
      button.click();
      const current=Number($('itemCount')?.textContent||0);
      status(current>previous?`“${item.name}” adicionado ao orçamento.`:'Não foi possível adicionar a peça. Confira o limite de itens da proposta.',current<=previous);
    }else{
      status(`“${item.name}” carregado. Edite os dados na calculadora e clique em “Atualizar produto no catálogo”.`);
    }
  }
  async function removeItem(item){
    if(!db||!userId||busy||!window.confirm(`Excluir “${item.name}” do catálogo? Os orçamentos existentes não serão apagados.`))return;
    busy=true;status('Excluindo produto...');
    try{
      const {data,error}=await db.from('catalog_products').delete().eq('owner_id',userId)
        .eq('id',item.id).select('id').maybeSingle();
      if(error)throw error;
      if(!data)throw new Error('Produto não encontrado; ele pode ter sido excluído em outro aparelho.');
      if(editingId===item.id)editingId=null;
      status('Produto excluído do catálogo.');
    }catch(error){status(friendlyError(error),true);}
    finally{busy=false;await refresh();}
  }
  function createUI(){
    const side=document.querySelector('.sidebar .nav');
    const top=document.querySelector('.embedded-nav');
    const calculator=$('panel-calculadora');
    const settings=$('panel-configuracoes');
    if(!side||!calculator||!settings||$('panel-catalogo'))return false;
    const sideBtn=document.createElement('button');sideBtn.type='button';sideBtn.className='nav-link';sideBtn.dataset.tab='catalogo';sideBtn.innerHTML='<span class="nav-ico">▦</span> Produtos cadastrados';
    const before=side.querySelector('[data-tab="configuracoes"]');side.insertBefore(sideBtn,before||null);
    sideBtn.addEventListener('click',showTab);
    if(top){
      const mini=document.createElement('button');mini.type='button';mini.dataset.tab='catalogo';mini.textContent='▦ Produtos cadastrados';
      top.insertBefore(mini,top.querySelector('[data-tab="configuracoes"]')||null);
      mini.addEventListener('click',showTab);
    }
    const saveBtn=document.createElement('button');saveBtn.type='button';saveBtn.id='catalogSaveCalc';saveBtn.className='catalog-save-calc';
    saveBtn.textContent='☆ Salvar produto no catálogo';saveBtn.addEventListener('click',saveCurrent);
    $('addItemBtn')?.insertAdjacentElement('afterend',saveBtn);
    const editBanner=document.createElement('div');editBanner.id='catalogEditBanner';editBanner.className='catalog-edit-banner';editBanner.hidden=true;
    editBanner.innerHTML='<span>Você está editando: <strong id="catalogEditingName"></strong></span><button type="button" id="catalogCancelEdit">Cancelar edição</button>';
    calculator.querySelector('.page-head')?.insertAdjacentElement('afterend',editBanner);
    $('catalogCancelEdit').addEventListener('click',()=>{editingId=null;saveBtn.textContent='☆ Salvar produto no catálogo';noticeEditing();status('Edição cancelada.');});
    const panel=document.createElement('section');panel.id='panel-catalogo';panel.className='panel catalog-panel';panel.setAttribute('aria-label','Produtos cadastrados');
    panel.innerHTML=`<div class="page-head"><div><div class="eyebrow">CATÁLOGO DE PRODUTOS</div><h1>Suas peças mais <em>vendidas.</em></h1><p>Cadastre uma vez, reutilize nos orçamentos e sincronize entre seus dispositivos.</p></div><button class="btn btn-dark" type="button" id="catalogGoCalc">+ Cadastrar nova peça</button></div>
      <section class="surface catalog-surface">
        <div class="surface-header"><div><div class="section-counter">PRODUTOS FREQUENTES</div><h2>Peças salvas <span id="catalogCount" class="mini-count">0</span></h2></div><button type="button" id="catalogRefresh" class="btn btn-small btn-outline">↻ Atualizar</button></div>
        <div class="catalog-toolbar"><label class="field"><span>Buscar produto</span><input type="search" id="catalogSearch" placeholder="Nome, material ou descrição..."></label><p>Para cadastrar: configure a peça na aba Calculadora e clique em <b>Salvar produto no catálogo</b>.</p></div>
        <div id="catalogStatus" class="catalog-status" role="status">Conectando ao Supabase...</div>
        <div id="catalogList" class="catalog-list"></div>
      </section>`;
    settings.insertAdjacentElement('beforebegin',panel);
    $('catalogGoCalc').addEventListener('click',()=>{editingId=null;saveBtn.textContent='☆ Salvar produto no catálogo';noticeEditing();navigateCalculator();$('prod_nome')?.focus();});
    $('catalogRefresh').addEventListener('click',refresh);
    $('catalogSearch').addEventListener('input',render);
    return true;
  }
  function loadScript(url){return new Promise((resolve,reject)=>{
    const el=document.createElement('script');el.src=url;el.onload=resolve;el.onerror=()=>reject(new Error('Não foi possível carregar '+url));document.head.append(el);
  });}
  async function cloudStart(){
    try{
      let cfg=window.FEITO_SUPABASE;
      if(!cfg && window.parent!==window){try{cfg=window.parent.FEITO_SUPABASE}catch(e){}}
      if(!cfg) {await loadScript('../config.js');cfg=window.FEITO_SUPABASE;}
      if(!cfg?.url||!cfg?.publishableKey||!String(cfg.url).startsWith('https://'))throw new Error('Não foi possível ler a conexão do Planner. Abra a calculadora pelo menu Envio de orçamento.');
      let sdk=window.supabase;
      if(!sdk?.createClient && window.parent!==window){try{sdk=window.parent.supabase}catch(e){}}
      if(!sdk?.createClient){await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');sdk=window.supabase;}
      if(!sdk?.createClient)throw new Error('Biblioteca Supabase indisponível.');
      db=sdk.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      const {data,error}=await db.auth.getUser();if(error)throw error;
      if(!data?.user?.id)throw new Error('É necessário entrar na mesma conta no Planner para acessar o catálogo.');
      userId=data.user.id;
      await refresh();
      channel=db.channel(`catalogo-${userId}`).on('postgres_changes',
        {event:'*',schema:'public',table:'catalog_products',filter:`owner_id=eq.${userId}`},scheduleRefresh).subscribe();
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
      setInterval(()=>{if(!document.hidden && $('panel-catalogo')?.classList.contains('active'))refresh();},45000);
    }catch(error){status(friendlyError(error),true);}
  }
  function init(){
    if(!createUI())return;
    cloudStart();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
