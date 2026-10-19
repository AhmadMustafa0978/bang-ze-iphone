// Bang-ZE motion engine. Local Canvas, CSS and Web Animations only: no framework,
// network fonts or remote assets. A particle core morphs with the real service
// phase, surfaces react to the pointer and presses release a spark burst.
const running=new WeakMap();
const EASE='cubic-bezier(.22,1,.36,1)';
const SPRING='cubic-bezier(.34,1.56,.64,1)';
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const pointer={x:-1e5,y:-1e5};
const PLASMA=['#ffd100','#ffe566','#1e5ac8','#3f7be0','#8fb6ff','#ffffff'];
const PALETTES={ready:['#ffd100','#ffe14d','#fff1a6','#ffc400','#ffe566','#ffffff'],error:['#ff5a76','#ff2d55','#ff8a65','#ff7a59','#ff9aa8','#ffffff']};
const LABELS={idle:'جاهز لرابطك',linked:'الرابط في مكانه',reading:'نقرأ الجودات المتاحة',preview:'اختر ما تحتاجه',working:'ملفك قيد التجهيز',ready:'جاهز لينتقل إلى ملفاتك',error:'نحتاج محاولة أخرى'};

function animate(el,frames,options={}){
  if(!el)return;
  const current=running.get(el);current?.cancel();
  const animation=el.animate(frames,{duration:380,easing:EASE,...options});
  running.set(el,animation);animation.finished.catch(()=>{}).finally(()=>{if(running.get(el)===animation)running.delete(el);});
  return animation;
}

// Words, never letters: splitting Arabic letters would break their joined shapes.
function splitWords(heading){
  if(heading.dataset.split)return;
  heading.dataset.split='1';
  for(const node of [...heading.childNodes]){
    if(node.nodeType===Node.ELEMENT_NODE){node.classList.add('w');continue;}
    if(node.nodeType!==Node.TEXT_NODE)continue;
    const fragment=document.createDocumentFragment();
    for(const chunk of node.textContent.split(/(\s+)/)){
      if(!chunk)continue;
      if(/^\s+$/.test(chunk)){fragment.append(chunk);continue;}
      const word=document.createElement('span');word.className='w';word.textContent=chunk;fragment.append(word);
    }
    node.replaceWith(fragment);
  }
}
function revealWords(root){
  const heading=root.matches('h1')?root:root.querySelector('h1');
  if(!heading)return;
  splitWords(heading);
  heading.querySelectorAll('.w').forEach((word,i)=>animate(word,[{opacity:0,transform:'translateY(55%) skewY(7deg) scale(.92)'},{opacity:1,transform:'none'}],{duration:900,delay:90+i*85,fill:'backwards'}));
}

export function enter(el){
  if(!el)return;
  animate(el,[{opacity:0,transform:'translateY(22px) scale(.975)'},{opacity:1,transform:'none'}],{duration:640});
  revealWords(el);
  el.querySelectorAll('.storage-list article,.history-row,.save-hint,.eyebrow').forEach((item,i)=>item.animate([{opacity:0,transform:'translateY(26px)'},{opacity:1,transform:'none'}],{duration:760,delay:140+i*75,easing:EASE,fill:'backwards'}));
}
export function feedback(el){animate(el,[{transform:'scale(1)'},{transform:'scale(1.06)'},{transform:'scale(1)'}],{duration:520,easing:SPRING});}
export function sweep(el){if(!el)return;el.classList.remove('is-sweeping');void el.offsetWidth;el.classList.add('is-sweeping');}
export function openDialog(el){
  if(!el||el.open)return;
  el.showModal();
  animate(el,[{opacity:0,transform:'translateY(40px) scale(.9) rotateX(14deg)'},{opacity:1,transform:'none'}],{duration:700,easing:SPRING});
}

