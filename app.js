import {enter,setPhase,alignNavigation,openDialog} from './motion.js?v=2.2.0';
const $ = s => document.querySelector(s);
// The published Pages build has a fixed API origin. The Docker build uses
// its own origin. Neither depends on an asynchronously loaded config script.
const apiBase = location.hostname === 'ahmadmustafa0978.github.io'
  ? 'https://bang-ze-engine.onrender.com'
  : '';
const KEY = 'bangze-history-v1';
const ACTIVE = new Set(['queued', 'downloading', 'processing']);
const labels = {queued:'في الانتظار',downloading:'تنزيل إلى مساحة التجهيز',processing:'تجهيز الصيغة النهائية',ready:'جاهز للحفظ',failed:'تعذّر التجهيز',cancelled:'أُلغي التجهيز',expired:'انتهت النسخة المؤقتة'};
let preview = null, previewController, pollTimer, toastTimer, busy = false;
// Jobs started on this page open their save link by themselves when ready.
const autoSave = new Set();
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
async function ensureSession(force=false){
  if(token&&!force)return;
  if(sessionPromise)return sessionPromise;
  sessionPromise=(async()=>{const result=await api('/session',{method:'POST',body:'{}'});if(typeof result.token!=='string')throw new Error('خدمة التنزيل تبدأ الآن. انتظر قليلًا ثم حاول مجددًا.');token=result.token;try{localStorage.setItem('bangze-visitor-v1',token);}catch{}})().finally(()=>sessionPromise=null);
  return sessionPromise;
}
async function api(path,options={}) {
  const response=await fetch(`${apiBase}/api${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers},cache:'no-store',signal:options.signal||AbortSignal.timeout(90000)});
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('خدمة التنزيل تستيقظ الآن أو لا تستجيب. انتظر قليلًا ثم حاول مجددًا.');
  const body=await response.json().catch(()=>{throw new Error('تعذّر قراءة رد خدمة التنزيل. حاول مجددًا.');});
  if(!response.ok) {
    if(response.status===401&&path!=='/session'&&!options.refreshed) { token=''; await ensureSession(true);return api(path,{...options,refreshed:true}); }
    const error=new Error(typeof body.detail==='string'?body.detail:'تعذّر إكمال الطلب. حاول مجددًا.');error.status=response.status;throw error;
  }
  return body;
}
// Apps often share a sentence around the link; the first https link is used.
function clientLink(value) {
  const found=String(value||'').match(/https:\/\/[^\s<>"'“”]+/i);
  if(!found)throw new Error('لم نجد رابطًا. انسخ رابط الفيديو من التطبيق ثم اضغط الزر.');
  let u; try{u=new URL(found[0].replace(/[).,،]+$/,''));}catch{throw new Error('الرابط غير مكتمل. انسخه من جديد ثم اضغط الزر.');}
  if(u.username||u.password||u.port)throw new Error('استخدم رابط HTTPS مباشرًا من المنصة.');
  const host=u.hostname.toLowerCase();
  if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(host))throw new Error('روابط YouTube غير مدعومة. استخدم Instagram أو Facebook أو Pinterest.');
  if(!['instagram.com','www.instagram.com','facebook.com','www.facebook.com','m.facebook.com','fb.watch','pinterest.com','www.pinterest.com','pin.it'].includes(host))throw new Error('هذا الرابط ليس من Instagram أو Facebook أو Pinterest.');
  return u.href;
}
const actions=[...document.querySelectorAll('[data-mode]')].map(button=>({button,label:button.querySelector('span').textContent}));
function setBusy(active){for(const {button,label} of actions){button.disabled=!!active;button.querySelector('span').textContent=button===active?'نجهّز…':label;button.classList.toggle('is-working',button===active);}}
async function readClipboard(){try{return await navigator.clipboard.readText();}catch{return '';}}
// One action: read the link, choose the best real format, start the job.
async function start(mode,button){
  if(busy)return;
  busy=true;
  let source=$('#url').value.trim();
  if(!/https:\/\//i.test(source)){const pasted=(await readClipboard()).slice(0,2048);if(pasted){source=pasted;$('#url').value=pasted;}}
  let url;
  try{url=clientLink(source);}catch(err){busy=false;setPhase('error');message(err.message,true);return;}
  setBusy(button);setPhase('reading');
  message(mode==='audio'?'نقرأ الرابط ونجهّز الصوت…':'نقرأ الرابط ونجهّز أعلى جودة…');
  previewController?.abort();previewController=new AbortController();
  const timeout=setTimeout(()=>previewController.abort(),90000);
  try{
    await ensureSession();
    for(let attempt=0;;attempt++){
      if(!preview||preview.link!==url){preview=await api('/preview',{method:'POST',body:JSON.stringify({url}),signal:previewController.signal});preview.link=url;}
      // The server lists video options from the highest quality down.
      const option=preview.options.find(f=>f.mode===mode);
      if(!option)throw new Error(mode==='audio'?'هذا الرابط لا يوفّر صوتًا. جرّب زر الفيديو.':'هذا الرابط لا يوفّر فيديو متوافقًا. جرّب زر الصوت.');
      renderPreview(option);
      try{
        const job=await api('/jobs',{method:'POST',body:JSON.stringify({preview_id:preview.id,option_id:option.id})});
        autoSave.add(job.id);upsert(job);renderJobs();schedulePoll(500);
        message('بدأ التنزيل. عند الانتهاء يُفتح الحفظ وحده.');
        break;
      }catch(err){
        // A preview expires after 30 minutes or a service restart: read it once more.
        if(err.status===410&&attempt===0){preview=null;continue;}
        throw err;
      }
    }
  }catch(err){setPhase('error');message(err.name==='AbortError'?'استغرقت قراءة المصدر وقتًا طويلًا. حاول مجددًا.':err.message||'تعذّر الاتصال بالخدمة.',true);}
  finally{clearTimeout(timeout);busy=false;setBusy(null);}
}
$('#link-form').addEventListener('submit',e=>{e.preventDefault();const button=e.submitter?.dataset.mode?e.submitter:$('#get-video');start(button.dataset.mode,button);});
$('#url').addEventListener('input',()=>{ if(busy)return; preview=null; $('#preview').hidden=true;message('');setPhase($('#url').value.trim()?'linked':'idle'); });
// Pasting a link into the box starts the best video without another tap.
$('#url').addEventListener('paste',()=>setTimeout(()=>{if(/https:\/\//i.test($('#url').value))start('video',$('#get-video'));},0));
function renderPreview(option) {
  $('#media-title').textContent=preview.title;$('#source').textContent=preview.source;
  const duration=preview.duration?`${Math.floor(preview.duration/60)}:${String(Math.floor(preview.duration%60)).padStart(2,'0')}`:'';
  $('#media-info').textContent=[duration,option.label,bytes(option.size)].filter(Boolean).join(' · ');
  const safeThumb=typeof preview.thumbnail==='string'&&preview.thumbnail.startsWith('https://');
  $('#thumbnail').hidden=!safeThumb; if(safeThumb)$('#thumbnail').src=preview.thumbnail;
  if($('#preview').hidden){$('#preview').hidden=false;enter($('#preview'));}
}
function saveFile(job){
  const path=typeof job.download_path==='string'&&/^\/files\/[a-f0-9]{32}\?token=/.test(job.download_path)?job.download_path:null;
  if(!path)return;
  const link=document.createElement('a');link.href=apiBase+path;link.rel='noopener';document.body.append(link);link.click();link.remove();
  const row=history.find(h=>h.id===job.id);if(row){row.opened=true;persist();}
  toast('الملف جاهز. إذا سألك Safari اختر «تنزيل».');
}
function upsert(job) {
  jobs.set(job.id,job);
  const prior=history.find(r=>r.id===job.id);
  history=[{id:job.id,url:job.url,title:job.title,status:job.status,created:job.created,expires:job.expires,format:job.format,...(prior?.opened?{opened:true}:{})},...history.filter(r=>r.id!==job.id)].sort((a,b)=>b.created-a.created).slice(0,50);
  persist();
}
function jobMarkup(job) {
  // A signed link stops working at its expiry even before the next poll arrives.
  if(job.status==='ready'&&Number.isFinite(job.expires)&&job.expires*1000<=Date.now())job={...job,status:'expired'};
  const ready=job.status==='ready';const active=ACTIVE.has(job.status);
  const percent=Number.isFinite(job.progress)?Math.max(0,Math.min(99,job.progress)):null;
  // The server signs the URL; only a same-backend relative file path is accepted.
  const path=typeof job.download_path==='string' && /^\/files\/[a-f0-9]{32}\?token=/.test(job.download_path)?job.download_path:null;
  return `<article class="job" data-job="${escape(job.id)}" data-status="${escape(job.status)}"><div class="job-top"><h3>${escape(job.title)}</h3><small dir="ltr">${escape(job.format)}</small></div><p class="status">${escape(labels[job.status]||job.status)}</p>${active?`<progress max="100" ${percent!==null&&job.status==='downloading'?`value="${percent}"`:''} aria-label="تقدم تجهيز الملف"></progress><div class="job-details">${percent!==null&&job.status==='downloading'?`${percent.toFixed(0)}%`:''} ${bytes(job.downloaded)} ${job.speed?`· ${bytes(job.speed)}/ث`:''}</div>`:''}${job.error?`<p class="error">${escape(job.error)}</p>`:''}${ready&&path?`<a class="download-link" href="${escape(apiBase+path)}" target="_blank" rel="noopener" data-save="${escape(job.id)}">حفظ في الملفات${job.size?' · '+bytes(job.size):''}</a><p class="job-details">الرابط مؤقت حتى ${new Date(job.expires*1000).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}. فتحه لا يؤكد اكتمال الحفظ على الجهاز.</p>`:''}<div class="job-actions">${active?`<button class="text-button" data-cancel="${escape(job.id)}">إلغاء</button>`:''}${['failed','expired','cancelled'].includes(job.status)?`<button class="text-button" data-retry="${escape(job.id)}">معاينة الرابط مجددًا</button>`:''}</div></article>`;
}
function renderJobs() { const values=[...jobs.values()].sort((a,b)=>b.created-a.created);const prior=new Map([...$('#jobs').children].map(el=>[el.dataset.job,el.dataset.status]));$('#jobs').innerHTML=values.map(jobMarkup).join('');$('#activity-heading').hidden=!values.length;$('#job-count').textContent=values.filter(j=>ACTIVE.has(j.status)).length;for(const el of $('#jobs').children){if(prior.get(el.dataset.job)!==el.dataset.status)enter(el);}if(values.some(j=>ACTIVE.has(j.status)))setPhase('working');else if(values[0]?.status==='ready')setPhase('ready'); }
function schedulePoll(delay=3000){clearTimeout(pollTimer);if(!document.hidden&&navigator.onLine&&token)pollTimer=setTimeout(poll,delay);}
async function poll() {
  const ids=[...new Set([...jobs.values()].filter(j=>ACTIVE.has(j.status)).map(j=>j.id).concat(history.filter(h=>ACTIVE.has(h.status)||h.status==='ready').slice(0,10).map(h=>h.id)))];
  let lost=false;
  for(const id of ids){try{const job=await api(`/jobs/${id}`);upsert(job);if(job.status==='ready'&&autoSave.delete(id))saveFile(job);}catch(err){if([404,410].includes(err.status)){const old=jobs.get(id)||history.find(h=>h.id===id);if(old)upsert({...old,status:'expired',error:'لم تعد النسخة المؤقتة متاحة. أعد معاينة الرابط.'});}else lost=true; if(!token)break;}}
  if(lost)message('تعذّر تحديث بعض الملفات. سنحاول مجددًا عند الاتصال؛ لا يعني ذلك فشل التجهيز.',true);
  renderJobs();
  const values=[...jobs.values()];
  if(values.some(j=>ACTIVE.has(j.status))||lost)schedulePoll(lost?10000:3000);
  else if(values.some(j=>j.status==='ready'))schedulePoll(30000);
}
$('#jobs').addEventListener('click',async e=>{
  const cancel=e.target.closest('[data-cancel]'),retry=e.target.closest('[data-retry]'),save=e.target.closest('[data-save]');
  if(cancel){cancel.disabled=true;try{upsert(await api(`/jobs/${cancel.dataset.cancel}`,{method:'DELETE'}));renderJobs();}catch(err){toast(err.message);cancel.disabled=false;}}
  if(retry){const job=jobs.get(retry.dataset.retry);$('#url').value=job.url;preview=null;window.scrollTo({top:0,behavior:'smooth'});start(job.mode==='audio'?'audio':'video',job.mode==='audio'?$('#get-audio'):$('#get-video'));}
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
const shareBase=`${location.origin}${location.pathname}#`;
$('#share-link').textContent=shareBase;
$('#share-setup').addEventListener('click',()=>dialog('#share-dialog'));
$('#copy-share-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(shareBase);toast('نُسخ الرابط. الصقه في إجراء «نص».');}catch{toast('اضغط مطولًا على الرابط وانسخه.');}});
document.querySelectorAll('dialog .close,dialog .close-action').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
function connection(){ $('#offline').hidden=navigator.onLine;if(navigator.onLine)schedulePoll(0); }
window.addEventListener('online',connection);window.addEventListener('offline',connection);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(pollTimer);else schedulePoll(0);});
if('serviceWorker'in navigator)navigator.serviceWorker.register(new URL('sw.js',document.baseURI).pathname,{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});
connection();renderJobs();
// Links arriving from the iPhone share-sheet shortcut (#link), Android share
// targets (?url= / ?text=) or a plain ?url= start the best video at once.
const params=new URLSearchParams(location.search);
let incoming=params.get('url')||params.get('text')||'';
try{if(!incoming&&location.hash.length>1)incoming=decodeURIComponent(location.hash.slice(1));}catch{incoming=location.hash.slice(1);}
if(/https:\/\//i.test(incoming)){
  window.history.replaceState(null,'',location.pathname);
  $('#url').value=incoming.slice(0,2048);
  const audio=params.get('mode')==='audio';
  start(audio?'audio':'video',audio?$('#get-audio'):$('#get-video'));
}
