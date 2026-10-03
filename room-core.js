(function(root){
'use strict';
const K=typeof module==='object'?require('./contracts.js'):root.DonRamonContracts,D=typeof module==='object'?require('./deposits-core.js'):root.DonRamonDepositCore,T=typeof module==='object'?require('./tenant-core.js'):root.DonRamonTenantCore;
const copy=x=>JSON.parse(JSON.stringify(x)),money=x=>Math.round(Number(x||0)*100)/100,today=T.today;
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
function active(data,room,date=today()){
 const periods=K.roomHistory(data.inquilinas||[],room).filter(c=>K.status(c,date)==='activa'&&c.entryDate&&Number(c.rentaAcordada)>0);
 return {tenant:periods.length===1?(data.inquilinas||[]).find(t=>t.id===periods[0].id):null,contract:periods.length===1?periods[0]:null,conflict:periods.length>1};
}
function settings(data,rooms){return Object.fromEntries(rooms.map(room=>[room.id,{nombre:room.label||'Habitación '+room.id,inmueble:'DON RAMÓN',precio:Number(room.precio),diaCobro:'Día 5',formaCobro:'Transferencia',notas:'',...data.habitacionesInfo?.[room.id]}]));}
function saveSettings(input,room,values){
 if(![1,2,3,4,5].includes(Number(room)))throw Error('Habitación inválida.');const data=copy(input),amount=Number(values.precio);
 if(values.precio===''||!Number.isFinite(amount)||amount<0)throw Error('Indica una renta estándar válida.');
 if(!/^Día ([1-9]|[12]\d|3[01])$/.test(values.diaCobro||''))throw Error('Indica un día de cobro válido.');
 data.habitacionesInfo??={};data.habitacionesInfo[room]={...values,nombre:String(values.nombre||'').trim()||'Habitación '+room,precio:money(amount)};const year=today().slice(0,4);data.objectiveRatesByYear??={};data.objectiveRatesByYear[year]??=Object.fromEntries([850,800,800,750,700].map((n,i)=>[i+1,Number(data.habitacionesInfo?.[i+1]?.precio??n)]));data.objectiveRatesByYear[year][room]=money(amount);return data;
}
function paymentRows(data,room,month){return (data.cobrosByMonth?.[month]||[]).map((row,index)=>({row,index})).filter(x=>Number(x.row.habitacion)===Number(room));}
function identity(data,row,room,month){return (data.inquilinas||[]).find(t=>t.id===row?.inquilinaId)||(!row?.inquilinaId||/^h[1-5]$/.test(row.inquilinaId)?(data.inquilinas||[]).find(t=>t.id===K.occupantAt(data.inquilinas||[],room,month)?.id):null);}
function cash(row){return money(row.status==='cobrado'?row.amount:row.status==='parcial'?row.importeParcial:0);}
function receiptOwner(data,room,month,index){
 const rows=paymentRows(data,room,month),row=index!==undefined&&index!==null&&index!==''?rows.find(x=>x.index===Number(index))?.row:null;
 if(index!==undefined&&index!==null&&index!==''&&!row)throw Error('El cobro ha cambiado. Vuelve a abrir el mes.');
 const tenant=identity(data,row,room,month);if(!tenant)throw Error('Vincula primero el contrato de esta habitación y mes con su inquilina.');
 const contract=K.list(tenant).filter(c=>Number(c.habitacion)===Number(room)&&c.entryDate?.slice(0,7)<=month&&(c.fechaSalidaReal||c.exitDate||'9999-12-31').slice(0,7)>=month).sort((a,b)=>b.entryDate.localeCompare(a.entryDate)).find(c=>!row?.contratoId||c.id===row.contratoId);
 if(!contract&&!row)throw Error('No hay contrato para esa habitación y mes.');
 const override=data.acuerdosIngresos?.[month]?.[room],expected=override?.inquilinaId===tenant.id?Number(override.amount):contract?Number(contract.rentaAcordada):Number.isFinite(row?.importePrevisto)?row.importePrevisto:null;
 return {tenant,contract,row,expected};
}
function savePayment(input,room,values){
 const data=copy(input),month=values.month,amount=Number(values.amount);
 if(![1,2,3,4,5].includes(Number(room))||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||month<'2025-06')throw Error('Selecciona una habitación y un mes válidos desde junio de 2025.');
 if(values.amount===''||!Number.isFinite(amount)||amount<=0)throw Error('Indica el importe realmente cobrado, mayor que cero.');
 if(!validDate(values.date)||values.date>today())throw Error('Indica la fecha real del abono, hasta hoy.');
 if(!['Transferencia','Bizum','Efectivo','Domiciliación','Otro','Sin indicar'].includes(values.method))throw Error('Selecciona el método real de cobro.');
 let selected=values.index===undefined||values.index===null||values.index===''?null:Number(values.index);const context=receiptOwner(data,room,month,selected),{tenant,contract,expected}=context;let row=context.row;
 if(selected===null){const pending=paymentRows(data,room,month).filter(x=>x.row.status==='pendiente'&&identity(data,x.row,room,month)?.id===tenant.id);if(pending.length===1){selected=pending[0].index;row=pending[0].row;}}
 const movements=(data.fianzasV2?.records||[]).filter(r=>r.inquilinaId===tenant.id).flatMap(r=>(r.movimientos||[]).filter(m=>Number(m.habitacion||r.habitacion)===Number(room)&&D.imputationMonth(m)===month&&Number(m.aplicado)>0));
 if(row&&row.status!=='pendiente'&&(/fianza|compensaci/i.test(row.metodo||'')||movements.some(m=>m.contabilizadoEnCobro)))throw Error('Este cobro incluye una fianza ya contabilizada. Revisa esa operación desde Fianzas para no duplicarla.');
 const other=paymentRows(data,room,month).filter(x=>x.index!==selected&&identity(data,x.row,room,month)?.id===tenant.id).reduce((s,x)=>s+cash(x.row),0),applied=movements.filter(m=>m.tipo==='compensacion'&&!m.contabilizadoEnCobro).reduce((s,m)=>s+Number(m.aplicado),0);
 const partial=expected>0&&money(amount+other+applied)<money(expected);
 const saved={...(row||{}),id:row?.id||root.crypto?.randomUUID?.()||'cobro_'+Date.now()+'_'+Math.random(),habitacion:Number(room),inquilinaId:tenant.id,contratoId:contract?.id||row?.contratoId||null,status:partial?'parcial':'cobrado',amount:partial?Number(expected):money(amount),fechaAbono:values.date,metodo:values.method,notas:values.notes||''};
 if(partial)saved.importeParcial=money(amount);else delete saved.importeParcial;
 if(expected!==null)saved.importePrevisto=Number(expected);
 data.cobrosByMonth??={};const list=data.cobrosByMonth[month]??=[];if(selected!==null)list[selected]=saved;else list.push(saved);
 return data;
}
function cancelPayment(input,room,month,index){
 const data=copy(input);if(index===''||index===null||index===undefined)throw Error('Selecciona el cobro que quieres anular.');const {tenant,row,expected}=receiptOwner(data,room,month,index);
 if(row.status==='pendiente')return data;
 const linked=(data.fianzasV2?.records||[]).filter(r=>r.inquilinaId===tenant.id).some(r=>(r.movimientos||[]).some(m=>m.contabilizadoEnCobro&&D.imputationMonth(m)===month&&Number(m.habitacion||r.habitacion)===Number(room)));
 if(/fianza|compensaci/i.test(row.metodo||'')||linked)throw Error('Este cobro contiene una fianza aplicada. Revísalo desde Fianzas.');
 data.cambiosCobros??=[];data.cambiosCobros.push({fecha:new Date().toISOString(),accion:'anular',habitacion:Number(room),month,inquilinaId:tenant.id,anterior:copy(row)});
 const next={...row,status:'pendiente',amount:expected??row.importePrevisto??row.amount};delete next.importeParcial;delete next.fechaAbono;delete next.metodo;data.cobrosByMonth[month][Number(index)]=next;return data;
}
function endStay(input,tenantId,room,date,reason){
 if(!validDate(date)||date>today())throw Error('Indica una fecha de salida real válida hasta hoy.');
 const data=copy(input),tenant=(data.inquilinas||[]).find(t=>t.id===tenantId),c=active(data,room,date).contract;
 if(!tenant||!c||c.id!==tenantId)throw Error('No se encuentra la estancia vigente de esta inquilina.');
 return T.save(data,{...T.draft(tenant,date),fechaSalidaReal:date,estadoContrato:'rescindido',motivoBaja:reason||'Salida anticipada'},today());
}
function deposits(data,room){const records=(data.fianzasV2?.records||[]).filter(r=>Number(r.habitacion)===Number(room));return {records,total:money(records.reduce((s,r)=>s+D.balance(r),0)),count:records.filter(r=>D.balance(r)>0).length};}
function analysis(data,expenses,room,cutoff=today()){
 const A=root.DonRamonAnnualAnalysis|| (typeof module==='object'?require('./annual-analysis.js'):null),ob=K.obligations(data),current=cutoff.slice(0,7),periods=new Set([...Object.keys(ob),...Object.keys(data.cobrosByMonth||{}),...Object.keys(expenses||{}),current]);
 for(const r of data.fianzasV2?.records||[])for(const m of r.movimientos||[])if(Number(m.habitacion||r.habitacion)===Number(room))periods.add(D.imputationMonth(m));
 const years=[...new Set([...periods].filter(m=>m>='2025-06'&&m<=cutoff.slice(0,4)+'-12').map(m=>m.slice(0,4)))].sort().reverse().map(year=>{
  const months=[];for(let n=year==='2025'?6:1;n<=12;n++){const month=year+'-'+String(n).padStart(2,'0'),future=month>current,r=A.monthAnalysis(data,{},month,cutoff).rooms.find(r=>r.room===Number(room)),direct=(expenses?.[month]||[]).filter(e=>Number(String(e.habitacion||'').match(/\d+/)?.[0])===Number(room)&&(!e.fecha||e.fecha<=cutoff)),cost=future?0:money(direct.reduce((s,e)=>s+Number(e.importe||0),0));months.push({...r,month,future,actual:future?0:r.actual,expenses:cost,net:future?null:money(r.actual-cost)});}
  return {year,months,actual:money(months.reduce((s,m)=>s+m.actual,0)),expected:money(months.reduce((s,m)=>s+(m.expected||0),0)),expenses:money(months.reduce((s,m)=>s+m.expenses,0)),missing:months.some(m=>m.expected===null)};
 });
 const records=[];for(const [month,list] of Object.entries(data.cobrosByMonth||{}))if(month>='2025-06')list.forEach((row,index)=>{if(Number(row.habitacion)!==Number(room))return;const tenant=identity(data,row,room,month);records.push({...row,month,index,name:tenant?.nombre||'Inquilina sin identificar',actual:cash(row),kind:row.status==='parcial'?'Cobro parcial':row.status==='cobrado'?'Cobro':'Pendiente',future:month>current||row.fechaAbono>cutoff});});
 for(const r of data.fianzasV2?.records||[])for(const m of r.movimientos||[])if(Number(m.habitacion||r.habitacion)===Number(room)&&Number(m.aplicado)>0&&!m.contabilizadoEnCobro&&D.imputationMonth(m)>='2025-06')records.push({id:m.id,month:D.imputationMonth(m),name:(data.inquilinas||[]).find(t=>t.id===(m.inquilinaId||r.inquilinaId))?.nombre||r.nombre||'Inquilina sin identificar',actual:Number(m.aplicado),fechaAbono:m.fecha,metodo:'Aplicación de fianza',kind:'Fianza aplicada como ingreso',notas:m.motivo,future:D.imputationMonth(m)>current||m.fecha>cutoff});
 records.sort((a,b)=>b.month.localeCompare(a.month)||(b.fechaAbono||'').localeCompare(a.fechaAbono||''));
 return {years,records,total:money(years.reduce((s,y)=>s+y.actual,0)),expected:money(years.reduce((s,y)=>s+y.expected,0)),expenses:money(years.reduce((s,y)=>s+y.expenses,0)),collectionMonths:new Set(records.filter(r=>r.actual>0&&!r.future).map(r=>r.month)).size};
}
async function fileDB(){return new Promise((resolve,reject)=>{const request=root.indexedDB.open('donRamonRoomFilesV1',1);request.onupgradeneeded=()=>request.result.createObjectStore('files',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('No se pudo abrir el archivo local de documentos.'));});}
async function saveFile(file){if(file.size>25*1024*1024)throw Error('El archivo supera 25 MB.');const db=await fileDB(),id=root.crypto?.randomUUID?.()||'archivo_'+Date.now();try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put({id,name:file.name,blob:file});tx.oncomplete=resolve;tx.onerror=()=>reject(Error('No se pudo guardar el archivo. Comprueba el espacio disponible.'));tx.onabort=tx.onerror;});return id;}finally{db.close();}}
async function downloadFile(id){const db=await fileDB();try{const record=await new Promise((resolve,reject)=>{const tx=db.transaction('files','readonly'),request=tx.objectStore('files').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=reject;});if(!record)throw Error('El archivo no está en este navegador. Vuelve a adjuntarlo.');const url=URL.createObjectURL(record.blob),a=document.createElement('a');a.href=url;a.download=record.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}finally{db.close();}}
const api={active,settings,saveSettings,paymentRows,identity,cash,receiptOwner,savePayment,cancelPayment,endStay,deposits,analysis,saveFile,downloadFile,today};if(typeof module==='object')module.exports=api;else root.DonRamonRoomCore=api;
})(typeof window==='object'?window:globalThis);
