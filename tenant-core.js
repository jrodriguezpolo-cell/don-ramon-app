(function(root){
'use strict';
const K=typeof module==='object'?require('./contracts.js'):root.DonRamonContracts;
const D=typeof module==='object'?require('./deposits-core.js'):root.DonRamonDepositCore;
const clone=x=>JSON.parse(JSON.stringify(x));
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
function draft(input,date=today()){
 const t=clone(input);for(const key of ['notas','acuerdos','docs'])if(!Array.isArray(t[key]))t[key]=[];
 t.nombre=String(t.nombre||'');t.numeroDocumento=t.numeroDocumento||t.dni||'';t.fianza=t.fianza||{importe:0,estado:'pendiente',fecha:'',metodo:'Sin indicar'};
 if(t.contratos?.length)K.project(t,date);return t;
}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function save(input,values,date=today()){
 const data=clone(input),t=clone(values),previous=(data.inquilinas||[]).find(x=>x.id===t.id);
 for(const key of ['notas','acuerdos','docs'])if(!Array.isArray(t[key]))t[key]=[];
 t.nombre=String(t.nombre||'').trim();if(!t.nombre)throw Error('Añade al menos el nombre de la inquilina.');
 const identity=String(t.numeroDocumento||t.dni||'').replace(/\s/g,'').toUpperCase();
 if(identity&&(data.inquilinas||[]).some(other=>other.id!==t.id&&String(other.numeroDocumento||other.dni||'').replace(/\s/g,'').toUpperCase()===identity))throw Error('Ya existe una ficha con ese documento. Usa la ficha existente para conservar su historial.');
 t.habitacion=Number(t.habitacion||0);t.rentaAcordada=Number(t.rentaAcordada||0);
 if(![0,1,2,3,4,5].includes(t.habitacion))throw Error('Selecciona una habitación del 1 al 5.');
 if(!Number.isFinite(t.rentaAcordada)||t.rentaAcordada<0)throw Error('Indica una renta válida.');
 for(const key of ['entryDate','exitDate','fechaSalidaReal'])if(t[key]&&!validDate(t[key]))throw Error('Indica fechas válidas en el contrato.');
 if(t.exitDate&&(!t.entryDate||t.exitDate<t.entryDate))throw Error('El fin del contrato debe ser posterior o igual al inicio.');
 if(t.fechaSalidaReal&&(!t.entryDate||t.fechaSalidaReal<t.entryDate||t.exitDate&&t.fechaSalidaReal>t.exitDate))throw Error('La salida real debe estar dentro de la vigencia del contrato.');
 const existing=previous?.contratos?.find(c=>c.id===t.contratoActualId);
 // Personal details can be saved before a contract is complete. Existing contracts must stay complete.
 if(existing&&(!t.habitacion||!t.entryDate||!t.exitDate||!t.rentaAcordada))throw Error('Completa habitación, vigencia y renta del contrato.');
 const complete=t.habitacion&&t.entryDate&&t.exitDate&&t.rentaAcordada>0;
 if(complete){
  const end=t.fechaSalidaReal||t.exitDate;
  for(const other of data.inquilinas||[])for(const c of K.list(other)){
   if(other.id===t.id&&(!existing||c.id===existing.id))continue;
   if(Number(c.habitacion)===t.habitacion&&c.entryDate&&c.entryDate<=end&&(c.fechaSalidaReal||c.exitDate||'9999-12-31')>=t.entryDate)throw Error('La habitación ya tiene un contrato durante esas fechas. Revisa la vigencia o registra la salida real.');
  }
  if(['finalizado','rescindido'].includes(t.estadoContrato)&&end>=date&&!t.fechaSalidaReal)throw Error('Para finalizar antes de la fecha prevista, indica la fecha de salida real. No renovar no finaliza el contrato anticipadamente.');
  const c=existing?{...existing}:K.snapshot(t);
  for(const key of ['habitacion','entryDate','exitDate','rentaAcordada','fechaSalidaReal'])c[key]=t[key]|| (key==='fechaSalidaReal'?'':t[key]);
  c.estadoContrato=t.fechaSalidaReal?'rescindido':t.entryDate>date?'previsto':'activa';
  t.contratos=clone(previous?.contratos||t.contratos||[]);const index=t.contratos.findIndex(x=>x.id===c.id);if(index<0)t.contratos.push(c);else t.contratos[index]=c;
  t.contratoActualId=c.id;K.project(t,date);
 }
 // Deposit money is edited only in its ledger, never inferred from rent or a draft.
 t.fianza=clone(previous?.fianza||{importe:Number(values.fianza?.importe||0),estado:'pendiente',fecha:'',metodo:'Sin indicar'});
 data.inquilinas=(data.inquilinas||[]).filter(x=>x.id!==t.id);data.inquilinas.push(t);
 K.reconcile(data);const next=D.ensure(data);for(const r of next.fianzasV2.records)if(r.inquilinaId===t.id){r.nombre=t.nombre;const c=K.list(t).find(c=>c.id===r.contratoId);if(c){r.importeAcordado=Number(c.fianzaImporte||0);r.habitacion=Number(c.habitacion);}}
 return next;
}
function deletionError(data,id){
 if(Object.values(data.cobrosByMonth||{}).flat().some(r=>r.inquilinaId===id&&['cobrado','parcial'].includes(r.status)))return 'Esta inquilina tiene cobros registrados. Conserva su ficha para mantener el historial.';
 if((data.fianzasV2?.records||[]).some(r=>r.inquilinaId===id&&(r.recibida||r.movimientos?.length)))return 'Esta inquilina tiene una fianza o movimientos registrados. Conserva su ficha para mantener el historial.';
 const t=(data.inquilinas||[]).find(t=>t.id===id);
 if(t?.fianza&&['retenida','devuelta','compensada'].includes(t.fianza.estado)&&Number(t.fianza.importeOriginal||t.fianza.importe)>0)return 'Esta inquilina tiene una fianza registrada. Conserva su ficha para mantener el historial.';
 if(t&&Object.entries(data.cobrosByMonth||{}).some(([month,rows])=>rows.some(r=>(!r.inquilinaId||/^h[1-5]$/.test(r.inquilinaId))&&['cobrado','parcial'].includes(r.status)&&K.occupantAt(data.inquilinas||[],r.habitacion,month)?.id===id)))return 'Hay cobros de esta habitación vinculados a su estancia. Conserva la ficha para mantener el historial.';
 return '';
}
function remove(input,id){const error=deletionError(input,id);if(error)throw Error(error);const data=clone(input);data.inquilinas=(data.inquilinas||[]).filter(t=>t.id!==id);for(const [month,rows] of Object.entries(data.cobrosByMonth||{}))data.cobrosByMonth[month]=rows.filter(r=>r.inquilinaId!==id);if(data.fianzasV2)data.fianzasV2.records=data.fianzasV2.records.filter(r=>r.inquilinaId!==id);return K.reconcile(data);}
const api={draft,save,remove,deletionError,today};if(typeof module==='object')module.exports=api;else root.DonRamonTenantCore=api;
})(typeof window==='object'?window:globalThis);
