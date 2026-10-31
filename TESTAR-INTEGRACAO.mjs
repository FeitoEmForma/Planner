// Verifica a integridade estrutural dos arquivos publicados.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const read=path=>readFileSync(join(root,path),'utf8');
const homepage=read('index.html'),planner=read('app.js'),extras=read('studio-enhancements.js');
const css=read('studio-enhancements.css');
const worker=read('service-worker.js');
const schema=read('ATIVAR-MODULOS-STUDIO.sql');
const correction=read('CORRIGIR-CALCULADORA-LOGIN.sql');
const coreSchema=read('BANCO-DE-DADOS.sql');
const calculator=read('calculadora/assets/js/app.js');
const productPlugin=read('calculadora/assets/js/catalogo.js');
const assets=[...homepage.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css|svg|png|webmanifest))"/g)].map(x=>x[1]);
for(const asset of assets){
  if(/^https?:/.test(asset))continue;
  assert(existsSync(join(root,asset)),'Arquivo referenciado não existe: '+asset);
}
const precached=[...worker.matchAll(/'\.\/([^']+)'/g)].map(x=>x[1]);
for(const asset of precached)assert(existsSync(join(root,asset)),'Arquivo do cache ausente: '+asset);
for(const page of ['inventory','finance']){
  assert(homepage.includes('data-studio-view="'+page+'"'),'Menu ausente: '+page);
  assert(extras.includes(page),'Módulo ausente: '+page);
}
assert(!homepage.includes('data-studio-view="catalog"'),'Catálogo permanece acessível na navegação');
assert(!homepage.includes('id="guestAccess"')&&!homepage.includes('id="guestGate"')&&!homepage.includes('id="guestNoCloud"'),'Modo visitante ainda aparece na entrada');
assert(homepage.includes('id="statusFilter"')&&homepage.includes('id="completionMonthFilter"'),'Filtros da etapa e do mês de fechamento ausentes');
assert(homepage.includes('id="exportFilteredXlsx"'),'Botão de extrair somente os filtros ausente');
assert(planner.includes('exportExcel(items)')&&planner.includes('const exportedQuotes=Array.isArray(selected)?selected:quotes'),'Extração filtrada não utiliza os registros visíveis');
assert(planner.includes("h.to==='finalizado'"),'Filtro mensal não verifica a data da conclusão');
assert(!homepage.includes('data-studio-view="tools"'),'Ferramentas 3D ainda aparecem no menu');
assert(!homepage.includes('data-studio-view="tools"'),'Ferramentas 3D ainda aparecem no menu');
for(const threeScript of ['mesh-tools.js','mesh-viewer.js','model-builder.js','tool-panel.js']){
  assert(!homepage.includes('src="'+threeScript+'"'),'O site continua carregando o laboratório 3D: '+threeScript);
  assert(!worker.includes("'./"+threeScript+"'"),'O cache continua instalando '+threeScript);
}
for(const id of ['mobileMenuToggle','mobileMenuClose','mobileNavScrim','appSidebar','mobileStage','workspaceToolbar']){
  assert(homepage.includes('id="'+id+'"'),'Navegação mobile incompleta: '+id);
}
assert(homepage.includes('class="mobile-shortcuts"'),'Acessos rápidos mobile ausentes');
assert(planner.includes('mobile-menu-open'),'Abertura e fechamento do menu mobile ausentes');
assert(planner.includes('board-one-stage'),'Filtro de etapas mobile não foi implementado');
assert(read('style.css').includes('.report-ring'),'Gráfico circular de fechamento não foi implementado');
assert(planner.includes('report-months'),'Gráfico mensal de fechamentos ausente');
assert(planner.includes('report-margin-value'),'Gráfico da margem de lucro ausente');
assert(homepage.includes('id="studioExtraContent"'),'Área de integração ausente');
assert(planner.includes('window.FeitoPlannerBridge'),'Ponte de sessão não instalada');
assert(extras.includes('st-saved-product')&&extras.includes('applySavedProduct'),'Seleção de produtos no estoque está ausente');
assert(css.includes('.studio-finance-kpis'),'Estilos financeiros não foram criados');
assert(extras.includes('bridge?.quotes?.()'),'Financeiro não lê os orçamentos da conta');
assert(extras.includes('importQuoteProducts'),'Produtos dos pedidos não são aproveitados pelo estoque');
assert(extras.includes('catalog_product_id'),'Estoque não é vinculado aos produtos já salvos');
assert(calculator.includes("location.replace('../index.html')"),'Rota antiga do visitante ainda está acessível');
assert(productPlugin.includes("from('studio_products')"),'Calculadora ainda usa catálogo separado');
assert(!productPlugin.includes("from('catalog_products')"),'Fonte legada não foi substituída');
for(const table of ['studio_inventory','studio_finance','studio_products']){
  assert(schema.includes('public.'+table),'Tabela ausente: '+table);
}
for(const column of ['product_data','source_key','catalog_product_id']){
  assert(schema.includes(column),'Atualização do banco ausente: '+column);
}
assert(schema.includes('enable row level security'),'RLS ausente');
assert(schema.includes('auth.uid()'),'Restrição por usuário ausente');
for(const [label,sql] of [['instalação',schema],['correção',correction],['banco inicial',coreSchema]]){
  assert(/add column if not exists calculator_data jsonb/i.test(sql),`Coluna calculator_data ausente em ${label}`);
}
const whatsApp=calculator.slice(calculator.indexOf('async function sendWhatsApp()'));
assert(whatsApp.includes('newTab.location.replace(url)'),'Não abre o WhatsApp');
assert(whatsApp.indexOf('newTab.location.replace(url)')<whatsApp.indexOf("await plannerRequest('draft')"),'WhatsApp não pode depender do salvamento online');
assert(!whatsApp.includes('newTab.close()'),'O botão WhatsApp não pode fechar a mensagem por erro de banco');
console.log('OK: navegação, arquivos, banco e integração verificados.');
