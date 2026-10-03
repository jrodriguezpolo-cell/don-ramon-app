(function(root){
'use strict';
const stays=typeof module==='object'?require('./contracts.js'):root.DonRamonContracts;
const CATEGORIES=['Comunidad','Agua','Luz','Gas','Seguro','Impuestos','Internet','Otros'];
const CONTRACT_FIELDS=['nombre','tipoDocumento','numeroDocumento','email','telefono','nacionalidad','ocupacion','centroEstudiosTrabajo','domicilioFamiliar','habitacion','rentaAcordada','fianzaImporte','entryDate','exitDate'];
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const clone=x=>JSON.parse(JSON.stringify(x));
function money(s){
 if(typeof s==='number')return Number.isFinite(s)?s:null;
 s=String(s??'').replace(/[€\s]/g,'').trim();
 if(!/^\d+(?:[.,]\d+)*$/.test(s))return null;
 if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.');}
 else if(/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 const n=Number(s);return Number.isFinite(n)?Math.round(n*100)/100:null;
}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const datePattern='(?:\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s*de\\s+(?:'+months.join('|')+')\\s+de\\s+\\d{4})';
function date(s){let m=String(s??'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return validDate(s)?s:null;
 m=String(s??'').match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);let y,mo,d;
 if(m){d=m[1];mo=m[2];y=m[3].length===2?'20'+m[3]:m[3];}else{m=norm(s).match(/(\d{1,2})\s*de\s+(\w+)\s+de\s+(\d{4})/);if(!m)return null;d=m[1];mo=String(months.indexOf(m[2])+1);y=m[3];}
 const out=y+'-'+mo.padStart(2,'0')+'-'+d.padStart(2,'0');return validDate(out)?out:null;
}
function pdfPageText(items,annotations=[]){
 const usable=items.filter(item=>typeof item.str==='string'&&item.transform).map(item=>({...item}));
 const slots=[];
 for(const [index,item] of usable.entries()){
  const units=[...item.str].map(c=>/[ilI.,:;'|]/.test(c)?.35:/[mwMW]/.test(c)?.9:/\s/.test(c)?.3:.6);const total=units.reduce((a,b)=>a+b,0)||1;
  for(const m of item.str.matchAll(/[.…]{2,}|…/g))slots.push({index,start:m.index,end:m.index+m[0].length,x:item.transform[4]+item.width*units.slice(0,m.index).reduce((a,b)=>a+b,0)/total,y:item.transform[5]+(item.height||10)/2});
 }
 const overlays=annotations.filter(a=>a.subtype==='FreeText'&&a.contentsObj?.str?.trim()&&a.rect?.length===4).sort((a,b)=>b.rect[3]-a.rect[3]||a.rect[0]-b.rect[0]);
 const extra=[];
 for(const a of overlays){
  const size=a.defaultAppearanceData?.fontSize||10,center=a.rect[3]-size*.8;
  const slot=slots.filter(s=>!s.value&&Math.abs(s.y-center)<9).sort((l,r)=>Math.abs(l.x-a.rect[0])-Math.abs(r.x-a.rect[0]))[0];
  if(slot)slot.value=a.contentsObj.str.replace(/\s+/g,' ').trim();
  else extra.push(a.contentsObj.str);
 }
 for(const slot of slots.filter(s=>s.value).sort((a,b)=>b.start-a.start)){const item=usable[slot.index];item.str=item.str.slice(0,slot.start)+' '+slot.value+' '+item.str.slice(slot.end);}
 const lines=[];let line='',previous=null;
 for(const item of usable){
  const sameRow=previous&&Math.abs(item.transform[5]-previous.transform[5])<=3;
  if(previous&&!sameRow&&line){lines.push(line);line='';}
  const gap=previous?item.transform[4]-previous.transform[4]-previous.width:0;
  const separator=line&&sameRow&&gap>1&&!/\s$/.test(line)&&!/^\s/.test(item.str)?' ':'';
  line+=separator+item.str;previous=item;
  if(item.hasEOL){lines.push(line);line='';previous=null;}
 }
 if(line)lines.push(line);lines.push(...extra);
 return {text:lines.join('\n'),method:overlays.length?'texto y campos superpuestos':'texto',runs:items.filter(i=>i.str?.trim()&&i.transform).map(i=>({text:i.str,x:i.transform[4],y:i.transform[5],width:i.width,height:i.height||10}))};
}
function cleanFormText(text){
 text=String(text).normalize('NFC').replace(/[.…]{2,}|…/g,' ');
 for(const word of ['teléfono','móvil','pasaporte']){
  const pattern=[...word].map(c=>c==='é'?'[eé]':c==='ó'?'[oó]':c).join('\\s*');
  text=text.replace(new RegExp('\\b'+pattern+'\\b','ig'),word);
 }
 return text;
}
function bankReceipt(page){
 if(!/domiciliaci[oó]n\s+de\s+pagos/i.test(page.text)||!/entidad\s+ordenante/i.test(page.text)||!page.runs?.length)return null;
 const runs=page.runs,rows=[];
 for(const run of [...runs].sort((a,b)=>b.y-a.y||a.x-b.x)){
  let row=rows.find(r=>Math.abs(r.y-run.y)<2);
  if(!row){row={y:run.y,runs:[]};rows.push(row);}row.runs.push(run);
 }
 const label=re=>runs.find(r=>re.test(r.text.trim()));
 const below=header=>header&&rows.filter(r=>r.y<header.y-2&&header.y-r.y<26).sort((a,b)=>b.y-a.y)[0];
 const crop=(row,left,right)=>row?.runs.sort((a,b)=>a.x-b.x).map(r=>{
  if(r.x+r.width<=left||r.x>=right)return '';
  // Bank body uses a fixed-width font; crop compound runs at column boundaries.
  const start=Math.max(0,Math.round((left-r.x)/r.width*r.text.length));
  const end=Math.min(r.text.length,Math.round((right-r.x)/r.width*r.text.length));
  return r.text.slice(start,end);
 }).filter(Boolean).join(' ').trim()||'';
 const total=label(/^total$/i),amount=label(/^importe$/i),dateHeader=label(/^fecha$/i),valueHeader=label(/^fecha valor$/i),issuer=label(/^entidad ordenante/i),holder=label(/^titular$/i),ref=label(/^referencia$/i);
 const values={},put=(key,value,quote)=>{if(value!==null&&value!==undefined&&value!=='')values[key]={value,page:page.page,quote,method:'texto por posición',confidence:page.confidence??null};};
 const readAmount=header=>{const row=below(header);const t=crop(row,header?.x??0,Infinity);const m=t.match(/^(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+\.\d{2})(?:\s*(?:€|EUR))?$/i);return m?money(m[1]):null;};
 const totalValue=readAmount(total),amountValue=readAmount(amount);
 const warnings=[];
 if(totalValue!==null&&amountValue!==null&&totalValue!==amountValue)warnings.push('El importe y el total del cargo son diferentes. Revisa ambos antes de guardar.');
 else put('importe',totalValue??amountValue,(totalValue!==null?'Total: ':'Importe: ')+crop(below(totalValue!==null?total:amount),(totalValue!==null?total:amount)?.x??0,Infinity));
 const charge=crop(below(dateHeader),dateHeader?.x??0,(issuer?.x??80)-2).match(/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/)?.[0];
 put('fecha',charge?date(charge):null,'Fecha del cargo: '+(charge||''));
 const value=crop(below(valueHeader),valueHeader?.x??0,(issuer?.x??80)-2).match(/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/)?.[0];
 if(value&&charge&&date(value)!==date(charge))warnings.push('La fecha valor difiere de la fecha del cargo. Se propone la fecha del cargo.');
 const provider=crop(below(issuer),issuer?.x??0,holder?.x??Infinity).replace(/[,;\s]+$/,'');put('proveedor',provider,'Entidad ordenante: '+provider);
 const reference=crop(below(ref),ref?.x??0,Infinity);if(/^[A-Z0-9/-]{3,60}$/i.test(reference)&&/\d/.test(reference))put('referencia',reference,'Referencia bancaria: '+reference);
 const issuerRow=below(issuer),sepa=label(/^REF\.?\s*SEPA/i);
 const concept=rows.filter(r=>issuerRow&&r.y<issuerRow.y-2&&r.y>(sepa?.y??issuerRow.y-80)).map(r=>crop(r,0,label(/^\(\*\)/)?.x??Infinity)).find(t=>t&&!/^(?:ES\d|REF\.?\s*SEPA|\*|En cumplimiento|Para m[aá]s informaci[oó]n|Importe|Total|CaixaBank|Tel[eé]fono|\d{5})/i.test(t));
 if(concept)put('concepto',concept,'Concepto del cargo: '+concept);
 warnings.push('Justificante bancario: se propone la fecha del cargo. No indica el periodo facturado ni la duración de la cobertura.');
 return {fields:values,warnings};
}
function extract(pages,mode){
 pages=pages.map(p=>({...p,text:cleanFormText(p.text||'')}));
 const fields={},warnings=[],candidates={};
 const text=pages.map(p=>p.text).join('\n');
 function capture(key,re,convert=x=>x.trim(),sourcePages=pages){
  const found=[];
  for(const p of sourcePages){for(const m of p.text.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))){const value=convert(m[1],p);if(value!==null&&value!==''&&value!==undefined)found.push({value,page:p.page,quote:m[0].slice(0,300),method:p.method||'texto',confidence:p.confidence??null});}}
  const unique=[...new Map(found.map(f=>[String(f.value),f])).values()];
  if(unique.length===1){fields[key]=unique[0];}
  else if(unique.length>1){candidates[key]=unique;warnings.push('Hay varios valores posibles para '+key+'. Revisa el documento.');}
 }
 function capDate(key,label,sourcePages=pages){capture(key,new RegExp(label+'[^\\d]{0,35}('+datePattern+')','ig'),date,sourcePages);}
 const amount='(\\d{1,3}(?:[ .]\\d{3})*(?:[,.]\\d{2})?|\\d+(?:[,.]\\d{2})?)(?![\\d.,])';
 if(mode==='nueva'||mode==='completar'||mode==='renovar'){
  // Restrict identity/contact extraction to explicitly identified tenant sections.
  const roles=[];
  for(const p of pages){
   const re=/(?:y\s+de\s+(?:la\s+)?otra\s+parte|y\s+de\s+otra|arrendatari[oa]\s*[:\-]|inquilin[oa]\s*[:\-])\s*[,\n]?\s*([\s\S]{0,750})/ig;
   for(const m of p.text.matchAll(re)){let block=m[1].split(/\b(?:EXPONEN|MANIFIESTAN|ESTIPULACIONES|CLAUSULAS|INTERVIENEN|REUNIDOS)\b/i)[0];roles.push({...p,text:block.replace(/\s+/g,' ').trim()});}
  }
  if(roles.length){
   capture('nombre',/^(?:D\s*\.?\s*\/\s*D[ñn]a\.?\s*|D[ñn]a\.?\s*|D[oóeé](?:[ñn]|fi|h)a\s+|Don\s+|D\.\s*)?([A-ZÁÉÍÓÚÑ][A-Za-zÀ-ÿ'’ -]{3,100}?)(?=,|\n|\s+(?:en\s+adelante|mayor\s+de\s+edad|con\s+(?:DNI|NIE|pasaporte|domicilio)|titular\s+del|provista?\s+de|identificad[oa]))/gi,x=>{x=x.replace(/\s+/g,' ').trim();if(/^(?:en adelante|mayor de edad|la inquilina)/i.test(x)||/^(?:Doña|Don|Dña\.?)$/i.test(x))return null;return x===x.toUpperCase()?x.toLowerCase().replace(/(^|[ -])([a-zà-ÿ])/g,(_,a,b)=>a+b.toUpperCase()):x;},roles);
   capture('numeroDocumento',/(?:DNI(?:\s*\/\s*NIE)?|NIE|pasaporte|documento(?:\s+nacional)?(?:\s+de\s+identidad)?)\s*(?:n[úu]mero|n[º°.]|:|o\s+pasaporte)?\s*[:.\-]?\s*([A-Z0-9]{6,15})\b/ig,x=>x.replace(/\s+/g,'').toUpperCase(),roles);
   capture('email',/\b([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})\b/ig,x=>x.toLowerCase(),roles);
   if(!fields.email&&roles.some(p=>p.text.includes('@')))warnings.push('El correo electrónico no se lee con claridad. Compruébalo en el documento original; no se han adivinado caracteres.');
   capture('nacionalidad',/nacionalidad\s+([^,]{2,70}?)(?=,|\s+que\s+(?:estudia|trabaja))/ig,x=>/[.…]/.test(x)?null:x.trim(),roles);
   capture('ocupacion',/que\s+((?:estudia|trabaja)\s+en\s+[^,]{2,100}?)(?=,|\s+con\s+(?:domicilio|DNI|NIE|pasaporte)|$)/ig,x=>/[.…]/.test(x)?null:x.trim(),roles);
   capture('centroEstudiosTrabajo',/que\s+(?:estudia|trabaja)\s+en\s+([^,]{2,160}?)(?=,|\s+con\s+(?:domicilio|DNI|NIE|pasaporte)|$)/ig,x=>/[.…]/.test(x)?null:x.trim(),roles);
   capture('domicilioFamiliar',/domicilio\s+familiar\s+(?:en\s+)?([\s\S]{3,300}?)(?=\s+con\s+(?:DNI|NIE|pasaporte)\b|,?\s+(?:DNI|NIE|pasaporte)\b)/ig,x=>/[.…]/.test(x)?null:x.replace(/[,\s]+$/,'').trim(),roles);
   capture('telefono',/(?:tel[eé]fono\s*(?:m[oóé]vil)?|m[oóé]vil|tlf\.?|tel\.?)\s*[:.\-]?\s*(\+?\d[\d ()-]{7,19}\d)/ig,x=>x.replace(/[^+\d]/g,''),roles);
   if(fields.numeroDocumento){let raw=fields.numeroDocumento.quote;let tipo=/^pasaporte/i.test(raw)?'Pasaporte':/^NIE\b/i.test(raw)?'NIE':/^DNI\b/i.test(raw)?'DNI':'Sin indicar';fields.tipoDocumento={...fields.numeroDocumento,value:tipo};}
  }else warnings.push('No se identifica inequívocamente la parte arrendataria. Completa nombre y documento tras comprobarlos.');
  capture('habitacion',/(?:habitaci[oó]n\s*(?:identificada\s+con\s+el\s+)?(?:n[úu]mero|n[º°.]|:)?\s*|identificada\s+con\s+el\s+n[úu]mero\s*)([1-5Il|])(?=\s|[),.]|$)/ig,(x,p)=>{if(/^[Il|]$/.test(x)){if(p.method!=='OCR')return null;warnings.push('Revisa la habitación: el escaneo ha leído una letra o trazo en lugar del número 1.');return 1;}return Number(x);});
  capture('rentaAcordada',new RegExp('(?:renta\\s*(?:mensual)?|mensualidad|cantidad\\s+mensual\\s+de)\\s*(?:ser[aá]\\s+de|de|es\\s+de|:|por\\s+importe\\s+de)?\\s*'+amount+'\\s*(?:euros|€)','ig'),money);
  capture('fianzaImporte',new RegExp('(?:fianza\\s*(?:de|:|por\\s+importe\\s+de|de\\s+la\\s+cantidad\\s+de|de\\s+una\\s+cantidad\\s+de)?\\s*|(?:se[nñ]al[-– ]dep[oó]sito[-– ]fianza|fianza)\\s+que\\s+se\\s+entrega[^;]{0,250}?asciende\\s+a\\s+la\\s+cantidad\\s+de\\s*:?\\s*)'+amount+'\\s*(?:euros|€)','ig'),money);
  capDate('entryDate','(?:fecha\\s+de\\s+(?:inicio|entrada)|inicia\\s+el\\s+d[ií]a|comienza\\s+el|desde\\s+el|inicio\\s+del\\s+contrato|entrada)');
  capDate('exitDate','(?:fecha\\s+de\\s+(?:fin|finalizaci[oó]n|salida)|finaliza\\s+el|hasta\\s+el|termina\\s+el|fin\\s+del\\s+contrato|salida)');
 }else{
  const bankPages=pages.map(p=>({page:p,result:bankReceipt(p)})).filter(p=>p.result);
  const receiptPages=pages.filter(p=>!bankPages.some(b=>b.page===p));
  capture('importe',new RegExp('(?:importe\\s+total(?:\\s+(?:a\\s+pagar|del\\s+recibo|factura))?|total\\s+a\\s+pagar|total\\s+factura|total\\s+recibo|total\\s+cobrado|importe\\s+cobrado|importe\\s+adeudado|importe\\s+del\\s+recibo)\\s*[:€]?\\s*'+amount+'(?:\\s*(?:euros|EUR|€))?','ig'),money,receiptPages);
  if(!fields.importe&&!candidates.importe)capture('importe',new RegExp('(?:^|\\n)\\s*total\\s*[:€]?\\s*'+amount+'\\s*(?:euros|EUR|€)?(?:\\s*$|\\n)','igm'),money,receiptPages);
  capDate('fecha','(?:fecha\\s+(?:de\\s+)?(?:emisi[oó]n|factura|cargo|pago|abono|operaci[oó]n)|fecha)',receiptPages);
  capture('concepto',/(?:concepto|descripci[oó]n)\s*[:\-]\s*([^\n]{3,150})/ig,x=>x.trim(),receiptPages);
  capture('referencia',/(?:factura\s*(?:n[º°.]|n[úu]mero)|n[º°.]\s*factura|referencia)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9/\-]{2,45})/ig,x=>/\d/.test(x)?x.trim():null,receiptPages);
  capture('proveedor',/(?:proveedor|emisor|raz[oó]n\s+social)\s*[:\-]\s*([^\n]{3,120})/ig,x=>x.trim(),receiptPages);
  for(const key of ['importe','fecha','proveedor','concepto','referencia']){
   const found=[...(candidates[key]||[]),...(fields[key]?[fields[key]]:[]),...bankPages.map(b=>b.result.fields[key]).filter(Boolean)];
   const unique=[...new Map(found.map(f=>[String(f.value),f])).values()];
   if(unique.length===1)fields[key]=unique[0];
   else if(unique.length>1){delete fields[key];candidates[key]=unique;warnings.push('Hay varios valores posibles para '+key+'. Revisa el documento.');}
  }
  warnings.push(...bankPages.flatMap(b=>b.result.warnings));
  capture('numeroDocumento',/\b([XYZ]\d{7}[A-Z]|\d{8}[A-Z])\b/ig,x=>x.toUpperCase());
  capture('nombre',/(?:inquilin[oa]|arrendatari[oa]|ordenante|pagador)\s*[:\-]\s*([^\n,]{3,100})/ig);
  capture('periodo',/(?:periodo|mensualidad|mes\s+de\s+renta)\s*[:\-]?\s*(\d{4}-\d{2})\b/ig);
  const catRules=[['Comunidad',/comunidad\s+de\s+propietarios|cuota\s+comunidad|gastos\s+de\s+comunidad|\bC\.\s*P\.\s+[^\n]+/i],['Gas',/gas\s+natural|suministro\s+de\s+gas|consumo\s+de\s+gas|\bGAS\s+POWER\b/i],['Luz',/energ[ií]a\s+el[eé]ctrica|suministro\s+el[eé]ctrico|electricidad/i],['Agua',/suministro\s+de\s+agua|consumo\s+de\s+agua|canal\s+de\s+isabel/i],['Seguro',/seguro\s+(?:de\s+)?hogar|p[oó]liza\s+de\s+seguro/i],['Internet',/fibra\s+[oó]ptica|internet|banda\s+ancha|servicio\s+de\s+telecomunicaciones/i],['Impuestos',/impuesto\s+sobre|\bI[.\s]*B[.\s]*I\.?\b|bienes\s+inmuebles|tasa\s+municipal/i]];
  const hits=catRules.filter(([,re])=>re.test(text));
  if(hits.length===1){let p=pages.find(p=>hits[0][1].test(p.text));fields.categoria={value:hits[0][0],page:p.page,quote:p.text.match(hits[0][1])[0],method:p.method,confidence:p.confidence??null};}
  if(hits.length>1)warnings.push('El recibo menciona varias categorías. Selecciona la que corresponda.');
 }
 const alternatives=pages.filter(p=>p.alternative).map(p=>({...p.alternative,page:p.page}));
 if(alternatives.length){
  const secondary=extract(alternatives,mode);let recovered=false;
  for(const [key,field] of Object.entries(secondary.fields)){if(!fields[key]&&!candidates[key]){fields[key]=field;recovered=true;}}
  if(recovered){warnings.push('Algunos campos se han recuperado mediante OCR. Compruébalos en el original.');warnings.push(...secondary.warnings);}
 }
 if(pages.some(p=>p.visualFallbackFailed))warnings.push('No se ha podido completar la comprobación visual. Revisa los campos que faltan en el original.');
 for(const p of pages)if(p.method==='OCR'&&p.confidence<70)warnings.push('La página '+p.page+' tiene baja legibilidad. Comprueba sus datos.');
 return {fields,warnings:[...new Set(warnings)],candidates,pages};
}
function existingValue(tenant,key){if(key==='fianzaImporte')return typeof tenant.fianza==='object'?tenant.fianza.importe:null;return tenant[key]??(key==='numeroDocumento'?tenant.dni:null);}
function missingField(tenant,key){
 if(!tenant)return false;
 const value=existingValue(tenant,key);
 if(value===null||value===undefined||String(value).trim()==='')return true;
 if(key==='tipoDocumento')return norm(value)==='sin indicar';
 if(key==='habitacion')return ![1,2,3,4,5].includes(Number(value));
 if(key==='rentaAcordada')return !(money(value)>0);
 if(key==='fianzaImporte')return money(value)===null||money(value)===0&&!(money(tenant.rentaAcordada)>0)&&!tenant.exitDate&&!(tenant.docs||[]).length;
 return false;
}
function completionSelection(tenant,values){return CONTRACT_FIELDS.filter(key=>missingField(tenant,key)&&values[key]!==undefined&&values[key]!==null&&String(values[key]).trim()!=='');}
function matchTenant(data,fields){const list=data.inquilinas||[];const id=norm(fields.numeroDocumento?.value);if(id){const found=list.filter(t=>norm(t.numeroDocumento||t.dni)===id);if(found.length===1)return found[0].id;}
 const name=norm(fields.nombre?.value);if(name){const found=list.filter(t=>norm(t.nombre)===name);if(found.length===1)return found[0].id;}return null;}
function validContract(v){if(!String(v.nombre||'').trim())throw Error('Completa el nombre de la inquilina.');if(![1,2,3,4,5].includes(Number(v.habitacion)))throw Error('Selecciona la habitación.');if(!(money(v.rentaAcordada)>0))throw Error('Indica la renta mensual real.');if(money(v.fianzaImporte)===null)throw Error('Indica la fianza acordada; puede ser 0 €.');if(!validDate(v.entryDate)||!validDate(v.exitDate)||v.exitDate<v.entryDate)throw Error('Comprueba las fechas de inicio y fin del contrato.');}
function assertNoOverlap(data,v,except,includeSelf=false){for(const t of data.inquilinas||[]){if(!includeSelf&&String(t.id)===String(except))continue;for(const period of stays.list(t)){if(Number(period.habitacion)!==Number(v.habitacion)||period.estadoContrato==='rescindido')continue;if(!period.entryDate)throw Error('Falta la fecha de inicio de '+t.nombre+'.');if(v.entryDate<=(period.fechaSalidaReal||period.exitDate||'9999-12-31')&&v.exitDate>=period.entryDate)throw Error('El periodo se solapa con '+t.nombre+' en esta habitación. Revisa las fechas.');}}}
function duplicate(data,meta,kind){if((data.importacionesDocumentales||[]).some(x=>x.hash===meta.hash&&x.tipo===kind))throw Error('Este documento ya se incorporó con esta acción.');}
function documentMeta(meta){return {id:'doc_'+meta.hash.slice(0,16),nombre:meta.name,fecha:meta.today,hash:meta.hash,origen:'Lectura local revisada',archivoGuardado:false};}
function record(data,meta,kind,target,values){data.importacionesDocumentales=data.importacionesDocumentales||[];data.importacionesDocumentales.push({hash:meta.hash,nombre:meta.name,tipo:kind,target,fecha:meta.today,campos:values});}
function contract(original,values,meta,targetId,selected){
 const data=clone(original);const isNew=targetId===null;duplicate(data,meta,isNew?'contrato_nuevo':'contrato_actualizado');
 let t=isNew?{id:'inq_'+meta.hash.slice(0,16),nombre:'',telefono:'',email:'',numeroCuenta:'',tipoDocumento:'Sin indicar',numeroDocumento:'',dni:'',observaciones:'',nacimiento:'',nacionalidad:'',ocupacion:'',tipoContrato:'',renovacion:false,notas:[],acuerdos:[],docs:[],fianza:{importe:0,fecha:'',estado:'pendiente',metodo:'Sin indicar'}}:data.inquilinas.find(t=>String(t.id)===String(targetId));
 if(!t)throw Error('La ficha seleccionada ya no existe.');
 if(isNew){const fields={nombre:{value:values.nombre},numeroDocumento:{value:values.numeroDocumento}};if(matchTenant(data,fields))throw Error('Esta inquilina ya tiene ficha. Utiliza Renovar con nuevo contrato o Completar inquilina existente.');}
 if(!isNew&&t.contratos?.length&&selected.some(k=>['entryDate','exitDate','habitacion'].includes(k)&&values[k]&&String(values[k])!==String(t[k])))throw Error('Para añadir otra estancia utiliza Renovar con nuevo contrato. No se ha modificado el contrato anterior.');

 if(typeof t.fianza!=='object'||t.fianza===null)t.fianza={importe:money(t.fianza),fecha:'',estado:'pendiente',metodo:'Sin indicar'};
 if(!isNew&&!selected.length)throw Error('Selecciona al menos un campo que quieras incorporar.');
 const incompleteDeposit=missingField(t,'fianzaImporte');
 const keys=isNew?CONTRACT_FIELDS:selected;
 for(const key of keys){if(!CONTRACT_FIELDS.includes(key))continue;const val=values[key];if(val===undefined||val===null||val==='')continue;
 if(key==='fianzaImporte'){if(money(val)===null)throw Error('Fianza no válida.');t.fianza={...(typeof t.fianza==='object'?t.fianza:{}),...(incompleteDeposit?{estado:'pendiente',fecha:'',metodo:'Sin indicar'}:{}),importe:money(val)};}
 else if(key==='rentaAcordada'){if(!(money(val)>0))throw Error('Renta no válida.');t[key]=money(val);}
 else if(key==='habitacion')t[key]=Number(val);else t[key]=String(val).trim();
 }
 if(keys.includes('numeroDocumento'))t.dni=t.numeroDocumento;
 const merged={...t,fianzaImporte:existingValue(t,'fianzaImporte')};validContract(merged);assertNoOverlap(data,merged,t.id);
 if(t.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email))throw Error('Comprueba el email.');
 t.docs=[...(t.docs||[]).filter(d=>d.hash!==meta.hash),documentMeta(meta)];
 t.contrato={...(t.contrato||{}),renta:t.rentaAcordada,fianza:t.fianza.importe,inicio:t.entryDate,fin:t.exitDate};
 t.estadoContrato=t.estadoContrato==='rescindido'?'rescindido':t.exitDate<meta.today?'finalizado':t.entryDate>meta.today?'previsto':'activa';
 const saved=stays.snapshot(t,'contrato_'+meta.hash.slice(0,16));
 if(!t.contratos?.length)t.contratos=[saved];else{const index=t.contratos.findIndex(c=>c.id===t.contratoActualId);if(index>=0)t.contratos[index]={...t.contratos[index],...saved,id:t.contratos[index].id};}
 t.contratoActualId=t.contratos.find(c=>c.entryDate===t.entryDate&&c.exitDate===t.exitDate)?.id;
 if(isNew){data.inquilinas=data.inquilinas||[];data.inquilinas.push(t);}
 // Contract terms can only update unpaid expectations. Never turn terms into received money.
 data.cobrosByMonth=data.cobrosByMonth||{};
 if(t.estadoContrato!=='rescindido'&&(isNew||keys.some(k=>['rentaAcordada','entryDate','exitDate','habitacion'].includes(k)))){
  for(const [month,list] of Object.entries(data.cobrosByMonth)){
   if(month<t.entryDate.slice(0,7)||month>t.exitDate.slice(0,7))continue;
   for(let i=0;i<list.length;i++){const row=list[i];if(Number(row.habitacion)===t.habitacion&&row.status==='pendiente'&&(String(row.inquilinaId)===String(t.id)||!row.inquilinaId)){list[i]={...row,inquilinaId:t.id,amount:t.rentaAcordada};}}
   if(!list.some(row=>Number(row.habitacion)===t.habitacion))list.push({habitacion:t.habitacion,inquilinaId:t.id,amount:t.rentaAcordada,status:'pendiente'});
  }
 }
 stays.reconcile(data);record(data,meta,isNew?'contrato_nuevo':'contrato_actualizado',t.id,values);return data;
}
function renewal(original,values,meta,targetId){
 const data=clone(original),t=data.inquilinas?.find(t=>String(t.id)===String(targetId));if(!t)throw Error('Selecciona la inquilina que renueva.');
 duplicate(data,meta,'renovacion');const identity=norm(values.numeroDocumento),oldIdentity=norm(t.numeroDocumento||t.dni);if(identity&&oldIdentity&&identity!==oldIdentity)throw Error('El documento de identidad no corresponde a la inquilina seleccionada.');
 if(!identity&&!oldIdentity&&norm(values.nombre)!==norm(t.nombre))throw Error('Comprueba el nombre de la inquilina seleccionada.');
 const next={...values,nombre:t.nombre};validContract(next);
 const previous=stays.list(t).filter(c=>c.entryDate).sort((a,b)=>a.entryDate.localeCompare(b.entryDate)).at(-1);if(!previous)throw Error('Completa primero las fechas del contrato anterior.');
 if(next.entryDate<=(previous.fechaSalidaReal||previous.exitDate))throw Error('La renovación debe empezar después del contrato anterior.');
 if(stays.list(t).some(c=>c.hash===meta.hash||c.entryDate===next.entryDate&&c.exitDate===next.exitDate&&Number(c.habitacion)===Number(next.habitacion)))throw Error('Este contrato ya está registrado.');
 assertNoOverlap(data,next,t.id,true);
 t.contratos=copyPeriods(t);const doc=documentMeta(meta);const agreement={id:'contrato_'+meta.hash.slice(0,16),hash:meta.hash,habitacion:Number(next.habitacion),entryDate:next.entryDate,exitDate:next.exitDate,rentaAcordada:money(next.rentaAcordada),fianzaImporte:money(next.fianzaImporte),estadoContrato:'',docs:[doc],renovacionDe:previous.id};t.contratos.push(agreement);
 t.docs=[...(t.docs||[]),doc];t.renovacion=true;t.renovacionEstado='si';
 // The deposit held is a single balance on the person, not a receipt created by a contract.
 const held=t.fianza?.estado==='retenida'?money(t.fianza?.importe)||0:0;t.fianzaRenovacion={contratoId:agreement.id,acordada:agreement.fianzaImporte,retenida:held,diferencia:agreement.fianzaImporte-held,estado:'por_revisar'};
 stays.reconcile(data);
 stays.project(t,meta.today);record(data,meta,'renovacion',t.id,values);
 return data;
}
function copyPeriods(t){return clone(stays.list(t));}
function expense(original,real,annual,v,meta){
 const data=clone(original),rows=clone(real),totals=clone(annual);duplicate(data,meta,'gasto');
 const importe=money(v.importe);if(!(importe>0)||!validDate(v.fecha)||!v.concepto?.trim()||!CATEGORIES.includes(v.categoria))throw Error('Completa concepto, importe positivo, fecha y categoría.');
 const month=v.fecha.slice(0,7),y=month.slice(0,4),m=month.slice(5);
 const all=Object.values(rows).flat();if(v.referencia&&all.some(r=>norm(r.referencia)===norm(v.referencia)&&norm(r.proveedor)===norm(v.proveedor)&&r.fecha===v.fecha&&Number(r.importe)===importe))throw Error('Ya existe un gasto con esta referencia, emisor, fecha e importe.');
 let tenant=null;if(v.inquilinaId){tenant=data.inquilinas.find(t=>String(t.id)===String(v.inquilinaId));if(!tenant)throw Error('La inquilina seleccionada no existe.');}
 const row={id:'g_doc_'+meta.hash.slice(0,16),fecha:v.fecha,concepto:v.concepto.trim(),importe,categoria:v.categoria,habitacion:tenant?tenant.habitacion:'General',inquilinaId:tenant?.id||null,referencia:v.referencia||'',proveedor:v.proveedor||'',origen:'Lectura local revisada',recibo:false,documento:documentMeta(meta)};
 (rows[month]??=[]).push(row);totals[y]??={};totals[y][v.categoria]??={};totals[y][v.categoria][m]=Math.round((Number(totals[y][v.categoria][m]||0)+importe)*100)/100;
 record(data,meta,'gasto',row.id,v);return {data,rows,totals};
}
function income(original,v,meta){
 const data=clone(original);duplicate(data,meta,'cobro');const amount=money(v.importe);if(!(amount>0)||!validDate(v.fecha)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.periodo||''))throw Error('Indica importe positivo, fecha de abono y mes de renta.');
 const owner=data.inquilinas.find(t=>String(t.id)===String(v.inquilinaId));if(!owner)throw Error('Selecciona la inquilina que realiza el pago.');
 const matches=stays.list(owner).filter(c=>c.entryDate&&v.periodo>=c.entryDate.slice(0,7)&&v.periodo<=(c.fechaSalidaReal||c.exitDate||'9999-12-31').slice(0,7));
 if(matches.length>1)throw Error('Hay más de un contrato en este mes. Registra el cobro desde Ingresos indicando la habitación.');
 const t=matches.length?{...owner,...matches[0],id:owner.id}:owner;

 if(v.periodo<t.entryDate.slice(0,7)||t.exitDate&&v.periodo>t.exitDate.slice(0,7))throw Error('El mes de renta queda fuera del contrato. Comprueba la ficha o el periodo.');
 const list=(data.cobrosByMonth??={})[v.periodo]??=[];const previous=list.find(r=>Number(r.habitacion)===Number(t.habitacion));
 if(previous&&previous.status!=='pendiente')throw Error('Ya hay un cobro registrado en esa habitación y mes. Revísalo en Ingresos antes de incorporar otro recibo.');
 if(previous&&String(previous.inquilinaId)!==String(t.id))throw Error('El mes está asignado a otra inquilina. Revisa el contrato antes de incorporar el pago.');
 const row={...(previous||{}),habitacion:Number(t.habitacion),inquilinaId:t.id,amount,status:'cobrado',fechaAbono:v.fecha,metodo:v.metodo||'Sin indicar',periodo:v.periodo,origen:'Lectura local revisada',documento:documentMeta(meta)};
 if(previous)list[list.indexOf(previous)]=row;else list.push(row);
 owner.docs=[...(owner.docs||[]),documentMeta(meta)];record(data,meta,'cobro',owner.id,v);return data;
}
const api={pdfPageText,cleanFormText,CATEGORIES,CONTRACT_FIELDS,norm,money,date,validDate,extract,existingValue,missingField,completionSelection,matchTenant,contract,renewal,expense,income};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DonRamonDocumentCore=api;
})(typeof window!=='undefined'?window:globalThis);