export function alignNavigation(){
  const nav=document.querySelector('.navigation'),lens=nav?.querySelector('.nav-lens'),active=nav?.querySelector('[aria-current=page]');
  if(!active)return;
  const old=getComputedStyle(lens).transform;
  const x=active.offsetLeft-(nav.clientWidth-lens.offsetWidth-6);
  if(lens.style.getPropertyValue('--nav-x')===`${x}px`)return;
  lens.style.setProperty('--nav-x',`${x}px`);
  const target=`translateX(${x}px)`;
  if(old==='none')return;
  const from=new DOMMatrixReadOnly(old).m41;
  // Liquid lens: it stretches toward the destination, then settles.
  animate(lens,[{transform:old},{transform:`translateX(${(from+x)/2}px) scaleX(1.45) scaleY(.82)`,offset:.45},{transform:target}],{duration:620,easing:SPRING});
  active.querySelector('svg')?.animate([{transform:'translateY(0) rotate(0)'},{transform:'translateY(-7px) rotate(-10deg)'},{transform:'none'}],{duration:560,easing:SPRING});
}

/* ---------- Particle core ---------- */
const core=(()=>{
  const canvas=document.querySelector('.core-canvas');
  const ctx=canvas?.getContext('2d');
  if(!ctx)return {mode(){},burst(){},poke(){},start(){},stop(){}};
  const COUNT=matchMedia('(max-width:520px)').matches?900:1500;
  const x=new Float32Array(COUNT),y=new Float32Array(COUNT),vx=new Float32Array(COUNT),vy=new Float32Array(COUNT);
  const seed=new Float32Array(COUNT),angle=new Float32Array(COUNT),radius=new Float32Array(COUNT);
  for(let i=0;i<COUNT;i++){seed[i]=Math.random();angle[i]=Math.random()*Math.PI*2;radius[i]=.08+Math.random()*.5;}
  const HEX='m200 89 62 35v72l-62 36-62-36v-72z';
  const Z='M174 135h52v12l-28 28h24v-9l15 17-15 17v-13h-51v-13l28-27h-25z';
  function sample(draw){
    const S=240,c=document.createElement('canvas');c.width=c.height=S;
    const g=c.getContext('2d');g.fillStyle=g.strokeStyle='#fff';g.lineCap=g.lineJoin='round';
    g.translate(S/2,S/2);g.scale(1.55,1.55);g.translate(-200,-160);draw(g);
    const data=g.getImageData(0,0,S,S).data,points=[];
    for(let py=0;py<S;py+=2)for(let px=0;px<S;px+=2)if(data[(py*S+px)*4+3]>120)points.push([(px-S/2)/S,(py-S/2)/S]);
    for(let i=points.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[points[i],points[j]]=[points[j],points[i]];}
    const out=new Float32Array(COUNT*2);
    for(let i=0;i<COUNT;i++){const p=points[i%points.length];out[i*2]=p[0]+(Math.random()-.5)/S*2;out[i*2+1]=p[1]+(Math.random()-.5)/S*2;}
    return out;
  }
  const ring=g=>{g.lineWidth=1.6;g.beginPath();g.arc(200,160,74,0,Math.PI*2);g.stroke();};
  const symbol=(path,width)=>g=>{ring(g);g.lineWidth=width;g.stroke(new Path2D(path));};
  const shapes={
    logo:sample(g=>{g.lineWidth=2.2;g.stroke(new Path2D(HEX));g.translate(-7,-12);g.fill(new Path2D(Z));}),
    arrow:sample(symbol('M200 118v68M176 162l24 24 24-24M174 204h52',7)),
    check:sample(symbol('M166 162l22 22 46-50',8)),
    cross:sample(symbol('M178 138l44 44M222 138l-44 44',7)),
  };
  let W=0,H=0,dpr=1,raf=0,phase='idle',burstUntil=0,lastGlitch=0,visible=true,initialised=false;
  function resize(){
    dpr=Math.min(devicePixelRatio||1,2);
    W=canvas.width=Math.max(1,Math.round(canvas.clientWidth*dpr));
    H=canvas.height=Math.max(1,Math.round(canvas.clientHeight*dpr));
    if(!initialised){
      // Opening shot: the particles rush in from beyond the frame to build the logo.
      initialised=true;
      for(let i=0;i<COUNT;i++){const a=Math.random()*Math.PI*2,r=Math.max(W,H)*(.55+Math.random()*.6);x[i]=W/2+Math.cos(a)*r;y[i]=H/2+Math.sin(a)*r;}
    }
  }
  function tick(now){
    raf=requestAnimationFrame(tick);
    if(!W)return;
    const t=now/1000,cx=W/2,cy=H/2,scale=Math.min(W,H)*.9;
    const rect=canvas.getBoundingClientRect();
    const px=(pointer.x-rect.left)*dpr,py=(pointer.y-rect.top)*dpr,R=95*dpr,R2=R*R;
    const exploding=now<burstUntil;
    const k=exploding?0:phase==='ready'?.035:.055,damp=exploding?.95:.83;
    const shape=phase==='preview'||phase==='working'?shapes.arrow:phase==='ready'?shapes.check:phase==='error'?shapes.cross:shapes.logo;
    const glitch=phase==='error'&&now-lastGlitch>140;
    if(glitch)lastGlitch=now;
    const band=Math.random()*H,shift=(Math.random()-.5)*36*dpr;
    const breath=scale*(1+Math.sin(t*.8)*.012);
    for(let i=0;i<COUNT;i++){
      let tx,ty;
      if(phase==='linked'){
        const a=seed[i]*Math.PI*2+t*(.3+(i%5)*.12)*(i%2?1:-1);
        const r=(.3+(i%7)*.012)*scale+Math.sin(t*2.4+seed[i]*30)*4*dpr;
        tx=cx+Math.cos(a)*r;ty=cy+Math.sin(a)*r*.88;
      }else if(phase==='reading'||(phase==='working'&&i%3===0)){
        // Accretion vortex: faster near the centre, reborn at the rim.
        angle[i]+=.012+.018/(radius[i]+.05);
        radius[i]-=.0016+radius[i]*.006;
        if(radius[i]<.03)radius[i]=.42+Math.random()*.14;
        tx=cx+Math.cos(angle[i])*radius[i]*scale;ty=cy+Math.sin(angle[i])*radius[i]*scale*.9;
      }else{
        tx=cx+shape[i*2]*breath;
        ty=cy+shape[i*2+1]*breath;
      }
      vx[i]=(vx[i]+(tx-x[i])*k)*damp;vy[i]=(vy[i]+(ty-y[i])*k)*damp;
      const dx=x[i]-px,dy=y[i]-py,d2=dx*dx+dy*dy;
      if(d2<R2&&d2>1){const d=Math.sqrt(d2),f=(1-d/R)**2*7*dpr;vx[i]+=dx/d*f;vy[i]+=dy/d*f;}
      if(glitch&&Math.abs(y[i]-band)<18*dpr)x[i]+=shift;
      x[i]+=vx[i];y[i]+=vy[i];
    }
    ctx.globalCompositeOperation='destination-out';
    ctx.fillStyle=phase==='reading'||phase==='working'?'rgba(0,0,0,.2)':'rgba(0,0,0,.34)';
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation='lighter';
    const colors=PALETTES[phase]||PLASMA,size=1.5*dpr;
    for(let b=0;b<6;b++){
      ctx.fillStyle=colors[b];
      ctx.globalAlpha=b===5?.95:.78;
      const s=b===5?size*1.5:size;
      for(let i=b;i<COUNT;i+=6)ctx.fillRect(Math.round(x[i]),Math.round(y[i]),s,s);
    }
    ctx.globalAlpha=1;
  }
  function start(){if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
  function stop(){cancelAnimationFrame(raf);raf=0;}
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;visible?start():stop();}).observe(canvas);
  document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();poke((e.clientX-r.left)*dpr,(e.clientY-r.top)*dpr,10);});
  function poke(ox,oy,power){
    for(let i=0;i<COUNT;i++){const dx=x[i]-ox,dy=y[i]-oy,d=Math.hypot(dx,dy)||1;const f=Math.max(0,1-d/(260*dpr))*power*dpr;vx[i]+=dx/d*f;vy[i]+=dy/d*f;}
  }
  return {
    start,stop,poke,
    mode(next){phase=next;},
    burst(){
      burstUntil=performance.now()+520;
      for(let i=0;i<COUNT;i++){const a=Math.random()*Math.PI*2,s=(4+Math.random()*16)*dpr;vx[i]=Math.cos(a)*s;vy[i]=Math.sin(a)*s;}
    },
  };
})();

