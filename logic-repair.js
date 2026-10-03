(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
function category(row){const text=String(row.concepto||row.concept||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),old=row.categoria||row.category;
 if(['Otros','Luz','Gas','Seguro'].includes(old)){
  if(/seguro.*(hogar|vivienda)|seguro de hogar/.test(text))return 'Seguro';
  if(/\bgas\b/.test(text)&&!/gasolina/.test(text))return 'Gas';
  if(old==='Otros'&&/\bibi\b|impuesto.*bienes inmuebles/.test(text))return 'Impuestos';
  if(old==='Otros'&&/comunidad|derrama/.test(text))return 'Comunidad';
  if(old==='Otros'&&/suministro.*agua|recibo.*agua/.test(text))return 'Agua';
  if(old==='Otros'&&/electricidad|suministro.*luz/.test(text))return 'Luz';
 }
 return old;
}
function repair(input,ledger,today){const data=copy(input),expenses=copy(ledger),K=root.DonRamonContracts||require('./contracts.js'),D=root.DonRamonDepositCore||require('./deposits-core.js');
 // Only the owner-confirmed August extension, with the exact original period and receipt.
 const tenant=(data.inquilinas||[]).find(t=>t.id===JSON.parse(localStorage.getItem('donRamonPersonalFiscalV1')||'{}').extensionTenantId),original=tenant?.contratos?.find(c=>Number(c.habitacion)===5&&c.exitDate==='2026-07-30'),august=(data.cobrosByMonth?.['2026-08']||[]).filter(r=>r.inquilinaId===tenant?.id&&Number(r.habitacion)===5);
 if(original&&august.length){const id='prorroga_'+original.id+'_2026_08';if(!tenant.contratos.some(c=>c.id===id))tenant.contratos.push({id,habitacion:5,entryDate:'2026-08-01',exitDate:'2026-08-31',rentaAcordada:650,fianzaImporte:650,estadoContrato:'finalizado',tipoAcuerdo:'Prórroga acordada sin nuevo contrato firmado',prorrogaDe:original.id,confirmacion:'Confirmado por José el 03/10/2026',docs:[]});for(const row of august)if(!row.contratoId)row.contratoId=id;
 const deposit=data.fianzasV2?.records?.find(r=>r.inquilinaId===tenant.id&&(r.contratos||[]).includes(original.id));if(deposit&&!deposit.contratos.includes(id))deposit.contratos.push(id);
 K.project(tenant,today);
 }
 for(const rows of Object.values(expenses))for(const row of rows){const next=category(row);if(next!==row.categoria){row.categoryCorrections??=[];row.categoryCorrections.push({previous:row.categoria,next,reason:'Clasificación por concepto del recibo'});row.categoria=next;}}
 data.objectiveRatesByYear??={};const defaults=[850,800,800,750,700],current=today.slice(0,4);for(let year=2025;year<=Number(current);year++)if(!data.objectiveRatesByYear[year])data.objectiveRatesByYear[year]=Object.fromEntries(defaults.map((price,i)=>[i+1,Number(data.habitacionesInfo?.[i+1]?.precio??price)]));
 data.objectiveRatesByYear[current]=Object.fromEntries(defaults.map((price,i)=>[i+1,Number(data.habitacionesInfo?.[i+1]?.precio??price)]));
 return {data:D.ensure(data),expenses};
}
function migrate(storage,today){const main=storage.getItem('donRamonV5');if(!main)return false;const rawExpenses=storage.getItem('donRamonGastosReal')||'{}',before=JSON.parse(main),ledger=JSON.parse(rawExpenses),next=repair(before,ledger,today),newMain=JSON.stringify(next.data),newExpenses=JSON.stringify(next.expenses);if(newMain===main&&newExpenses===rawExpenses)return false;
 storage.setItem('donRamonBeforeLogicRepairV1',JSON.stringify({main,expenses:rawExpenses}));try{storage.setItem('donRamonV5',newMain);storage.setItem('donRamonGastosReal',newExpenses);}catch(error){storage.setItem('donRamonV5',main);storage.setItem('donRamonGastosReal',rawExpenses);throw error;}return true;
}
const api={category,repair,migrate};root.DonRamonLogicRepair=api;if(typeof module==='object')module.exports=api;
if(root.document&&root.localStorage)try{migrate(root.localStorage,new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date()));}catch(e){console.error('No se pudo guardar la revisión de lógica',e);}
})(typeof window==='object'?window:globalThis);
