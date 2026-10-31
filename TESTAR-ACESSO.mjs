/* Regressão: o Planner não oferece mais acesso de visitante. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const homepage=read('index.html');
const planner=read('app.js');
const calculator=read('calculadora/assets/js/app.js');

for(const obsolete of ['guestAccess','guestGate','guestNoCloud','guestCalculator']){
  assert(!homepage.includes('id="'+obsolete+'"'),'Acesso de visitante ainda está disponível: '+obsolete);
}
assert(!planner.includes('function showGuest('),'Fluxo antigo de visitante ainda está ligado');
assert(!planner.includes('function leaveGuest('),'Fluxo antigo de visitante ainda está ligado');
assert.match(calculator,/if\(new URLSearchParams\(location\.search\)\.get\('guest'\)==='1'\)\{\s*location\.replace\('\.\.\/index\.html'\);\s*return;/);
console.log('OK: entrada exclusiva por login e rota antiga de visitante desativada.');