/* ---------- Spark layer: press bursts and the cursor comet ---------- */
const fx=(()=>{
  const canvas=document.createElement('canvas');canvas.className='fx-layer';canvas.setAttribute('aria-hidden','true');
  document.body.append(canvas);
  const ctx=canvas.getContext('2d');
  let sparks=[],raf=0,dpr=1;
  function resize(){dpr=Math.min(devicePixelRatio||1,2);canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;}
  resize();addEventListener('resize',resize);
  function loop(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    sparks=sparks.filter(s=>(s.life-=s.decay)>0);
    for(const s of sparks){
      const ox=s.x,oy=s.y;s.vx*=.94;s.vy=s.vy*.94+s.gravity;s.x+=s.vx;s.y+=s.vy;
      ctx.strokeStyle=s.color;ctx.globalAlpha=s.life;ctx.lineWidth=s.width*dpr;
      ctx.beginPath();ctx.moveTo(ox*dpr,oy*dpr);ctx.lineTo(s.x*dpr,s.y*dpr);ctx.stroke();
    }
    ctx.globalAlpha=1;
    raf=sparks.length?requestAnimationFrame(loop):0;
  }
  return {
    emit(x,y,count,power,colors=PLASMA,{gravity=.12,width=2,decay=.022}={}){
      if(document.hidden)return;
      for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=power*(.35+Math.random()*.65);sparks.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,decay:decay*(.7+Math.random()*.6),gravity,width,color:colors[Math.random()*colors.length|0]});}
      if(sparks.length>500)sparks.splice(0,sparks.length-500);
      if(!raf)raf=requestAnimationFrame(loop);
    },
  };
})();

