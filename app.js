import {enter,setPhase,alignNavigation,sweep,openDialog} from './motion.js';
const $ = s => document.querySelector(s);
const cfg = window.BANGZE_CONFIG || {};
const apiBase = (cfg.apiBase || '').replace(/\/$/, '');
const KEY = 'bangze-history-v1';
const ACTIVE = new Set(['queued', 'downloading', 'processing']);
const labels = {queued:'في الانتظار',downloading:'تنزيل إلى مساحة التجهيز',processing:'تجهيز الصيغة النهائية',ready:'جاهز للحفظ',failed:'تعذّر التجهيز',cancelled:'أُلغي التجهيز',expired:'انتهت النسخة المؤقتة'};
let preview = null, previewController, pollTimer, toastTimer, busy = false;
let token = readStorage('bangze-visitor-v1') || '';
let sessionPromise;
let history = readHistory();
const jobs = new Map();
function readStorage(key, storage=localStorage) { try { return storage.getItem(key); } catch { return null; } }
function readHistory() { try { const records=JSON.parse(readStorage(KEY)||'[]'); return Array.isArray(records)?records.filter(r=>r && typeof r.id==='string' && typeof r.title==='string').slice(0,50):[]; } catch { return []; } }
function persist() { try { localStorage.setItem(KEY,JSON.stringify(history.slice(0,50))); } catch { toast('تعذّر حفظ السجل محليًا. يمكنك متابعة التنزيل.'); } }
function escape(text) { return String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,4500); }
function bytes(n) { if(!Number.isFinite(n)||n<=0)return ''; return n<1048576?`${(n/1024).toFixed(0)} ك.ب`:`${(n/1048576).toFixed(1)} م.ب`; }
function showView(id) { for(const name of ['download-view','history-view','storage-view']) $(`#${name}`).hidden=name!==id; document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===id?'page':'false')); if(id==='history-view')renderHistory(); alignNavigation();enter($(`#${id}`));window.scrollTo({top:0,behavior:'instant'}); }
function message(text,error=false) { $('#link-message').textContent=text; $('#link-message').classList.toggle('error',error); }
function dialog(id) { openDialog($(id)); }
function needService() {
  if(!cfg.configured) { message('واجهة Bang-ZE جاهزة. خدمة تجهيز الروابط لم تُربط بالاستضافة بعد؛ التنزيل غير متاح الآن.',true); return true; }
  return false;
}
async function ensureSession(force=false){
  if(token&&!force)return;
  if(sessionPromise)return sessionPromise;
  sessionPromise=(async()=>{const result=await api('/session',{method:'POST',body:'{}'});token=result.token;try{localStorage.setItem('bangze-visitor-v1',token);}catch{}})().finally(()=>sessionPromise=null);
  return sessionPromise;
}
async function api(path,options={}) {
  const response=await fetch(`${apiBase}/api${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers},cache:'no-store',signal:options.signal||AbortSignal.timeout(90000)});
  const body=await response.json().catch(()=>({detail:'تعذّر قراءة رد خدمة التنزيل.'}));
  if(!response.ok) {
    if(response.status===401&&path!=='/session'&&!options.refreshed) { token=''; await ensureSession(true);return api(path,{...options,refreshed:true}); }
    const error=new Error(typeof body.detail==='string'?body.detail:'تعذّر إكمال الطلب. حاول مجددًا.');error.status=response.status;throw error;
  }
  return body;
}
function clientLink(value) {
  let u; try{u=new URL(value.trim());}catch{throw new Error('ألصق رابطًا كاملًا يبدأ بـ https://');}
  if(u.protocol!=='https:'||u.username||u.password||u.port)throw new Error('استخدم رابط HTTPS مباشرًا من المنصة.');
  const host=u.hostname.toLowerCase();
  if(!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','instagram.com','www.instagram.com','facebook.com','www.facebook.com','m.facebook.com','fb.watch','pinterest.com','www.pinterest.com','pin.it'].includes(host))throw new Error('ألصق رابط منشور من YouTube أو Instagram أو Facebook أو Pinterest.');
  if(u.pathname.startsWith('/playlist') || (/youtube\.com$/.test(host) && !['/watch','/shorts/','/live/'].some(p=>u.pathname.startsWith(p))))throw new Error('هذه النسخة للروابط المفردة. افتح الفيديو نفسه وانسخ رابطه.');
  return u.href;
}
$('#link-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy)return;
  let url;try{url=clientLink($('#url').value);}catch(err){message(err.message,true);return;}
  if(needService())return;
  busy=true;setPhase('reading');$('#inspect').disabled=true;$('#inspect span').textContent='قراءة الرابط…';$('#preview').hidden=true;preview=null;
  previewController?.abort(); previewController=new AbortController();
  const timeout=setTimeout(()=>previewController.abort(),90000);
  message('نجلب الجودات المتاحة لهذا الرابط.');
  try{await ensureSession();preview=await api('/preview',{method:'POST',body:JSON.stringify({url}),signal:previewController.signal});renderPreview();message('اختر ما تريد حفظه. لن ننزّل الخيارات الأخرى.');}
  catch(err){setPhase('error');message(err.name==='AbortError'?'استغرقت قراءة المصدر وقتًا طويلًا. حاول مجددًا.':err.message||'تعذّر الاتصال بالخدمة.',true);}
  finally{clearTimeout(timeout);busy=false;$('#inspect').disabled=false;$('#inspect span').textContent='معاينة الرابط';}
});
$('#url').addEventListener('input',()=>{ previewController?.abort(); preview=null; $('#preview').hidden=true;message('');setPhase($('#url').value.trim()?'linked':'idle'); });
$('#paste').addEventListener('click',async()=>{try{const value=await navigator.clipboard.readText();$('#url').value=value.slice(0,2048);$('#url').dispatchEvent(new Event('input'));$('#url').focus();}catch{$('#url').focus();toast('اضغط مطولًا داخل مربع الرابط، ثم اختر «لصق».');}});
function renderPreview() {
  $('#media-title').textContent=preview.title;$('#source').textContent=preview.source;
  $('#media-info').textContent=preview.duration?`${Math.floor(preview.duration/60)}:${String(Math.floor(preview.duration%60)).padStart(2,'0')}`:'';
  const safeThumb=typeof preview.thumbnail==='string'&&preview.thumbnail.startsWith('https://');
  $('#thumbnail').hidden=!safeThumb; if(safeThumb)$('#thumbnail').src=preview.thumbnail;
  const video=document.querySelector('input[name=mode][value=video]'), audio=document.querySelector('input[name=mode][value=audio]');
  video.disabled=!preview.options.some(f=>f.mode==='video');audio.disabled=!preview.options.some(f=>f.mode==='audio');
  (video.disabled?audio:video).checked=true;renderFormats();$('#preview').hidden=false;setPhase('preview');enter($('#preview'));sweep($('#prepare'));
}
function renderFormats() {
  if(!preview)return;
  const mode=$('input[name=mode]:checked').value;
  const options=preview.options.filter(f=>f.mode===mode);
  $('#quality').innerHTML=options.map(f=>`<option value="${escape(f.id)}">${escape(f.label)}${f.size?' — '+bytes(f.size):''}</option>`).join('');
  $('#format-note').textContent=mode==='audio'?(options[0]?.extract_from_video?'لا يوفّر المصدر صوتًا منفصلًا؛ يستخرجه الخادم من الفيديو مؤقتًا. ما تحفظه على الآيفون هو M4A فقط.':'نجهّز مسار الصوت وحده بصيغة M4A، دون ملف الفيديو.'):'الجودات مأخوذة من المصدر. لا نكبّر الدقة؛ نفضّل MP4 المتوافق مع الآيفون.';
  $('#prepare').textContent=mode==='audio'?'تجهيز الصوت فقط':'تجهيز الفيديو';$('#prepare').disabled=!options.length;
}
document.querySelectorAll('input[name=mode]').forEach(r=>r.addEventListener('change',()=>{renderFormats();enter($('#quality'));}));
$('#prepare').addEventListener('click',async()=>{
  if(!preview||needService())return;
  $('#prepare').disabled=true;message('');
  try{const job=await api('/jobs',{method:'POST',body:JSON.stringify({preview_id:preview.id,option_id:$('#quality').value})});upsert(job);renderJobs();schedulePoll(500);toast('بدأ تجهيز اختيارك.');}
  catch(err){message(err.message||'تعذّر الاتصال بالخدمة.',true);}
  finally{renderFormats();}
});
function upsert(job) {
  jobs.set(job.id,job);
  const prior=history.find(r=>r.id===job.id);
  history=[{id:job.id,url:job.url,title:job.title,status:job.status,created:job.created,expires:job.expires,format:job.format,...(prior?.opened?{opened:true}:{})},...history.filter(r=>r.id!==job.id)].sort((a,b)=>b.created-a.created).slice(0,50);
  persist();
}
function jobMarkup(job) {
  const ready=job.status==='ready';const active=ACTIVE.has(job.status);
  const percent=Number.isFinite(job.progress)?Math.max(0,Math.min(99,job.progress)):null;
  // The server signs the URL; only a same-backend relative file path is accepted.
  const path=typeof job.download_path==='string' && /^\/files\/[a-f0-9]{32}\?token=/.test(job.download_path)?job.download_path:null;
  return `<article class="job" data-job="${escape(job.id)}" data-status="${escape(job.status)}"><div class="job-top"><h3>${escape(job.title)}</h3><small dir="ltr">${escape(job.format)}</small></div><p class="status">${escape(labels[job.status]||job.status)}</p>${active?`<progress max="100" ${percent!==null&&job.status==='downloading'?`value="${percent}"`:''} aria-label="تقدم تجهيز الملف"></progress><div class="job-details">${percent!==null&&job.status==='downloading'?`${percent.toFixed(0)}%`:''} ${bytes(job.downloaded)} ${job.speed?`· ${bytes(job.speed)}/ث`:''}</div>`:''}${job.error?`<p class="error">${escape(job.error)}</p>`:''}${ready&&path?`<a class="download-link" href="${escape(apiBase+path)}" target="_blank" rel="noopener" data-save="${escape(job.id)}">حفظ في الملفات${job.size?' · '+bytes(job.size):''}</a><p class="job-details">الرابط مؤقت حتى ${new Date(job.expires*1000).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}. فتحه لا يؤكد اكتمال الحفظ على الجهاز.</p>`:''}<div class="job-actions">${active?`<button class="text-button" data-cancel="${escape(job.id)}">إلغاء</button>`:''}${['failed','expired','cancelled'].includes(job.status)?`<button class="text-button" data-retry="${escape(job.id)}">معاينة الرابط مجددًا</button>`:''}</div></article>`;
}
function renderJobs() { const values=[...jobs.values()].sort((a,b)=>b.created-a.created);const prior=new Map([...$('#jobs').children].map(el=>[el.dataset.job,el.dataset.status]));$('#jobs').innerHTML=values.map(jobMarkup).join('');$('#activity-heading').hidden=!values.length;$('#job-count').textContent=values.filter(j=>ACTIVE.has(j.status)).length;for(const el of $('#jobs').children){if(prior.get(el.dataset.job)!==el.dataset.status)enter(el);}if(values.some(j=>ACTIVE.has(j.status)))setPhase('working');else if(values[0]?.status==='ready')setPhase('ready'); }
function schedulePoll(delay=3000){clearTimeout(pollTimer);if(!document.hidden&&navigator.onLine&&token&&cfg.configured)pollTimer=setTimeout(poll,delay);}
async function poll() {
  const ids=[...new Set([...jobs.values()].filter(j=>ACTIVE.has(j.status)).map(j=>j.id).concat(history.filter(h=>ACTIVE.has(h.status)||h.status==='ready').slice(0,10).map(h=>h.id)))];
  let lost=false;
  for(const id of ids){try{upsert(await api(`/jobs/${id}`));}catch(err){if([404,410].includes(err.status)){const old=jobs.get(id)||history.find(h=>h.id===id);if(old)upsert({...old,status:'expired',error:'لم تعد النسخة المؤقتة متاحة. أعد معاينة الرابط.'});}else lost=true; if(!token)break;}}
  if(lost)message('تعذّر تحديث بعض الملفات. سنحاول مجددًا عند الاتصال؛ لا يعني ذلك فشل التجهيز.',true);
  renderJobs();if([...jobs.values()].some(j=>ACTIVE.has(j.status))||lost)schedulePoll(lost?10000:3000);
}
$('#jobs').addEventListener('click',async e=>{
  const cancel=e.target.closest('[data-cancel]'),retry=e.target.closest('[data-retry]'),save=e.target.closest('[data-save]');
  if(cancel){cancel.disabled=true;try{upsert(await api(`/jobs/${cancel.dataset.cancel}`,{method:'DELETE'}));renderJobs();}catch(err){toast(err.message);cancel.disabled=false;}}
  if(retry){const job=jobs.get(retry.dataset.retry);$('#url').value=job.url;$('#link-form').requestSubmit();window.scrollTo({top:0,behavior:'smooth'});}
  if(save){const row=history.find(h=>h.id===save.dataset.save);if(row){row.opened=true;persist();}}
});
function renderHistory(){
  $('#history-count').textContent=`${history.length} / 50`;
  $('#history').innerHTML=history.length?history.map(h=>`<article class="history-row"><div><h3>${escape(h.title)}</h3><p>${escape(labels[h.status]||h.status)}${h.opened?' · فُتح رابط الحفظ':''}<br>${escape(h.format)} · ${new Date(h.created*1000).toLocaleDateString('ar')}</p></div><button class="text-button" data-history-id="${escape(h.id)}">فتح الرابط</button></article>`).join(''):'<div class="empty"><span class="empty-arrow">≡</span><h3>لا روابط في السجل بعد</h3><p>سيظهر هنا ما تجهّزه على هذا الجهاز.</p></div>';
}
$('#history').addEventListener('click',e=>{const b=e.target.closest('[data-history-id]');if(!b)return;const h=history.find(x=>x.id===b.dataset.historyId);$('#url').value=h.url;$('#preview').hidden=true;preview=null;showView('download-view');$('#url').focus();});
function clearHistory(){if(!confirm('مسح سجل الروابط؟ لن تُحذف الملفات من تطبيق «الملفات»، ولن تُلغى المهام الجارية.'))return;history=history.filter(h=>ACTIVE.has(h.status));persist();renderHistory();toast('مُسح السجل. بقيت المهام الجارية.');}
$('#clear-history').addEventListener('click',clearHistory);$('#clear-local').addEventListener('click',clearHistory);
document.querySelectorAll('[data-view],[data-open]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view||b.dataset.open)));
$('#install').addEventListener('click',()=>dialog('#install-dialog'));
document.querySelectorAll('dialog .close,dialog .close-action').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
if(!cfg.configured){$('#service-notice').hidden=false;$('#service-notice').innerHTML='<strong>الاستضافة قيد التجهيز</strong>هذه معاينة واجهة قابلة للتثبيت. تنزيل الروابط سيعمل بعد ربط خادم المعالجة.';}
function connection(){ $('#offline').hidden=navigator.onLine;if(navigator.onLine)schedulePoll(0); }
window.addEventListener('online',connection);window.addEventListener('offline',connection);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(pollTimer);else schedulePoll(0);});
if('serviceWorker'in navigator)navigator.serviceWorker.register(new URL('sw.js',document.baseURI).pathname).catch(()=>{});
connection();renderJobs();
