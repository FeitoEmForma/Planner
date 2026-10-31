/* Regressão dos filtros usados na tela e na extração de planilha. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const match=source.match(/  function filteredQuotes\(\)\{([\s\S]*?)\n  \}\n  function quoteCard\(/);
assert(match,'Não foi possível localizar a filtragem original');

const fields={searchInput:'',priorityFilter:'all',deadlineFilter:'all',statusFilter:'finalizado',completionMonthFilter:''};
const quotes=[
  {code:'FF-1',client:'Ana',product:'Chaveiro',priority:'media',status:'finalizado',updatedAt:'2026-10-25T10:00:00Z',history:[{to:'finalizado',at:'2026-10-15T09:00:00Z'}]},
  {code:'FF-2',client:'Bruna',product:'Placa',priority:'alta',status:'finalizado',updatedAt:'2026-10-30T10:00:00Z',history:[{to:'finalizado',at:'2026-09-29T09:00:00Z'}]},
  {code:'FF-3',client:'Carla',product:'Boneco',priority:'media',status:'enviado',updatedAt:'2026-10-26T10:00:00Z',history:[]},
  {code:'FF-4',client:'Daniel',product:'Logo',priority:'alta',status:'finalizado',updatedAt:'2026-10-28T10:00:00Z',history:[]}
];
const context={quotes,currentView:'list',$:id=>({value:fields[id]}),normalize:x=>String(x||'').toLowerCase(),isLate:()=>false,isSoon:()=>false,followupDue:()=>false,byDate:()=>0};
vm.createContext(context);
vm.runInContext('function filteredQuotes(){'+match[1]+'\n};this.filteredQuotes=filteredQuotes',context);

assert.equal(context.filteredQuotes().length,3,'Finalizados devem ignorar propostas em outras etapas');
fields.completionMonthFilter='2026-10';
assert.deepEqual(Array.from(context.filteredQuotes(),q=>q.code),['FF-1','FF-4'],'O mês deve considerar o fechamento, não a criação');
fields.priorityFilter='alta';
assert.deepEqual(Array.from(context.filteredQuotes(),q=>q.code),['FF-4'],'Prioridade e mês devem funcionar juntos');
fields.searchInput='ana';
assert.equal(context.filteredQuotes().length,0,'Busca precisa combinar com os outros filtros');
fields.searchInput='';fields.priorityFilter='all';fields.completionMonthFilter='';fields.statusFilter='all';
assert.equal(context.filteredQuotes().length,4,'Todas as etapas deve trazer todos os orçamentos');

const excel=source.slice(source.indexOf('async function exportExcel('),source.indexOf('function getCellValue('));
assert.match(excel,/const exportedQuotes=Array\.isArray\(selected\)\?selected:quotes/);
assert.match(excel,/for\(const q of exportedQuotes\)/);
assert.match(excel,/exportExcel\(items\)/);
console.log('OK: filtros combinados de etapa, mês de conclusão, busca e prioridade; exportação usa apenas resultados filtrados.');