export function setPhase(phase){
  const scene=document.querySelector('.transfer-scene');
  if(!scene||scene.dataset.phase===phase)return;
  scene.dataset.phase=phase;
  core.mode(phase);
  const label=document.querySelector('#scene-label');
  label.textContent=LABELS[phase]||LABELS.idle;
  animate(label,[{opacity:0,transform:'translateY(8px)',filter:'blur(6px)'},{opacity:1,transform:'none',filter:'blur(0)'}],{duration:520});
  if(phase==='ready'){
    // The "Bang": the core detonates, a shockwave rolls out, sparks rain down.
    core.burst();
    animate(scene.querySelector('.shockwave'),[{opacity:.95,transform:'scale(.2)',borderWidth:'6px'},{opacity:0,transform:'scale(3.2)',borderWidth:'1px'}],{duration:1100,easing:'cubic-bezier(.1,.7,.2,1)'});
    const box=scene.getBoundingClientRect();
    fx.emit(box.left+box.width/2,box.top+box.height/2,90,14,PALETTES.ready,{gravity:.18,width:2.4,decay:.016});
  }
  if(phase==='error')animate(scene,[{transform:'translateX(0)'},{transform:'translateX(-12px)'},{transform:'translateX(10px)'},{transform:'translateX(-6px)'},{transform:'translateX(3px)'},{transform:'none'}],{duration:520,easing:'ease-out'});
}

/* ---------- Pointer-reactive surfaces ---------- */
const TILT='.composer,.job,.storage-list article';
const MAGNET='.primary,.ghost-action,.install-button,.navigation button,.download-link,.brand,.platforms span,.text-button';
let tilted=null,magnet=null,frame=0;
function resetTilt(el){if(el){el.style.removeProperty('--rx');el.style.removeProperty('--ry');el.classList.remove('is-lit');}}
function resetMagnet(el){if(el)el.style.translate='';}
function onPointer(){
  frame=0;
  const root=document.documentElement.style;
  root.setProperty('--px',`${pointer.x}px`);root.setProperty('--py',`${pointer.y}px`);
  if(!fine)return;
  const target=document.elementFromPoint(pointer.x,pointer.y);
  const tilt=target?.closest(TILT);
  if(tilt!==tilted){resetTilt(tilted);tilted=tilt;}
  if(tilt){
    const r=tilt.getBoundingClientRect(),nx=(pointer.x-r.left)/r.width,ny=(pointer.y-r.top)/r.height;
    const strength=tilt.matches(':focus-within')?.25:tilt.classList.contains('composer')?.6:1;
    tilt.style.setProperty('--rx',`${(.5-ny)*7*strength}deg`);tilt.style.setProperty('--ry',`${(nx-.5)*9*strength}deg`);
    tilt.style.setProperty('--gx',`${nx*100}%`);tilt.style.setProperty('--gy',`${ny*100}%`);tilt.classList.add('is-lit');
  }
  const pull=target?.closest(MAGNET);
  if(pull!==magnet){resetMagnet(magnet);magnet=pull;}
  if(pull&&!pull.disabled){
    const r=pull.getBoundingClientRect(),dx=pointer.x-(r.left+r.width/2),dy=pointer.y-(r.top+r.height/2);
    const clamp=(v,m)=>Math.max(-m,Math.min(m,v));
    pull.style.translate=`${clamp(dx*.22,10)}px ${clamp(dy*.32,7)}px`;
  }
}
addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY;if(!frame)frame=requestAnimationFrame(onPointer);},{passive:true});
for(const type of ['pointerup','pointercancel'])addEventListener(type,e=>{if(e.pointerType!=='mouse')pointer.x=pointer.y=-1e5;},{passive:true});
document.documentElement.addEventListener('pointerleave',()=>{pointer.x=pointer.y=-1e5;resetTilt(tilted);resetMagnet(magnet);tilted=magnet=null;});

