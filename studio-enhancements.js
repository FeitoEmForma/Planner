/* Feito em Forma Studio dentro do Planner original.
 * Mantém o login Supabase já existente e a identidade visual do Planner.
 */
(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const host = $('#studioExtraContent');
  const container = $('#studioExtraWorkspace');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
  const qty = value => new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(value)||0);
  const num = value => Number(value)||0;
  const dateToday = () => {
    const d = new Date(), n = value => String(value).padStart(2,'0');
    return d.getFullYear()+'-'+n(d.getMonth()+1)+'-'+n(d.getDate());
  };
  const bridge = window.FeitoPlannerBridge;
  const TABLES = Object.freeze({inventory:'studio_inventory',finance:'studio_finance',catalog:'studio_products'});
  const names = {
    inventory:['Estoque','Todos os materiais em ordem.','Controle filamentos, peças prontas e necessidade de reposição.'],
    finance:['Financeiro','Seu negócio em números.','Acompanhe o resultado dos orçamentos e as movimentações do caixa.']
  };
  const fields = {
    inventory:[
      ['name','Nome do item','text',true],
      ['type','Tipo','select',false,['Filamento','Insumo','Produto pronto','Embalagem','Outro']],
      ['quantity','Quantidade disponível','number',true],
      ['unit','Unidade','select',false,['un','kg','g','m','rolo','caixa']],
      ['min_quantity','Estoque mínimo','number',true],
      ['cost','Custo unitário (R$)','number',true],
      ['notes','Observações','textarea',false]
    ],
    finance:[
      ['description','Descrição da movimentação','text',true],
      ['type','Tipo','select',true,[['income','Receita'],['expense','Despesa']]],
      ['amount','Valor (R$)','number',true],
      ['date','Data','date',true],
      ['category','Categoria','select',false,['Venda','Filamento','Energia','Embalagem','Manutenção','Transporte','Outros']],
      ['notes','Observações','textarea',false]
    ]
  };
  let current = '', currentUser = '', currentLoad = 0, editing = null, saving = false, inventoryCatalogProductId = null, updateDebounce;
  const rows = {inventory:[],finance:[],catalog:[]};
  let toastTimer;
  function notify(message,error=false) {
    const el=$('#toast');
    clearTimeout(toastTimer);
    el.textContent=String(message);
    el.classList.toggle('error',error);
    el.classList.add('show');
    toastTimer=setTimeout(()=>el.classList.remove('show'),5000);
  }
  function db() { return bridge?.client?.(); }
  function user() { return bridge?.user?.(); }
  function resetView() {
    if (!current) return;
    ++currentLoad;current='';container.hidden=true;
    document.querySelectorAll('[data-studio-view]').forEach(el=>el.classList.remove('active'));
  }
  async function show(view) {
    if(!names[view])return;
    if(!user()||!db()){notify('Entre na sua conta para abrir este módulo.',true);return;}
    const userId=user().id;
    if(currentUser!==userId){currentUser=userId;for(const k of Object.keys(rows))rows[k]=[];}
    current=view;editing=null;inventoryCatalogProductId=null;
    document.querySelectorAll('[data-view]').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('[data-studio-view]').forEach(el=>el.classList.toggle('active',el.dataset.studioView===view));
    container.hidden=false;
    $('#workspace').hidden=true;
    $('#calculatorWorkspace').hidden=true;
    $('#stats').hidden=true;
    $('.sync-bar').hidden=true;
    $('#breadcrumbTitle').textContent=names[view][0];
    $('#pageTitle').textContent=names[view][1];
    $('#pageSubtitle').textContent=names[view][2];
    host.innerHTML='<div class="studio-loading">Buscando dados da sua conta...</div>';
    const run=++currentLoad;
    try {
      const response=await db().from(TABLES[view]).select('*').eq('owner_id',userId).order('created_at',{ascending:false}).limit(1000);
      if(response.error)throw response.error;
      if(run!==currentLoad||current!==view||user()?.id!==userId)return;
      rows[view]=response.data||[];
      if(view==='inventory'){
        const products=await db().from(TABLES.catalog).select('*').eq('owner_id',userId).order('created_at',{ascending:false}).limit(1000);
        if(products.error)throw products.error;
        rows.catalog=products.data||[];
        await importQuoteProducts(userId,run);
      }
      if(run!==currentLoad||current!==view||user()?.id!==userId)return;
      renderBusiness();
    }catch(error){
      if(run!==currentLoad||current!==view)return;
      console.error('Módulo Studio:',error);
      const missing=['42P01','PGRST205'].includes(error.code);
      host.innerHTML='<div class="studio-error"><h2>'+ (missing?'Ative o banco dos novos módulos':'Não foi possível carregar seus dados') +'</h2><p>'+ (missing?'Execute o arquivo <b>ATIVAR-MODULOS-STUDIO.sql</b> no SQL Editor do mesmo Supabase do Planner. Os orçamentos atuais não serão alterados.':escapeHtml(error.message||'Verifique a conexão e tente novamente.')) +'</p><button class="button primary" data-module-action="reload">Tentar novamente</button></div>';
    }
  }
  const normalizedKey = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
  const productKey = (name,material) => `${normalizedKey(name)}|${normalizedKey(material||'PLA')}`;
  function quoteProducts(){
    const found=new Map();
    for(const quote of bridge?.quotes?.()||[]){
      const detailed=quote.calculatorData?.items;
      const items=Array.isArray(detailed)&&detailed.length?detailed:[{name:quote.product,materialType:'PLA',unitPrice:quote.unitPrice}];
      for(const item of items){
        const name=String(item.name||'').trim().slice(0,150);
        const material=String(item.materialType||item.material||'PLA').trim().slice(0,60);
        if(!name)continue;
        const key=productKey(name,material);
        const productFields=item.productFields&&typeof item.productFields==='object'&&!Array.isArray(item.productFields)?item.productFields:{};
        const product_data={...productFields,prod_nome:name,prod_material:material,prod_quantidade:String(item.quantity||quote.quantity||1),
          prod_preco_manual:String(Math.max(0,num(item.unitPrice))),prod_descricao:String(item.description||'')};
        if(!found.has(key))found.set(key,{name,material,price:Math.max(0,num(item.unitPrice)),source_key:key,product_data});
      }
    }
    return [...found.values()];
  }
  async function importQuoteProducts(userId,run){
    // Apenas cadastros ausentes: preço, descrição e estoque editados pelo usuário prevalecem.
    const existing=new Set(rows.catalog.map(p=>productKey(p.name,p.material)));
    const missing=quoteProducts().filter(p=>!existing.has(p.source_key)).slice(0,250);
    if(!missing.length)return;
    const payload=missing.map(p=>({...p,owner_id:userId,category:'Impressão 3D',stock:0}));
    const result=await db().from(TABLES.catalog).upsert(payload,{onConflict:'owner_id,source_key',ignoreDuplicates:true});
    if(result.error)throw result.error;
    if(run!==currentLoad||current!=='inventory'||user()?.id!==userId)return;
    const updated=await db().from(TABLES.catalog).select('*').eq('owner_id',userId).order('created_at',{ascending:false}).limit(1000);
    if(updated.error)throw updated.error;
    rows.catalog=updated.data||[];
  }
  function tableHead(cells){return '<thead><tr>'+cells.map(s=>'<th>'+s+'</th>').join('')+'</tr></thead>';}
  function actions(id,extra='') {
    return '<div class="studio-actions">'+extra+'<button class="studio-small-button" data-module-action="edit" data-id="'+escapeHtml(id)+'">Editar</button><button class="studio-small-button danger" data-module-action="remove" data-id="'+escapeHtml(id)+'">Excluir</button></div>';
  }
  function top(title,subtitle,button='Novo registro') {
    return '<div class="studio-module-top"><div><div class="eyebrow">FEITO EM FORMA · CONTROLE</div><h2>'+title+'</h2><p>'+subtitle+'</p></div><div class="studio-module-buttons"><button class="button secondary" data-module-action="backup">Backup JSON</button><button class="button primary" data-module-action="add">+ '+button+'</button></div></div>';
  }
  function tile(label,value,detail){return '<div class="studio-kpi"><span>'+label+'</span><strong>'+value+'</strong><small>'+detail+'</small></div>';}
  function renderInventory(items){
    const low=items.filter(item=>num(item.quantity)<=num(item.min_quantity));
    const value=items.reduce((s,x)=>s+num(x.quantity)*num(x.cost),0);
    const body=items.map(item=>'<tr><td><strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(item.type)+'</small></td><td>'+qty(item.quantity)+' '+escapeHtml(item.unit)+'</td><td>'+qty(item.min_quantity)+'</td><td>'+brl(item.cost)+'</td><td>'+brl(num(item.quantity)*num(item.cost))+'</td><td>'+(num(item.quantity)<=num(item.min_quantity)?'<span class="studio-tag warning">Repor</span>':'<span class="studio-tag">Disponível</span>')+'</td><td>'+actions(item.id)+'</td></tr>').join('');
    return top('Controle de estoque','Monitore quantidades e reposições. Ao cadastrar, escolha um produto já salvo ou registre um insumo novo.','Cadastrar item')+
      '<div class="studio-kpis">'+tile('Itens cadastrados',items.length,'Materiais e produtos')+tile('Reposição necessária',low.length,'Igual ou abaixo do mínimo')+tile('Valor em estoque',brl(value),'Pelo custo cadastrado')+'</div>'+
      '<div class="studio-panel"><div class="studio-panel-title">Materiais e produtos</div>'+(items.length?'<div class="studio-table-wrap"><table>'+tableHead(['ITEM','DISPONÍVEL','MÍNIMO','CUSTO UN.','TOTAL','SITUAÇÃO','AÇÕES'])+'<tbody>'+body+'</tbody></table></div>':empty('Nenhum item cadastrado. Comece pelo botão “Cadastrar item”.'))+'</div>';
  }
  function renderFinance(items){
    const income=items.filter(x=>x.type==='income').reduce((s,x)=>s+num(x.amount),0);
    const expense=items.filter(x=>x.type==='expense').reduce((s,x)=>s+num(x.amount),0);
    const orders=bridge?.quotes?.()||[];
    const approved=new Set(['aprovado','producao','embalagem','pagamento','finalizado']);
    const committed=orders.filter(q=>approved.has(q.status));
    const finalized=orders.filter(q=>q.status==='finalizado');
    const totalOf=q=>q.calculatorData?.totals?.revenue!=null?num(q.calculatorData.totals.revenue):num(q.quantity)*num(q.unitPrice);
    const costOf=q=>q.calculatorData?.totals?.cost!=null?num(q.calculatorData.totals.cost):num(q.quantity)*num(q.unitCost);
    const paidOf=q=>q.paymentStatus==='pago'?totalOf(q):Math.min(totalOf(q),num(q.paidAmount));
    const committedTotal=committed.reduce((s,q)=>s+totalOf(q),0);
    const committedCost=committed.reduce((s,q)=>s+costOf(q),0);
    const paid=orders.reduce((s,q)=>s+paidOf(q),0);
    const receivables=committed.reduce((s,q)=>s+Math.max(0,totalOf(q)-paidOf(q)),0);
    const finishedGross=finalized.reduce((s,q)=>s+totalOf(q),0);
    const finishedCost=finalized.reduce((s,q)=>s+costOf(q),0);
    const cash=paid+income-expense;
    const ordersBody=orders.map(q=>'<tr><td><strong>'+escapeHtml(q.client)+'</strong><small>'+escapeHtml(q.code)+' · '+escapeHtml(q.product)+'</small></td><td>'+escapeHtml(({a_fazer:'A fazer',enviado:'Enviado',aprovado:'Aprovado',producao:'Produção',embalagem:'Embalando',pagamento:'Aguardando',finalizado:'Finalizado',standby:'Stand-by'})[q.status]||q.status)+'</td><td>'+brl(totalOf(q))+'</td><td>'+brl(costOf(q))+'</td><td class="'+(totalOf(q)-costOf(q)<0?'studio-negative':'studio-positive')+'">'+brl(totalOf(q)-costOf(q))+'</td><td>'+brl(paidOf(q))+'</td><td>'+brl(Math.max(0,totalOf(q)-paidOf(q)))+'</td></tr>').join('');
    const body=items.map(item=>'<tr><td><strong>'+escapeHtml(item.description)+'</strong><small>'+escapeHtml(item.category)+'</small></td><td>'+escapeHtml(item.date||'—')+'</td><td><span class="studio-tag '+(item.type==='expense'?'warning':'')+'">'+(item.type==='income'?'Receita':'Despesa')+'</span></td><td class="'+(item.type==='income'?'studio-positive':'studio-negative')+'"><strong>'+(item.type==='income'?'+ ':'− ')+brl(item.amount)+'</strong></td><td>'+actions(item.id)+'</td></tr>').join('');
    return top('Financeiro integrado','Valores do Quadro de Pedidos atualizados pela nuvem e lançamentos adicionais de caixa.','Nova movimentação')+
      '<div class="studio-kpis studio-finance-kpis">'+tile('Saldo de caixa registrado',brl(cash),'Recebido nos pedidos + entradas extras − saídas extras')+tile('Recebimentos de pedidos',brl(paid),orders.length+' orçamento(s) integrado(s)')+tile('A receber dos aprovados',brl(receivables),'Pedidos aprovados/em produção/finalizados')+tile('Lucro previsto dos aprovados',brl(committedTotal-committedCost),'Venda − fabricação, sem despesas extras')+tile('Lucro previsto dos finalizados',brl(finishedGross-finishedCost),finalized.length+' pedido(s) concluído(s)')+tile('Despesas extras',brl(expense),'Lançamentos manuais')+'</div>'+
      '<div class="studio-info">O <b>saldo de caixa registrado</b> reflete somente recebimentos e movimentações informados; não desconta automaticamente o custo de produção, que aparece separado no lucro estimado. Lance despesas efetivamente pagas abaixo. <b>Não registre novamente como receita manual</b> um pagamento já marcado no Quadro de Pedidos.</div>'+
      '<div class="studio-panel"><div class="studio-panel-title">Orçamentos e pedidos integrados <span class="studio-muted">('+orders.length+')</span></div>'+(orders.length?'<div class="studio-table-wrap"><table>'+tableHead(['CLIENTE / PRODUTO','ETAPA','VENDA','FABRICAÇÃO','LUCRO PREV.','RECEBIDO','A RECEBER'])+'<tbody>'+ordersBody+'</tbody></table></div>':empty('Os orçamentos do Quadro de Pedidos aparecerão aqui automaticamente.'))+'</div>'+
      '<div class="studio-panel"><div class="studio-panel-title">Lançamentos adicionais de caixa</div>'+(items.length?'<div class="studio-table-wrap"><table>'+tableHead(['DESCRIÇÃO','DATA','TIPO','VALOR','AÇÕES'])+'<tbody>'+body+'</tbody></table></div>':empty('Nenhuma entrada ou despesa extra cadastrada.'))+'</div>';
  }
  function empty(message){return '<div class="studio-empty">'+escapeHtml(message)+'</div>';}
  function renderBusiness() {
    if(!names[current])return;
    host.innerHTML=current==='inventory'?renderInventory(rows.inventory):renderFinance(rows.finance);
  }
  function renderField([key,label,type,required,options],item) {
    const defaults={quantity:0,min_quantity:0,cost:0,amount:0,unit:'un',type:'Filamento',date:dateToday()};
    const raw=item?.[key]??defaults[key]??'';
    const val=escapeHtml(raw);
    const attrs='name="'+key+'" id="st-field-'+key+'" '+(required?'required':'');
    let input;
    if(type==='select'){
      input='<select '+attrs+'>'+options.map(o=>{const value=Array.isArray(o)?o[0]:o,caption=Array.isArray(o)?o[1]:o;return '<option value="'+escapeHtml(value)+'" '+(String(raw)===String(value)?'selected':'')+'>'+escapeHtml(caption)+'</option>';}).join('')+'</select>';
    }else if(type==='textarea')input='<textarea '+attrs+' maxlength="2000" rows="3">'+val+'</textarea>';
    else input='<input '+attrs+' type="'+type+'" value="'+val+'" '+(type==='number'?'min="0" step="'+(key==='stock'?'1':'any')+'"':'')+' '+(type==='text'?'maxlength="180"':'')+'>';
    return '<label class="'+(type==='textarea'?'studio-form-wide':'')+'">'+label+input+'</label>';
  }
  function formModal(item={}) {
    const id=editing,section=current,head={inventory:'item de estoque',finance:'movimentação'}[section];
    const form='<div class="studio-form-grid">'+fields[section].map(f=>renderField(f,item)).join('')+'</div>';
    const productOptions=rows.catalog.filter(p=>p.id&&p.name).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'))
      .map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.name)+' · '+escapeHtml(p.material||'Material não informado')+'</option>').join('');
    const picker=section==='inventory'&&!id?'<div class="studio-product-picker"><label for="st-saved-product">Selecionar um produto já cadastrado<select id="st-saved-product"><option value="">Novo item / preenchimento manual</option>'+productOptions+'</select></label><small>Produtos salvos na Calculadora ou nos pedidos. Você pode escolher um deles ou criar um item novo.</small></div>':'';
    const linkNote=section==='inventory'?'<p id="studioProductLinkHint" class="studio-form-hint" '+(!(inventoryCatalogProductId||item.catalog_product_id)?'hidden':'')+'>Produto vinculado à Calculadora. Ao salvar, a quantidade disponível ficará sincronizada com o produto cadastrado.</p>':'';
    host.insertAdjacentHTML('beforeend','<div id="studioFormOverlay" class="studio-form-overlay"><div class="studio-form-card" role="dialog" aria-modal="true" aria-labelledby="studioFormTitle"><div class="studio-form-head"><div><div class="eyebrow">DADOS DA SUA EMPRESA</div><h2 id="studioFormTitle">'+(id?'Editar ':'Adicionar ')+head+'</h2></div><button class="studio-close" data-module-action="close" aria-label="Fechar">×</button></div><form id="studioForm">'+picker+linkNote+form+'<div class="studio-form-actions"><button type="button" class="button muted" data-module-action="close">Cancelar</button><button type="submit" class="button primary">Salvar dados</button></div></form></div></div>');
    (picker?$('#st-saved-product'):$('#studioForm input'))?.focus();
  }
  function applySavedProduct(productId){
    if(current!=='inventory'||!$('#studioForm'))return;
    const selected=rows.catalog.find(p=>String(p.id)===String(productId));
    const existing=selected&&rows.inventory.find(inv=>inv.catalog_product_id===selected.id);
    editing=existing?.id||null;
    inventoryCatalogProductId=selected?.id||null;
    const values=selected?{
      name:existing?.name||selected.name,
      type:existing?.type||'Produto pronto',
      quantity:existing?.quantity??selected.stock??0,
      unit:existing?.unit||'un',
      min_quantity:existing?.min_quantity??0,
      cost:existing?.cost??0,
      notes:existing?.notes||'Produto cadastrado · Material: '+(selected.material||'não informado')
    }:{name:'',type:'Filamento',quantity:0,unit:'un',min_quantity:0,cost:0,notes:''};
    for(const [key,value] of Object.entries(values)){
      const input=$('#st-field-'+key);
      if(input)input.value=String(value);
    }
    $('#studioFormTitle').textContent=(existing?'Editar':'Adicionar')+' item de estoque';
    $('#studioProductLinkHint').hidden=!selected;
  }
  async function saveForm(event) {
    event.preventDefault();if(saving||!TABLES[current]||!user())return;
    const view=current,id=editing,userId=user().id,form=new FormData(event.target),record={};
    for(const [key,value] of form)record[key]=value;
    const numeric=view==='inventory'?['quantity','min_quantity','cost']:['amount'];
    for(const key of numeric){
      const v=Number(record[key]);
      if(!Number.isFinite(v)||v<0){notify('Informe números válidos e não negativos.',true);return;}
      record[key]=v;
    }
    const title=(record.name||record.description||'').trim();
    if(!title){notify('Informe um nome ou descrição.',true);return;}
    const linkedProductId=view==='inventory'?(inventoryCatalogProductId||rows.inventory.find(x=>x.id===id)?.catalog_product_id):null;
    if(linkedProductId){
      if(!Number.isInteger(record.quantity)||record.unit!=='un'){
        notify('Para produtos prontos vinculados ao catálogo, use unidades inteiras (un).',true);return;
      }
      record.catalog_product_id=linkedProductId;
    }
    saving=true;
    const button=event.target.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const request=id?db().from(TABLES[view]).update(record).eq('id',id).eq('owner_id',userId):db().from(TABLES[view]).insert({...record,owner_id:userId});
      const {data,error}=await request.select('id').single();
      if(error)throw error;
      // Se o registro foi criado e a sincronização vinculada falhar, uma nova
      // tentativa atualiza o mesmo ID em vez de inserir um item duplicado.
      if(!id&&data?.id)editing=data.id;
      if(linkedProductId){
        const sync=await db().from(TABLES.catalog).update({stock:record.quantity}).eq('id',linkedProductId).eq('owner_id',userId);
        if(sync.error)throw new Error('Estoque salvo, mas não foi possível atualizar a quantidade do produto na calculadora: '+sync.error.message);
      }
      if(current!==view||user()?.id!==userId)return;
      editing=null;
      inventoryCatalogProductId=null;
      await show(view);
      notify('Registro salvo na nuvem.');
    }catch(error){
      notify('Erro ao salvar: '+(error.message||'verifique o Supabase'),true);
      button.disabled=false;
    }finally{saving=false;}
  }
  function backup() {
    const payload={version:1,exportedAt:new Date().toISOString(),module:current,records:rows[current]};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='FeitoEmForma-'+current+'-'+dateToday()+'.json';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function moduleAction(event){
    const button=event.target.closest('[data-module-action]');if(!button||!current)return;
    const action=button.dataset.moduleAction,id=button.dataset.id,view=current;
    const item=rows[view]?.find(x=>x.id===id);
    if(action==='reload'){show(view);return;}
    if(action==='backup'){backup();return;}
    if(action==='close'){$('#studioFormOverlay')?.remove();editing=null;inventoryCatalogProductId=null;return;}
    if(action==='add'||action==='edit'){editing=action==='edit'?id:null;inventoryCatalogProductId=null;formModal(item);return;}
    if(action==='remove'&&item){
      if(!confirm('Excluir “'+(item.name||item.description)+'” da sua conta?'))return;
      const response=await db().from(TABLES[view]).delete().eq('id',id).eq('owner_id',user().id);
      if(response.error)notify('Não foi possível excluir: '+response.error.message,true);
      else{notify('Registro excluído.');show(view);}
    }
  }
  document.querySelectorAll('[data-studio-view]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.studioView)));
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',resetView,{capture:true}));
  window.addEventListener('feito:quotes-updated',()=>{
    if(current!=='finance'&&current!=='inventory')return;
    clearTimeout(updateDebounce);
    updateDebounce=setTimeout(()=>{if(current==='finance')renderBusiness();else if(current==='inventory'&&!$('#studioFormOverlay'))show('inventory');},600);
  });
  host.addEventListener('click',event=>{
    moduleAction(event);
  });
  host.addEventListener('submit',event=>{
    if(event.target.id==='studioForm')saveForm(event);
  });
  host.addEventListener('change',event=>{
    if(event.target.id==='st-saved-product')applySavedProduct(event.target.value);
  });
})();
