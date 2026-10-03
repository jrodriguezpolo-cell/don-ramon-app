(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const terms=['habitacion','entryDate','exitDate','rentaAcordada','estadoContrato','fechaSalidaReal'];
function snapshot(t,id){return {id:id||'contrato_'+t.id,habitacion:Number(t.habitacion),entryDate:t.entryDate||t.contrato?.inicio,exitDate:t.exitDate||t.contrato?.fin,rentaAcordada:Number(t.rentaAcordada||t.contrato?.renta||0),fianzaImporte:Number(t.contrato?.fianza??t.fianza?.importe??0),estadoContrato:t.estadoContrato||'',fechaSalidaReal:t.fechaSalidaReal||'',docs:copy(t.docs||[])};}
function list(t){return Array.isArray(t.contratos)&&t.contratos.length?t.contratos:[snapshot(t)];}
function status(c,today){if((c.estadoContrato==='rescindido'||c.estadoContrato==='finalizado')&&!c.fechaSalidaReal||c.fechaSalidaReal&&c.fechaSalidaReal<=today||!c.fechaSalidaReal&&c.exitDate&&c.exitDate<today)return 'historico';if(c.entryDate>today)return 'proxima';return 'activa';}
function current(t,today){const all=list(t).filter(c=>c.entryDate).sort((a,b)=>a.entryDate.localeCompare(b.entryDate));return all.find(c=>status(c,today)==='activa')||all.find(c=>status(c,today)==='proxima')||all.at(-1);}
function project(t,today){const c=current(t,today);if(!c)return t;for(const key of terms){if(c[key]!==undefined)t[key]=c[key];else if(key==='fechaSalidaReal')delete t[key];}t.contratoActualId=c.id;t.estadoContrato=status(c,today)==='historico'?'finalizado':status(c,today)==='proxima'?'previsto':'activa';t.contrato={renta:c.rentaAcordada,fianza:c.fianzaImporte,inicio:c.entryDate,fin:c.exitDate};return t;}
function ensure(data,today){for(const t of data.inquilinas||[]){if(!Array.isArray(t.contratos)||!t.contratos.length){const saved=snapshot(t);if(saved.entryDate&&saved.exitDate)t.contratos=[saved];}if(t.renovacionEstado==='no'&&!t.fechaSalidaReal){const c=t.contratos?.find(c=>c.id===t.contratoActualId)||t.contratos?.find(c=>c.entryDate===t.entryDate&&c.exitDate===t.exitDate);if(c?.estadoContrato==='finalizado'&&!c.fechaSalidaReal&&c.exitDate>=today)c.estadoContrato='activa';}if(t.contratos?.length)project(t,today);}return data;}
function roomHistory(tenants,room){return tenants.flatMap(t=>list(t).filter(c=>Number(c.habitacion)===Number(room)).map(c=>({...t,...c,id:t.id,contratoId:c.id}))).sort((a,b)=>(b.entryDate||'').localeCompare(a.entryDate||''));}
function occupantAt(tenants,room,month){return roomHistory(tenants,room).find(c=>c.entryDate&&c.entryDate.slice(0,7)<=month&&(c.fechaSalidaReal||c.exitDate||'9999-12-31').slice(0,7)>=month)||null;}
function obligations(data){
  const byMonth={};
  for(const tenant of data.inquilinas||[])for(const agreement of list(tenant)){
    const end=agreement.fechaSalidaReal||agreement.exitDate;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(agreement.entryDate||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||end<agreement.entryDate||![1,2,3,4,5].includes(Number(agreement.habitacion))||!(Number(agreement.rentaAcordada)>0)||(agreement.estadoContrato==='rescindido'&&!agreement.fechaSalidaReal))continue;
    let month=agreement.entryDate.slice(0,7),last=end.slice(0,7),count=0;
    while(month<=last&&count++<600){
      const rooms=byMonth[month]??={},room=Number(agreement.habitacion),existing=rooms[room];
      const component={habitacion:room,inquilinaId:tenant.id,contratoId:agreement.id,amount:Number(agreement.rentaAcordada),entryDate:agreement.entryDate};
      if(!existing)rooms[room]={...component,components:[component]};else{existing.components.push(component);existing.amount+=component.amount;if(component.entryDate>existing.entryDate){existing.inquilinaId=component.inquilinaId;existing.contratoId=component.contratoId;existing.entryDate=component.entryDate;}}
      let [year,index]=month.split('-').map(Number);index++;if(index===13){year++;index=1;}month=String(year).padStart(4,'0')+'-'+String(index).padStart(2,'0');
    }
  }
  for(const [month,rooms] of Object.entries(data.acuerdosIngresos||{}))for(const [room,a] of Object.entries(rooms)){const row=byMonth[month]?.[room];if(row){const parts=row.components.filter(p=>p.inquilinaId===a.inquilinaId);if(parts.length===1){parts[0].amount=Number(a.amount);row.amount=row.components.reduce((sum,p)=>sum+p.amount,0);}}}
  return byMonth;
}
function reconcile(data){
  data.cobrosByMonth=data.cobrosByMonth||{};
  const duties=obligations(data);
  for(const [month,rows] of Object.entries(data.cobrosByMonth))data.cobrosByMonth[month]=rows.filter(row=>row.status!=='pendiente'||!row.contratoId||duties[month]?.[row.habitacion]?.components?.some(c=>c.contratoId===row.contratoId));
  for(const [month,rooms] of Object.entries(duties)){
    const rows=data.cobrosByMonth[month]??=[];
    for(const obligation of Object.values(rooms).flatMap(room=>room.components||[room])){
      const {entryDate,...row}=obligation,index=rows.findIndex(r=>Number(r.habitacion)===obligation.habitacion&&(r.contratoId===obligation.contratoId||!r.contratoId&&(r.inquilinaId===obligation.inquilinaId||r.status==='pendiente'&&(!r.inquilinaId||/^h[1-5]$/.test(r.inquilinaId)))));
      if(index<0)rows.push({...row,status:'pendiente'});
      else if(rows[index].status==='pendiente')rows[index]={...rows[index],...row};
    }
  }
  return data;
}
function expectedTotal(data,month){return Object.values(obligations(data)[month]||{}).reduce((sum,row)=>sum+row.amount,0);}
function collection(data,room,month){
  const row=(data.cobrosByMonth?.[month]||[]).find(r=>Number(r.habitacion)===Number(room));
  // The agreement for this room and period is authoritative; a legacy hN receipt ID is not a person.
  const occupant=occupantAt(data.inquilinas||[],room,month);
  const agreement=occupant||null;
  const override=data.acuerdosIngresos?.[month]?.[room];
  return {occupant:agreement,rent:Number(override&&override.inquilinaId===agreement?.id?override.amount:agreement?.rentaAcordada||0),vigencia:agreement?`${agreement.entryDate||'Sin indicar'} · ${agreement.exitDate||'Sin indicar'}`:'Contrato sin enlazar',date:row?.fechaAbono||'',method:row?.metodo||''};
}
function depositBalance(data,tenant){
  if(tenant?.fianza?.estado!=='retenida')return 0;
  let used=0;
  for(const [month,rooms] of Object.entries(data.compensaciones||{}))for(const [room,entry] of Object.entries(rooms)){
    const owner=occupantAt(data.inquilinas||[],room,month);
    const sameAgreement=!tenant.fianza.contratoId||(entry.contratoId||owner?.contratoId)===tenant.fianza.contratoId;
    if(sameAgreement&&(entry.inquilinaId?entry.inquilinaId===tenant.id:owner?.id===tenant.id)&&!entry.saldoActualizado)used+=Number(entry.importe||0);
  }
  return Math.max(0,Number(tenant.fianza.importe||0)-used);
}
function depositSummary(data){const balances=(data.inquilinas||[]).map(t=>depositBalance(data,t));return {total:balances.reduce((a,b)=>a+b,0),count:balances.filter(b=>b>0).length};}
function depositChanges(tenant,values){
  const amount=Number(values.importe);
  if(values.importe===''||!Number.isFinite(amount)||amount<0)throw Error('Indica un importe válido.');
  const method=values.metodo||'Sin indicar';
  if(!['Transferencia','Bizum','Efectivo','Sin indicar'].includes(method)&&method!==tenant.fianza?.metodo)throw Error('Selecciona el medio de ingreso.');
  if(!['pendiente','retenida','devuelta','compensada'].includes(values.estado))throw Error('Selecciona el estado de la fianza.');
  if(values.fecha&&!/^\d{4}-\d{2}-\d{2}$/.test(values.fecha))throw Error('Indica una fecha válida.');
  return {...tenant.fianza,importe:amount,fecha:values.fecha||'',metodo:method,estado:values.estado};
}
function depositCard(data,room,month){
  const stay=occupantAt(data.inquilinas||[],room,month),tenant=(data.inquilinas||[]).find(t=>t.id===stay?.id);
  if(!tenant)return {stay:null,tenant:null,balance:0,deposit:null,editable:false};
  const ledgerId=tenant.contratoActualId||tenant.fianza?.contratoId;
  const editable=ledgerId===stay.contratoId;
  const deposit=editable?tenant.fianza:tenant.fianzasPorContrato?.[stay.contratoId];
  const balance=editable?depositBalance(data,tenant):deposit?.estado==='retenida'?Number(deposit.importe||0):0;
  return {stay,tenant,balance,deposit,editable};
}
function confirmReportedDeposits(data){
  // Owner explicitly confirmed on 2 Oct 2026 that these five current agreements hold €3900.
  // Apply once, only when the actual agreements match that statement; never infer future deposits.
  if(data.fianzasConfirmadas20261002)return data;
  const active=(data.inquilinas||[]).map(t=>({t,c:current(t,'2026-10-02')})).filter(({c})=>c&&status(c,'2026-10-02')==='activa');
  const names=active.map(({t})=>String(t.nombre||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
  if(!['natalia','flavia','sara','isabel','regina'].every(name=>names.some(value=>value.split(/\s+/).includes(name))))return data;
  if(active.length!==5||new Set(active.map(({c})=>Number(c.habitacion))).size!==5||active.reduce((sum,{c})=>sum+Number(c.fianzaImporte||0),0)!==3900)return data;
  if(active.some(({t})=>['devuelta','compensada'].includes(t.fianza?.estado))||Object.keys(data.compensaciones||{}).length)return data;
  data.fianzasConfirmadas20261002={total:3900,fechaConfirmacion:'2026-10-02',contratos:active.map(({t,c})=>({inquilinaId:t.id,contratoId:c.id,importe:Number(c.fianzaImporte)})),anteriores:active.map(({t})=>({inquilinaId:t.id,fianza:copy(t.fianza||{})}))};
  for(const {t,c} of active){t.fianza={...t.fianza,importe:Number(c.fianzaImporte),estado:'retenida',contratoId:c.id,confirmacion:'Propietario · 2026-10-02'};if(t.fianzaRenovacion)t.fianzaRenovacion={...t.fianzaRenovacion,retenida:Number(c.fianzaImporte),diferencia:0,estado:'confirmada'};}
  return data;
}
function sync(data){for(const t of data.inquilinas||[]){if(!t.contratos?.length)continue;const c=t.contratos.find(c=>c.id===t.contratoActualId);if(c){for(const key of terms)c[key]=t[key];}}return data;}
function months(data,today){
  const year=Number(today.slice(0,4)),bounds=[(year-1)+'-01',(year+1)+'-12'];
  for(const t of data.inquilinas||[])for(const c of list(t)){if(c.entryDate)bounds.push(c.entryDate.slice(0,7));if(c.exitDate)bounds.push(c.exitDate.slice(0,7));}
  bounds.sort();let month=bounds[0],end=bounds.at(-1),result=[];
  while(month<=end){const [year,index]=month.split('-').map(Number);result.push({id:month,label:['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEPT','OCT','NOV','DIC'][index-1]+' '+year});month=String(index===12?year+1:year).padStart(4,'0')+'-'+String(index===12?1:index+1).padStart(2,'0');}
  return result;
}
const api={snapshot,list,status,current,project,ensure,roomHistory,occupantAt,obligations,reconcile,expectedTotal,collection,depositBalance,depositSummary,depositChanges,depositCard,confirmReportedDeposits,sync,months};if(typeof module==='object')module.exports=api;else root.DonRamonContracts=api;
})(typeof window==='object'?window:globalThis);