// Custom cursor with a plasma comet tail, on precise pointers only.
if(fine){
  const ring=document.createElement('div'),dot=document.createElement('div');
  ring.className='cursor-ring';dot.className='cursor-dot';ring.setAttribute('aria-hidden','true');dot.setAttribute('aria-hidden','true');
  document.body.append(ring,dot);
  let rx=innerWidth/2,ry=innerHeight/2,lx=0,ly=0,loop=0;
  const follow=()=>{
    rx+=(pointer.x-rx)*.18;ry+=(pointer.y-ry)*.18;
    ring.style.translate=`${rx}px ${ry}px`;
    loop=Math.abs(pointer.x-rx)+Math.abs(pointer.y-ry)>.3?requestAnimationFrame(follow):0;
  };
  addEventListener('pointermove',e=>{
    dot.style.translate=`${e.clientX}px ${e.clientY}px`;
    document.body.classList.add('has-cursor');
    const over=e.target.closest?.('a,button,select,label,[data-history-id],.platforms span');
    ring.classList.toggle('is-hover',!!over);
    ring.classList.toggle('is-text',!!e.target.closest?.('textarea'));
    if(Math.hypot(e.clientX-lx,e.clientY-ly)>7){lx=e.clientX;ly=e.clientY;fx.emit(lx,ly,1,1.2,PLASMA,{gravity:.03,width:1.6,decay:.04});}
    if(!loop)loop=requestAnimationFrame(follow);
  },{passive:true});
  addEventListener('pointerdown',()=>ring.classList.add('is-down'));
  addEventListener('pointerup',()=>ring.classList.remove('is-down'));
  document.documentElement.addEventListener('pointerleave',()=>document.body.classList.remove('has-cursor'));
}

// Brand decode: Latin glyphs only, so the Arabic text is never scrambled.
function decode(el){
  const final=el.dataset.text,glyphs='▲◆●■ZB/<>#01';let step=0;
  clearInterval(el.decoder);
  el.decoder=setInterval(()=>{
    el.textContent=[...final].map((ch,i)=>i<step/2?ch:glyphs[Math.random()*glyphs.length|0]).join('');
    if(++step>final.length*2+1){clearInterval(el.decoder);el.textContent=final;}
  },40);
}
const brandWord=document.querySelector('.brand-word');
if(brandWord){decode(brandWord);document.querySelector('.brand').addEventListener('pointerenter',()=>decode(brandWord));}

document.addEventListener('pointerdown',event=>{
  const button=event.target.closest('.primary,.ghost-action,.download-link,.share-card,.navigation button,.install-button');
  if(!button||button.disabled)return;
  fx.emit(event.clientX,event.clientY,button.matches('.primary,.download-link')?26:12,button.matches('.primary,.download-link')?7:4);
  if(!button.matches('.primary,.download-link'))return;
  const box=button.getBoundingClientRect(),wave=document.createElement('i');
  wave.className='press-wave';wave.style.left=`${event.clientX-box.left-15}px`;wave.style.top=`${event.clientY-box.top-15}px`;
  button.append(wave);
  const a=wave.animate([{transform:'scale(.2)',opacity:.8},{transform:'scale(18)',opacity:0}],{duration:650,easing:EASE});
  a.finished.catch(()=>{}).finally(()=>wave.remove());
});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('motion-paused',document.hidden));
addEventListener('resize',alignNavigation);
requestAnimationFrame(alignNavigation);
core.start();
enter(document.querySelector('#download-view'));
enter(document.querySelector('.composer'));
