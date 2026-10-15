/* Feito em Forma • Calculadora e orçamentos 3D. Funciona sem servidor. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const MONEY = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
  const PERCENT = new Intl.NumberFormat('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1});
  const embedded = window.parent!==window && new URLSearchParams(location.search).get('embedded')==='1';
  if(embedded)document.documentElement.classList.add('is-embedded');
  // Dados locais separados por usuário: trocar a conta do Planner não mistura rascunhos.
  const owner=new URLSearchParams(location.search).get('user')||'';
  const namespace=embedded&&/^[0-9a-f-]{36}$/i.test(owner)?`_user_${owner}`:'';
  const KEYS = Object.fromEntries(Object.entries({ settings:'fef_settings_v1', form:'fef_product_v1', draft:'fef_quote_draft_v1', history:'fef_history_v1' }).map(([k,v])=>[k,v+namespace]));
  const plannerRequests=new Map();
  const DEFAULTS = {
    p_filamento:'120.00', p_perdas:'0', p_energia:'0.95', p_consumo:'150',
    p_depreciacao:'1.50', p_maodeobra:'20.00', prod_nome:'Suporte Auto-irrigável Planta',
    prod_material:'PLA', prod_custo_filamento:'', prod_quantidade:'1', prod_peso:'120', prod_temp_imp:'6',
    prod_temp_prep:'3', prod_emb:'2.50', prod_extras:'2.00', prod_descricao:'',
    prod_canal:'marketplace', prod_margem_pct:'35', prod_taxa_pct:'19',
    prod_taxa_fixa:'4.00', prod_preco_manual:'', vendas_qtd:'40',
    cliente_nome:'', cliente_telefone:'', orc_desconto:'0', orc_frete:'0',
    orc_custo_frete:'0', orc_prazo:'', orc_pagamento:'', orc_observacoes:''
  };
  const SETTING_IDS = ['p_filamento','p_perdas','p_energia','p_consumo','p_depreciacao','p_maodeobra'];
  const PRODUCT_IDS = ['prod_nome','prod_material','prod_custo_filamento','prod_quantidade','prod_peso','prod_temp_imp','prod_temp_prep','prod_emb','prod_extras','prod_descricao','prod_canal','prod_margem_pct','prod_taxa_pct','prod_taxa_fixa','prod_preco_manual','vendas_qtd'];
  const QUOTE_IDS = ['cliente_nome','cliente_telefone','orc_validade','orc_desconto','orc_frete','orc_custo_frete','orc_prazo','orc_pagamento','orc_observacoes'];
  const STORAGE_LIMIT_ITEMS = 150;
  const QUOTE_STATUSES = ['Orçamento enviado','Orçamento aprovado','Peça em produção','Peça Embalado','Aguardando pagamento','Finalizado'];
  const quoteStatus = value => QUOTE_STATUSES.includes(value) ? value : QUOTE_STATUSES[0];
  let items = [];
  let history = [];
  let activeQuoteId = null;
  let draftQuoteId = null;
  let lastCalculation = null;
  let lastQuote = null;
  let toastTimeout;

  const money = value => MONEY.format(Number.isFinite(value) ? value : 0);
  const percent = value => `${PERCENT.format(Number.isFinite(value) ? value : 0)}%`;
  const roundCents = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const ceilCents = value => Math.ceil(value * 100 - 1e-8) / 100;
  const string = (v,max=300) => String(v ?? '').slice(0,max);
  const escapeHtml = value => string(value,1000).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parseField = (id, max=1e9) => {
    const el=$(id); if(!el) return null;
    const raw=el.value.trim();
    if(raw === '') return null;
    const value=Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
  };
  const nonnegative = (value,max=1e9) => Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=max;
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const ptDate = value => {
    if(!value) return 'A combinar';
    const parts=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!parts) return 'A combinar';
    return `${parts[3]}/${parts[2]}/${parts[1]}`;
  };
  const safeLoad = key => { try {return JSON.parse(localStorage.getItem(key) || 'null')} catch(e){return null} };
  const safeSave = (key,value) => {
    try {localStorage.setItem(key,JSON.stringify(value));return true}
    catch(e){toast('Não foi possível salvar neste navegador. Libere espaço ou use o backup.',true);return false}
  };
  const valuesOf = ids => Object.fromEntries(ids.map(id=>[id,$(id).value]));
  function setValues(data,ids) {
    if(!data || typeof data !== 'object') return;
    for(const id of ids) {
      if(Object.prototype.hasOwnProperty.call(data,id) && typeof data[id] !== 'object') $(id).value=String(data[id]);
    }
  }
  function toast(message,error=false) {
    const el=$('toast'); el.textContent=message; el.classList.toggle('error',error); el.classList.add('show');
    window.clearTimeout(toastTimeout); toastTimeout=window.setTimeout(()=>el.classList.remove('show'),3600);
  }
  function chooseTab(tab){
    document.querySelectorAll('.panel').forEach(el=>el.classList.toggle('active',el.id===`panel-${tab}`));
    document.querySelectorAll('.embedded-nav [data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
    document.querySelectorAll('.nav-link').forEach(el=>{
      const active=el.dataset.tab===tab;
      el.classList.toggle('active',active);
      if(active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    $('breadcrumbSection').textContent=({calculadora:'CALCULADORA',orcamento:'ORÇAMENTO',historico:'HISTÓRICO',configuracoes:'CUSTOS E AJUSTES'})[tab];
    if(tab==='historico') renderHistory();
    if(embedded)requestAnimationFrame(()=>setTimeout(reportHeight,40));
    window.scrollTo({top:0,behavior:'auto'});
  }
  function showNumber(id,value,kind='money') { $(id).textContent=kind==='percent'?percent(value):money(value); }

  function calculate() {
    const inp={};
    const numericIds=[...SETTING_IDS,'prod_quantidade','prod_peso','prod_temp_imp','prod_temp_prep','prod_emb','prod_extras','prod_margem_pct','prod_taxa_pct','prod_taxa_fixa','vendas_qtd'];
    for(const id of numericIds) {
      inp[id]=parseField(id, id==='prod_margem_pct'||id==='prod_taxa_pct'?99 : id==='prod_quantidade'?100000:1e9);
    }
    const channel=$('prod_canal').value;
    $('marketplaceFields').classList.toggle('hidden',channel!=='marketplace');
    $('channelChip').textContent=channel==='marketplace'?'MARKETPLACE':'VENDA DIRETA';
    const usedIds=channel==='marketplace'?numericIds:numericIds.filter(id=>!['prod_taxa_pct','prod_taxa_fixa'].includes(id));
    const invalidId=usedIds.find(id=>inp[id]===null);
    const quantity=inp.prod_quantidade;
    const qtyValid=quantity!==null && Number.isInteger(quantity) && quantity>=1;
    const projectionValid=inp.vendas_qtd!==null && Number.isInteger(inp.vendas_qtd);
    const margin=inp.prod_margem_pct===null?0:inp.prod_margem_pct/100;
    const marketplaceRate=channel==='marketplace'?(inp.prod_taxa_pct||0)/100:0;
    const feeFixed=channel==='marketplace'?(inp.prod_taxa_fixa||0):0;
    const divisor=1-margin-marketplaceRate;
    const filamentInput=$('prod_custo_filamento').value.trim();
    const filamentCustom=filamentInput===''?null:parseField('prod_custo_filamento');
    const manualInput=$('prod_preco_manual').value.trim();
    const manual=manualInput===''?null:parseField('prod_preco_manual');
    let error='';
    if(invalidId) error='Preencha os custos e medidas com valores válidos, sem números negativos.';
    else if(!qtyValid || !projectionValid) error='As quantidades devem ser números inteiros válidos.';
    else if(filamentInput!=='' && filamentCustom===null) error='Confira o custo do filamento específico informado.';
    else if(manualInput!=='' && manual===null) error='Confira o preço manual informado.';
    else if(divisor<=0) error='A soma da margem desejada e da comissão deve ser menor que 100%.';
    if(error){
      lastCalculation=null;
      ['priceUnit','suggestedUnit','priceTotal','costUnit','profitUnit','c_material','c_energia','c_depreciacao','c_maodeobra','c_embalagem','c_total_direto','c_taxa_mkt_total','c_lucro_unit','kpi_faturamento','kpi_custo','kpi_lucro'].forEach(id=>showNumber(id,0));
      $('summaryQty').textContent=quantity&&qtyValid?String(quantity):'–';
      $('marginReal').textContent='–'; $('calcFeedback').className='calc-feedback error'; $('calcFeedback').textContent=error;
      $('addItemBtn').disabled=true; return;
    }
    const costKg=filamentCustom===null?inp.p_filamento:filamentCustom;
    const material=(inp.prod_peso / 1000)*costKg*(1+inp.p_perdas/100);
    const energy=inp.prod_temp_imp*(inp.p_consumo/1000)*inp.p_energia;
    const maintenance=inp.prod_temp_imp*inp.p_depreciacao;
    const labor=inp.prod_temp_prep*inp.p_maodeobra;
    const extras=inp.prod_emb+inp.prod_extras;
    const production=material+energy+maintenance+labor+extras;
    const suggested=ceilCents((production+feeFixed)/divisor);
    const unitPrice=manual===null?suggested:roundCents(manual);
    const unitFees=unitPrice*marketplaceRate+feeFixed;
    const unitProfit=unitPrice-production-unitFees;
    const unitMargin=unitPrice>0?unitProfit/unitPrice*100:0;
    const revenue=unitPrice*inp.vendas_qtd;
    const totalCost=(production+unitFees)*inp.vendas_qtd;
    lastCalculation={name:$('prod_nome').value.trim(),description:$('prod_descricao').value.trim(),materialType:$('prod_material').value,quantity,unitPrice,suggested,production,commissionRate:marketplaceRate,feeFixed,channel,marginTarget:inp.prod_margem_pct,unitFees,unitProfit,unitMargin,
      productFields:valuesOf(PRODUCT_IDS),settings:valuesOf(SETTING_IDS),
      costDetails:{material,energy,maintenance,labor,packaging:inp.prod_emb,accessories:inp.prod_extras,extras,filamentCostKg:costKg,materialLossPct:inp.p_perdas}};
    showNumber('priceUnit',unitPrice); showNumber('suggestedUnit',suggested); showNumber('priceTotal',unitPrice*quantity);
    showNumber('costUnit',production); showNumber('profitUnit',unitProfit); $('marginReal').textContent=percent(unitMargin); $('summaryQty').textContent=String(quantity);
    showNumber('c_material',material); showNumber('c_energia',energy); showNumber('c_depreciacao',maintenance); showNumber('c_maodeobra',labor); showNumber('c_embalagem',extras);showNumber('c_total_direto',production);showNumber('c_taxa_mkt_total',unitFees);showNumber('c_lucro_unit',unitProfit);
    showNumber('kpi_faturamento',revenue); showNumber('kpi_custo',totalCost); showNumber('kpi_lucro',revenue-totalCost);
    const feedback=$('calcFeedback');feedback.className='calc-feedback';
    if(unitPrice<=0) {feedback.classList.add('error');feedback.textContent='O preço é zero. Informe custos ou um preço manual antes de criar um orçamento.'}
    else if(unitProfit<0) {feedback.classList.add('error');feedback.textContent='Atenção: este preço gera prejuízo por unidade.'}
    else if(unitMargin+0.005<inp.prod_margem_pct) {feedback.classList.add('warning');feedback.textContent='A margem real ficou abaixo da meta definida. Revise o preço manual.'}
    else feedback.textContent='✓ Preço calculado com custos e taxas considerados.';
    $('addItemBtn').disabled=unitPrice<=0 || !lastCalculation.name;
  }
  function addItem(){
    calculate();
    if(!lastCalculation || lastCalculation.unitPrice<=0){toast('Revise os dados da peça para adicionar ao orçamento.',true);return}
    if(!lastCalculation.name){toast('Informe o nome do produto.',true);return}
    if(items.length>=60){toast('Limite de 60 linhas por orçamento.',true);return}
    items.push({...lastCalculation,id:`it-${Date.now()}-${Math.random().toString(36).slice(2,8)}`});
    saveDraft();renderQuote();chooseTab('orcamento');toast('Produto adicionado à proposta.');
  }
  function normalizeItem(item){
    if(!item || typeof item!=='object')return null;
    const qty=Number(item.quantity),price=Number(item.unitPrice),cost=Number(item.production),rate=Number(item.commissionRate),fixed=Number(item.feeFixed);
    if(!Number.isInteger(qty)||qty<1||qty>100000 || !nonnegative(price,1e8)||!nonnegative(cost,1e8)||!nonnegative(rate,0.99)||!nonnegative(fixed,1e8))return null;
    const cleanFields=(source,ids)=>{const clean={};if(source&&typeof source==='object'&&!Array.isArray(source)){for(const id of ids)if(Object.hasOwn(source,id))clean[id]=string(source[id],650)}return clean};
    const breakdown={};if(item.costDetails&&typeof item.costDetails==='object'&&!Array.isArray(item.costDetails)){
      for(const id of ['material','energy','maintenance','labor','packaging','accessories','extras','filamentCostKg','materialLossPct']){const v=item.costDetails[id];if(v!==null&&v!==undefined&&nonnegative(v,1e9))breakdown[id]=Number(v)}
    }
    return {id:string(item.id,70)||`item-${Math.random()}`,name:string(item.name,120),description:string(item.description,180),materialType:string(item.materialType,30),quantity:qty,unitPrice:roundCents(price),suggested:item.suggested!==null&&item.suggested!==undefined&&nonnegative(item.suggested,1e8)?Number(item.suggested):null,production:cost,commissionRate:rate,feeFixed:fixed,channel:item.channel==='marketplace'?'marketplace':'direta',marginTarget:nonnegative(item.marginTarget,99)?Number(item.marginTarget):0,
      productFields:cleanFields(item.productFields,PRODUCT_IDS),settings:cleanFields(item.settings,SETTING_IDS),costDetails:breakdown};
  }
  function quoteData(){
    const discount=parseField('orc_desconto',100),shippingCharge=parseField('orc_frete'),shippingCost=parseField('orc_custo_frete');
    let error='';
    if(discount===null||shippingCharge===null||shippingCost===null)error='Confira desconto e frete: não podem ser negativos ou inválidos.';
    const subtotal=roundCents(items.reduce((s,i)=>s+i.unitPrice*i.quantity,0));
    const discountValue=discount===null?0:roundCents(subtotal*discount/100);
    const discountedSubtotal=roundCents(subtotal-discountValue);
    const revenue=roundCents(discountedSubtotal+(shippingCharge||0));
    const productionCost=items.reduce((s,i)=>s+i.production*i.quantity,0);
    const fees=items.reduce((s,i)=>s+(i.unitPrice*(1-(discount||0)/100)*i.commissionRate+i.feeFixed)*i.quantity,0);
    const cost=productionCost+fees+(shippingCost||0);
    const profit=revenue-cost;
    const margin=revenue>0?profit/revenue*100:0;
    return {subtotal,discount:discount||0,discountValue,shippingCharge:shippingCharge||0,shippingCost:shippingCost||0,revenue,cost,profit,margin,error};
  }
  function renderQuote(){
    const content=$('quoteItems');content.replaceChildren();
    $('itemCount').textContent=String(items.length);$('navCount').textContent=String(items.length);$('topCount').textContent=`(${items.length})`;
    if(items.length===0){content.innerHTML='<div class="empty-state"><div class="empty-illustration">⬡</div><strong>Seu orçamento está vazio</strong><p>Calcule uma peça e clique em “Adicionar ao orçamento”. Você pode incluir vários produtos.</p></div>'}
    else for(const item of items){
      const node=document.createElement('div');node.className='quote-line';
      const info=document.createElement('div');const strong=document.createElement('strong');strong.textContent=item.name;
      const sub=document.createElement('small');sub.textContent=[item.materialType,item.description,`Unidade: ${money(item.unitPrice)}`].filter(Boolean).join(' • ');info.append(strong,sub);
      const cost=document.createElement('div');cost.className='line-price';cost.textContent=money(item.unitPrice*item.quantity);
      const actions=document.createElement('div');actions.className='line-actions';
      const label=document.createElement('label');label.textContent='Quantidade: ';
      const input=document.createElement('input');input.type='number';input.min='1';input.max='100000';input.step='1';input.value=String(item.quantity);input.setAttribute('aria-label',`Quantidade de ${item.name}`);
      input.addEventListener('change',()=>{const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>100000){input.value=String(item.quantity);toast('Use uma quantidade inteira entre 1 e 100.000.',true);return}item.quantity=n;saveDraft();renderQuote()});
      label.append(input);
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remover item';remove.addEventListener('click',()=>{items=items.filter(x=>x.id!==item.id);saveDraft();renderQuote()});
      actions.append(label,remove);node.append(info,cost,actions);content.append(node);
    }
    lastQuote=quoteData();
    showNumber('quoteRevenue',lastQuote.revenue);showNumber('quoteCosts',lastQuote.cost);showNumber('quoteProfit',lastQuote.profit);$('quoteMargin').textContent=percent(lastQuote.margin);
    $('quoteProfit').style.color=lastQuote.profit<0?'#be354a':'#00875b';
    const warning=$('quoteWarning');
    if(lastQuote.error)warning.textContent=lastQuote.error;
    else if(items.length===0)warning.textContent='Os indicadores serão calculados quando houver produtos no orçamento.';
    else if(lastQuote.profit<0)warning.textContent='⚠ Atenção: o desconto e/ou o frete fazem esta proposta dar prejuízo.';
    else if(lastQuote.margin<Math.min(...items.map(i=>i.marginTarget)))warning.textContent='Observe que descontos e frete podem reduzir a margem do orçamento.';
    else warning.textContent='✓ Margem positiva considerando custos, descontos, comissões e frete informado.';
    ['sendWhatsapp','copyQuote','saveQuote','printQuote'].forEach(id=>$(id).disabled=items.length===0||!!lastQuote.error||lastQuote.revenue<=0);
    renderProposal();
  }
  function quoteNumber(){
    if(activeQuoteId)return activeQuoteId;
    if(draftQuoteId)return draftQuoteId;
    const d=new Date();
    draftQuoteId=`FF-${localDate(d).replaceAll('-','')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
    return draftQuoteId;
  }
  function renderProposal(){
    const d=lastQuote||quoteData();
    const name=$('cliente_nome').value.trim()||'Cliente';const valid=ptDate($('orc_validade').value);
    const rows=items.map(i=>`<tr><td><strong>${escapeHtml(i.name)}</strong><div class="line-desc">${escapeHtml([i.materialType,i.description].filter(Boolean).join(' • '))}</div></td><td>${i.quantity}</td><td>${money(i.unitPrice)}</td><td>${money(i.unitPrice*i.quantity)}</td></tr>`).join('');
    const terms=[['Prazo estimado',$('orc_prazo').value.trim()],['Pagamento',$('orc_pagamento').value.trim()],['Observações',$('orc_observacoes').value.trim()]].filter(([,v])=>v).map(([label,value])=>`<div><strong>${label}:</strong> ${escapeHtml(value)}</div>`).join('');
    $('proposalPreview').innerHTML=`<div class="proposal-header"><div class="proposal-brand"><img src="assets/img/logo-feito-em-forma.png" alt="Feito em Forma — logo original"><small>IMPRESSÃO 3D • PEÇAS PERSONALIZADAS</small></div><div class="proposal-number">PROPOSTA<br><strong>${escapeHtml(quoteNumber())}</strong></div></div><h3>Proposta comercial</h3><div class="proposal-sub"><div><b>PREPARADO PARA</b>${escapeHtml(name)}</div><div><b>VÁLIDO ATÉ</b>${escapeHtml(valid)}</div></div><table class="proposal-table"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Adicione produtos para visualizar sua proposta.</td></tr>'}</tbody></table><div class="proposal-totals"><div><span>Subtotal</span><strong>${money(d.subtotal)}</strong></div>${d.discount>0?`<div><span>Desconto (${percent(d.discount)})</span><strong>− ${money(d.discountValue)}</strong></div>`:''}${d.shippingCharge>0?`<div><span>Frete</span><strong>${money(d.shippingCharge)}</strong></div>`:''}<div class="grand"><span>VALOR TOTAL</span><strong>${money(d.revenue)}</strong></div></div><div class="proposal-terms">${terms}</div><div class="proposal-footer">Feito em Forma, feito para lembrar. 🤎</div>`;
    const preview=$('whatsappPreviewText');
    if(preview) preview.textContent=items.length>0?quoteMessage():'Adicione um produto para visualizar a mensagem de orçamento que será enviada ao cliente.';
  }
  function quoteMessage(){
    const d=lastQuote||quoteData();const name=$('cliente_nome').value.trim();
    const lines=['*FEITO EM FORMA | ORÇAMENTO 3D*','','Olá'+(name?`, ${name}`:'')+'! 😊','Segue nossa proposta comercial:','',`*Proposta:* ${quoteNumber()}`,`*Validade:* ${ptDate($('orc_validade').value)}`,'','*PRODUTOS*'];
    items.forEach((i,n)=>{lines.push(`${n+1}. *${i.name}*`);const desc=[i.materialType,i.description].filter(Boolean).join(' • ');if(desc)lines.push(`   ${desc}`);lines.push(`   ${i.quantity} un. × ${money(i.unitPrice)} = *${money(i.unitPrice*i.quantity)}*`)});
    lines.push('',`Subtotal: ${money(d.subtotal)}`);
    if(d.discount>0)lines.push(`Desconto (${percent(d.discount)}): − ${money(d.discountValue)}`);
    if(d.shippingCharge>0)lines.push(`Frete: ${money(d.shippingCharge)}`);
    lines.push(`*TOTAL: ${money(d.revenue)}*`);
    if($('orc_prazo').value.trim())lines.push('',`*Prazo:* ${$('orc_prazo').value.trim()}`);
    if($('orc_pagamento').value.trim())lines.push(`*Pagamento:* ${$('orc_pagamento').value.trim()}`);
    if($('orc_observacoes').value.trim())lines.push(`*Observações:* ${$('orc_observacoes').value.trim()}`);
    lines.push('','Qualquer dúvida, estamos à disposição!','*Feito em Forma* 🤎','Feito para lembrar.');
    return lines.join('\n');
  }
  function validQuote(){if(items.length===0||lastQuote.error||lastQuote.revenue<=0){toast('Adicione produtos e confira os valores para continuar.',true);return false}return true}
  function plannerSnapshot(){
    const d=quoteData();
    return {id:quoteNumber(),items:items.map(i=>({...i})),fields:valuesOf(QUOTE_IDS),totals:{revenue:roundCents(d.revenue),cost:roundCents(d.cost)}};
  }
  function plannerRequest(mode='draft'){
    if(!validQuote())return Promise.reject(new Error('Revise os itens e os valores antes de salvar.'));
    if(!$('cliente_nome').value.trim()){
      chooseTab('orcamento');toast('Informe o nome do cliente antes de salvar no Planner.',true);
      return Promise.reject(new Error('Informe o nome do cliente antes de salvar.'));
    }
    if(!embedded)return Promise.reject(new Error('Abra a calculadora pelo menu Envio de orçamento do Planner online.'));
    const requestId=`req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const el=$('plannerSaveStatus');el.className='planner-save-status';el.textContent='Salvando na nuvem...';
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{plannerRequests.delete(requestId);reject(new Error('O Planner não respondeu. Confira sua conexão com o Supabase.'));},30000);
      plannerRequests.set(requestId,{resolve,reject,timeout});
      window.parent.postMessage({type:'FEF_CALCULATOR_SAVE',requestId,mode,snapshot:plannerSnapshot()},location.origin);
    }).then(result=>{
      el.className='planner-save-status success';el.textContent=result.message;return result;
    },error=>{
      el.className='planner-save-status failure';el.textContent=error.message;throw error;
    });
  }
  window.addEventListener('message',event=>{
    if(!embedded||event.origin!==location.origin||event.source!==window.parent||!event.data||typeof event.data!=='object')return;
    const m=event.data;
    if(m.type==='FEF_PLANNER_RESULT'){
      const pending=plannerRequests.get(m.requestId);if(!pending)return;
      clearTimeout(pending.timeout);plannerRequests.delete(m.requestId);
      if(m.ok)pending.resolve(m);else pending.reject(new Error(m.message||'Erro ao salvar no Planner.'));
    }
    if(m.type==='FEF_LOAD_PROPOSAL'&&m.snapshot){
      try{loadQuote(m.snapshot);toast('Proposta carregada do Planner para edição.');}
      catch(err){toast('Não foi possível carregar esta proposta.',true)}
    }
  });
  function reportHeight(){
    if(embedded){window.parent.postMessage({type:'FEF_CALCULATOR_RESIZE',height:document.body.scrollHeight},location.origin)}
  }
  if(embedded){
    window.addEventListener('load',()=>{
      reportHeight();
      if('ResizeObserver' in window){new ResizeObserver(()=>reportHeight()).observe(document.body)}
    });
  }
  async function savePlanner(mode='draft'){
    try{const response=await plannerRequest(mode);saveDraft();toast(response.message);}
    catch(error){toast(error.message,true);}
  }
  async function sendWhatsApp(){
    if(!validQuote())return;
    const phoneRaw=$('cliente_telefone').value.trim();let digits=phoneRaw.replace(/\D/g,'');
    if(digits){
      if(digits.length===10||digits.length===11)digits=`55${digits}`;
      if(!/^\d{12,13}$/.test(digits)||!digits.startsWith('55')){toast('Número inválido. Informe DDD + telefone brasileiro ou deixe em branco para escolher o contato.',true);return}
    }
    const text=encodeURIComponent(quoteMessage());
    const url=digits?`https://api.whatsapp.com/send?phone=${digits}&text=${text}`:`https://api.whatsapp.com/send?text=${text}`;
    // Cria a aba durante o clique para não acionar o bloqueio de pop-ups.
    const newTab=window.open('about:blank','_blank');
    if(!newTab){toast('O navegador bloqueou a nova aba. Permita pop-ups ou copie a mensagem.',true);return;}
    if(embedded){
      newTab.document.title='Preparando orçamento...';
      newTab.document.body.textContent='Salvando seu orçamento no Planner antes de abrir o WhatsApp...';
      try{await plannerRequest('draft');saveDraft();newTab.location.replace(url);}
      catch(error){newTab.close();toast(`WhatsApp não aberto: ${error.message}`,true);}
    }else{newTab.location.replace(url)}
  }
  async function copyText(){
    if(!validQuote())return;
    const message=quoteMessage();
    try{await navigator.clipboard.writeText(message);toast('Mensagem comercial copiada! Cole no WhatsApp Business.')}
    catch(e){
      const field=document.createElement('textarea');field.value=message;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();
      const ok=document.execCommand('copy');field.remove();toast(ok?'Mensagem copiada!':'Não foi possível copiar automaticamente. Selecione a mensagem na prévia.',!ok);
    }
  }
  function saveDraft(){safeSave(KEYS.draft,{items,fields:valuesOf(QUOTE_IDS),activeQuoteId,draftQuoteId:quoteNumber()})}
  function saveQuote(){
    if(!validQuote())return;
    const id=quoteNumber();const updatedAt=new Date().toISOString();
    const existing=history.findIndex(i=>i.id===id);
    const previous=existing!==-1?history[existing]:null;
    const obj={id,savedAt:previous?.savedAt||updatedAt,updatedAt,status:quoteStatus(previous?.status),items:items.map(i=>({...i})),fields:valuesOf(QUOTE_IDS)};
    if(existing!==-1)history[existing]=obj;else history.unshift(obj);
    history=history.slice(0,STORAGE_LIMIT_ITEMS);
    if(!safeSave(KEYS.history,history))return;
    activeQuoteId=id;draftQuoteId=id;saveDraft();renderQuote();toast(existing!==-1?'Proposta atualizada no histórico.':'Orçamento salvo no histórico!');
  }
  function loadQuote(q){
    if(!q||!Array.isArray(q.items))return;
    items=q.items.map(normalizeItem).filter(Boolean).slice(0,60);
    setValues(q.fields,QUOTE_IDS);activeQuoteId=q.id;draftQuoteId=q.id;
    saveDraft();renderQuote();chooseTab('orcamento');toast('Orçamento carregado para edição ou envio.');
  }
  function renderHistory(){
    const area=$('historyList');area.replaceChildren();const needle=$('historySearch').value.trim().toLocaleLowerCase('pt-BR');
    const selected=history.filter(q=>[q.id,q.fields?.cliente_nome,quoteStatus(q.status),...(q.items||[]).map(i=>i.name)].join(' ').toLocaleLowerCase('pt-BR').includes(needle));
    if(!selected.length){area.innerHTML='<div class="empty-state"><div class="empty-illustration">◷</div><strong>Nenhum orçamento encontrado</strong><p>Salve um orçamento ou tente outro termo na pesquisa.</p></div>';return}
    for(const quote of selected){
      const el=document.createElement('div');el.className='history-card';
      const meta=document.createElement('div');meta.className='history-meta';
      const title=document.createElement('h3');title.textContent=quote.fields?.cliente_nome || 'Cliente não informado';
      const desc=document.createElement('p');desc.textContent=`${quote.id} • ${new Date(quote.savedAt).toLocaleDateString('pt-BR')} • ${quote.items.length} item(ns)`;meta.append(title,desc);
      const amount=document.createElement('div');amount.className='history-amount';const label=document.createElement('strong');
      const subtotal=quote.items.reduce((sum,i)=>sum+i.unitPrice*i.quantity,0);
      const discount=Number(quote.fields?.orc_desconto)||0;const shipping=Number(quote.fields?.orc_frete)||0;
      label.textContent=money(roundCents(subtotal*(1-discount/100))+shipping);
      const caption=document.createElement('span');caption.textContent='Valor da proposta';amount.append(label,caption);
      const statusLabel=document.createElement('label');statusLabel.className='history-status';
      const statusTitle=document.createElement('span');statusTitle.textContent='Status do orçamento';
      const statusSelect=document.createElement('select');statusSelect.setAttribute('aria-label',`Status da proposta ${quote.id}`);
      for(const status of QUOTE_STATUSES){const option=document.createElement('option');option.value=status;option.textContent=status;statusSelect.append(option)}
      statusSelect.value=quoteStatus(quote.status);statusSelect.dataset.state=String(QUOTE_STATUSES.indexOf(statusSelect.value));
      statusSelect.addEventListener('change',()=>{const old=quote.status;quote.status=statusSelect.value;
        if(!safeSave(KEYS.history,history)){quote.status=old;statusSelect.value=quoteStatus(old);return}
        statusSelect.dataset.state=String(QUOTE_STATUSES.indexOf(statusSelect.value));toast('Status do orçamento atualizado.');
      });statusLabel.append(statusTitle,statusSelect);
      const actions=document.createElement('div');actions.className='history-actions';
      const open=document.createElement('button');open.className='btn btn-dark';open.textContent='Abrir';open.addEventListener('click',()=>loadQuote(quote));
      const del=document.createElement('button');del.className='btn btn-outline danger';del.textContent='Excluir';del.addEventListener('click',()=>{
        if(!window.confirm(`Excluir a proposta ${quote.id}? Essa ação não pode ser desfeita.`))return;
        history=history.filter(x=>x.id!==quote.id);safeSave(KEYS.history,history);
        if(activeQuoteId===quote.id)activeQuoteId=null;
        renderHistory();toast('Orçamento excluído.');
      });actions.append(open,del);el.append(meta,amount,statusLabel,actions);area.append(el);
    }
  }
  function newValidityDate(){const d=new Date();d.setDate(d.getDate()+7);return localDate(d)}
  function newQuote(){
    if((items.length>0 || $('cliente_nome').value.trim()) && !window.confirm('Começar novo orçamento? O rascunho atual será limpo. Os orçamentos salvos no histórico serão preservados.'))return;
    items=[];activeQuoteId=null;draftQuoteId=null;
    setValues(DEFAULTS,QUOTE_IDS.filter(id=>id!=='orc_validade'));
    $('orc_validade').value=newValidityDate();
    saveDraft();renderQuote();chooseTab('calculadora');toast('Novo orçamento iniciado.');
  }
  /* Exportação XLSX local, sem bibliotecas externas. O arquivo também contém
     os dados necessários para restaurar o histórico pelo botão de importação. */
  function historySummary(q){
    const f=q.fields||{};const discount=Number(f.orc_desconto)||0;
    const subtotal=roundCents((q.items||[]).reduce((s,i)=>s+i.unitPrice*i.quantity,0));
    const discountValue=roundCents(subtotal*discount/100);
    const shippingCharge=Number(f.orc_frete)||0,shippingCost=Number(f.orc_custo_frete)||0;
    const revenue=roundCents(subtotal-discountValue+shippingCharge);
    const materials=(q.items||[]).reduce((s,i)=>s+i.production*i.quantity,0);
    const fees=(q.items||[]).reduce((s,i)=>s+(i.unitPrice*(1-discount/100)*i.commissionRate+i.feeFixed)*i.quantity,0);
    const cost=materials+fees+shippingCost,profit=revenue-cost;
    return {discount,subtotal,discountValue,shippingCharge,shippingCost,revenue,materials,fees,cost,profit,margin:revenue?100*profit/revenue:0};
  }
  function buildExcelData(){
    const quoteHeaders=['Número do orçamento','Status','Data de criação','Data de atualização','Cliente','WhatsApp','Validade',
      'Prazo estimado','Forma de pagamento','Observações','Itens diferentes','Quantidade de peças',
      'Subtotal (R$)','Desconto (%)','Desconto (R$)','Frete cobrado (R$)','Custo real do frete (R$)',
      'Custos de fabricação (R$)','Comissões e taxas (R$)','Custo total (R$)','Receita total (R$)','Lucro estimado (R$)','Margem líquida (%)'];
    const itemHeaders=['Número do orçamento','Status','Data de criação','Cliente','Produto','Descrição da peça','Material',
      'Quantidade','Canal de venda','Preço unitário (R$)','Preço sugerido (R$)','Venda bruta item (R$)',
      'Venda pós desconto item (R$)','Custo produção unitário (R$)','Custo produção total (R$)',
      'Comissão (%)','Taxa fixa unitária (R$)','Taxas totais item (R$)','Lucro item após desconto (R$)',
      'Margem alvo (%)','Peso (g)','Tempo de impressão (h)','Tempo de preparação (h)',
      'Filamento (R$/kg)','Reserva de perdas (%)','Energia (R$/kWh)','Consumo (W)',
      'Depreciação (R$/h)','Mão de obra (R$/h)','Embalagem unitária (R$)','Extras unitários (R$)',
      'Gasto com filamento unitário (R$)','Gasto com energia unitário (R$)',
      'Gasto manutenção unitário (R$)','Gasto mão de obra unitário (R$)',
      'Gasto embalagem unitário (R$)','Gasto acessórios unitário (R$)',
      'Gasto filamento total (R$)','Gasto energia total (R$)',
      'Gasto manutenção total (R$)','Gasto mão de obra total (R$)',
      'Gasto embalagem total (R$)','Gasto acessórios total (R$)',
      'Custo filamento personalizado (R$/kg)','Preço manual informado (R$)',
      'Quantidade projeção','Preço filamento padrão (R$/kg)','Quantidade original informada','Dados detalhados disponíveis'];
    const qr=[quoteHeaders],ir=[itemHeaders];
    const knownNumber=(object,key)=>object&&Object.prototype.hasOwnProperty.call(object,key)&&object[key]!==''&&object[key]!==null&&object[key]!==undefined&&Number.isFinite(Number(object[key]))?Number(object[key]):'';
    const knownCost=(obj,key)=>obj&&Object.prototype.hasOwnProperty.call(obj,key)&&obj[key]!==null&&obj[key]!==undefined&&obj[key]!==''&&Number.isFinite(Number(obj[key]))?Number(obj[key]):'';
    const times=n=>n===''?'':n;
    for(const q of history){
      const f=q.fields||{},v=historySummary(q),qitems=q.items||[];
      qr.push([q.id,quoteStatus(q.status),formatExportDate(q.savedAt),formatExportDate(q.updatedAt||q.savedAt),
        f.cliente_nome||'',f.cliente_telefone||'',f.orc_validade||'',f.orc_prazo||'',f.orc_pagamento||'',f.orc_observacoes||'',
        qitems.length,qitems.reduce((s,i)=>s+i.quantity,0),v.subtotal,v.discount,v.discountValue,v.shippingCharge,v.shippingCost,
        v.materials,v.fees,v.cost,v.revenue,v.profit,v.margin]);
      for(const i of qitems){
        const pf=i.productFields||{},settings=i.settings||{},c=i.costDetails||{},disc=v.discount/100;
        const itemRevenue=i.unitPrice*(1-disc)*i.quantity;
        const itemFees=(i.unitPrice*(1-disc)*i.commissionRate+i.feeFixed)*i.quantity;
        const itemProfit=itemRevenue-(i.production*i.quantity)-itemFees;
        const sumCost=key=>{const val=knownCost(c,key);return val===''?'':roundCents(val*i.quantity)};
        ir.push([q.id,quoteStatus(q.status),formatExportDate(q.savedAt),f.cliente_nome||'',i.name,i.description,i.materialType,
          i.quantity,i.channel==='marketplace'?'Marketplace':'Venda direta',i.unitPrice,knownCost(i,'suggested'),
          roundCents(i.unitPrice*i.quantity),roundCents(itemRevenue),i.production,roundCents(i.production*i.quantity),
          roundCents(i.commissionRate*100),i.feeFixed,roundCents(itemFees),roundCents(itemProfit),i.marginTarget,
          knownNumber(pf,'prod_peso'),knownNumber(pf,'prod_temp_imp'),knownNumber(pf,'prod_temp_prep'),
          knownCost(c,'filamentCostKg'),knownCost(c,'materialLossPct'),knownNumber(settings,'p_energia'),knownNumber(settings,'p_consumo'),
          knownNumber(settings,'p_depreciacao'),knownNumber(settings,'p_maodeobra'),knownCost(c,'packaging'),knownCost(c,'accessories'),
          knownCost(c,'material'),knownCost(c,'energy'),knownCost(c,'maintenance'),knownCost(c,'labor'),knownCost(c,'packaging'),knownCost(c,'accessories'),
          sumCost('material'),sumCost('energy'),sumCost('maintenance'),sumCost('labor'),sumCost('packaging'),sumCost('accessories'),
          knownNumber(pf,'prod_custo_filamento'),knownNumber(pf,'prod_preco_manual'),knownNumber(pf,'vendas_qtd'),knownNumber(settings,'p_filamento'),knownNumber(pf,'prod_quantidade'),
          Object.keys(c).length&&Object.keys(pf).length?'Sim':'Não — orçamento antigo sem detalhamento original']);
      }
    }
    // Cada orçamento é repartido em blocos menores que o limite de 32.767 caracteres por célula.
    const backup=[['Número do orçamento','Parte','Dados para restauração']];
    for(const q of history){const raw=JSON.stringify(q);for(let pos=0,n=1;pos<raw.length;pos+=12000,n++)backup.push([q.id,n,raw.slice(pos,pos+12000)])}
    return [{name:'Orçamentos',rows:qr},{name:'Itens e custos',rows:ir},{name:'_Restauracao',rows:backup,hidden:true}];
  }
  function formatExportDate(date){const t=new Date(date);return Number.isFinite(t.getTime())?t.toLocaleString('pt-BR',{hour12:false}):''}
  const excelEscape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
  function excelColumn(index){let col='';for(let n=index;n;n=Math.floor((n-1)/26))col=String.fromCharCode(65+(n-1)%26)+col;return col}
  function excelSheetXml(table){
    const moneyWords=/\(R\$\)|\(R\$\/kg\)|\(R\$\/kWh\)|\(R\$\/h\)/;
    const pctWords=/\(%\)/;
    const cellRows=table.rows.map((values,ri)=>{
      const cells=values.map((value,ci)=>{
        if(value===null||value===undefined||value==='')return '';
        const ref=excelColumn(ci+1)+(ri+1);
        if(typeof value==='number'&&Number.isFinite(value)){
          const style=moneyWords.test(table.rows[0][ci])?2:pctWords.test(table.rows[0][ci])?3:0;
          return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
        }
        const style=ri===0?' s="1"':'';
        return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${excelEscape(value)}</t></is></c>`;
      }).join('');
      return `<row r="${ri+1}"${ri===0?' ht="30" customHeight="1"':''}>${cells}</row>`;
    }).join('');
    const cols=table.rows[0].map((h,i)=>{
      const wide=table.hidden?i===2?65:21:/Observações|Descrição|Pagamento|Prazo/.test(h)?38:/Número do orçamento/.test(h)?25:/Data de/.test(h)?23:/Cliente|Status|Produto/.test(h)?25:19;
      return `<col min="${i+1}" max="${i+1}" width="${wide}" customWidth="1"/>`;
    }).join('');
    const last=excelColumn(table.rows[0].length);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${Math.max(table.rows.length,1)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${cols}</cols><sheetData>${cellRows}</sheetData><autoFilter ref="A1:${last}${Math.max(table.rows.length,1)}"/></worksheet>`;
  }
  const EXCEL_STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  function excelFiles(tables){
    const entries={
      '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
      '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${tables.map((t,i)=>`<sheet name="${excelEscape(t.name)}" sheetId="${i+1}" r:id="rId${i+1}"${t.hidden?' state="hidden"':''}/>`).join('')}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${tables.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml':EXCEL_STYLES
    };
    tables.forEach((t,i)=>{entries[`xl/worksheets/sheet${i+1}.xml`]=excelSheetXml(t)});
    return entries;
  }
  const ZIP_CRC_TABLE=(()=>{const arr=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xEDB88320^(c>>>1):c>>>1;arr[i]=c>>>0}return arr})();
  function zipCRC(bytes){let crc=0xffffffff;for(const b of bytes)crc=ZIP_CRC_TABLE[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
  function zipArchive(files){
    const encoder=new TextEncoder(),locals=[],centrals=[];let offset=0;
    function u16(view,at,n){view.setUint16(at,n,true)}function u32(view,at,n){view.setUint32(at,n>>>0,true)}
    for(const [path,content] of Object.entries(files)){
      const name=encoder.encode(path),data=encoder.encode(content),crc=zipCRC(data);
      const local=new Uint8Array(30+name.length+data.length),v=new DataView(local.buffer);
      u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0800);u16(v,8,0);u32(v,14,crc);u32(v,18,data.length);u32(v,22,data.length);u16(v,26,name.length);
      local.set(name,30);local.set(data,30+name.length);locals.push(local);
      const cd=new Uint8Array(46+name.length),cv=new DataView(cd.buffer);
      u32(cv,0,0x02014b50);u16(cv,4,20);u16(cv,6,20);u16(cv,8,0x0800);u16(cv,10,0);u32(cv,16,crc);u32(cv,20,data.length);u32(cv,24,data.length);u16(cv,28,name.length);u32(cv,42,offset);cd.set(name,46);centrals.push(cd);
      offset+=local.length;
    }
    const directoryLength=centrals.reduce((s,a)=>s+a.length,0);const end=new Uint8Array(22),ev=new DataView(end.buffer);
    u32(ev,0,0x06054b50);u16(ev,8,centrals.length);u16(ev,10,centrals.length);u32(ev,12,directoryLength);u32(ev,16,offset);
    return new Blob([...locals,...centrals,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function exportBackup(){
    try{
      const blob=zipArchive(excelFiles(buildExcelData()));
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`feito-em-forma-backup-${localDate(new Date())}.xlsx`;
      document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),3000);
      toast(`Planilha Excel exportada com ${history.length} orçamento(s) e todos os dados disponíveis.`);
    }catch(e){console.error(e);toast('Não foi possível exportar o Excel. Tente novamente.',true)}
  }
  async function readBackupXlsx(file){
    const data=new Uint8Array(await file.arrayBuffer()),view=new DataView(data.buffer);const decoder=new TextDecoder();
    let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-66000);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break}}
    if(end<0)throw Error('ZIP inválido');
    const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true);let at=start,xml='';
    for(let i=0;i<count;i++){
      if(view.getUint32(at,true)!==0x02014b50)throw Error('ZIP inválido');
      const method=view.getUint16(at+10,true),size=view.getUint32(at+20,true),len=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true);
      const name=decoder.decode(data.slice(at+46,at+46+len)),localOffset=view.getUint32(at+42,true);
      if(name==='xl/worksheets/sheet3.xml'){
        const contentAt=localOffset+30+view.getUint16(localOffset+26,true)+view.getUint16(localOffset+28,true),content=data.slice(contentAt,contentAt+size);
        if(method===0)xml=decoder.decode(content);
        else if(method===8&&typeof DecompressionStream==='function')xml=decoder.decode(new Uint8Array(await new Response(new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()));
        else throw Error('Compactação do XLSX não suportada neste navegador');
        break;
      }
      at+=46+len+extra+comment;
    }
    if(!xml)throw Error('Planilha sem dados de restauração');
    const documentXml=new DOMParser().parseFromString(xml,'application/xml');
    if(documentXml.querySelector('parsererror'))throw Error('Planilha inválida');
    const parts=new Map();
    for(const row of documentXml.getElementsByTagName('row')){
      if(row.getAttribute('r')==='1')continue;
      const fields={};for(const cell of row.getElementsByTagName('c')){
        const col=(cell.getAttribute('r')||'').match(/^[A-Z]+/)?.[0]||'';
        fields[col]=cell.getElementsByTagName('t')[0]?.textContent||cell.getElementsByTagName('v')[0]?.textContent||'';
      }
      if(fields.A&&!Number.isNaN(Number(fields.B))&&fields.C){if(!parts.has(fields.A))parts.set(fields.A,[]);parts.get(fields.A).push({part:Number(fields.B),value:fields.C})}
    }
    const imported=[];for(const chunks of parts.values()){
      const raw=chunks.sort((a,b)=>a.part-b.part).map(c=>c.value).join('');imported.push(JSON.parse(raw));
    }
    if(!imported.length)throw Error('Planilha vazia');
    return {app:'Feito em Forma Orçamentos',schema:1,history:imported};
  }
  function mergeBackup(parsed){
    if(parsed.app!=='Feito em Forma Orçamentos'||parsed.schema!==1||!Array.isArray(parsed.history))throw Error('Formato inválido');
    const cleaned=parsed.history.slice(0,150).map(q=>{
      if(!q||typeof q!=='object'||!Array.isArray(q.items)||typeof q.id!=='string'||q.id.length>70||!/^FF-\d{8}-\d{6}$/.test(q.id))return null;
      const cleanItems=q.items.slice(0,60).map(normalizeItem).filter(Boolean);if(cleanItems.length!==q.items.length)return null;
      const fields={};for(const id of QUOTE_IDS)fields[id]=string(q.fields?.[id],650);
      if(!nonnegative(Number(fields.orc_desconto),100)||!nonnegative(Number(fields.orc_frete))||!nonnegative(Number(fields.orc_custo_frete)))return null;
      return {id:q.id,savedAt:Number.isFinite(new Date(q.savedAt).getTime())?q.savedAt:new Date().toISOString(),updatedAt:q.updatedAt||q.savedAt,status:quoteStatus(q.status),fields,items:cleanItems};
    }).filter(Boolean);
    if(cleaned.length===0)throw Error('Nenhum orçamento válido');
    const merged=new Map(history.map(q=>[q.id,q]));cleaned.forEach(q=>merged.set(q.id,q));
    history=Array.from(merged.values()).sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt)).slice(0,STORAGE_LIMIT_ITEMS);
    if(!safeSave(KEYS.history,history))return;
    renderHistory();toast(`${cleaned.length} orçamento(s) importado(s).`);
  }
  async function importBackup(file){
    if(!file)return;
    if(file.size>20_000_000){toast('Backup muito grande (máximo 20 MB).',true);return}
    try{
      const parsed=file.name.toLowerCase().endsWith('.xlsx')?await readBackupXlsx(file):JSON.parse(await file.text());
      mergeBackup(parsed);
    }catch(e){console.error(e);toast('Backup inválido. Importe um XLSX criado pela calculadora ou seu JSON anterior.',true)}
    $('importFile').value='';
  }
  function init(){
    if(!embedded){$('savePlanner').hidden=true;$('markPlannerSent').hidden=true;$('plannerSaveStatus').textContent='Histórico salvo apenas neste navegador. Para salvar online, abra a calculadora pelo Planner.';}
    $('currentYear').textContent=String(new Date().getFullYear());$('orc_validade').value=newValidityDate();
    const settings=safeLoad(KEYS.settings),form=safeLoad(KEYS.form),draft=safeLoad(KEYS.draft);
    setValues(settings,SETTING_IDS);setValues(form,PRODUCT_IDS);
    if(draft&&typeof draft==='object'){
      items=Array.isArray(draft.items)?draft.items.slice(0,60).map(normalizeItem).filter(Boolean):[];
      setValues(draft.fields,QUOTE_IDS);
      draftQuoteId=typeof draft.draftQuoteId==='string'&&/^FF-\d{8}-\d{6}$/.test(draft.draftQuoteId)?draft.draftQuoteId:null;
      activeQuoteId=typeof draft.activeQuoteId==='string'&&/^FF-\d{8}-\d{6}$/.test(draft.activeQuoteId)?draft.activeQuoteId:null;
    }
    const savedHistory=safeLoad(KEYS.history);
    history=Array.isArray(savedHistory)?savedHistory.filter(q=>q&&Array.isArray(q.items)&&typeof q.id==='string').slice(0,STORAGE_LIMIT_ITEMS):[];
    document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>chooseTab(el.dataset.tab)));
    document.querySelectorAll('[data-goto]').forEach(el=>el.addEventListener('click',()=>chooseTab(el.dataset.goto)));
    PRODUCT_IDS.forEach(id=>$(id).addEventListener('input',()=>{safeSave(KEYS.form,valuesOf(PRODUCT_IDS));calculate()}));
    SETTING_IDS.forEach(id=>$(id).addEventListener('input',()=>{safeSave(KEYS.settings,valuesOf(SETTING_IDS));calculate();$('settingsStatus').textContent='Custos atualizados e salvos.'}));
    QUOTE_IDS.forEach(id=>$(id).addEventListener('input',()=>{saveDraft();renderQuote()}));
    $('prod_canal').addEventListener('change',calculate);
    $('addItemBtn').addEventListener('click',addItem);
    $('newQuote').addEventListener('click',newQuote);
    $('backCalcBtn').addEventListener('click',()=>chooseTab('calculadora'));
    $('sendWhatsapp').addEventListener('click',sendWhatsApp);
    $('copyQuote').addEventListener('click',copyText);
    $('saveQuote').addEventListener('click',saveQuote);
    $('savePlanner').addEventListener('click',()=>savePlanner('draft'));
    $('markPlannerSent').addEventListener('click',()=>savePlanner('sent'));
    $('printQuote').addEventListener('click',()=>{if(validQuote())window.print()});
    $('historySearch').addEventListener('input',renderHistory);
    $('exportHistory').addEventListener('click',exportBackup);
    $('importHistory').addEventListener('click',()=>$('importFile').click());
    $('importFile').addEventListener('change',e=>importBackup(e.target.files?.[0]));
    $('resetSettings').addEventListener('click',()=>{
      if(!window.confirm('Restaurar custos originais da calculadora?'))return;
      setValues(DEFAULTS,SETTING_IDS);safeSave(KEYS.settings,valuesOf(SETTING_IDS));calculate();toast('Parâmetros originais restaurados.');
    });
    calculate();renderQuote();
  }
  document.addEventListener('DOMContentLoaded',init);
})();
