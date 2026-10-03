(function(){
'use strict';
const overlays='#root .fixed.inset-0,#custom-cobro-nuevo-overlay,#rentabilidad-v12-overlay,#ia-doc-overlay,#backup-panel,#reload-panel,#income-panel,#expense-panel';
function classify(text){text=String(text||'').trim();if(/^[×✕✖✗xX]$/.test(text))return 'close';if(/^(?:[←‹❮]\s*)?Volver(?:\s|$)/i.test(text)||text==='←')return 'back';if(text==='Cerrar')return 'close-text';return '';}
function update(){const nav=document.getElementById('app-bottom-nav');if(nav)nav.classList.add('dr-nav');document.querySelectorAll(overlays).forEach(overlay=>{overlay.classList.add('dr-modal-overlay');const card=[...overlay.children].find(c=>['DIV','SECTION'].includes(c.tagName));if(!card)return;card.classList.add('dr-modal-card');const first=card.firstElementChild;if(first&&first.tagName==='DIV'&&first.querySelector('button')){first.classList.add('dr-modal-header');if(overlay.classList.contains('z-50')){const exit=first.querySelector('button');if(exit){exit.classList.add('dr-close');exit.setAttribute('aria-label','Cerrar');}}}
 card.querySelectorAll('button').forEach(button=>{const type=classify(button.textContent);if(type==='close'){button.classList.add('dr-close');button.setAttribute('aria-label','Cerrar');}if(type==='back'&&!button.classList.contains('dr-close'))button.classList.add('dr-back-button');if(type==='close-text')button.classList.add('dr-secondary-close');});
 });}
function init(){const style=document.createElement('style');style.textContent=`
:root{--dr-nav-gap:calc(16px + env(safe-area-inset-bottom,0px));--dr-modal-gap:16px}
#app-bottom-nav{bottom:var(--dr-nav-gap)!important;isolation:isolate;z-index:40}
#app-bottom-nav::before{content:"";position:absolute;z-index:-1;top:0;bottom:calc(-1 * var(--dr-nav-gap));left:50%;width:100vw;transform:translateX(-50%);background:#f5f7fb;pointer-events:auto}
#app-bottom-nav::after{content:"";position:absolute;z-index:-1;inset:0;border-radius:26px;background:white}
.dr-modal-overlay{align-items:center!important;justify-content:center!important;padding:var(--dr-modal-gap)!important;overflow:hidden!important;background:rgba(15,23,42,.4)!important;backdrop-filter:blur(6px)!important;-webkit-backdrop-filter:blur(6px)!important;box-sizing:border-box}
.dr-modal-card{width:100%!important;max-width:600px!important;min-height:0!important;height:auto!important;max-height:calc(90dvh - 2 * var(--dr-modal-gap))!important;margin:0!important;border:1px solid #e5e7eb!important;border-radius:24px!important;background:white!important;box-shadow:0 20px 60px rgba(15,23,42,.2)!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;box-sizing:border-box;position:relative!important;transform:none!important;color:#0f172a;font-family:inherit!important}
#backup-panel>.dr-modal-card,#reload-panel>.dr-modal-card{max-width:600px!important;border-radius:24px!important;padding:24px!important}
.dr-modal-card.modal-centered,.dr-modal-card[class*="max-w-"]{padding:24px!important}
.dr-modal-header{position:sticky!important;top:-24px;z-index:15!important;background:white!important;padding:16px 0!important;margin:0 0 16px!important;min-height:60px;box-sizing:border-box;border-bottom:1px solid #f1f5f9;align-items:flex-start!important;border-radius:0!important;gap:12px}
#rentabilidad-v12-overlay>.dr-modal-card,#ia-doc-overlay>.dr-modal-card,#custom-cobro-nuevo-overlay>.dr-modal-card{padding:0!important}
#rentabilidad-v12-overlay .dr-modal-header,#ia-doc-overlay .dr-modal-header,#custom-cobro-nuevo-overlay .dr-modal-header{top:0!important;padding:20px 24px!important;margin:0!important}
.dr-modal-card .dr-close{position:relative;flex:0 0 40px!important;width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important;max-width:40px!important;padding:0!important;border:1px solid #e5e7eb!important;border-radius:50%!important;background:#f5f7fb!important;color:#0f172a!important;font-size:0!important;line-height:1!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;box-shadow:none!important;cursor:pointer;z-index:20}
.dr-modal-card .dr-close::after{content:"×";font:500 24px/1 system-ui}
.dr-modal-card>.dr-close{position:sticky!important;top:0!important;float:right!important}
.dr-modal-card .dr-back-button,.dr-modal-card .dr-secondary-close{font-family:inherit!important;font-size:14px!important;font-weight:700!important;line-height:20px!important;min-height:44px!important;padding:11px 16px!important;border:1px solid #e5e7eb!important;border-radius:14px!important;background:white!important;color:#2b5cff!important;box-shadow:none!important;width:auto!important;cursor:pointer}
.dr-modal-card button:focus-visible{outline:2px solid #2b5cff;outline-offset:3px}
.dr-modal-card>h2{position:sticky;top:0;background:white;padding:8px 48px 12px 0;font-size:22px!important;margin-top:0;z-index:10}
@media(max-width:420px){#backup-panel>.dr-modal-card,#reload-panel>.dr-modal-card{padding:20px!important}:root{--dr-modal-gap:12px}.dr-modal-card.modal-centered,.dr-modal-card[class*="max-w-"]{padding:20px!important}.dr-modal-header{top:-20px}#rentabilidad-v12-overlay .dr-modal-header,#ia-doc-overlay .dr-modal-header,#custom-cobro-nuevo-overlay .dr-modal-header{padding:20px!important}}
`;document.head.appendChild(style);update();new MutationObserver(update).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
