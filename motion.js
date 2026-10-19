// Small, interruptible motion primitives; no animation framework or network fonts.
const running=new WeakMap();
const EASE='cubic-bezier(.22,1,.36,1)';
function animate(el,frames,options={}){
  if(!el)return;
  const current=running.get(el);current?.cancel();
  const animation=el.animate(frames,{duration:380,easing:EASE,...options});
  running.set(el,animation);animation.finished.catch(()=>{}).finally(()=>{if(running.get(el)===animation)running.delete(el);});
  return animation;
}
export function enter(el){animate(el,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}]);}
export function feedback(el){animate(el,[{transform:'translateY(0)'},{transform:'translateY(-4px)'},{transform:'translateY(0)'}],{duration:420});}
export function setPhase(phase){const scene=document.querySelector('.transfer-scene');if(!scene||scene.dataset.phase===phase)return;scene.dataset.phase=phase;document.querySelector('#scene-label').textContent=({idle:'جاهز لرابطك',linked:'الرابط في مكانه',reading:'نقرأ الجودات المتاحة',preview:'اختر ما تحتاجه',working:'ملفك قيد التجهيز',ready:'جاهز لينتقل إلى ملفاتك',error:'نحتاج محاولة أخرى'})[phase]||'جاهز لرابطك';if(phase==='ready')feedback(scene.querySelector('.core-group'));}
export function alignNavigation(){const nav=document.querySelector('.navigation'),lens=nav.querySelector('.nav-lens'),active=nav.querySelector('[aria-current=page]');if(!active)return;const old=getComputedStyle(lens).transform;const x=active.offsetLeft-(nav.clientWidth-lens.offsetWidth-6);lens.style.setProperty('--nav-x',`${x}px`);const target=`translateX(${x}px)`;if(old!=='none')animate(lens,[{transform:old},{transform:target}],{duration:360});}
export function sweep(el){if(!el)return;el.classList.remove('is-sweeping');void el.offsetWidth;el.classList.add('is-sweeping');}
export function openDialog(el){if(!el||el.open)return;el.showModal();enter(el);}
document.addEventListener('pointerdown',event=>{const button=event.target.closest('.primary,.download-link');if(!button||button.disabled)return;const box=button.getBoundingClientRect(),wave=document.createElement('i');wave.className='press-wave';wave.style.left=`${event.clientX-box.left-15}px`;wave.style.top=`${event.clientY-box.top-15}px`;button.append(wave);const a=wave.animate([{transform:'scale(.2)',opacity:.8},{transform:'scale(18)',opacity:0}],{duration:650,easing:EASE});a.finished.catch(()=>{}).finally(()=>wave.remove());});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('motion-paused',document.hidden));
window.addEventListener('resize',alignNavigation);
requestAnimationFrame(alignNavigation);
enter(document.querySelector('.composer'));
