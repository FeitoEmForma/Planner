(() => {
  'use strict';
  const STORAGE_KEY = 'feito_em_forma_planner_v1';
  const STATUSES = [
    {id:'a_fazer',label:'Orçamentos a fazer',short:'A fazer',color:'#c18e37'},
    {id:'enviado',label:'Enviado ao cliente',short:'Enviado',color:'#5989b3'},
    {id:'aprovado',label:'Orçamento aprovado',short:'Aprovado',color:'#3e9674'},
    {id:'producao',label:'Em produção',short:'Em produção',color:'#9672ba'},
    {id:'embalagem',label:'Embalamento',short:'Embalamento',color:'#d18b46'},
    {id:'pagamento',label:'Aguardando pagamento',short:'Aguard. pagamento',color:'#c87569'},
    {id:'finalizado',label:'Finalizado',short:'Finalizado',color:'#36865b'},
    {id:'standby',label:'Stand-by',short:'Stand-by',color:'#89968e'}
  ];
  const statusById = Object.fromEntries(STATUSES.map(s => [s.id,s]));
  // No local quote cache is shown as online data. Old v1 records remain
  // untouched until the user deliberately imports them.
  let quotes = [];
  let db = null, activeUser = null, realtimeChannel = null;
  let writing = false, refreshing = false, syncDebounce = null;
  let authMode = 'login', editingVersion = null, currentSessionUserId = null, recovering = false;

  let currentView = 'board';
  let editingId = null;
  let pendingImport = null;
  let pendingConfirm = null;
  let toastTimer = null;
  const $ = id => document.getElementById(id);
  const nowIso = () => new Date().toISOString();
  const todayYmd = () => {
    const n=new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  };
  const html = v => String(v ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
  const compactDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','') : 'Sem prazo';
  const fullDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
  const validStatus = status => statusById[status] ? status : 'a_fazer';
  const safeNumber = v => Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : 0;
  const safeQuantity = v => Math.max(1,Math.min(1e6,Math.round(safeNumber(v)||1)));
  const moneyRound = n => Math.round((Number(n)+Number.EPSILON)*100)/100;
  const totalOf = q => moneyRound(safeQuantity(q.quantity)*safeNumber(q.unitPrice));
  const costOf = q => moneyRound(safeQuantity(q.quantity)*safeNumber(q.unitCost));
  const netOf = q => moneyRound(totalOf(q)-costOf(q));
  const marginOf = q => totalOf(q)>0 ? netOf(q)/totalOf(q) : 0;
  const paidOf = q => q.paymentStatus==='pago' ? totalOf(q) : Math.min(totalOf(q),safeNumber(q.paidAmount));
  const marginText = q => new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(marginOf(q));
  const timestamp = v => (new Date(v).getTime()||0);
  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,11)}`;
  const normalize = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const isLate = q => q.dueDate && q.dueDate < todayYmd() && q.status!=='finalizado' && q.status!=='standby';
  const isSoon = q => {
    if (!q.dueDate || q.status==='finalizado' || q.status==='standby')return false;
    const days=Math.round((new Date(`${q.dueDate}T12:00:00`)-new Date(`${todayYmd()}T12:00:00`))/86400000);
    return days>=0 && days<=7;
  };
  const followupDue = q => q.followUpDate && q.followUpDate<=todayYmd() && q.status!=='finalizado' && q.status!=='standby';
  const byDate = (a,b) => {
    const pa={alta:0,media:1,baixa:2};
    return (pa[a.priority]??1)-(pa[b.priority]??1) || (a.dueDate||'9999').localeCompare(b.dueDate||'9999') || timestamp(b.createdAt)-timestamp(a.createdAt);
  };

  function loadQuotes(){
    try { const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); return Array.isArray(raw)?raw.map(sanitizeQuote).filter(q=>q.client&&q.product):[]; }
    catch(e){ console.warn('Não foi possível ler os dados locais.',e);return []; }
  }
  function sanitizeQuote(q){
    const src=q&&typeof q==='object'?q:{};
    return {
      id:String(src.id||uid()).slice(0,100),code:String(src.code||'').slice(0,45),
      client:String(src.client||'').slice(0,100),phone:String(src.phone||'').slice(0,32),email:String(src.email||'').slice(0,130),
      product:String(src.product||'').slice(0,180),quantity:safeQuantity(src.quantity),unitPrice:moneyRound(safeNumber(src.unitPrice)),unitCost:moneyRound(safeNumber(src.unitCost)),
      status:validStatus(src.status),priority:['alta','media','baixa'].includes(src.priority)?src.priority:'media',
      dueDate:validDate(src.dueDate),followUpDate:validDate(src.followUpDate),
      paymentStatus:['nao_informado','pendente','parcial','pago'].includes(src.paymentStatus)?src.paymentStatus:'nao_informado',
      paidAmount:safeNumber(src.paidAmount),notes:String(src.notes||'').slice(0,1800),
      createdAt:src.createdAt && !Number.isNaN(Date.parse(src.createdAt))?src.createdAt:nowIso(),
      updatedAt:src.updatedAt && !Number.isNaN(Date.parse(src.updatedAt))?src.updatedAt:nowIso(),
      history:Array.isArray(src.history)?src.history.slice(-40).map(h=>({at:String(h.at||nowIso()),from:String(h.from||'').slice(0,40),to:validStatus(h.to)})):[]
    };
  }
  function validDate(v){return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime())?v:'';}
  function syncLabel(value, error=false){
    $('saveStatus').textContent=value;
    $('syncPill').textContent=value;
    $('syncPill').classList.toggle('sync-error',error);
  }
  function dbError(error){
    const message = String(error?.message || 'Falha desconhecida');
    if(/Failed to fetch|network|offline|NetworkError/i.test(message))return 'Sem conexão com a internet. Confira sua rede e tente novamente.';
    if(error?.code==='23505')return 'Este código de orçamento já existe. Atualize a página e tente novamente.';
    if(error?.code==='42P01'||error?.code==='PGRST205')return 'A tabela do banco ainda não existe. Execute o arquivo BANCO-DE-DADOS.sql no Supabase.';
    if(error?.code==='42703'||error?.code==='PGRST204'||/unit_cost/.test(message))return 'Falta atualizar o banco: execute ATUALIZAR-BANCO-V3.sql no SQL Editor do Supabase.';
    if(error?.code==='42501')return 'Acesso negado pelo banco. Confira o SQL e as permissões de segurança (RLS).';
    return message;
  }
  function isUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
  function fromRow(r){return sanitizeQuote({
    id:r.id,code:r.code,client:r.client,phone:r.phone,email:r.email,product:r.product,
    quantity:r.quantity,unitPrice:r.unit_price,unitCost:r.unit_cost,status:r.status,priority:r.priority,
    dueDate:r.due_date,followUpDate:r.follow_up_date,paymentStatus:r.payment_status,
    paidAmount:r.paid_amount,notes:r.notes,history:r.history,
    createdAt:r.created_at,updatedAt:r.updated_at
  });}
  function toRow(q, includeCreated=false){
    const row={id:isUuid(q.id)?q.id:uid(),owner_id:activeUser.id,
      code:q.code,client:q.client,phone:q.phone,email:q.email,product:q.product,
      quantity:q.quantity,unit_price:q.unitPrice,unit_cost:q.unitCost,status:q.status,priority:q.priority,
      due_date:q.dueDate||null,follow_up_date:q.followUpDate||null,
      payment_status:q.paymentStatus,paid_amount:q.paidAmount,notes:q.notes,
      history:(q.history||[]).slice(-40)};
    if(includeCreated && q.createdAt)row.created_at=q.createdAt;
    return row;
  }
  async function refreshQuotes(showStatus=false){
    if(!db || !activeUser || writing)return;
    if(refreshing){if(showStatus)scheduleRefresh();return;}
    const forUser=activeUser.id;
    refreshing=true;
    if(showStatus)syncLabel('Sincronizando...');
    try{
      const records=[];let start=0;
      while(true){
        const {data,error}=await db.from('quotes').select('*').eq('owner_id',forUser)
          .order('created_at',{ascending:false}).order('id',{ascending:true}).range(start,start+499);
        if(error)throw error;
        records.push(...data);
        if(data.length<500)break;
        start+=500;
      }
      if(activeUser?.id!==forUser)return;
      quotes=records.map(fromRow);
      render();syncLabel('✓ Sincronizado na nuvem');
      updateLegacyBanner();
    }catch(error){syncLabel('⚠ Falha na sincronização',true);if(showStatus)toast(dbError(error),true);console.error(error);}
    finally{refreshing=false;}
  }
  function scheduleRefresh(){
    if(!activeUser)return;
    clearTimeout(syncDebounce);
    syncDebounce=setTimeout(()=>refreshQuotes(),450);
  }
  async function writeQuote(q, expectedAt=null){
    const row=toRow(q, expectedAt===null);
    if(expectedAt){
      const {id,owner_id,...changes}=row;
      const {data,error}=await db.from('quotes').update(changes)
        .eq('id',id).eq('owner_id',owner_id).eq('updated_at',expectedAt).select('*').maybeSingle();
      if(error)throw error;
      if(!data)throw new Error('Este orçamento mudou em outro aparelho. Atualize e revise os dados antes de salvar.');
      return fromRow(data);
    }
    const {data,error}=await db.from('quotes').insert(row).select('*').single();
    if(error)throw error;
    return fromRow(data);
  }
  async function withWrite(work){
    if(writing || !activeUser){toast('Aguarde a operação atual ou faça login.',true);return false;}
    writing=true;syncLabel('Salvando na nuvem...');
    let success=false;
    try{await work();success=true;}
    catch(error){toast(dbError(error),true);console.error(error);}
    finally{
      writing=false;await refreshQuotes(success);
      if(!success)syncLabel('⚠ Alteração não salva',true);
    }
    return success;
  }
  function nextCode(){
    const year=new Date().getFullYear();
    const prefix=`FF-${year}-`;
    let max=0;
    quotes.forEach(q=>{if(q.code.startsWith(prefix)){const value=parseInt(q.code.slice(prefix.length),10);if(Number.isFinite(value))max=Math.max(max,value);}});
    return `${prefix}${String(max+1).padStart(3,'0')}`;
  }
  function toast(message,isError=false){
    const el=$('toast');el.textContent=message;el.classList.toggle('error',isError);el.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4300);
  }
  function icon(ch){return ch;}
  function renderStats(){
    const open=quotes.filter(q=>!['finalizado','standby'].includes(q.status));
    const toDo=quotes.filter(q=>q.status==='a_fazer');
    const awaiting=quotes.filter(q=>q.status==='pagamento');
    const finished=quotes.filter(q=>q.status==='finalizado');
    const data=[
      {label:'Orçamentos a fazer',value:String(toDo.length),detail:'Precisam de orçamento',symbol:'✎'},
      {label:'Pedidos em aberto',value:String(open.length),detail:`${quotes.length} pedidos cadastrados`,symbol:'◫'},
      {label:'Aguardando pagamento',value:String(awaiting.length),detail:money(awaiting.reduce((n,q)=>n+Math.max(0,totalOf(q)-paidOf(q)),0))+' a receber',symbol:'◈'},
      {label:'Valor dos finalizados',value:money(finished.reduce((n,q)=>n+totalOf(q),0)),detail:`Líquido estimado: ${money(finished.reduce((n,q)=>n+netOf(q),0))}`,symbol:'✓',isMoney:true}
    ];
    $('stats').innerHTML=data.map(s=>`<div class="stat-card"><div class="stat-top"><span class="stat-title">${s.label}</span><span class="stat-icon">${icon(s.symbol)}</span></div><div class="stat-value ${s.isMoney?'money':''}">${s.value}</div><div class="stat-detail">${html(s.detail)}</div></div>`).join('');
  }
  function filteredQuotes(){
    const text=normalize($('searchInput').value);
    const priority=$('priorityFilter').value;
    const deadline=$('deadlineFilter').value;
    return quotes.filter(q=>{
      if(text && !normalize([q.code,q.client,q.phone,q.email,q.product,q.notes].join(' ')).includes(text))return false;
      if(priority!=='all' && q.priority!==priority)return false;
      if(deadline==='late'&&!isLate(q))return false;
      if(deadline==='soon'&&!isSoon(q))return false;
      if(deadline==='followup'&&!followupDue(q))return false;
      return true;
    }).sort(byDate);
  }
  function quoteCard(q){
    const overdue=isLate(q),soon=isSoon(q),follow=followupDue(q);
    const dueClass=overdue?'late':soon?'soon':'';
    const dueLabel=q.dueDate?(overdue?'⚠ ':'◷ ')+compactDate(q.dueDate):'◷ Sem prazo';
    const total=totalOf(q);
    return `<article class="quote-card" draggable="true" tabindex="0" role="button" data-id="${html(q.id)}" aria-label="Abrir pedido ${html(q.code)} de ${html(q.client)}"><div class="card-top"><span class="code">${html(q.code)}</span><span class="card-badge priority-${html(q.priority)}">${q.priority==='alta'?'↑ Alta prioridade':q.priority==='baixa'?'↓ Baixa prioridade':'Normal'}</span></div><h3 class="card-client">${html(q.client)}</h3><p class="card-product">${html(q.product)} <span>· ${q.quantity} un.</span></p><div class="card-financial"><div class="card-value">${total?money(total):'A orçar'} <small>bruto</small></div><div class="card-net ${netOf(q)<0?'negative':''}">${total?money(netOf(q)):'—'} líquido</div></div><div class="card-footer"><span class="card-due ${dueClass}" title="Prazo para entrega">${html(dueLabel)}</span>${follow?'<span class="followup-bubble" title="Retorno ao cliente pendente">↗ Retornar</span>':q.paymentStatus==='pago'?'<span class="card-payment">✓ Pago</span>':'<span>↗ Ver detalhes</span>'}</div></article>`;
  }
  function renderBoard(){
    const matches=filteredQuotes();
    $('boardView').innerHTML=STATUSES.map(s=>{
      const items=matches.filter(q=>q.status===s.id);
      const sum=items.reduce((n,q)=>n+totalOf(q),0);
      const isEmpty=items.length===0;
      return `<section class="board-column" data-status="${s.id}" style="--status:${s.color}" aria-label="${s.label}"><div class="column-top"><div class="column-heading"><span class="status-dot"></span>${s.label}<span class="column-count">${items.length}</span></div><div class="column-total">${money(sum)}</div></div><div class="cards">${items.map(quoteCard).join('')}${isEmpty?'<div class="empty-column">Nenhum pedido nesta etapa</div>':''}</div><button class="new-in-column" data-add-status="${s.id}" type="button">+ Adicionar pedido</button></section>`;
    }).join('');
  }
  function renderList(){
    const items=filteredQuotes();
    $('listView').innerHTML=items.length?`<table class="data-table"><thead><tr><th>Código</th><th>Cliente / produto</th><th>Quantidade</th><th>Bruto</th><th>Custo</th><th>Líquido estimado</th><th>Etapa</th><th>Prazo</th><th>Prioridade</th><th>Pagamento</th></tr></thead><tbody>${items.map(q=>{
      const s=statusById[q.status];
      return `<tr data-id="${html(q.id)}" tabindex="0"><td><b>${html(q.code)}</b></td><td><div class="table-client">${html(q.client)}</div><div class="table-product">${html(q.product)}</div></td><td>${q.quantity}</td><td><b>${totalOf(q)?money(totalOf(q)):'A orçar'}</b></td><td>${money(costOf(q))}</td><td><b class="${netOf(q)<0?'financial-negative':'financial-positive'}">${money(netOf(q))}</b></td><td><span class="status-pill" style="--status:${s.color}">${s.short}</span></td><td class="${isLate(q)?'late':isSoon(q)?'soon':''}">${fullDate(q.dueDate)}</td><td>${q.priority==='alta'?'Alta':q.priority==='baixa'?'Baixa':'Normal'}</td><td>${paymentText(q.paymentStatus)}</td></tr>`;
    }).join('')}</tbody></table>`:`<div class="empty-list"><b>Nenhum orçamento encontrado.</b><p>Cadastre seu primeiro pedido ou ajuste os filtros da pesquisa.</p><button class="button primary" id="emptyNew" type="button">+ Criar orçamento</button></div>`;
  }
  function paymentText(status){return {nao_informado:'Não informado',pendente:'Pendente',parcial:'Sinal / parcial',pago:'Pago'}[status]||'Não informado';}
  function renderReports(){
    const total=quotes.length||1;
    const statusRows=STATUSES.map(s=>{
      const group=quotes.filter(q=>q.status===s.id);
      return `<div class="report-row" style="--status:${s.color}"><div class="report-row-header"><span><span class="status-dot" style="display:inline-block;margin-right:7px"></span>${s.label}</span><span>${group.length} · ${money(group.reduce((n,q)=>n+totalOf(q),0))}</span></div><div class="bar-back"><div class="bar-front" style="width:${100*group.length/total}%"></div></div></div>`;
    }).join('');
    const open=quotes.filter(q=>!['finalizado','standby'].includes(q.status));
    const pipeline=open.reduce((s,q)=>s+totalOf(q),0);
    const late=open.filter(isLate).length;
    const pending=open.filter(followupDue).length;
    const received=quotes.reduce((sum,q)=>sum+paidOf(q),0);
    const gross=quotes.reduce((s,q)=>s+totalOf(q),0);
    const production=quotes.reduce((s,q)=>s+costOf(q),0);
    const net=quotes.reduce((s,q)=>s+netOf(q),0);
    $('reportsView').innerHTML=`<div class="report-panel"><h3>Pedidos por etapa</h3><p>Distribuição dos pedidos cadastrados.</p>${statusRows}</div><div class="report-panel"><h3>Visão do negócio</h3><p>Valores e compromissos com base nos registros atuais.</p><div class="report-kpi"><span class="label">Valor bruto de todos os orçamentos</span><span class="value">${money(gross)}</span></div><div class="report-kpi"><span class="label">Custo de fabricação previsto</span><span class="value">${money(production)}</span></div><div class="report-kpi"><span class="label">Valor líquido estimado</span><span class="value ${net<0?'financial-negative':'financial-positive'}">${money(net)}</span></div><div class="report-kpi"><span class="label">Valor total em aberto</span><span class="value">${money(pipeline)}</span></div><div class="report-kpi"><span class="label">Valores recebidos registrados</span><span class="value">${money(received)}</span></div><div class="report-kpi"><span class="label">Pedidos com prazo atrasado</span><span class="value ${late?'late':''}">${late}</span></div><div class="report-kpi"><span class="label">Contatos que precisam de retorno</span><span class="value">${pending}</span></div><p class="report-note">Estes números consideram os pedidos atualmente cadastrados. "Em aberto" inclui orçamentos ainda não aprovados e não representa receita garantida. O valor líquido estimado é bruto menos fabricação; não considera impostos, frete ou taxas fora do custo informado. O valor recebido só reflete o que foi registrado nos campos de pagamento.</p></div>`;
  }
  function render(){
    renderStats();
    if(currentView==='board')renderBoard();
    else if(currentView==='list')renderList();
    else renderReports();
  }
  function switchView(view){
    currentView=view;
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const names={board:['Quadro de pedidos','Seu trabalho em ordem.','Do primeiro contato à entrega, acompanhe cada pedido em um só lugar.'],list:['Todos os orçamentos','Tudo em um só lugar.','Consulte rapidamente os pedidos, valores e prazos cadastrados.'],reports:['Indicadores','Acompanhe os resultados.','Enxergue o que está em andamento e o que precisa de atenção.']};
    $('breadcrumbTitle').textContent=names[view][0];
    $('pageTitle').innerHTML=html(names[view][1].slice(0,-1))+'<span class="heading-period">.</span>';
    $('pageSubtitle').textContent=names[view][2];
    $('boardView').hidden=view!=='board';$('boardTip').hidden=view!=='board';
    $('listView').hidden=view!=='list';$('reportsView').hidden=view!=='reports';
    render();
  }
  function openOverlay(id){$(id).hidden=false;document.body.style.overflow='hidden';}
  function closeOverlay(id){$(id).hidden=true;if(!document.querySelector('.modal-overlay:not([hidden])'))document.body.style.overflow='';}
  function parseMoney(value){
    let v=String(value??'').replace(/[^\d,.-]/g,'').trim();
    if(!v)return 0;
    if(v.includes(',')){v=v.replace(/\./g,'').replace(',','.');}
    else if((v.match(/\./g)||[]).length>1){v=v.replace(/\./g,'');}
    const n=Number(v);return Number.isFinite(n)?Math.max(0,n):0;
  }
  function formatMoneyInput(value){return safeNumber(value)?safeNumber(value).toFixed(2).replace('.',','):'';}
  function updateFormTotal(){
    const q={quantity:safeQuantity($('fQuantity').value),unitPrice:parseMoney($('fUnitPrice').value),unitCost:parseMoney($('fUnitCost').value)};
    $('fTotal').textContent=money(totalOf(q));$('fCostTotal').textContent=money(costOf(q));
    $('fNet').textContent=money(netOf(q));$('fMargin').textContent=marginText(q);
    $('fNet').parentElement.classList.toggle('negative',netOf(q)<0);
  }
  function fillQuoteForm(q){
    $('fClient').value=q.client||'';$('fPhone').value=q.phone||'';$('fEmail').value=q.email||'';
    $('fProduct').value=q.product||'';$('fQuantity').value=q.quantity||1;$('fUnitPrice').value=formatMoneyInput(q.unitPrice);$('fUnitCost').value=formatMoneyInput(q.unitCost);
    $('fStatus').value=q.status||'a_fazer';$('fPriority').value=q.priority||'media';
    $('fDue').value=q.dueDate||'';$('fFollowup').value=q.followUpDate||'';
    $('fPayment').value=q.paymentStatus||'nao_informado';$('fPaidAmount').value=formatMoneyInput(q.paidAmount);
    $('fNotes').value=q.notes||'';updateFormTotal();
  }
  function openNew(status='a_fazer'){
    if(!activeUser)return;
    editingId=null;editingVersion=null;$('quoteForm').reset();
    fillQuoteForm({quantity:1,status,priority:'media',paymentStatus:'nao_informado'});
    $('modalTitle').textContent='Novo orçamento';$('modalCode').textContent='Você pode preencher agora e atualizar depois.';
    ['deleteQuote','duplicateQuote','copyQuote','whatsappQuote','quoteHistory'].forEach(id=>$(id).hidden=true);
    openOverlay('quoteOverlay');$('fClient').focus();
  }
  function openEdit(id){
    const q=quotes.find(v=>v.id===id);if(!q)return;
    editingId=q.id;editingVersion=q.updatedAt;fillQuoteForm(q);
    $('modalTitle').textContent='Detalhes do orçamento';$('modalCode').textContent=`${q.code} · Criado em ${new Date(q.createdAt).toLocaleDateString('pt-BR')}`;
    ['deleteQuote','duplicateQuote','copyQuote','whatsappQuote'].forEach(k=>$(k).hidden=false);
    if(q.history.length){
      $('quoteHistory').hidden=false;
      $('quoteHistory').innerHTML='<h3>Histórico de etapas</h3>'+q.history.slice().reverse().slice(0,8).map(h=>`<div class="history-item">${html(new Date(h.at).toLocaleString('pt-BR'))} · ${h.from?html(statusById[h.from]?.short||h.from)+' → ':''}<strong>${html(statusById[h.to]?.label||h.to)}</strong></div>`).join('');
    }else $('quoteHistory').hidden=true;
    openOverlay('quoteOverlay');
  }
  function getFormData(){
    return {
      client:$('fClient').value.trim(),phone:$('fPhone').value.trim(),email:$('fEmail').value.trim(),
      product:$('fProduct').value.trim(),quantity:safeQuantity($('fQuantity').value),unitPrice:parseMoney($('fUnitPrice').value),unitCost:parseMoney($('fUnitCost').value),
      status:validStatus($('fStatus').value),priority:$('fPriority').value,
      dueDate:validDate($('fDue').value),followUpDate:validDate($('fFollowup').value),
      paymentStatus:$('fPayment').value,paidAmount:parseMoney($('fPaidAmount').value),notes:$('fNotes').value.trim()
    };
  }
  async function onSubmit(e){
    e.preventDefault();
    const fields=getFormData();
    if(!fields.client||!fields.product){toast('Preencha o nome do cliente e o produto.',true);return;}
    if(fields.paidAmount>fields.unitPrice*fields.quantity){toast('O valor recebido não pode ser maior que o total do pedido.',true);return;}
    if(fields.paymentStatus==='pago')fields.paidAmount=fields.unitPrice*fields.quantity;
    const old=editingId?quotes.find(q=>q.id===editingId):null;
    if(editingId && (!old || old.updatedAt!==editingVersion)){
      toast('Este pedido foi alterado em outro aparelho. Feche e abra novamente para revisar.',true);return;
    }
    const now=nowIso();
    const history=old?[...(old.history||[])]:[];
    if(!old || old.status!==fields.status)history.push({at:now,from:old?.status||'',to:fields.status});
    const candidate=sanitizeQuote({...old,...fields,id:old?.id||uid(),code:old?.code||nextCode(),
      createdAt:old?.createdAt||now,history,updatedAt:old?.updatedAt||now});
    const success=await withWrite(async()=>{
      // A unique index protects against accidentally generating the same code on two devices.
      // On collision, retry with a short ID suffix rather than overwriting the other record.
      try{await writeQuote(candidate,old?.updatedAt||null);}
      catch(error){
        if(!old && error?.code==='23505'){
          candidate.code=`FF-${new Date().getFullYear()}-${candidate.id.slice(0,8).toUpperCase()}`;
          await writeQuote(candidate);
        }else throw error;
      }
    });
    if(success){closeOverlay('quoteOverlay');toast(old?'Orçamento atualizado na nuvem.':'Orçamento cadastrado na nuvem.');}
  }
  async function moveQuote(id,to){
    const q=quotes.find(v=>v.id===id);
    if(!q||q.status===to||!statusById[to])return;
    const history=[...(q.history||[]),{at:nowIso(),from:q.status,to}].slice(-40);
    const copy=sanitizeQuote({...q,status:to,history});
    const success=await withWrite(()=>writeQuote(copy,q.updatedAt));
    if(success)toast(`${q.code} → ${statusById[to].label}`);
  }
  function askConfirm(title,message,action,button='Excluir pedido'){
    $('confirmTitle').textContent=title;$('confirmText').textContent=message;$('acceptConfirm').textContent=button;
    pendingConfirm=action;openOverlay('confirmOverlay');
  }
  function quoteMessage(q){
    const total=totalOf(q);
    return `Olá, ${q.client}! 👋\n\nSegue o resumo do seu orçamento da Feito em Forma:\n\n📋 Pedido: ${q.code}\n📦 Produto: ${q.product}\n🔢 Quantidade: ${q.quantity} unidade(s)\n${total?`💰 Valor total: ${money(total)}\n`:''}${q.dueDate?`📆 Data combinada: ${fullDate(q.dueDate)}\n`:''}\nQualquer dúvida, estamos à disposição!\n\nFeito em Forma — Feito para lembrar. 🤎`;
  }
  async function copyText(text){
    try{
      if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);toast('Resumo copiado para a área de transferência.');return;}
      const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();
      const ok=document.execCommand('copy');a.remove();if(!ok)throw new Error('copy');toast('Resumo copiado para a área de transferência.');
    }catch(e){toast('Não foi possível copiar automaticamente. Use a opção de WhatsApp.',true);}
  }
  async function duplicateCurrent(){
    const q=quotes.find(q=>q.id===editingId);if(!q)return;
    const copy=sanitizeQuote({...q,id:uid(),code:nextCode(),status:'a_fazer',
      paymentStatus:'nao_informado',paidAmount:0,createdAt:nowIso(),updatedAt:nowIso(),
      history:[{at:nowIso(),from:'',to:'a_fazer'}]});
    const success=await withWrite(async()=>{
      try{await writeQuote(copy);}
      catch(e){if(e?.code==='23505'){copy.code=`FF-${new Date().getFullYear()}-${copy.id.slice(0,8).toUpperCase()}`;await writeQuote(copy);}else throw e;}
    });
    if(success){closeOverlay('quoteOverlay');toast('Orçamento duplicado na nuvem.');}
  }
  function whatsappCurrent(){
    const q=quotes.find(q=>q.id===editingId);if(!q)return;
    let phone=q.phone.replace(/\D/g,'');
    if(phone.length===10||phone.length===11)phone='55'+phone;
    if(phone.length<12||phone.length>13){toast('Cadastre um WhatsApp válido com DDD para abrir a conversa.',true);return;}
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(quoteMessage(q))}`,'_blank','noopener,noreferrer');
  }
  function fileDownload(content,name,type){
    const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function exportBackup(){
    fileDownload(JSON.stringify({app:'feito-em-forma-planner',version:3,storage:'cloud',exportedAt:nowIso(),quotes},null,2),`feito-em-forma-backup-${todayYmd()}.json`,'application/json;charset=utf-8');
    toast('Backup JSON baixado. Guarde este arquivo em local seguro.');
  }
  // JSON e formato restauravel para recuperar dados e historico da conta.
  const csvHeaders=['Código','Cliente','WhatsApp','E-mail','Produto','Quantidade','Valor unitário','Custo unitário','Valor bruto','Custo total','Valor líquido','Margem %','Etapa','Prioridade','Prazo','Próximo contato','Situação do pagamento','Valor recebido','Observações','Criado em','Atualizado em'];
  function csvValue(v){let value=String(v??'');if(/^[\s]*[=+@-]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';}
  function generateCSV(data,headers){return '\ufeff'+headers.map(csvValue).join(';')+'\r\n'+data.map(row=>row.map(csvValue).join(';')).join('\r\n');}
  function exportCSV(){
    const val=v=>Number(v).toFixed(2).replace('.',',');
    const rows=quotes.map(q=>[q.code,q.client,q.phone,q.email,q.product,q.quantity,val(q.unitPrice),val(q.unitCost),val(totalOf(q)),val(costOf(q)),val(netOf(q)),(marginOf(q)*100).toFixed(1).replace('.',',')+'%',statusById[q.status].label,q.priority,fullDate(q.dueDate)==='—'?'':fullDate(q.dueDate),fullDate(q.followUpDate)==='—'?'':fullDate(q.followUpDate),paymentText(q.paymentStatus),val(paidOf(q)),q.notes,new Date(q.createdAt).toLocaleDateString('pt-BR'),new Date(q.updatedAt).toLocaleDateString('pt-BR')]);
    fileDownload(generateCSV(rows,csvHeaders),`feito-em-forma-orcamentos-${todayYmd()}.csv`,'text/csv;charset=utf-8');
    toast('Planilha CSV exportada.');
  }
  function downloadTemplate(){
    const rows=[['','Nome do cliente','11999999999','cliente@exemplo.com','Chaveiros personalizados','10','12,50','4,20','','','','','Orçamentos a fazer','media','30/10/2026','20/10/2026','Pendente','0,00','Cor verde e branca','','']];
    fileDownload(generateCSV(rows,csvHeaders),'modelo-importacao-feito-em-forma.csv','text/csv;charset=utf-8');
  }
  const excelMoney='#,##0.00;[Red](#,##0.00)';
  const excelPercent='0.0%;[Red](0.0%)';
  const excelInk='FF203C30',excelGreen='FF1D654C',excelCream='FFF6F8F4';
  const excelDate=s=>s?new Date(`${s}T12:00:00`):null;
  const excelDateTime=s=>s?new Date(s):null;
  const excelDecorateHeader=(worksheet,range)=>{
    worksheet.getRow(range).height=32;
    worksheet.getRow(range).eachCell(cell=>{
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:excelGreen}};
      cell.font={name:'Aptos',size:10,bold:true,color:{argb:'FFFFFFFF'}};
      cell.alignment={vertical:'middle',wrapText:true};
      cell.border={bottom:{style:'thin',color:{argb:'FF143F30'}}};
    });
  };
  function excelKpi(sheet,row,label,formula,result,format=excelMoney){
    const a=sheet.getCell(`A${row}`),b=sheet.getCell(`B${row}`);
    a.value=label;b.value={formula,result};
    a.font={name:'Aptos',size:11,color:{argb:excelInk},bold:true};
    b.font={name:'Aptos',size:12,color:{argb:excelGreen},bold:true};
    b.numFmt=format;
    a.fill={type:'pattern',pattern:'solid',fgColor:{argb:row%2?'FFEDF4EC':excelCream}};
    b.fill={type:'pattern',pattern:'solid',fgColor:{argb:row%2?'FFEDF4EC':excelCream}};
    sheet.getRow(row).height=28;
    a.alignment={vertical:'middle'};b.alignment={vertical:'middle',horizontal:'right'};
  }
  function excelTitle(sheet,title,subtitle,mergeRange='A1:H2'){
    sheet.mergeCells(mergeRange);
    const titleCell=sheet.getCell('A1');titleCell.value=title;
    titleCell.font={name:'Aptos Display',size:20,bold:true,color:{argb:'FFFFFFFF'}};
    titleCell.alignment={vertical:'middle'};
    titleCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:excelGreen}};
    sheet.getRow(1).height=31;sheet.getRow(2).height=16;
    sheet.getCell('A4').value=subtitle;
    sheet.getCell('A4').font={name:'Aptos',size:11,italic:true,color:{argb:'FF64786C'}};
    sheet.getRow(4).height=24;
  }
  async function exportExcel(){
    if(!window.ExcelJS?.Workbook){toast('Não foi possível carregar a biblioteca de Excel. Atualize a página e confira sua internet.',true);return;}
    try{
      const wb=new window.ExcelJS.Workbook();
      wb.creator='Feito em Forma';wb.title='Planner de Orçamentos — Backup Financeiro';wb.subject='Backup de orçamentos e resultados';
      wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
      const sheet=wb.addWorksheet('Orcamentos',{views:[{state:'frozen',xSplit:2,ySplit:5}]});
      const summary=wb.addWorksheet('Resumo Financeiro',{views:[{state:'frozen',ySplit:4}]});
      const stage=wb.addWorksheet('Por Etapa',{views:[{state:'frozen',ySplit:5}]});
      const help=wb.addWorksheet('LEIA-ME');
      excelTitle(sheet,'FEITO EM FORMA  |  ORÇAMENTOS','Valores em R$. Bruto = venda; líquido estimado = bruto − custo de fabricação.','A1:H2');
      const titles=['Código','Cliente','WhatsApp','E-mail','Produto','Quantidade','Venda unitária (R$)','Custo unitário (R$)','Valor bruto (R$)','Custo total (R$)','Valor líquido (R$)','Margem %','Etapa','Prioridade','Prazo','Próximo contato','Pagamento','Valor recebido (R$)','A receber (R$)','Observações','Criado em','Atualizado em','ID do registro','Histórico JSON'];
      sheet.getRow(5).values=titles;
      excelDecorateHeader(sheet,5);
      sheet.autoFilter={from:'A5',to:'X5'};
      sheet.columns.forEach((col,i)=>{col.width=[18,27,19,25,34,12,21,20,21,21,22,15,25,15,18,18,21,21,20,42,20,20,38,34][i];});
      quotes.forEach((q,i)=>{
        const r=i+6,row=sheet.getRow(r);
        row.values=[q.code,q.client,q.phone,q.email,q.product,q.quantity,q.unitPrice,q.unitCost,
          {formula:`F${r}*G${r}`,result:totalOf(q)},
          {formula:`F${r}*H${r}`,result:costOf(q)},
          {formula:`I${r}-J${r}`,result:netOf(q)},
          {formula:`IFERROR(K${r}/I${r},0)`,result:marginOf(q)},
          statusById[q.status]?.label||q.status,q.priority,excelDate(q.dueDate),excelDate(q.followUpDate),paymentText(q.paymentStatus),paidOf(q),
          {formula:`MAX(0,I${r}-R${r})`,result:Math.max(0,totalOf(q)-paidOf(q))},
          q.notes,excelDateTime(q.createdAt),excelDateTime(q.updatedAt),q.id,JSON.stringify(q.history||[])];
        row.height=22;
        for(let c=1;c<=24;c++){
          const cell=row.getCell(c);
          cell.font={name:'Aptos',size:10,color:{argb:c===11?(netOf(q)<0?'FFB3433D':excelGreen):excelInk}};
          cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2===0?'FFFFFFFF':excelCream}};
          cell.alignment={vertical:'middle',wrapText:false};
        }
        [7,8,9,10,11,18,19].forEach(col=>row.getCell(col).numFmt=excelMoney);
        row.getCell(12).numFmt=excelPercent;
        [15,16].forEach(col=>row.getCell(col).numFmt='dd/mm/yyyy');
        [21,22].forEach(col=>row.getCell(col).numFmt='dd/mm/yyyy hh:mm');
      });
      const last=Math.max(6,quotes.length+5),ref=col=>`Orcamentos!${col}6:${col}${last}`;
      const all=quotes;
      const gross=all.reduce((n,q)=>n+totalOf(q),0);
      const cost=all.reduce((n,q)=>n+costOf(q),0);
      const net=all.reduce((n,q)=>n+netOf(q),0);
      const paid=all.reduce((n,q)=>n+paidOf(q),0);
      const due=all.reduce((n,q)=>n+Math.max(0,totalOf(q)-paidOf(q)),0);
      const fin=all.filter(q=>q.status==='finalizado');
      excelTitle(summary,'FEITO EM FORMA  |  RESUMO FINANCEIRO',`Gerado em ${new Date().toLocaleString('pt-BR')}. Valores de orçamentos não aprovados não são receitas garantidas.`);
      summary.getColumn('A').width=48;summary.getColumn('B').width=26;
      for(const c of ['C','D','E','F','G','H'])summary.getColumn(c).width=12;
      excelKpi(summary,6,'Total de orçamentos cadastrados',`COUNTA(${ref('A')})`,all.length,'0');
      excelKpi(summary,7,'Valor bruto total',`SUM(${ref('I')})`,gross);
      excelKpi(summary,8,'Custo de fabricação total',`SUM(${ref('J')})`,cost);
      excelKpi(summary,9,'Resultado líquido estimado',`SUM(${ref('K')})`,net);
      excelKpi(summary,10,'Margem líquida estimada',`IFERROR(B9/B7,0)`,gross?net/gross:0,excelPercent);
      excelKpi(summary,11,'Valor já recebido',`SUM(${ref('R')})`,paid);
      excelKpi(summary,12,'Saldo a receber',`SUM(${ref('S')})`,due);
      excelKpi(summary,13,'Valor líquido dos finalizados',`SUMIF(${ref('M')},"Finalizado",${ref('K')})`,fin.reduce((n,q)=>n+netOf(q),0));
      excelKpi(summary,14,'Total de pedidos finalizados',`COUNTIF(${ref('M')},"Finalizado")`,fin.length,'0');
      summary.mergeCells('A17:F17');summary.getCell('A17').value='OBSERVAÇÃO: lucro líquido estimado ≠ dinheiro recebido. Custos não informados não são descontados.';
      summary.getCell('A17').font={name:'Aptos',italic:true,size:11,color:{argb:'FF7A5A3A'}};
      summary.mergeCells('A19:F19');summary.getCell('A19').value='Para editar valores e manter as fórmulas, altere as colunas Quantidade, Venda unitária e Custo unitário em Orcamentos.';
      summary.getCell('A19').font={name:'Aptos',size:10,color:{argb:'FF64786C'}};
      excelTitle(stage,'FEITO EM FORMA  |  ETAPAS','Acompanhe receita bruta, custo e resultado estimado por fase.');
      const stageHeaders=['Etapa','Orçamentos','Bruto (R$)','Custos (R$)','Líquido (R$)'];
      stage.getRow(5).values=stageHeaders;excelDecorateHeader(stage,5);
      [34,18,22,22,22].forEach((width,i)=>stage.getColumn(i+1).width=width);
      STATUSES.forEach((st,i)=>{
        const row=stage.getRow(i+6),group=all.filter(q=>q.status===st.id);
        row.values=[st.label,
          {formula:`COUNTIF(${ref('M')},A${i+6})`,result:group.length},
          {formula:`SUMIF(${ref('M')},A${i+6},${ref('I')})`,result:group.reduce((n,q)=>n+totalOf(q),0)},
          {formula:`SUMIF(${ref('M')},A${i+6},${ref('J')})`,result:group.reduce((n,q)=>n+costOf(q),0)},
          {formula:`C${i+6}-D${i+6}`,result:group.reduce((n,q)=>n+netOf(q),0)}];
        row.height=26;
        row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2?excelCream:'FFFFFFFF'}};c.font={name:'Aptos',size:11,color:{argb:excelInk}};});
        [3,4,5].forEach(c=>row.getCell(c).numFmt=excelMoney);
      });
      excelTitle(help,'FEITO EM FORMA  |  LEIA-ME','Como usar seu arquivo de backup financeiro.');
      help.getColumn('A').width=110;
      const tips=[
        '1. Orcamentos: cada linha representa um pedido. Filtre por cliente, prazo ou etapa no cabeçalho.',
        '2. Altere quantidade, venda unitária ou custo unitário para recalcular bruto, custo e líquido no Excel.',
        '3. Resultado líquido estimado = valor bruto − custo total de fabricação. Margem = líquido / bruto.',
        '4. O resultado não desconta impostos, taxas, frete ou outras despesas não incluídas no custo unitário.',
        '5. Resumo Financeiro e Por Etapa consolidam automaticamente os valores dos orçamentos existentes.',
        '6. Este XLSX também pode ser IMPORTADO no Planner: Importar dados → selecione o arquivo .xlsx.',
        '7. Na importação, pedidos com o mesmo ID já presentes na conta são ignorados; não substitui registros existentes.',
        '8. Caso edite fórmulas no Excel, o Planner recalcula os valores a partir da quantidade, venda e custo unitário.',
        '9. Guarde o arquivo em local seguro: ele contém dados dos seus clientes e os custos de fabricação.',
        '10. Backup JSON separado continua disponível para preservar o histórico completo e garantir a restauração.'
      ];
      tips.forEach((t,i)=>{const c=help.getCell(`A${i+6}`);c.value=t;c.font={name:'Aptos',size:11,color:{argb:excelInk}};help.getRow(i+6).height=25;});
      const buffer=await wb.xlsx.writeBuffer();
      fileDownload(buffer,`feito-em-forma-backup-financeiro-${todayYmd()}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast(`Excel financeiro gerado com ${quotes.length} orçamento(s).`);
    }catch(error){console.error(error);toast(`Erro ao criar o Excel: ${error.message}`,true);}
  }
  function getCellValue(cell){
    const raw=cell?.value;
    if(raw==null)return '';
    if(raw instanceof Date)return raw;
    if(typeof raw==='object'){
      if(raw.result!==undefined && raw.result!==null)return raw.result;
      if(typeof raw.text==='string')return raw.text;
      if(Array.isArray(raw.richText))return raw.richText.map(x=>x.text).join('');
      return '';
    }
    return raw;
  }
  function excelText(v){return v instanceof Date ? v.toLocaleDateString('pt-BR') : String(v??'').trim();}
  function excelDateToYmd(v){if(v instanceof Date && !Number.isNaN(v.getTime()))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;return csvDate(v);}
  function excelTimestamp(v){if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString();return String(v??'').trim();}
  async function parseImportedExcel(file){
    if(!window.ExcelJS?.Workbook)throw new Error('A biblioteca Excel não carregou. Recarregue a página e tente novamente.');
    const book=new window.ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());
    let work=null,headerIndex=0,heads=[];
    const candidates=[book.getWorksheet('Orcamentos'),...book.worksheets].filter(Boolean);
    for(const ws of candidates){
      for(let i=1;i<=Math.min(ws.rowCount,12);i++){
        const values=ws.getRow(i).values.slice(1).map(x=>normalize(excelText(x&&typeof x==='object'&&!(x instanceof Date)&&x.text?x.text:x)).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim());
        if(values.includes('cliente')&&(values.includes('produto')||values.includes('produto servico'))){work=ws;headerIndex=i;heads=values;break;}
      }
      if(work)break;
    }
    if(!work)throw new Error('Não encontrei as colunas Cliente e Produto na planilha XLSX.');
    const cols={};Object.entries(fieldAliases).forEach(([key,aliases])=>{const i=heads.findIndex(h=>aliases.includes(h));if(i>=0)cols[key]=i+1;});
    const pick=(row,key)=>cols[key] ? getCellValue(row.getCell(cols[key])):'';
    const imported=[];
    work.eachRow((row,i)=>{
      if(i<=headerIndex)return;
      const client=excelText(pick(row,'client')),product=excelText(pick(row,'product'));
      if(!client||!product)return;
      const quantity=safeQuantity(pick(row,'quantity'));
      const unitPrice=cols.unitPrice?parseMoney(pick(row,'unitPrice')):parseMoney(pick(row,'total'))/quantity;
      const unitCost=cols.unitCost?parseMoney(pick(row,'unitCost')):parseMoney(pick(row,'costTotal'))/quantity;
      const paymentStatus=csvPayment(excelText(pick(row,'paymentStatus')));
      const paidAmount=paymentStatus==='pago'?quantity*unitPrice:parseMoney(pick(row,'paidAmount'));
      let history=[];
      try{const h=JSON.parse(excelText(pick(row,'history')));if(Array.isArray(h))history=h;}catch(_){}
      imported.push(sanitizeQuote({
        id:isUuid(excelText(pick(row,'id')))?excelText(pick(row,'id')):uid(),
        code:excelText(pick(row,'code')),client,phone:excelText(pick(row,'phone')),email:excelText(pick(row,'email')),
        product,quantity,unitPrice,unitCost,status:csvStatus(excelText(pick(row,'status'))),priority:csvPriority(excelText(pick(row,'priority'))),
        dueDate:excelDateToYmd(pick(row,'dueDate')),followUpDate:excelDateToYmd(pick(row,'followUpDate')),
        paymentStatus,paidAmount,notes:excelText(pick(row,'notes')),
        createdAt:excelTimestamp(pick(row,'createdAt')),updatedAt:excelTimestamp(pick(row,'updatedAt')),history
      }));
    });
    if(!imported.length)throw new Error('Não encontrei orçamentos válidos na planilha XLSX.');
    return imported;
  }
  function parseCSV(text){
    const input=text.replace(/^\ufeff/,'');
    const firstLine=input.split(/\r?\n/,1)[0];
    const count=c=>(firstLine.match(new RegExp(`\\${c}`,'g'))||[]).length;
    const separator=count(';')>=count(',')?';':',';
    const rows=[];let row=[],cell='',inside=false;
    for(let i=0;i<input.length;i++){
      const c=input[i];
      if(c==='"'){if(inside&&input[i+1]==='"'){cell+='"';i++;}else inside=!inside;}
      else if(c===separator&&!inside){row.push(cell);cell='';}
      else if((c==='\r'||c==='\n')&&!inside){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
    return rows;
  }
  function csvDate(raw){
    const value=String(raw||'').trim();
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(value)){const [d,m,y]=value.split('/');return validDate(`${y}-${m}-${d}`);}
    return validDate(value);
  }
  function csvStatus(s){
    const v=normalize(s).replace(/[^a-z0-9 ]/g,' ');
    if(v.includes('stand')||v.includes('pausado'))return 'standby';
    if(v.includes('finaliz')||v.includes('entregue')||v.includes('concluid'))return 'finalizado';
    if(v.includes('pagamento')||v.includes('receber'))return 'pagamento';
    if(v.includes('embal')||v.includes('empacot'))return 'embalagem';
    if(v.includes('produ'))return 'producao';
    if(v.includes('aprova')||v.includes('aceito'))return 'aprovado';
    if(v.includes('envia')||v.includes('cliente')||v.includes('proposta'))return 'enviado';
    return 'a_fazer';
  }
  function csvPriority(s){const v=normalize(s);return v.includes('alta')||v.includes('urgent')?'alta':v.includes('baix')?'baixa':'media';}
  function csvPayment(s){const v=normalize(s);if(v.includes('parcial')||v.includes('sinal'))return 'parcial';if(v.includes('pago')||v.includes('recebido'))return 'pago';if(v.includes('pendente')||v.includes('aguard'))return 'pendente';return 'nao_informado';}
  const fieldAliases={
    client:['cliente','nome do cliente','nome','comprador','customer'],
    phone:['whatsapp','telefone','celular','contato'],email:['e mail','email'],
    product:['produto','produto servico','produto / servico','descricao','pedido','peca','servico','item'],
    quantity:['quantidade','qtd','qtde','unidades'],unitPrice:['valor unitario','preco unitario','venda unitaria r','valor','preco'],
    unitCost:['custo unitario','custo unitario r','custo por unidade','custo de fabricacao por peca','custo de fabricacao','custo de producao'],
    costTotal:['custo total','custo total r'],id:['id do registro'],history:['historico json'],
    createdAt:['criado em'],updatedAt:['atualizado em'],
    total:['valor total','valor bruto','valor bruto r','total','valor do pedido'],status:['etapa','status','situacao','fase'],
    priority:['prioridade'],dueDate:['prazo','prazo entrega','data entrega','entrega','data de entrega'],
    followUpDate:['proximo contato','retorno','follow up','data retorno'],
    paymentStatus:['situacao do pagamento','status pagamento','pagamento'],
    paidAmount:['valor recebido','pago','recebido'],notes:['observacoes','obs','detalhes'],code:['codigo','numero','id']
  };
  function parseImportedCSV(data){
    const rows=parseCSV(data);if(rows.length<2)throw new Error('O CSV está vazio ou não possui linhas de dados.');
    const headings=rows[0].map(v=>normalize(v).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim());
    const cols={};Object.entries(fieldAliases).forEach(([key,aliases])=>{const idx=headings.findIndex(v=>aliases.some(a=>v===a));if(idx>=0)cols[key]=idx;});
    if(cols.client===undefined||cols.product===undefined)throw new Error('A planilha precisa ter as colunas Cliente e Produto. Baixe o modelo CSV.');
    const val=(row,key)=>cols[key]===undefined?'':String(row[cols[key]]||'').trim();
    const result=[];
    rows.slice(1).forEach(row=>{
      const client=val(row,'client'),product=val(row,'product');if(!client||!product)return;
      const quantity=safeQuantity(val(row,'quantity'));
      const unitPrice=cols.unitPrice!==undefined?parseMoney(val(row,'unitPrice')):parseMoney(val(row,'total'))/quantity;
      const paymentStatus=csvPayment(val(row,'paymentStatus'));
      result.push(sanitizeQuote({id:uid(),code:val(row,'code'),client,phone:val(row,'phone'),email:val(row,'email'),product,quantity,unitPrice,unitCost:cols.unitCost!==undefined?parseMoney(val(row,'unitCost')):parseMoney(val(row,'costTotal'))/quantity,status:csvStatus(val(row,'status')),priority:csvPriority(val(row,'priority')),dueDate:csvDate(val(row,'dueDate')),followUpDate:csvDate(val(row,'followUpDate')),paymentStatus,paidAmount:paymentStatus==='pago'?quantity*unitPrice:parseMoney(val(row,'paidAmount')),notes:val(row,'notes'),history:[]}));
    });
    if(!result.length)throw new Error('Não encontrei linhas válidas com cliente e produto.');
    return result;
  }
  async function onImportFile(e){
    pendingImport=null;$('confirmImport').disabled=true;
    const file=e.target.files?.[0];if(!file){$('importInfo').textContent='Nenhum arquivo selecionado.';return;}
    try{
      if(file.size>8*1024*1024)throw new Error('Arquivo muito grande. Limite de 8 MB.');
      const isExcel=file.name.toLowerCase().endsWith('.xlsx');
      const text=isExcel?'':await file.text();let imported=[];
      if(isExcel)imported=await parseImportedExcel(file);
      else if(file.name.toLowerCase().endsWith('.json')){
        const parsed=JSON.parse(text),values=Array.isArray(parsed)?parsed:parsed.quotes;
        if(!Array.isArray(values))throw new Error('O JSON não contém uma lista de orçamentos válida.');
        imported=values.map(sanitizeQuote).filter(q=>q.client&&q.product);
      }else if(file.name.toLowerCase().endsWith('.csv'))imported=parseImportedCSV(text);
      else throw new Error('Selecione um arquivo .xlsx, .json ou .csv.');
      if(!imported.length)throw new Error('O arquivo não contém orçamentos válidos.');
      pendingImport=imported;$('confirmImport').disabled=false;
      $('importInfo').textContent=`✓ ${file.name} — ${imported.length} orçamento(s) encontrado(s).`;
    }catch(error){$('importInfo').textContent=`Erro: ${error.message}`;toast(error.message,true);}
  }
  async function importQuotes(entries){
    if(!entries?.length)return;
    let added=0,skipped=0,failed=0;
    const knownIds=new Set(quotes.map(q=>q.id));
    const knownCodes=new Set(quotes.map(q=>q.code));
    const payload=[];
    for(const entry of entries){
      const q=sanitizeQuote(entry);
      if(isUuid(q.id)&&knownIds.has(q.id)){skipped++;continue;}
      if(!isUuid(q.id))q.id=uid();
      if(!q.code || knownCodes.has(q.code))q.code=`FF-${new Date().getFullYear()}-${q.id.slice(0,8).toUpperCase()}`;
      while(knownCodes.has(q.code))q.code=`FF-${new Date().getFullYear()}-${uid().slice(0,8).toUpperCase()}`;
      knownCodes.add(q.code);knownIds.add(q.id);payload.push(toRow(q,true));
    }
    const success=await withWrite(async()=>{
      for(let i=0;i<payload.length;i+=75){
        const batch=payload.slice(i,i+75);
        const {error}=await db.from('quotes').insert(batch);
        if(error){failed+=batch.length;throw new Error(`Importação interrompida após ${added} registros: ${dbError(error)}`);}
        added+=batch.length;
      }
    });
    if(!success && !failed)failed=1;
    toast(`Importação: ${added} adicionado(s), ${skipped} já existente(s)${failed?', verifique falhas acima':''}.`,!!failed);
    return {added,skipped,failed};
  }
  async function confirmImport(){
    if(!pendingImport)return;
    const imported=pendingImport;
    $('confirmImport').disabled=true;
    try{const result=await importQuotes(imported);if(result?.failed===0){pendingImport=null;closeOverlay('importOverlay');$('importFile').value='';}}
    finally{$('confirmImport').disabled=false;}
  }
  function updateLegacyBanner(){
    const old=loadQuotes();
    const count=old.filter(q=>!quotes.some(v=>v.id===q.id)).length;
    $('legacyBanner').hidden=!(activeUser && count>0);
    $('legacyCount').textContent=`Encontramos ${count} orçamento(s) da versão anterior neste navegador. Você pode copiá-los para sua conta online sem apagar os originais.`;
  }
  async function migrateLegacy(){
    const old=loadQuotes();
    if(!old.length){toast('Não há registros antigos neste navegador.',true);return;}
    await importQuotes(old);
  }
  function showAuth(mode='login',message=''){
    authMode=mode;
    $('authGate').hidden=false;$('appShell').hidden=true;$('configGate').hidden=true;
    $('authTitle').textContent={login:'Acesse seu Planner',signup:'Crie sua conta',reset:'Recuperar senha',recovery:'Definir nova senha'}[mode];
    $('authSubtitle').textContent={login:'Todos os seus orçamentos, em qualquer dispositivo.',signup:'Crie um acesso para salvar seus pedidos na nuvem.',reset:'Enviaremos um link para seu e-mail.',recovery:'Escolha uma senha segura para sua conta.'}[mode];
    $('authPasswordWrap').hidden=mode==='reset';
    $('authEmailWrap').hidden=mode==='recovery';
    $('authAction').textContent={login:'Entrar',signup:'Criar conta',reset:'Enviar link de recuperação',recovery:'Atualizar senha'}[mode];
    $('authModeLinks').hidden=mode==='recovery';
    $('authMessage').textContent=message;
    $('authMessage').hidden=!message;
    $('authPass').setAttribute('autocomplete',mode==='signup'?'new-password':mode==='recovery'?'new-password':'current-password');
    $('authPass').required=mode!=='reset';
    $('authEmail').required=mode!=='recovery';
  }
  function showConfig(message=''){
    $('configGate').hidden=false;$('appShell').hidden=true;$('authGate').hidden=true;
    $('configMessage').textContent=message||'Conecte o Supabase preenchendo o arquivo config.js e executando o SQL fornecido.';
  }
  async function authSubmit(e){
    e.preventDefault();
    if(!db)return;
    const email=$('authEmail').value.trim(),password=$('authPass').value;
    $('authAction').disabled=true;$('authMessage').hidden=true;
    try{
      let result;
      if(authMode==='login')result=await db.auth.signInWithPassword({email,password});
      if(authMode==='signup')result=await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
      if(authMode==='reset')result=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      if(authMode==='recovery')result=await db.auth.updateUser({password});
      if(result?.error)throw result.error;
      if(authMode==='signup'&&!result.data?.session){showAuth('login','Conta criada! Confira seu e-mail para confirmar o cadastro antes de entrar.');}
      if(authMode==='reset')showAuth('login','Enviamos um link de recuperação, se o e-mail estiver cadastrado. Confira sua caixa de entrada.');
      if(authMode==='recovery'){recovering=false;showAuth('login','Senha atualizada. Você já pode entrar.');await db.auth.signOut();}
    }catch(err){$('authMessage').textContent=dbError(err);$('authMessage').hidden=false;}
    finally{$('authAction').disabled=false;}
  }
  async function routeAuth(event,session){
    if(event==='PASSWORD_RECOVERY'){recovering=true;showAuth('recovery');return;}
    if(recovering && session?.user)return;
    const user=session?.user||null;
    if(!user){
      activeUser=null;quotes=[];currentSessionUserId=null;
      if(realtimeChannel){db.removeChannel(realtimeChannel);realtimeChannel=null;}
      showAuth(authMode==='signup'?'signup':'login');return;
    }
    if(user.id===currentSessionUserId)return;
    if(realtimeChannel){db.removeChannel(realtimeChannel);realtimeChannel=null;}
    currentSessionUserId=user.id;activeUser=user;
    $('appShell').hidden=false;$('authGate').hidden=true;$('configGate').hidden=true;
    $('accountEmail').textContent=user.email||'Conta conectada';
    syncLabel('Conectando à nuvem...');
    await refreshQuotes(true);
    if(activeUser?.id!==user.id)return;
    realtimeChannel=db.channel(`quotes-${user.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'quotes',filter:`owner_id=eq.${user.id}`},scheduleRefresh)
      .subscribe();
  }
  async function startCloud(){
    const cfg=window.FEITO_SUPABASE||{};
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.url||'') || !cfg.publishableKey || /COLE|SUBSTITUA|SUA_CHAVE/.test(cfg.publishableKey)){
      showConfig();return;
    }
    if(!window.supabase?.createClient){showConfig('A biblioteca Supabase não carregou. Verifique sua conexão e recarregue a página.');return;}
    db=window.supabase.createClient(cfg.url.replace(/\/$/,''),cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    showAuth('login');
    db.auth.onAuthStateChange((event,session)=>{setTimeout(()=>routeAuth(event,session),0);});
    const {data,error}=await db.auth.getSession();
    if(error){showAuth('login',dbError(error));return;}
    await routeAuth('INITIAL_SESSION',data.session);
  }
  function initEvents(){
    document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
    $('newQuoteTop').addEventListener('click',()=>openNew());$('newQuoteMobile').addEventListener('click',()=>openNew());
    $('searchInput').addEventListener('input',render);
    $('priorityFilter').addEventListener('change',render);$('deadlineFilter').addEventListener('change',render);
    $('clearFilters').addEventListener('click',()=>{$('searchInput').value='';$('priorityFilter').value='all';$('deadlineFilter').value='all';render();});
    $('fQuantity').addEventListener('input',updateFormTotal);$('fUnitPrice').addEventListener('input',updateFormTotal);$('fUnitCost').addEventListener('input',updateFormTotal);
    $('quoteForm').addEventListener('submit',onSubmit);
    $('boardView').addEventListener('click',e=>{
      const add=e.target.closest('[data-add-status]');if(add){openNew(add.dataset.addStatus);return;}
      const card=e.target.closest('.quote-card');if(card)openEdit(card.dataset.id);
    });
    $('boardView').addEventListener('keydown',e=>{const card=e.target.closest('.quote-card');if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openEdit(card.dataset.id);}});
    let draggedId=null;
    $('boardView').addEventListener('dragstart',e=>{const card=e.target.closest('.quote-card');if(!card)return;draggedId=card.dataset.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedId);card.classList.add('dragging');});
    $('boardView').addEventListener('dragend',()=>{draggedId=null;document.querySelectorAll('.board-column').forEach(c=>c.classList.remove('drag-over'));});
    $('boardView').addEventListener('dragover',e=>{const col=e.target.closest('.board-column');if(!col)return;e.preventDefault();e.dataTransfer.dropEffect='move';document.querySelectorAll('.board-column').forEach(c=>c.classList.toggle('drag-over',c===col));});
    $('boardView').addEventListener('drop',e=>{const col=e.target.closest('.board-column');if(!col)return;e.preventDefault();const id=draggedId||e.dataTransfer.getData('text/plain');draggedId=null;moveQuote(id,col.dataset.status);document.querySelectorAll('.board-column').forEach(c=>c.classList.remove('drag-over'));});
    $('listView').addEventListener('click',e=>{if(e.target.id==='emptyNew')openNew();else{const row=e.target.closest('[data-id]');if(row)openEdit(row.dataset.id);}});
    $('listView').addEventListener('keydown',e=>{const tr=e.target.closest('[data-id]');if(tr&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openEdit(tr.dataset.id);}});
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeOverlay(b.dataset.close)));
    document.querySelectorAll('.modal-overlay').forEach(modal=>modal.addEventListener('click',e=>{if(e.target===modal&&modal.id!=='confirmOverlay')closeOverlay(modal.id);}));
    $('deleteQuote').addEventListener('click',()=>{
      const q=quotes.find(q=>q.id===editingId);if(!q)return;
      askConfirm('Excluir este orçamento?',`O pedido ${q.code} de ${q.client} será excluído permanentemente também na nuvem.`,async()=>{
        const success=await withWrite(async()=>{
          const {data,error}=await db.from('quotes').delete().eq('id',q.id).eq('owner_id',activeUser.id)
            .eq('updated_at',editingVersion).select('id').maybeSingle();
          if(error)throw error;
          if(!data)throw new Error('Este pedido mudou em outro dispositivo. Atualize e tente novamente.');
        });
        if(success){closeOverlay('quoteOverlay');toast('Orçamento excluído da nuvem.');}
      });
    });
    $('duplicateQuote').addEventListener('click',duplicateCurrent);
    $('copyQuote').addEventListener('click',()=>{const q=quotes.find(q=>q.id===editingId);if(q)copyText(quoteMessage(q));});
    $('whatsappQuote').addEventListener('click',whatsappCurrent);
    $('exportXlsx').addEventListener('click',exportExcel);
    $('exportJson').addEventListener('click',exportBackup);$('exportCsv').addEventListener('click',exportCSV);
    $('importButton').addEventListener('click',()=>{pendingImport=null;$('importFile').value='';$('importInfo').textContent='Nenhum arquivo selecionado.';$('confirmImport').disabled=true;openOverlay('importOverlay');});
    $('importFile').addEventListener('change',onImportFile);$('downloadTemplate').addEventListener('click',downloadTemplate);
    $('confirmImport').addEventListener('click',confirmImport);
    $('migrateLegacy').addEventListener('click',migrateLegacy);
    $('refreshCloud').addEventListener('click',()=>refreshQuotes(true));
    $('signOut').addEventListener('click',async()=>{if(!db)return;await db.auth.signOut();});
    $('authForm').addEventListener('submit',authSubmit);
    $('authSignup').addEventListener('click',()=>showAuth('signup'));
    $('authLogin').addEventListener('click',()=>showAuth('login'));
    $('authReset').addEventListener('click',()=>showAuth('reset'));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshQuotes();});
    window.addEventListener('online',()=>refreshQuotes(true));
    setInterval(()=>{if(!document.hidden)refreshQuotes();},45000);
    $('cancelConfirm').addEventListener('click',()=>{pendingConfirm=null;closeOverlay('confirmOverlay');});
    $('acceptConfirm').addEventListener('click',()=>{const fn=pendingConfirm;pendingConfirm=null;closeOverlay('confirmOverlay');if(fn)fn();});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){const open=document.querySelector('.modal-overlay:not([hidden])');if(open&&open.id!=='confirmOverlay')closeOverlay(open.id);return;}
      if(document.querySelector('.modal-overlay:not([hidden])'))return;
      const typing=/input|textarea|select/i.test(e.target?.tagName||'')||e.target.isContentEditable;
      if(!typing&&e.key.toLowerCase()==='n'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();openNew();}
      if(!typing&&e.key==='/'){e.preventDefault();$('searchInput').focus();}
    });
  }
  function init(){
    $('today').textContent=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
    $('fStatus').innerHTML=STATUSES.map(s=>`<option value="${s.id}">${s.label}</option>`).join('');
    initEvents();switchView('board');
    startCloud().catch(e=>showConfig(dbError(e)));
    if('serviceWorker'in navigator && window.location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
  init();
})();
