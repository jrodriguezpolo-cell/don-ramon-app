(function(root){
'use strict';
const money=n=>Math.round(Number(n||0)*100)/100;
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
const euro=n=>Number(n||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
function summary(data,tenant,cutoff=today()){
 const K=root.DonRamonContracts,C=root.DonRamonDepositCore,known=new Set((data.inquilinas||[]).map(t=>t.id)),obligations=K.obligations(data),months=new Map(),currentYear=cutoff.slice(0,4);let unassigned=0;
 const rowFor=month=>{if(!months.has(month))months.set(month,{month,expected:0,expectedKnown:false,cash:0,compensation:0,actual:0,receipts:[],future:month>cutoff.slice(0,7)});return months.get(month);};
 const owner=(row,month)=>known.has(row.inquilinaId)?row.inquilinaId:(!row.inquilinaId||/^h[1-5]$/.test(row.inquilinaId))?K.occupantAt(data.inquilinas||[],row.habitacion,month)?.id:undefined;
 for(const [month,list] of Object.entries(data.cobrosByMonth||{})){
  if(month<'2025-06'||month>cutoff.slice(0,7))continue;
  for(const r of list){if(r.fechaAbono&&r.fechaAbono>cutoff)continue;const amount=money(r.status==='cobrado'?r.amount:r.status==='parcial'?r.importeParcial:0);if(!amount)continue;
   const id=owner(r,month);if(!id){unassigned++;continue;}if(id!==tenant.id)continue;
   const m=rowFor(month),isComp=/fianza|compensaci/i.test(r.metodo||'');m[isComp?'compensation':'cash']=money(m[isComp?'compensation':'cash']+amount);m.receipts.push({amount,date:r.fechaAbono||'',method:r.metodo||'Sin indicar',kind:isComp?'Fianza aplicada':'Cobro'});
  }
 }
 for(const record of data.fianzasV2?.records||[])for(const move of record.movimientos||[]){const month=C.imputationMonth(move),amount=money(move.aplicado);if(!amount||move.contabilizadoEnCobro||month<'2025-06'||month>cutoff.slice(0,7)||(move.fecha&&move.fecha>cutoff))continue;
  const id=move.inquilinaId||record.inquilinaId||K.occupantAt(data.inquilinas||[],move.habitacion||record.habitacion,month)?.id;if(id!==tenant.id)continue;
  const m=rowFor(month);m.compensation=money(m.compensation+amount);m.receipts.push({amount,date:move.fecha||'',method:'Compensación de fianza',kind:'Fianza aplicada'});
 }
 const periods=new Set([...Object.keys(obligations),...Object.keys(data.cobrosByMonth||{})]);
 for(const month of periods){if(month<'2025-06'||month>currentYear+'-12')continue;const rooms=new Set([...Object.keys(obligations[month]||{}).map(Number),...(data.cobrosByMonth?.[month]||[]).map(r=>Number(r.habitacion))]);
  for(const room of rooms){const duty=obligations[month]?.[room],receipts=(data.cobrosByMonth?.[month]||[]).filter(r=>Number(r.habitacion)===room),explicit=receipts.find(r=>Number.isFinite(r.importePrevisto)&&r.importePrevisto>=0),agreement=data.acuerdosIngresos?.[month]?.[room];
   const own=duty?.components?.filter(p=>p.inquilinaId===tenant.id),id=own?.length?tenant.id:duty?.inquilinaId||agreement?.inquilinaId||(explicit?owner(explicit,month):undefined);if(id!==tenant.id)continue;
   const expected=own?.length?own.reduce((s,p)=>s+Number(p.amount),0):duty?Number(duty.amount):agreement?Number(agreement.amount):explicit?Number(explicit.importePrevisto):0;rowFor(month).expected=money(rowFor(month).expected+expected);rowFor(month).expectedKnown=true;
  }
 }
 const detail=[...months.values()].sort((a,b)=>b.month.localeCompare(a.month));for(const m of detail){m.actual=money(m.cash+m.compensation);m.difference=m.future||!m.expectedKnown?null:money(m.actual-m.expected);}
 const years=[...new Set(detail.map(m=>m.month.slice(0,4)))].sort().reverse().map(year=>{const rows=detail.filter(m=>m.month.startsWith(year));return {year,months:rows,actual:money(rows.reduce((s,m)=>s+m.actual,0)),cash:money(rows.reduce((s,m)=>s+m.cash,0)),compensation:money(rows.reduce((s,m)=>s+m.compensation,0)),expected:money(rows.reduce((s,m)=>s+m.expected,0))};});
 const total=money(detail.reduce((s,m)=>s+m.actual,0)),cash=money(detail.reduce((s,m)=>s+m.cash,0)),compensation=money(detail.reduce((s,m)=>s+m.compensation,0));
 const stays=K.list(tenant).filter(c=>c.entryDate&&c.entryDate<=cutoff&&(c.fechaSalidaReal||c.exitDate||'9999-12-31')>='2025-06-01'),received=detail.filter(m=>m.actual>0);
 return {total,cash,compensation,years,months:detail,collectionYears:new Set(received.map(m=>m.month.slice(0,4))).size,collectionMonths:received.length,stays,stayCount:stays.length,currentYear,currentActual:years.find(y=>y.year===currentYear)?.actual||0,unassigned};
}
function paymentStatus(data,tenant,cutoff=today(),dueDay=5,stats=summary(data,tenant,cutoff)){
 const current=root.DonRamonContracts.current(tenant,cutoff),period=cutoff.slice(0,7),day=Number(cutoff.slice(8)),due=Math.min(31,Math.max(1,Number(dueDay)||5));
 const elapsed=stats.months.filter(m=>m.month<period||m.month===period&&day>=Math.max(due,current?.entryDate?.slice(0,7)===period?Number(current.entryDate.slice(8)):1));
 const pending=money(elapsed.reduce((sum,m)=>sum+(m.expectedKnown?Math.max(0,m.expected-m.actual):0),0));
 if(pending>0)return {label:'Pendiente',tone:'pending',pending};
 if(elapsed.some(m=>!m.expectedKnown&&m.actual>0))return {label:'Revisar cobros',tone:'unknown',pending:0};
 if(!current?.habitacion||!current?.entryDate||!current?.exitDate||!(Number(current.rentaAcordada)>0))return {label:'Sin contrato',tone:'unknown',pending:0};
 if(root.DonRamonContracts.status(current,cutoff)==='proxima')return {label:'Próxima entrada',tone:'unknown',pending:0};
 return {label:'Al día',tone:'paid',pending:0};
}
function install(React){if(api.Panel)return api.Panel;const h=React.createElement;
 function Panel({data,tenant,mode='income',onClose}){const s=summary(data,tenant),metric=(label,value)=>h('div',{className:'bg-[#f8fafc] rounded-[14px] p-4'},h('div',{className:'text-sm text-slate-500'},label),h('div',{className:'text-lg font-bold mt-1'},value));
  return h('div',{className:'grid gap-3'},mode==='stays'?h(React.Fragment,null,metric('Contratos iniciados',s.stayCount),s.stays.map(c=>h('div',{key:c.id,className:'bg-[#f8fafc] rounded-[14px] p-4'},h('strong',null,'Habitación '+c.habitacion),h('p',null,c.entryDate+' · '+(c.fechaSalidaReal||c.exitDate||'Sin fecha de fin')),h('p',null,'Renta mensual: '+euro(c.rentaAcordada)),c.tipoAcuerdo&&h('p',{className:'text-slate-500'},c.tipoAcuerdo)))):h(React.Fragment,null,h('div',{className:'grid grid-cols-2 gap-3'},metric('Ingresos obtenidos totales',euro(s.total)),metric('Obtenido en '+s.currentYear,euro(s.currentActual)),metric('Cobros en dinero',euro(s.cash)),metric('Fianzas aplicadas como ingreso',euro(s.compensation))),h('p',{className:'text-sm text-slate-500'},'Son ingresos registrados, antes de gastos e IRPF. Incluyen las fianzas aplicadas como ingreso una sola vez. Las fianzas retenidas o devueltas no son ingresos. Los gastos del inmueble se consultan en Rent; no se reparte aquí un beneficio neto por inquilina.'),s.unassigned>0&&h('p',{className:'text-sm text-amber-700'},'Hay '+s.unassigned+' cobros sin inquilina identificada que requieren revisión.'),s.years.map(y=>h('details',{key:y.year,className:'border rounded-[14px] p-4',open:true},h('summary',{className:'font-bold text-base cursor-pointer'},y.year+' · Obtenido '+euro(y.actual)),h('p',{className:'text-sm mt-2'},'Esperado según contratos y acuerdos: '+euro(y.expected)),y.months.map(m=>h('div',{key:m.month,className:'border-t mt-3 pt-3 text-sm'},h('strong',null,m.month+(m.future?' · Futuro':'')),h('p',null,'Esperado '+(m.expectedKnown?euro(m.expected):'Sin dato contractual')+' · Obtenido '+euro(m.actual)),m.compensation>0&&h('p',null,'Incluye fianza aplicada: '+euro(m.compensation)),!m.future&&m.difference!==null&&h('p',null,'Diferencia frente a lo esperado: '+euro(m.difference)),m.receipts.map((r,i)=>h('p',{key:i,className:'text-slate-500'},[r.kind,euro(r.amount),r.date||'Fecha sin indicar',r.method].join(' · '))))))),!s.years.length&&h('p',{className:'text-sm text-slate-500'},'Sin cobros ni importes contractuales registrados.')),
  h('button',{type:'button',onClick:onClose,className:'w-full bg-slate-900 text-white rounded-[14px] py-3 font-bold'},'Cerrar'));
 }
 api.Panel=Panel;return Panel;
}
const api={summary,paymentStatus,install,today,euro};root.DonRamonTenantIncome=api;if(typeof module==='object')module.exports=api;
})(typeof window==='object'?window:globalThis);
