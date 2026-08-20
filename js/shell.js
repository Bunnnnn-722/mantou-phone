/* 壳期交互胶水：路由/换肤/半窗/拖拽/菜单。通电单元的新模块(db/api/writing…)各自独立建文件 */
  let _prevScr='home';
  function go(id){
    const cur=document.querySelector('.screen.active');
    if(cur&&cur.id!==id)_prevScr=cur.id;
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }
  /* 从哪进就退到哪（跨 APP 复用的屏用它做后退） */
  function goPrev(fallback){go(_prevScr||fallback||'home')}

  /* 隐藏页动画冻结三族坑(定时器/rAF/CSS 动画)总闸:后台时全局关动画,恢复即正常 */
  const syncBg=()=>document.documentElement.toggleAttribute('data-bg',document.hidden);
  document.addEventListener('visibilitychange',syncBg);syncBg();

  /* 页内 toast：全机统一提示，不用浏览器原生弹窗 */
  function toast(msg,ms){
    let t=document.getElementById('apptoast');
    if(!t){
      t=document.createElement('div');t.id='apptoast';
      t.style.cssText='position:absolute;left:50%;top:124px;transform:translateX(-50%) translateY(-8px);z-index:9000;width:max-content;max-width:88%;padding:11px 22px;border-radius:14px;background:color-mix(in srgb,var(--panel-3) 88%,#000);border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,.35);color:var(--text);font-size:12.5px;letter-spacing:.04em;line-height:1.75;text-align:center;opacity:0;transition:opacity .22s,transform .22s;pointer-events:none;font-family:var(--song)';
      (document.querySelector('.phone')||document.body).appendChild(t);
    }
    t.textContent=msg;
    clearTimeout(t._tm);
    // 隐藏页 rAF 与 CSS 过渡都会暂停(与 mock 定时器冻结同族坑):隐藏时跳过动画直接落定值
    t.style.transition=document.hidden?'none':'opacity .22s,transform .22s';
    t.style.opacity='0';t.style.transform='translateX(-50%) translateY(-8px)';
    void t.offsetHeight; // 同步回流,保证两态之间有一次样式提交
    t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';
    t._tm=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(-8px)'},ms||2600);
  }
  // 每个昼夜模式各自记住上次选的装帧，首次都是默认
  const palMem={dark:{id:'palMo',pal:''},light:{id:'palZhi',pal:''}};
  function markPal(id){
    document.querySelectorAll('#binding .palchip').forEach(c=>{c.textContent='启用';c.classList.remove('jade')});
    const el=document.getElementById(id);
    if(el){const c=el.querySelector('.palchip');c.textContent='当前';c.classList.add('jade')}
  }
  function setTheme(t){
    document.documentElement.dataset.theme=t;
    document.getElementById('segLight').classList.toggle('on',t==='light');
    document.getElementById('segDark').classList.toggle('on',t==='dark');
    document.getElementById('palDark').style.display=t==='dark'?'':'none';
    document.getElementById('palLight').style.display=t==='light'?'':'none';
    const m=palMem[t];
    if(m.pal)document.documentElement.dataset.palette=m.pal;
    else delete document.documentElement.dataset.palette;
    markPal(m.id);
  }
  function applyPal(id,theme,pal){
    palMem[theme]={id,pal};
    setTheme(theme);
  }
  function wtab(el,id){
    document.getElementById('wbooks').style.display=id==='wbooks'?'':'none';
    document.getElementById('wassets').style.display=id==='wassets'?'':'none';
    [...el.parentElement.children].forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
  }
  function atab(el,id){
    ['aop','awb','achar'].forEach(x=>{const n=document.getElementById(x);if(n)n.style.display=x===id?'':'none'});
    [...el.parentElement.children].forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
  }
  function ptab(el,id){
    ['pva','pvb','pvc'].forEach(x=>document.getElementById(x).style.display=x===id?'':'none');
    [...el.parentElement.children].forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
  }
  function gtab(el,id){
    document.getElementById('gLive').style.display=id==='gLive'?'':'none';
    document.getElementById('gReplay').style.display=id==='gReplay'?'':'none';
    [...el.parentElement.children].forEach(c=>c.classList.remove('on'));
    el.classList.add('on');
  }
  function qtoggle(on,el){
    document.getElementById('qbub').classList.toggle('show',on);
    if(!on)document.getElementById('qpanel').classList.remove('show');
    if(el){[...el.parentElement.children].forEach(c=>c.classList.remove('on'));el.classList.add('on');}
  }
  function togglePip(show){
    const pip=document.getElementById('pip');
    pip.classList.toggle('show',show);
    if(show&&!pip.style.left){pip.style.left='274px';pip.style.top='90px';}
    if(show)go('home');
  }
  (function(){
    const pip=document.getElementById('pip'),phone=document.getElementById('phone');
    let sx,sy,ox,oy,drag=false;
    pip.addEventListener('pointerdown',e=>{drag=true;sx=e.clientX;sy=e.clientY;ox=pip.offsetLeft;oy=pip.offsetTop;pip.setPointerCapture(e.pointerId)});
    pip.addEventListener('pointermove',e=>{
      if(!drag)return;
      const maxX=phone.clientWidth-pip.offsetWidth,maxY=phone.clientHeight-pip.offsetHeight;
      pip.style.left=Math.max(4,Math.min(maxX-4,ox+e.clientX-sx))+'px';
      pip.style.top=Math.max(56,Math.min(maxY-4,oy+e.clientY-sy))+'px';
    });
    pip.addEventListener('pointerup',()=>drag=false);
  })();
  function tick(){
    const d=new Date(),t=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    document.getElementById('clock').textContent=t;
    document.getElementById('clock2').textContent=t;
  }
  tick();setInterval(tick,10000);

  // 首屏摘句：按句读切分。引号内含句末标点→独立成句(去引号);
  // 引号内无句末标点→视为强调词，并回外层句子；超长交给 CSS 两行截断。
  function splitSentences(t){
    const out=[];let buf='',q=null;
    for(const ch of t){
      if(q!==null){
        if(ch==='」'||ch==='”'){
          if(/[。！？…]/.test(q))out.push(q.trim());
          else buf+='「'+q+'」';
          q=null;
        }else q+=ch;
      }else{
        if(ch==='「'||ch==='“'){q='';continue}
        buf+=ch;
        if(/[。！？…]/.test(ch)){const s=buf.trim();if(s)out.push(s);buf=''}
      }
    }
    const tail=buf.trim();if(tail)out.push(tail);
    return out;
  }
  (function(){
    const t=Array.from(document.querySelectorAll('#write .para')).map(p=>p.textContent).join('');
    const s=splitSentences(t).map(x=>x.replace(/^[，、；：—]+/,'')).filter(x=>x.length>=8);
    const q=s.length?s[Math.floor(Math.random()*s.length)]:'落潮之城';
    document.getElementById('resumeQuote').textContent='「'+q+'」';
  })();
  // 随行半窗拖拽：grab 上拉≥40px=全窗吸附顶栏下；下拉≥40px或轻点=退一级(全窗→半窗→收起)
  (function(){
    const sh=document.getElementById('cosheet');if(!sh)return;
    const grab=sh.querySelector('.grab');let sy=null;
    const pt=e=>(e.touches&&e.touches[0])||(e.changedTouches&&e.changedTouches[0])||e;
    const start=e=>{sy=pt(e).clientY;e.preventDefault()};
    const end=e=>{if(sy==null)return;const d=pt(e).clientY-sy;sy=null;
      if(d<-40)sh.classList.add('full');
      else if(sh.classList.contains('full'))sh.classList.remove('full');
      else sh.classList.remove('show')};
    grab.addEventListener('mousedown',start);grab.addEventListener('touchstart',start,{passive:false});
    addEventListener('mouseup',end);grab.addEventListener('touchend',end);
  })();

  // ⋯菜单：点到外面自动关闭
  addEventListener('click',e=>{document.querySelectorAll('.pop.show').forEach(p=>{const m=p.closest('.more');if(!m||!m.contains(e.target))p.classList.remove('show')})});

  // 实例锁：同源多开时后开的为准，旧窗口休眠（两窗口同写一份 IndexedDB 会互相覆盖）
  (()=>{
    const iid=Math.random().toString(36).slice(2);
    const sleep=()=>{
      if(document.getElementById('instlock'))return;
      const v=document.createElement('div');v.id='instlock';
      v.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(5,6,9,.88);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--text-2);font-size:13px;letter-spacing:.06em;text-align:center;padding:0 30px';
      v.innerHTML='<div style="font-family:var(--song);line-height:2">小手机已在另一个窗口打开，<br>这个窗口先睡了。</div><button class="btn" onclick="location.reload()">在这个窗口继续</button>';
      document.body.appendChild(v);
    };
    try{
      const bc=new BroadcastChannel('mantou-lock');
      bc.onmessage=e=>{if(e.data&&e.data.claim&&e.data.iid!==iid)sleep()};
      bc.postMessage({claim:1,iid});
    }catch(err){
      try{ // 无 BroadcastChannel 的环境:localStorage 事件兜底
        localStorage.setItem('mantou.lock',iid);
        addEventListener('storage',e=>{if(e.key==='mantou.lock'&&e.newValue&&e.newValue!==iid)sleep()});
      }catch(e2){}
    }
  })();
