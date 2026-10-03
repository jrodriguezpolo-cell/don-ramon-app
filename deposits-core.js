(function(root){
'use strict';
const contracts=typeof module==='object'?require('./contracts.js'):root.DonRamonContracts;
const copy=x=>JSON.parse(JSON.stringify(x));
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const cents=x=>Math.round(Number(x||0)*100);
const money=x=>cents(x)/100;
function balance(record){return record.recibida?Math.max(0,money(record.importeRecibido-(record.movimientos||[]).reduce((sum,m)=>sum+Number(m.devuelto||0)+Number(m.aplicado||0),0))):0;}
function project(data){
 for(const t of data.inquilinas||[]){const r=data.fianzasV2.records.find(r=>r.inquilinaId===t.id&&r.contratos.includes(t.contratoActualId))||data.fianzasV2.records.find(r=>r.id===t.fianza?.registroId);if(!r)continue;const pending=balance(r);t.fianza={...t.fianza,registroId:r.id,importe:pending,importeOriginal:r.importeRecibido,fecha:r.fechaIngreso||'',metodo:r.medioIngreso||'Sin indicar',estado:!r.recibida?'pendiente':pending>0?'retenida':(r.movimientos.some(m=>m.aplicado>0)?'compensada':'devuelta'),contratoId:r.contratoId};}
 return data;
}
function ensure(input,history=[]){
 const data=copy(input);data.fianzasV2=data.fianzasV2||{version:2,records:[]};
 for(const t of data.inquilinas||[]){
  const agreement=contracts.list(t).find(c=>c.id===t.contratoActualId)||contracts.current(t,new Date().toISOString().slice(0,10));if(!agreement)continue;
  const prior=data.fianzasV2.records.find(r=>r.id===t.fianza?.registroId),previousForOwner=data.fianzasV2.records.some(r=>r.inquilinaId===t.id);
  const existing=data.fianzasV2.records.find(r=>r.inquilinaId===t.id&&r.contratos.includes(agreement.id))||(prior&&balance(prior)>0?prior:null);
  if(existing){if(!existing.contratos.includes(agreement.id)){existing.contratos.push(agreement.id);existing.contratoId=agreement.id;existing.habitacion=Number(agreement.habitacion);}continue;}
  const f=previousForOwner?{importe:Number(agreement.fianzaImporte||0),estado:'pendiente',fecha:'',metodo:'Sin indicar'}:t.fianza||{},matches=(previousForOwner?[]:history).filter(entry=>entry.inquilinaId===t.id||!entry.inquilinaId&&norm(entry.inquilinaNombre)===norm(t.nombre));
  const original=Math.max(Number(f.importe||0),Number(f.importeOriginal||0),...matches.map(m=>Number(m.importeRetenidoOriginal||0)));
  const r={id:'fianza_'+t.id+'_'+agreement.id,inquilinaId:t.id,nombre:t.nombre,contratoId:agreement.id,contratos:[agreement.id],habitacion:Number(agreement.habitacion),importeRecibido:original||(['devuelta','compensada'].includes(f.estado)?Number(agreement.fianzaImporte||0):0),importeAcordado:Number(agreement.fianzaImporte||0),recibida:['retenida','devuelta','compensada'].includes(f.estado),fechaIngreso:f.fecha||'',medioIngreso:f.metodo||'Sin indicar',movimientos:[],legacy:copy(f)};
  for(const m of matches)if(m.tipo!=='compensar')r.movimientos.push({id:m.id||'legacy_'+r.movimientos.length,tipo:'devolucion',devuelto:Number(m.importeDevuelto||0),aplicado:0,fecha:m.fechaDevolucion||'',habitacion:Number(m.habId||r.habitacion),medio:m.medio||'Sin indicar',motivo:m.motivo||'',notas:m.notas||'',legacy:true});
  for(const [period,rooms] of Object.entries(previousForOwner?{}:data.compensaciones||{}))for(const [room,entry] of Object.entries(rooms)){
   const owner=contracts.occupantAt(data.inquilinas||[],room,period);
   if(entry.inquilinaId?entry.inquilinaId!==t.id:owner?.id!==t.id)continue;
   const rows=data.cobrosByMonth?.[period]||[];
   r.movimientos.push({id:'legacy_comp_'+period+'_'+room,tipo:'compensacion',devuelto:0,aplicado:Number(entry.importe||0),fecha:entry.fecha||'',periodoDeuda:period,habitacion:Number(room),medio:'Compensación',motivo:entry.motivo||'Impago',legacy:true,contabilizadoEnCobro:rows.some(row=>Number(row.habitacion)===Number(room)&&row.status==='cobrado')});
  }
  if(f.estado==='devuelta'&&!r.movimientos.length)r.movimientos.push({id:'legacy_devuelta_'+t.id,tipo:'devolucion',devuelto:r.importeRecibido,aplicado:0,fecha:f.fechaDevolucion||'',medio:f.medioDevolucion||'Sin indicar',motivo:'Devolución registrada anteriormente',legacy:true});
  if(f.estado==='compensada'&&!r.movimientos.length)r.movimientos.push({id:'legacy_aplicada_'+t.id,tipo:'compensacion',devuelto:0,aplicado:r.importeRecibido,fecha:f.fechaCompensacion||'',medio:'Compensación',motivo:'Compensación registrada anteriormente',legacy:true});
  // A legacy partial refund already reduced the scalar balance. Preserve its recorded remaining liability.
  if(f.estado==='retenida'&&matches.length)r.importeRecibido=Math.max(r.importeRecibido,Number(f.importe||0)+r.movimientos.reduce((sum,m)=>sum+m.devuelto+m.aplicado,0));
  data.fianzasV2.records.push(r);
 }
 return project(data);
}
function record(data,id){const r=data.fianzasV2?.records.find(r=>r.id===id);if(!r)throw Error('No se encuentra esta fianza.');return r;}
function summary(data){const rows=data.fianzasV2?.records||[];return {total:money(rows.reduce((sum,r)=>sum+balance(r),0)),count:rows.filter(r=>balance(r)>0).length};}
function saveReceipt(input,id,v){
 const data=copy(input),r=record(data,id),amount=Number(v.importe);
 if(v.importe===''||!Number.isFinite(amount)||amount<0)throw Error('Indica un importe válido.');
 const used=r.movimientos.reduce((sum,m)=>sum+m.devuelto+m.aplicado,0);if(cents(amount)<cents(used))throw Error('El importe recibido no puede ser menor que lo ya gestionado.');
 if(v.fecha&&!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha))throw Error('Indica una fecha válida.');
 if(!['Transferencia','Bizum','Efectivo','Sin indicar'].includes(v.metodo))throw Error('Selecciona el medio de ingreso.');
 if(!v.recibida&&used>0)throw Error('Esta fianza ya tiene devoluciones o aplicaciones registradas.');
 r.importeRecibido=money(amount);r.recibida=!!v.recibida;r.fechaIngreso=v.fecha||'';r.medioIngreso=v.metodo;return project(data);
}
function receipt(data,room,month,cutoff){
 const stay=contracts.occupantAt(data.inquilinas||[],room,month),rows=(data.cobrosByMonth?.[month]||[]).filter(r=>Number(r.habitacion)===Number(room)&&(!cutoff||month<=cutoff.slice(0,7)&&(!r.fechaAbono||r.fechaAbono<=cutoff))),row=rows.find(r=>['cobrado','parcial'].includes(r.status))||rows[0];
 const raw=data.compensaciones?.[month]?.[room],comp=raw&&(!raw.inquilinaId||raw.inquilinaId===stay?.id)&&(!cutoff||month<=cutoff.slice(0,7)&&(!raw.fecha||raw.fecha<=cutoff))?raw:null;
 const cash=money(rows.reduce((sum,r)=>sum+(r.status==='cobrado'?Number(r.amount||0):r.status==='parcial'?Number(r.importeParcial||0):0),0));
 const moves=(data.fianzasV2?.records||[]).flatMap(record=>(record.movimientos||[]).filter(m=>m.tipo==='compensacion'&&imputationMonth(m)===month&&Number(m.habitacion||record.habitacion)===Number(room)&&(!cutoff||month<=cutoff.slice(0,7)&&(!m.fecha||m.fecha<=cutoff))));
 const applied=moves.length?moves.filter(m=>!m.contabilizadoEnCobro).reduce((sum,m)=>sum+Number(m.aplicado||0),0):comp&&!rows.some(r=>r.status==='cobrado')?Number(comp.importe||0):0;
 const received=money(cash+applied),override=data.acuerdosIngresos?.[month]?.[room],duty=contracts.obligations(data)[month]?.[room],rent=Number(duty?.amount??(override&&override.inquilinaId===stay?.id?override.amount:rows.find(r=>Number.isFinite(r.importePrevisto))?.importePrevisto??stay?.rentaAcordada??0));
 const receiptTenant=!stay&&row?.inquilinaId?(data.inquilinas||[]).find(t=>t.id===row.inquilinaId):null;
 return {occupant:stay||receiptTenant,rent,received,cash,settled:rent>0&&cents(received)>=cents(rent),partial:received>0&&cents(received)<cents(rent),date:comp?.fecha||row?.fechaAbono||'',method:applied&&cash?'Cobro y compensación de fianza':applied?'Compensación de fianza':row?.metodo||'',row,compensation:comp,vigencia:stay?`${stay.entryDate||'Sin indicar'} · ${stay.fechaSalidaReal||stay.exitDate||'Sin indicar'}`:'Contrato sin enlazar'};
}
function settle(input,id,v){
 const data=copy(input),r=record(data,id);if(r.movimientos.some(m=>m.id===v.id))return data;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha||''))throw Error('Indica la fecha de la operación.');
 const dev=Number(v.devuelto||0),applied=Number(v.aplicado||0),remaining=balance(r);
 if(!Number.isFinite(dev)||!Number.isFinite(applied)||dev<0||applied<0||dev+applied<=0||cents(dev+applied)>cents(remaining))throw Error('La devolución y la aplicación deben caber en el saldo pendiente.');
 if(dev>0&&!['Transferencia','Bizum','Efectivo'].includes(v.medio))throw Error('Selecciona el medio de devolución.');
 if(applied>0&&!String(v.motivo||'').trim())throw Error('Indica el motivo del importe que te quedas.');
 let room=r.habitacion;
 if(v.tipo==='compensacion'){
  if(dev>0||!/^\d{4}-\d{2}$/.test(v.periodoDeuda||''))throw Error('Selecciona el mes de la deuda.');
  const tenant=data.inquilinas.find(t=>t.id===r.inquilinaId),agreement=contracts.list(tenant).find(c=>r.contratos.includes(c.id)&&c.entryDate?.slice(0,7)<=v.periodoDeuda&&(c.fechaSalidaReal||c.exitDate||'9999-12-31').slice(0,7)>=v.periodoDeuda);
  if(!agreement)throw Error('El mes de deuda no pertenece a esta inquilina y contrato.');room=Number(agreement.habitacion);
  const duty=contracts.obligations(data)[v.periodoDeuda]?.[room],parts=duty?.components?.filter(p=>p.inquilinaId===r.inquilinaId)||[];if(!parts.length)throw Error('La deuda corresponde a otra inquilina.');
  const ownerRent=parts.reduce((s,p)=>s+p.amount,0),ownerCash=(data.cobrosByMonth?.[v.periodoDeuda]||[]).filter(x=>Number(x.habitacion)===room&&(x.inquilinaId===r.inquilinaId||(!x.inquilinaId||/^h[1-5]$/.test(x.inquilinaId))&&contracts.occupantAt(data.inquilinas,room,v.periodoDeuda)?.id===r.inquilinaId)).reduce((s,x)=>s+(x.status==='cobrado'?Number(x.amount):x.status==='parcial'?Number(x.importeParcial):0),0),ownerApplied=data.fianzasV2.records.filter(x=>x.inquilinaId===r.inquilinaId).flatMap(x=>x.movimientos).filter(m=>m.tipo==='compensacion'&&imputationMonth(m)===v.periodoDeuda&&Number(m.habitacion)===room&&!m.contabilizadoEnCobro).reduce((s,m)=>s+Number(m.aplicado),0);
  if(cents(applied)>cents(Math.max(0,ownerRent-ownerCash-ownerApplied)))throw Error('El importe supera el alquiler pendiente de ese mes.');
  data.compensaciones=data.compensaciones||{};const rooms=data.compensaciones[v.periodoDeuda]??={};
  rooms[room]={...rooms[room],importe:money(Number(rooms[room]?.importe||0)+applied),fecha:v.fecha,medio:'Compensación',motivo:v.motivo,inquilinaId:r.inquilinaId,contratoId:agreement.id,saldoActualizado:true};
 }
 r.movimientos.push({id:v.id||'operacion_'+Date.now(),tipo:v.tipo||'devolucion',devuelto:money(dev),aplicado:money(applied),fecha:v.fecha,medio:dev>0?v.medio:'Aplicación de fianza',motivo:v.motivo||'',notas:v.notas||'',periodoDeuda:v.periodoDeuda||'',habitacion:room});
 return project(data);
}
function editMovement(input,id,movementId,v){const data=copy(input),r=record(data,id),m=r.movimientos.find(m=>m.id===movementId);if(!m)throw Error('No se encuentra la operación.');if(!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha||''))throw Error('Indica la fecha de la operación.');m.fecha=v.fecha;if(m.tipo==='compensacion'&&m.periodoDeuda){const entry=data.compensaciones?.[m.periodoDeuda]?.[m.habitacion];if(entry?.inquilinaId===r.inquilinaId)entry.fecha=v.fecha;}m.medio=v.medio||m.medio;m.motivo=v.motivo||m.motivo;m.notas=v.notas??m.notas;return project(data);}
function imputationMonth(m){return m.tipo==='compensacion'&&/^\d{4}-\d{2}$/.test(m.periodoDeuda||'')?m.periodoDeuda:m.fecha?.slice(0,7)||'';}
function applicationIncome(data,month,cutoff){return money((data.fianzasV2?.records||[]).reduce((sum,r)=>sum+r.movimientos.filter(m=>imputationMonth(m)===month&&!m.contabilizadoEnCobro&&(!cutoff||month<=cutoff.slice(0,7)&&(!m.fecha||m.fecha<=cutoff))).reduce((n,m)=>n+Number(m.aplicado||0),0),0));}
function monthlyIncome(data,month,cutoff){if(cutoff&&month>cutoff.slice(0,7))return 0;const cash=(data.cobrosByMonth?.[month]||[]).reduce((sum,row)=>sum+(cutoff&&row.fechaAbono&&row.fechaAbono>cutoff?0:row.status==='cobrado'?Number(row.amount||0):row.status==='parcial'?Number(row.importeParcial||0):0),0);return money(cash+applicationIncome(data,month,cutoff));}
const api={ensure,project,balance,summary,saveReceipt,settle,editMovement,receipt,imputationMonth,applicationIncome,monthlyIncome};if(typeof module==='object')module.exports=api;else root.DonRamonDepositCore=api;
})(typeof window==='object'?window:globalThis);
