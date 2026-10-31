// Testa o Financeiro e o reaproveitamento de produtos na seleção do Estoque.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=dirname(fileURLToPath(import.meta.url));
const code=readFileSync(join(root,'studio-enhancements.js'),'utf8');
const user={id:'00000000-0000-4000-8000-000000000001'};
const quotes=[
  {id:'a',code:'FF-1',client:'Ana',product:'Chaveiro',quantity:8,unitPrice:5,unitCost:2,
    status:'finalizado',paymentStatus:'pago',paidAmount:40,
    calculatorData:{totals:{revenue:40,cost:14},items:[{name:'Chaveiro',materialType:'PLA',unitPrice:5}]}},
  {id:'b',code:'FF-2',client:'Bruna',product:'Escultura',quantity:2,unitPrice:50,unitCost:20,
    status:'aprovado',paymentStatus:'parcial',paidAmount:30,calculatorData:null}
];
const storage={studio_products:[],studio_inventory:[],studio_finance:[
  {id:'f1',owner_id:user.id,description:'Venda externa',type:'income',amount:10,category:'Outros',date:'2026-10-30'},
  {id:'f2',owner_id:user.id,description:'Energia paga',type:'expense',amount:5,category:'Energia',date:'2026-10-30'}
]};
const mockDB={from(table){
  assert(Object.hasOwn(storage,table),'Tabela inesperada: '+table);
  return {
    select(){return {eq(){return {order(){return {limit(){return Promise.resolve({data:storage[table].map(x=>({...x})),error:null});}};}};}};},
    upsert(records){
      for(const record of records){
        if(!storage[table].some(r=>r.owner_id===record.owner_id&&r.source_key===record.source_key))
          storage[table].push({id:'id-'+(storage[table].length+1),...record});
      }
      return Promise.resolve({error:null});
    }
  };
}};
class FakeElement {
  constructor(dataset={}){this.dataset=dataset;this.hidden=false;this.innerHTML='';this.textContent='';this.value='';this.listeners={};this.classList={remove(){},add(){},toggle(){}};}
  addEventListener(type,listener){this.listeners[type]=listener;}
  insertAdjacentHTML(_position,markup){this.innerHTML+=markup;}
  focus(){}
  fire(type='click'){return this.listeners[type]?.();}
}
const els=new Map();
const get=selector=>{if(!els.has(selector))els.set(selector,new FakeElement());return els.get(selector);};
const modules=['inventory','finance'].map(view=>new FakeElement({studioView:view}));
const pageButtons=['board','calculator'].map(view=>new FakeElement({view}));
const document={querySelector:get,querySelectorAll:selector=>selector==='[data-studio-view]'?modules:selector==='[data-view]'?pageButtons:[]};
const window={FeitoPlannerBridge:{client:()=>mockDB,user:()=>user,quotes:()=>quotes,newQuoteFromProduct(){}},addEventListener(){}};
vm.runInNewContext(code,{document,window,console,Number,String,Array,Object,Map,Set,Date,Intl,URL,setTimeout,clearTimeout},{filename:'studio-enhancements.js'});

await modules[0].fire();
assert.equal(storage.studio_products.length,2,'Produtos dos orçamentos não foram importados para o seletor de estoque');
assert(storage.studio_products.some(p=>p.name==='Chaveiro'&&p.price===5),'Item detalhado da calculadora não foi aproveitado');
assert(storage.studio_products.some(p=>p.name==='Escultura'&&p.price===50),'Item simples do pedido não foi aproveitado');
assert(get('#studioExtraContent').innerHTML.includes('Cadastrar item'),'O controle de estoque está ausente');
get('#studioExtraContent').listeners.click({target:{closest:()=>({dataset:{moduleAction:'add'}})}});
assert(get('#studioExtraContent').innerHTML.includes('st-saved-product'),'O cadastro de estoque não oferece seleção de produtos existentes');
assert(get('#studioExtraContent').innerHTML.includes('Chaveiro')&&get('#studioExtraContent').innerHTML.includes('Escultura'),'A seleção não lista produtos dos pedidos');
get('#studioExtraContent').listeners.change({target:{id:'st-saved-product',value:storage.studio_products[0].id}});
assert.equal(get('#st-field-name').value,'Chaveiro','Seleção do produto não preenche o nome');
assert.equal(get('#st-field-type').value,'Produto pronto','Seleção do produto não preenche o tipo');
assert.equal(get('#studioProductLinkHint').hidden,false,'Não foi indicado o vínculo do estoque com o produto');
await modules[0].fire();
assert.equal(storage.studio_products.length,2,'Atualizar o estoque criou produtos duplicados');

await modules[1].fire();
const finance=get('#studioExtraContent').innerHTML;
assert(finance.includes('Ana')&&finance.includes('Bruna'),'Financeiro não inclui todos os orçamentos');
assert(finance.includes('75,00'),'Saldo de caixa deveria ser 40 + 30 + 10 - 5 = R$ 75,00');
assert(finance.includes('70,00'),'A receber dos aprovados deveria ser R$ 70,00');
assert(finance.includes('86,00'),'Lucro previsto dos aprovados deveria ser (40-14) + (100-40) = R$ 86,00');
assert(finance.includes('26,00'),'Lucro estimado dos finalizados deveria ser R$ 26,00');
console.log('OK: Financeiro integrado, produtos dos pedidos importados sem duplicar e selecionáveis no Estoque.');
