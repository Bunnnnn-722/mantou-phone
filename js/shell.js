/* 壳期交互胶水：路由/换肤/半窗/拖拽/菜单。通电单元的新模块(db/api/writing…)各自独立建文件 */
  let _prevScr='home';
  /* 记录最近一次按下的位置:从主屏开 APP 时,新屏从这个点放大出来(仿原生开 APP) */
  let _tap=null;
  addEventListener('pointerdown',e=>{_tap={x:e.clientX,y:e.clientY}},true);
  function go(id){
    const cur=document.querySelector('.screen.active');
    if(cur&&cur.id===id)return;
    const prev=_prevScr;
    if(cur)_prevScr=cur.id;
    const target=document.getElementById(id);
    document.querySelectorAll('.screen').forEach(s=>{if(s!==cur&&s!==target)s.classList.remove('active','zoomin','zoomout','navf','navb')});
    target.classList.remove('zoomin','zoomout','navf','navb');
    if(cur&&cur.id==='home'&&id!=='home'&&_tap){
      // 开 APP:新屏从点击处放大
      const ph=document.getElementById('phone').getBoundingClientRect();
      target.style.transformOrigin=(_tap.x-ph.left)+'px '+(_tap.y-ph.top)+'px';
      target.classList.add('zoomin');
      cur.classList.remove('active','zoomout','navf','navb');
    }else if(id==='home'&&cur){
      // 回主屏:当前屏缩回它的打开原点(没有原点=缩向中心),主屏在下层浮现
      cur.classList.remove('zoomin','navf','navb');
      cur.classList.add('zoomout');
      const out=cur;
      setTimeout(()=>{out.classList.remove('active','zoomout');out.style.transformOrigin=''},340); // 不等 animationend:隐藏页动画被关时它不会来
    }else if(cur){
      // 平级切换:去往刚来的那屏=后退(从左浅滑),否则前进(从右浅滑)
      target.classList.add(id===prev?'navb':'navf');
      cur.classList.remove('active','zoomin','zoomout','navf','navb');
    }
    target.classList.add('active');
  }
  /* 从哪进就退到哪（跨 APP 复用的屏用它做后退） */
  function goPrev(fallback){go(_prevScr||fallback||'home')}

  /* 画布高度与安全区(机制参考 SullyOS,自研实现):
     iOS 全屏 web app 里布局视口(innerHeight/vh/lvh)会谎报少一条状态栏高,只有 visualViewport.height 说真话——
     独立模式取 visualViewport 高度的历史最大值当画布高;env() 谎报 0 时顶部安全区用 JS 探测兜底。
     键盘弹起(可视高骤降)时画布钉成可视高,输入条随之贴键盘。 */
  (()=>{
    const doc=document.documentElement;let base=0;
    const standalone=()=>{try{return (matchMedia&&matchMedia('(display-mode: standalone)').matches)||!!navigator.standalone}catch(e){return false}};
    const probe=()=>{const p=document.createElement('div');p.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';document.body.appendChild(p);const cs=getComputedStyle(p);const r={top:Math.round(parseFloat(cs.paddingTop)||0),bottom:Math.round(parseFloat(cs.paddingBottom)||0)};p.remove();return r};
    const sync=()=>{
      if(!document.body)return;
      const sd=standalone(),vv=window.visualViewport;
      const ih=Math.round(innerHeight);
      const vh=Math.round(vv?vv.height:ih),vt=Math.round(vv?vv.offsetTop:0);
      const sa=probe();
      // 画布高度默认交给 CSS 的 100lvh(大视口):iOS 全屏 web app 里 innerHeight/visualViewport 报的是小视口(少一条状态栏),
      // 用它们定画布会把底部截掉——这就是 Dock 掉出屏幕的真凶(模拟器二分实证 08-21)。JS 只在键盘弹起时把画布钉成可视高。
      if(!base||vh>base)base=vh;
      const kb=vh>150&&vh<base-100;
      if(kb){doc.style.setProperty('--app-height',vh+'px');if(vt>0)scrollTo(0,0)}
      else doc.style.removeProperty('--app-height');
      if(sd){
        let top=sa.top;
        if(top<=0){const d=Math.round((screen.height||0)-ih);top=(d>=20&&d<=80)?d:44}
        doc.style.setProperty('--sa-top-js',top+'px');
      }else doc.style.removeProperty('--sa-top-js');
      document.body.classList.toggle('kb-open',!!kb);
    };
    addEventListener('resize',sync);
    if(window.visualViewport){visualViewport.addEventListener('resize',sync);visualViewport.addEventListener('scroll',sync)}
    addEventListener('orientationchange',()=>{base=0;setTimeout(sync,300)});
    sync();for(let k=1;k<=12;k++)setTimeout(sync,k*250); // 前 3 秒反复校准:iOS 收窄画布时未必派发 resize
  })();

  /* iOS 独立模式键盘后遗症:软键盘弹过一次,视口就永久缩水一条状态栏高(932→873),底部留死黑带,
     直到强杀 App。治法:输入框失焦后把全屏壳的 display 抖一下,逼 WebKit 重新量视口。
     抖动期间借动画总闸关动画防入场动画重放,并用装帧同色毛玻璃遮那一帧。 */
  (()=>{
    let maxVH=innerHeight;
    addEventListener('resize',()=>{maxVH=Math.max(maxVH,innerHeight)});
    const stuck=()=>maxVH-innerHeight>4;
    let veil=null;
    const heal=()=>{
      const phone=document.getElementById('phone');
      if(!phone||!stuck())return;
      const saved=[...document.querySelectorAll('.screen.active .scroll')].map(s=>[s,s.scrollTop]);
      document.documentElement.setAttribute('data-bg','');
      phone.style.display='none';void phone.offsetHeight;phone.style.display='';
      saved.forEach(([s,t])=>{s.scrollTop=t});
      setTimeout(()=>{if(!document.hidden)document.documentElement.removeAttribute('data-bg')},80);
    };
    const healMasked=()=>{
      if(!stuck())return;
      if(!veil){
        veil=document.createElement('div');
        veil.style.cssText='position:fixed;inset:0;z-index:9500;opacity:0;pointer-events:none;background:color-mix(in srgb,var(--bg) 45%,transparent);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px)';
        document.body.appendChild(veil);
      }
      veil.style.transition='opacity .2s ease-out';veil.style.opacity='1';
      setTimeout(heal,230);
      setTimeout(()=>{veil.style.transition='opacity .5s cubic-bezier(.32,.72,0,1)';veil.style.opacity='0'},380);
    };
    document.addEventListener('focusout',e=>{
      const t=e.target;
      if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))setTimeout(healMasked,140);
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(healMasked,200)});
    addEventListener('orientationchange',()=>setTimeout(healMasked,400));
  })();

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
  // 豪华装帧(带场景/换字体的那几套)不占昼夜记忆位:昼夜一切回经典(墨量/纸页或上次选的经典配色),
  // 但它们本身仍是"当前装帧",刷新后由 Prefs 用 palCur 恢复
  const SCENE_PALS=new Set(['xingkong','yuye','shenhai','xueri','bairimeng']);
  let palCur=null; // {id,theme,pal} 当前生效
  function markPal(id){
    document.querySelectorAll('#binding .palchip').forEach(c=>{c.textContent='启用';c.classList.remove('jade')});
    const el=document.getElementById(id);
    if(el){const c=el.querySelector('.palchip');c.textContent='当前';c.classList.add('jade')}
  }
  /* Safari 顶帘/状态栏用 theme-color 刷底:跟当前昼夜与装帧的 --bg 走,别留死黑帽子 */
  function syncThemeColor(){
    const m=document.querySelector('meta[name="theme-color"]');
    const bg=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#0F1216';
    if(m)m.content=bg;
    // 镜像到 localStorage 供 head 内联脚本首帧同步读取(昼夜/装帧/状态栏色)
    try{const d=document.documentElement;localStorage.setItem('mt.bg',bg);localStorage.setItem('mt.theme',d.dataset.theme||'dark');
      if(d.dataset.palette)localStorage.setItem('mt.pal',d.dataset.palette);else localStorage.removeItem('mt.pal')}catch(e){}
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
    markPal(m.id);palCur={id:m.id,theme:t,pal:m.pal};
    syncThemeColor();
  }
  syncThemeColor(); // 首帧就同步一次(默认主题不经过 setTheme)
  // 构建号+真机诊断:从样式表的 ?v= 读,部署对版本用(设置页底部)
  (()=>{const b=document.getElementById('buildTag');if(!b)return;
    const l=document.querySelector('link[rel="stylesheet"][href*="?v="]');
    b.textContent='夜书房 · 构建 '+((l&&l.href.split('?v=')[1])||'dev');
    try{
      const p=document.createElement('div');
      p.style.cssText='position:fixed;top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);left:0;width:0;pointer-events:none';
      document.body.appendChild(p);
      const r=p.getBoundingClientRect();p.remove();
      const ph=document.getElementById('phone').getBoundingClientRect();
      const lv=document.createElement('div');lv.style.cssText='position:fixed;visibility:hidden;height:100lvh;width:0';document.body.appendChild(lv);
      const lvh=Math.round(lv.getBoundingClientRect().height);lv.remove();
      const vv=window.visualViewport;
      const d=document.createElement('div');
      d.style.cssText='text-align:center;margin:2px 0 6px;font-size:9.5px;letter-spacing:.06em;color:var(--text-3);font-family:var(--mono)';
      d.textContent=`vp ${innerWidth}x${innerHeight} vv ${vv?Math.round(vv.height):'-'}+${vv?Math.round(vv.offsetTop):'-'} lvh ${lvh} scr ${screen.width}x${screen.height} sa ${Math.round(r.top)}/${Math.round(innerHeight-r.bottom)} ph ${Math.round(ph.top)}~${Math.round(ph.bottom)} sd ${navigator.standalone?1:0}`;
      b.after(d);
    }catch(e){}
  })();
  function applyPal(id,theme,pal){
    if(!SCENE_PALS.has(pal))palMem[theme]={id,pal};
    setTheme(theme);
    if(SCENE_PALS.has(pal)){document.documentElement.dataset.palette=pal;markPal(id);palCur={id,theme,pal};syncThemeColor()}
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

  // 系统返回手势接管:开 APP 时往历史压一个哨兵,边缘右滑触发 popstate 时补回哨兵并回主屏——
  // 右滑=关 APP,而不是把整个 PWA 退掉。细粒度返回仍走界面里的后退按钮。
  (()=>{
    const K='mtapp';
    const hasSent=()=>{try{return !!(history.state&&history.state[K])}catch(e){return false}};
    const push=()=>{try{history.pushState({[K]:1},'',location.href)}catch(e){}};
    const _g=go;
    go=id=>{_g(id);if(id!=='home'&&!hasSent())push()};
    addEventListener('popstate',()=>{
      const cur=document.querySelector('.screen.active');
      if(cur&&cur.id!=='home'){push();go('home')}
    });
  })();

  // 退场保存兜底:切后台/被杀前把写作内存态落盘(平时操作即存,这里保生成中途的半成品)
  (()=>{
    const flush=()=>{try{if(typeof Writing!=='undefined'&&Writing.flush)Writing.flush()}catch(e){}};
    addEventListener('pagehide',flush);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flush()});
  })();
