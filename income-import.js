(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function eligible(file){const result=clone(file),old=result.entries.filter(e=>e.month<'2025-06');result.entries=result.entries.filter(e=>e.month>='2025-06');result.excludedSourceIds=[...new Set([...(result.excludedSourceIds||[]),...old.map(e=>e.sourceId)])];return result;}
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\ballisa\b/g,'alisa').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const period=(y,m)=>{if(!Number.isInteger(Number(y))||Number(y)<2000||Number(y)>2100||!Number.isInteger(Number(m))||Number(m)<1||Number(m)>12)throw Error('Mes o año de ingreso inválido.');return y+'-'+String(m).padStart(2,'0');};
function parse(file){
 if(file?.format==='don-ramon-income'&&file.version===1){validate(file);return eligible(file);}
 if(file?.exportType!=='alquileres-firestore-data')throw Error('Selecciona el JSON de ingresos o la exportación de Firebase.');
 const col=file.household?.collections,rows=k=>(col?.[k]?.documents||[]).map(x=>({...x.data,id:x.id}));
 const tenants=Object.fromEntries(rows('tenants').map(x=>[x.id,x])),contracts=Object.fromEntries(rows('contracts').map(x=>[x.id,x])),rooms=Object.fromEntries(rows('rooms').map(x=>[x.id,x]));
 const agreements=rows('monthlyAgreements'),entries=[],excluded=[];
 for(const p of rows('payments')){
  if(p.excludedFromTotals||p.isDuplicate||p.status==='duplicado'){excluded.push(p.id);continue;}
  if(!['paid','pagado'].includes(p.status))throw Error('Hay un cobro con estado sin reconocer.');
  const c=contracts[p.contractId],tid=p.tenantId||c?.tenantId,t=tenants[tid],r=rooms[p.roomId],match=agreements.filter(a=>(a.tenantId||contracts[a.contractId]?.tenantId)===tid&&Number(a.year)===Number(p.year)&&Number(a.month)===Number(p.month));
  if(match.length>1)throw Error('Hay más de un acuerdo para una inquilina y mes.');
  const room=Number(r?.name?.match(/\d+/)?.[0]);
  entries.push({sourceId:p.id,sourceTenantId:tid,name:t?.fullName||'',room,month:period(p.year,p.month),amount:Number(p.paidAmount),expectedAmount:Number(match[0]?.agreedAmount??p.expectedAmount),date:p.paymentDate||'',method:p.paymentMethod||'Sin indicar',notes:p.notes||'',agreement:match[0]?{amount:Number(match[0].agreedAmount),reason:match[0].reason||match[0].notes||'Acuerdo mensual'}:null,kind:'cash'});
 }
 // Compensation is a reference to reconcile, never a second cash receipt.
 for(const d of rows('deposits'))if(d.retained&&(d.compensationMonth||d.compensation_month)){
  const tid=d.tenantId||contracts[d.contractId]?.tenantId;
  entries.push({sourceId:'deposit:'+d.id,sourceTenantId:tid,name:tenants[tid]?.fullName||'',room:Number(rooms[d.roomId]?.name?.match(/\d+/)?.[0]),month:period(d.compensationYear||d.compensation_year,d.compensationMonth||d.compensation_month),amount:Number(d.amount)-Number(d.returnedAmount||0),expectedAmount:Number(d.amount),date:d.retainedAt||'',method:'Compensación de fianza',notes:d.notes||'',kind:'compensation'});
 }
 const result={format:'don-ramon-income',version:1,source:'Firebase',generatedAt:file.generatedAt,excludedSourceIds:excluded,entries};validate(result);return eligible(result);
}
function validate(file){if(!Array.isArray(file.excludedSourceIds)||!Array.isArray(file.entries)||file.entries.length>10000)throw Error('Lista de ingresos inválida.');const ids=new Set();for(const e of file.entries){if(!e.sourceId||ids.has(e.sourceId)||!e.sourceTenantId||!e.name||!Number.isInteger(e.room)||e.room<1||e.room>5||!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.month)||!Number.isFinite(e.amount)||e.amount<0||!Number.isFinite(e.expectedAmount)||e.expectedAmount<0||!['cash','compensation'].includes(e.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||typeof e.method!=='string')throw Error('Ingreso incompleto, repetido o inválido.');if(e.agreement&&(!Number.isFinite(e.agreement.amount)||e.agreement.amount<0))throw Error('Acuerdo mensual inválido.');ids.add(e.sourceId);}}
function candidate(data,e){const exact=data.inquilinas.filter(t=>t.id===e.sourceTenantId||norm(t.nombre)===norm(e.name));if(exact.length===1)return exact[0].id;const tokens=norm(e.name).split(' '),subset=data.inquilinas.filter(t=>{const words=norm(t.nombre).split(' ');return tokens.length>=3&&tokens.every(w=>words.includes(w));});return subset.length===1?subset[0].id:'';}
function plan(data,file,mapping={}){validate(file);const K=root.DonRamonContracts,C=root.DonRamonDepositCore;return eligible(file).entries.map(e=>{
 const tenantId=mapping[e.sourceTenantId]??candidate(data,e),tenant=data.inquilinas.find(t=>t.id===tenantId);if(!tenant)return {e,tenantId:'',type:'unmatched',message:'Selecciona la inquilina de la aplicación.'};
 const matches=(data.cobrosByMonth?.[e.month]||[]).filter(r=>Number(r.habitacion)===e.room||r.inquilinaId===tenantId),existing=matches.find(r=>r.inquilinaId===tenantId)||matches[0];
 const comp=data.compensaciones?.[e.month]?.[e.room],ledger=(data.fianzasV2?.records||[]).filter(r=>r.inquilinaId===tenantId).flatMap(r=>r.movimientos||[]).filter(m=>m.tipo==='compensacion'&&C.imputationMonth(m)===e.month);
 const compensated=comp&&(!comp.inquilinaId||comp.inquilinaId===tenantId)?Number(comp.importe||0):ledger.reduce((sum,m)=>sum+Number(m.aplicado||0),0);
 const contract=K.list(tenant).find(c=>Number(c.habitacion)===e.room&&c.entryDate?.slice(0,7)<=e.month&&(c.fechaSalidaReal||c.exitDate||'9999').slice(0,7)>=e.month);
 let type='new',message='Nuevo ingreso';
 if(e.kind==='compensation'){type='protected';message=compensated===e.amount?'Compensación ya registrada. Se omite para no duplicarla.':'Compensación de fianza: requiere revisión; no se importa como cobro.';}
 else if(compensated>0){type='protected';message='Este mes ya tiene una compensación de fianza. Se omite para revisión.';}
 else if(matches.length>1){type='protected';message='Hay varios registros en este mes/habitación. Requiere revisión.';}
 else if(existing&&existing.inquilinaId&&existing.inquilinaId!==tenantId&&existing.inquilinaId!=='h'+e.room){type='protected';message='La habitación tiene un ingreso de otra inquilina. Requiere revisión.';}
 else if(data.incomeImportLog?.some(x=>x.sourceId===e.sourceId)){type='duplicate';message='Este registro ya fue importado.';}
 else if(existing&&existing.status!=='pendiente'){type='duplicate';message='Posible duplicado: ya existe un cobro de esta inquilina y mes.';}
 if(!contract&&type==='new')message+=' · Sin contrato histórico coincidente; se conservará la inquilina y habitación seleccionadas.';
 return {e,tenantId,contractId:contract?.id||null,existing,type,message};
 });}
