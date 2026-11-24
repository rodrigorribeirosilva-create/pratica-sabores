/* Experimento MDN: mantém carrinho/menu.js e painel originais. */
(()=>{'use strict';if(!document.body.classList.contains('mdn-premium'))return;
const hero=document.getElementById('heroCard'),content=hero.querySelector('.hero-content'),grid=document.getElementById('grid'),heading=document.querySelector('.section-head');
const img=document.createElement('img');img.className='mdn-cover';img.alt='';hero.prepend(img);const kicker=document.createElement('span');kicker.className='mdn-kicker';kicker.textContent='PERFUMES E PRESENTES';content.prepend(kicker);const cta=document.createElement('a');cta.className='mdn-cta';cta.href='#menuTitle';cta.textContent='EXPLORAR A COLEÇÃO →';content.appendChild(cta);const note=document.createElement('small');note.className='mdn-cover-note';content.appendChild(note);
const search=document.createElement('input');search.className='mdn-search';search.type='search';search.placeholder='Buscar no catálogo...';search.setAttribute('aria-label','Buscar produtos na categoria atual');heading.insertAdjacentElement('afterend',search);const status=document.createElement('p');status.className='mdn-search-note';status.setAttribute('aria-live','polite');search.insertAdjacentElement('afterend',status);
function filter(){const q=search.value.trim().toLocaleLowerCase('pt-BR');let count=0;grid.querySelectorAll('.card').forEach(card=>{const match=!q||card.textContent.toLocaleLowerCase('pt-BR').includes(q);card.hidden=!match;if(match)count++});status.textContent=q?(count?count+' produto(s) nesta categoria':'Nenhum produto encontrado nesta categoria.'):''}
search.addEventListener('input',filter);new MutationObserver(filter).observe(grid,{childList:true});
function validUrl(s){try{const u=new URL(s,location.href);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
function aplicarCapa(value){const url=validUrl(value||'');img.src=url||'/img/mdn-premium-ilustrativa.jpg';note.textContent=url?'':'Imagem ilustrativa'}
document.addEventListener('mdn:business',event=>aplicarCapa((event.detail||{}).cover_url));
async function loadCover(){try{const r=await fetch('/l/mdn-presents/api/menu',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();aplicarCapa((d.business||{}).cover_url)}catch{aplicarCapa('')}}
loadCover();
})();
