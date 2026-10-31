// Teste de execução dos cálculos e do fluxo de orçamento sem depender do Supabase.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(join(root,'calculadora/index.html'),'utf8');
const source=readFileSync(join(root,'calculadora/assets/js/app.js'),'utf8');
const nodes=new Map();
const initial=new Map();
for(const match of html.matchAll(/<(input|textarea|select)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
  const tag=match[0],id=match[2],value=tag.match(/\bvalue="([^"]*)"/)?.[1]??'';
  initial.set(id,value);
}
initial.set('prod_material','PLA');
initial.set('prod_canal','marketplace');

class FakeElement {
  constructor(id=''){
    this.id=id;this.value=initial.get(id)??'';this.textContent='';this.innerHTML='';this.style={};
    this.dataset={};this.hidden=false;this.disabled=false;this.children=[];this.listeners=new Map();
    this.classList={add(){},remove(){},toggle(){},contains(){return false}};
  }
  addEventListener(type,fn){this.listeners.set(type,fn)}
  dispatch(type){this.listeners.get(type)?.({target:this})}
  setAttribute(){}removeAttribute(){}focus(){}replaceChildren(...nodes){this.children=nodes}
  append(...nodes){this.children.push(...nodes)}
  insertBefore(child){this.children.push(child)}
  insertAdjacentElement(_where,child){this.children.push(child)}
  closest(){return this}querySelector(){return this}
  get lastElementChild(){return this.children.at(-1)??null}
}
const get=id=>{if(!nodes.has(id))nodes.set(id,new FakeElement(id));return nodes.get(id)};
let onReady=null;
const document={
  documentElement:new FakeElement('html'),body:new FakeElement('body'),
  getElementById:get,createElement:()=>new FakeElement(),
  querySelectorAll:()=>[],querySelector:()=>new FakeElement(),
  addEventListener:(type,fn)=>{if(type==='DOMContentLoaded')onReady=fn}
};
const local=new Map();
const localStorage={getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,value)};
const location={search:'?embedded=1&user=00000000-0000-4000-8000-000000000001',origin:'https://local.test'};
const window={parent:{postMessage(){}},addEventListener(){},scrollTo(){},setTimeout(){},clearTimeout(){},confirm:()=>true};
const sandbox={document,window,location,localStorage,URLSearchParams,Intl,Date,Number,Math,
  Promise,Map,Set,Object,String,Boolean,Array,JSON,console,requestAnimationFrame(){},setTimeout(){},clearTimeout(){}};
vm.runInNewContext(source,sandbox,{filename:'calculadora/assets/js/app.js'});
assert.equal(typeof onReady,'function','Calculadora não registra a inicialização');
onReady();

assert.equal(get('priceUnit').textContent,'R$ 201,65','Preço sugerido padrão incorreto');
assert.equal(get('addItemBtn').disabled,false,'Botão adicionar fica bloqueado com dados válidos');
get('prod_peso').value='240';
get('prod_peso').dispatch('input');
assert.equal(get('priceUnit').textContent,'R$ 232,95','Alterar o peso não recalculou o preço');
get('addItemBtn').dispatch('click');
assert.equal(get('itemCount').textContent,'1','Produto não entrou no orçamento');
assert.equal(get('quoteRevenue').textContent,'R$ 232,95','Total da proposta não acompanha a calculadora');
assert.match(get('proposalPreview').innerHTML,/Feito em Forma/,'Proposta com login perdeu sua identidade');
console.log('OK: calculadora com login inicializa, recalcula e adiciona produto ao orçamento.');