function apply(data,file,mapping,choices){const next=clone(data),items=plan(data,file,mapping);next.cobrosByMonth??={};next.incomeImportLog??=[];next.acuerdosIngresos??={};let imported=0;
 const selected=new Set();for(const item of items){const {e,tenantId,contractId,existing,type}=item,choice=choices[e.sourceId]||(type==='new'?'import':'skip');if(choice==='skip')continue;if(type==='protected'||type==='unmatched')throw Error('Resuelve la inquilina o conserva la omisión del registro protegido.');if(type==='duplicate'&&!['update','add'].includes(choice))throw Error('Debes elegir qué hacer con el posible duplicado.');if(!['import','update','add'].includes(choice))throw Error('Acción inválida.');const key=tenantId+'|'+e.month;if(selected.has(key))throw Error('El archivo contiene varios cobros para la misma inquilina y mes; revísalos por separado.');selected.add(key);
 const list=next.cobrosByMonth[e.month]??=[],index=existing?list.findIndex(r=>r.habitacion===existing.habitacion&&r.inquilinaId===existing.inquilinaId):-1;
 if(choice==='add'&&!existing)throw Error('El cobro original ya no existe; revisa el ingreso.');
 const amount=choice==='add'?e.amount+(existing.status==='parcial'?Number(existing.importeParcial||0):Number(existing.amount||0)):e.amount;
 const row={...(existing||{}),habitacion:e.room,inquilinaId:tenantId,contratoId:contractId||existing?.contratoId||null,status:'cobrado',amount,fechaAbono:e.date,metodo:e.method,notas:e.notes,importePrevisto:e.expectedAmount};
 if(index>=0)list[index]=row;else list.push(row);
 if(e.agreement){next.acuerdosIngresos[e.month]??={};next.acuerdosIngresos[e.month][e.room]={inquilinaId:tenantId,amount:e.agreement.amount,reason:e.agreement.reason};}
 next.incomeImportLog.push({sourceId:e.sourceId,month:e.month,tenantId,choice,amount:e.amount,previous:existing||null,importedAt:new Date().toISOString()});imported++;
 }return {data:next,imported};}
const api={parse,validate,plan,apply,candidate};root.DonRamonIncomeImport=api;if(typeof module==='object')module.exports=api;
})(typeof window==='object'?window:globalThis);
