/* 浮生记界面：信息流／灵感／赞过三 tab、订阅管理半窗、条目卡上的操作。
   数据与拉取在 rss.js（RSS），人物在 people.js（People），本文件只管画与转发调用。
   对 RSS／People 的调用全部在函数内进行，并做 typeof 保护——三份文件是并行写的。 */
const FeedUI=(()=>{
  let cur='stream';            // 当前 tab：stream / ideas / liked
  let busy=false;              // 刷新中
  let loaded=false;            // 是否已确保 RSS.load() 跑过
  const thinking=new Map();    // itemId → 人物名（正在生成短评）
  const byId=id=>document.getElementById(id);
  const hasRSS=()=>typeof RSS!=='undefined'&&!!RSS;
  const errMsg=e=>String((e&&e.message)||e||'未知错误').slice(0,80);
  const safeUrl=u=>/^https?:\/\//i.test(u||'')?u:'';

  /* 封面：引擎在 js/cover.js（与阅读书架共用）；这里只把条目字段翻成 Cover.html 的入参 */
  const TAGS={WP:'写作提示',SP:'简单提示',EU:'既有宇宙',CW:'限制写作',TT:'主题周四',RF:'现实虚构',PI:'受提示启发',PM:'求提示',MP:'媒体提示',IP:'图片提示',CC:'求点评',OT:'闲聊',WW:'练笔'};
  const hash=Cover.hash,isCJK=Cover.isCJK;
  // 只拆 Reddit 的「[WP] 标题」；译名表是 writingprompts 专用，别的版块保留原标签；普通 RSS 不拆
  function splitTag(title,f){
    const raw=String(title||'').trim();
    if(!f||f.type!=='reddit')return{tag:'',title:raw};
    const m=raw.match(/^[\[【（(]\s*([A-Za-z]{2,3})\s*[\]】）)]\s*(.*)$/);
    if(!m||!m[2].trim())return{tag:'',title:raw};
    const k=m[1].toUpperCase();
    const wp=/writingprompts/i.test((f.sub||'')+' '+(f.name||''));
    return{tag:(wp&&TAGS[k])||k,title:m[2].trim()};
  }
  const coverInfo=(it,f)=>{const {tag,title}=splitTag(it.title||'（无标题）',f);return{tag,title,cv:Cover.pick({id:it.id,_tpl:it._tpl},title)}};
  const ini=s=>{const t=String(s||'').replace(/^r\//,'').trim();const m=t.match(/[\u3400-\u9fff]/);return (m?m[0]:(Array.from(t)[0]||'？')).toUpperCase()};
  const bareUrl=t=>/^https?:\/\/\S+$/.test(String(t||'').trim());
  function coverHTML(it,f){
    const {tag,title}=splitTag(it.title||'（无标题）',f);
    return Cover.html({id:it.id,tpl:it._tpl,title,tag,src:f.name||'未知源',author:it.author,ts:it.ts,ex:bareUrl(it.text)?'':it.text,mode:'feed'});
  }
  /* 线性图标：心／星／气泡。on＝实心 */
  const PATH={heart:'M12 20.3C6.6 16.5 3.2 13.2 3.2 9.4 3.2 6.8 5.2 4.8 7.8 4.8c1.7 0 3.2.9 4.2 2.3 1-1.4 2.5-2.3 4.2-2.3 2.6 0 4.6 2 4.6 4.6 0 3.8-3.4 7.1-8.8 10.9z',star:'M12 3.6l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z',bubble:'M6 4.6h12a2.4 2.4 0 0 1 2.4 2.4v7.2a2.4 2.4 0 0 1-2.4 2.4h-7.2L6.4 20v-3.4H6a2.4 2.4 0 0 1-2.4-2.4V7a2.4 2.4 0 0 1 2.4-2.4z'};
  const ic=(n,on)=>`<svg class="ic${on?' on':''}" viewBox="0 0 24 24"><path d="${PATH[n]}"/></svg>`;

  /* 相对时间：刚刚／N 分钟前／N 小时前／昨天／日期 */
  function rel(ts){
    if(!ts)return '';
    const d=Date.now()-ts;
    if(d<60e3)return '刚刚';
    if(d<3600e3)return Math.floor(d/60e3)+' 分钟前';
    if(d<86400e3)return Math.floor(d/3600e3)+' 小时前';
    const now=new Date(),dt=new Date(ts);
    const today0=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    if(ts>=today0-86400e3)return '昨天';
    return (dt.getFullYear()===now.getFullYear()?'':dt.getFullYear()+'年')+(dt.getMonth()+1)+'月'+dt.getDate()+'日';
  }

  /* 半窗是 absolute 于所在 .screen：从别的屏打开前先搬进当前屏 */
  function hoist(sheet){
    const act=document.querySelector('.screen.active');
    if(act&&sheet&&sheet.parentElement!==act)act.appendChild(sheet);
  }
  function openSheet(id){const s=byId(id);if(!s)return;hoist(s);s.classList.add('show')}

  /* 危险按钮二击确认：第一击变红底「确认删除？」，2.6 秒未二击自动还原 */
  function arm(btn,label){
    const keep=btn.style.cssText;
    btn.dataset.armed='1';btn.textContent='确认删除？';
    btn.style.cssText=keep+';color:#fff;background:var(--danger);border-color:transparent';
    setTimeout(()=>{if(btn.isConnected&&btn.dataset.armed){delete btn.dataset.armed;btn.textContent=label;btn.style.cssText=keep}},2600);
  }

  const empty=t=>`<div class="sub fempty">${t}</div>`;
  const feedOf=id=>hasRSS()&&RSS.feeds?(RSS.feeds()||[]).find(f=>f.id===id):null;
  const itemOf=id=>hasRSS()&&RSS.items?(RSS.items()||[]).find(x=>x.id===id):null;

  /* 首次进屏保证 RSS 已从库里读过（RSS 自己的初始化是异步的，可能比进屏晚） */
  async function ensure(){
    if(loaded||!hasRSS()||!RSS.load)return;
    loaded=true;
    try{await RSS.load()}catch(e){console.error('rss load',e)}
    _render();
  }

  /* ── 渲染 ── */
  let pend=false;
  function render(){ // 同一轮里多次触发合并成一次
    if(pend)return;pend=true;
    Promise.resolve().then(()=>{pend=false;_render()});
  }
  function _render(){
    const fl=byId('feedList'),il=byId('ideaList');
    if(!fl||!il)return;
    if(!loaded)ensure();
    if(detailId&&detailShown())renderDetail();
    if(!feedShown())return; // 屏不在前台不重画，回来时 go 包装会再 render
    if(cur==='ideas'){fl.style.display='none';il.style.display='';renderIdeas(il);return}
    il.style.display='none';fl.style.display='';
    renderStream(fl,cur==='liked');
  }
  function tab(el,name){
    cur=name;
    const tabs=byId('feedTabs');
    if(tabs&&el)[...tabs.children].forEach(c=>c.classList.toggle('on',c===el));
    _render();
    const sc=document.querySelector('#feed .scroll');if(sc)sc.scrollTop=0;
  }

  const feedShown=()=>{const sc=byId('feed');return !!(sc&&sc.classList.contains('active'))};
  function renderStream(box,liked){
    if(!hasRSS()){box.className='';box.innerHTML=empty('订阅引擎还没加载。');return}
    const feeds=RSS.feeds()||[];
    const list=(liked?RSS.items({liked:true}):RSS.items()).filter(it=>liked||feedOf(it.feedId));
    if(!list||!list.length){
      box.className='';
      let t;
      if(liked)t='赞过的条目会留在这里。';
      else if(!feeds.length)t='还没有订阅源——点右上「订阅」添加一个。';
      else{
        const on=feeds.filter(f=>f.on!==false);
        if(!on.length)t='订阅源都停用了——去「订阅」里启用一个。';
        else if(on.every(f=>f.err))t='拉取都失败了：'+String(on[0].err).slice(0,60)+'。改好后下拉再试。';
        else t='下拉刷新，内容就来了。';
      }
      box.innerHTML=empty(t);return;
    }
    // 同一批条目只是赞／收／短评变了：原地更新来源行，不重画（重画会把滚动位置归零）
    const idSet=new Set(list.map(it=>it.id));
    const cur=[...box.querySelectorAll('.post')];
    if(box.className==='feed'&&cur.length===list.length&&cur.every(p=>idSet.has(p.dataset.id))){
      for(const p of cur){const it=itemOf(p.dataset.id);const a=p.querySelector('.acts');if(it&&a){a.innerHTML=actsHTML(it);bindActs(p,it)}}
      return;
    }
    // 真瀑布：两列容器，每张卡放进当前较矮的一列（屏没显示时退化为左右交替）；重画前后保住滚动位置
    const sc=box.closest('.scroll');const keep=sc?sc.scrollTop:0;
    box.className='feed';box.innerHTML='<div class="col"></div><div class="col"></div>';
    const cols=[...box.children],hidden=!box.offsetParent;
    list.forEach((it,i)=>{const c=hidden?cols[i%2]:(cols[0].offsetHeight<=cols[1].offsetHeight?cols[0]:cols[1]);c.appendChild(post(it))});
    if(sc&&keep)sc.scrollTop=Math.min(keep,sc.scrollHeight-sc.clientHeight);
  }
  /* 瀑布卡：封面 + 两行文案 + 来源行（气泡计数、可点的星与心）。长标题在封面上放不下，文案区就写全标题 */
  const GONE={name:'源已删除'};
  function actsHTML(it){
    const cm=(it.cmts||[]).length;
    return `${thinking.has(it.id)?'<span class="cnt">…</span>':''}${cm?`<span class="cnt">${ic('bubble')}${cm}</span>`:''}<span class="act${it.idea?' star':''}" data-a="star">${ic('star',it.idea)}</span><span class="act${it.liked?' jade':''}" data-a="like">${ic('heart',it.liked)}</span>`;
  }
  function bindActs(d,it){
    d.querySelector('[data-a=like]').onclick=e=>{e.stopPropagation();like(it.id)};
    d.querySelector('[data-a=star]').onclick=e=>{e.stopPropagation();idea(it.id)};
  }
  function post(it){
    const f=feedOf(it.feedId)||GONE;
    const d=document.createElement('div');d.className='post';d.dataset.id=it.id;
    const ci=coverInfo(it,f);
    const ex=bareUrl(it.text)?'':String(it.text||'').replace(/\s+/g,' ').trim();
    const cap=ci.cv.long?ci.title:ex;
    d.innerHTML=`${coverHTML(it,f)}<div class="meta">${cap?`<div class="cap">${esc(cap)}</div>`:''}<div class="who"><span class="avatar">${esc(ini(f.name||'？'))}</span><span class="src-n">${esc(f.name||'未知源')}</span><span class="acts">${actsHTML(it)}</span></div></div>`;
    d.onclick=()=>openDetail(it.id);
    bindActs(d,it);
    return d;
  }

  /* 书中人的话：已有短评＋「X 在想…」 */
  function cmtsHTML(it){
    const th=thinking.get(it.id);
    const pending=th?`<div class="fpend">${esc(th)}在想…</div>`:'';
    const cmts=(it.cmts||[]).map(c=>`<div class="fcmt"><span class="avatar">${esc((c.name||'？').slice(0,1))}</span><div class="fcbody"><div class="fcname">${esc(c.name||'')}</div><div class="fctext">${esc(c.text||'')}</div></div></div>`).join('');
    return cmts+pending;
  }

  /* ── 详情屏（小红书式）：顶栏源头像·源名＋原文，封面通栏，标题／全文／元信息／用它开书／书中人的话，底栏＝让书中人说＋心＋星＋气泡 ── */
  let detailId=null;
  function openDetail(id){
    if(hasRSS()&&RSS.pin){if(detailId&&detailId!==id)RSS.unpin(detailId);RSS.pin(id)} // 看着的这条不许被淘汰
    detailId=id;go('postdetail');
  }
  const detailShown=()=>{const sc=byId('postdetail');return !!(sc&&sc.classList.contains('active'))};
  function renderDetail(){
    const box=byId('pdScroll');if(!box)return;
    const it=detailId?itemOf(detailId):null;
    const ava=byId('pdAva'),srcEl=byId('pdSrc'),orig=byId('pdOrig'),bar=byId('pdBar');
    if(!it){
      box.innerHTML=empty('这条内容已经不在池子里了。');
      if(bar)bar.style.display='none';if(orig)orig.style.display='none';
      if(ava)ava.textContent='？';if(srcEl)srcEl.textContent='浮生记';
      return;
    }
    const f=feedOf(it.feedId)||GONE;
    const {tag,title}=splitTag(it.title||'（无标题）',f);
    const link=safeUrl(it.link);
    const ext=safeUrl(it.ext||(bareUrl(it.text)?String(it.text).trim():''));
    let host='';try{host=new URL(ext).hostname.replace(/^www\./,'')}catch(e){}
    if(ava)ava.textContent=ini(f.name||'？');
    if(srcEl)srcEl.textContent=f.name||'未知源';
    if(orig){orig.style.display=link?'':'none';orig.href=link||'#'}
    const meta=[];
    if(it.author&&String(it.author).trim()!==String(f.name||'').trim())meta.push(String(it.author));
    if(f.type==='reddit'){
      if(typeof it.score==='number')meta.push('↑ '+it.score);
      if(typeof it.comments==='number')meta.push('回帖 '+it.comments);
    }
    meta.push(rel(it.ts));
    const cm=(it.cmts||[]).length;
    const body=bareUrl(it.text)?'':String(it.text||'').replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim();
    box.innerHTML=`<div class="pdcover">${coverHTML(it,f)}</div>
      <div class="pdin">
        <div class="pdttl">${tag?`<span class="src" style="margin-right:8px;vertical-align:2px">${esc(tag)}</span>`:''}${esc(title)}</div>
        ${body?`<div class="pdbody">${esc(body)}</div>`:''}
        <div class="pdmeta">${meta.map(m=>'<span>'+esc(m)+'</span>').join(' · ')}</div>
        <div class="pdact"><span class="ghost" data-a="book">用它开书</span>${ext?`<a class="ghost" href="${esc(ext)}" target="_blank" rel="noopener">外链 · ${esc(host||'打开')}</a>`:''}</div>
        <div class="pdsep"></div>
        <div class="k" id="pdCmtHead" style="margin:0 2px 12px">书中人的话${cm?' · '+cm+' 条':''}</div>
        <div class="fcmts">${cmtsHTML(it)||'<div class="sub" style="margin:0">还没有人说话。点下面「让书中人说一句」。</div>'}</div>
      </div>`;
    box.querySelector('[data-a=book]').onclick=()=>toBook(it.id);
    if(bar){
      bar.style.display='';
      const L=byId('pdLike'),S=byId('pdStar'),C=byId('pdCmt'),say=byId('pdSay');
      if(L){L.innerHTML=ic('heart',it.liked);L.classList.toggle('on',!!it.liked)}
      if(S){S.innerHTML=ic('star',it.idea);S.classList.toggle('on',!!it.idea)}
      if(C)C.innerHTML=ic('bubble')+(cm?`<b>${cm}</b>`:'');
      const th=thinking.get(it.id);
      if(say)say.textContent=th?th+'在想…':'让书中人说一句…';
    }
  }
  function toTop(){
    const sc=document.querySelector('#feed .scroll');if(!sc)return;
    const smooth=!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(smooth){sc.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>{if(sc.scrollTop>0)sc.scrollTop=0},700)} // 平滑滚动被冻结时兜底
    else sc.scrollTop=0;
  }
  const detailSay=()=>{if(detailId)say(detailId)};
  const detailLike=()=>{if(detailId)like(detailId)};
  const detailStar=()=>{if(detailId)idea(detailId)};
  function detailCmts(){const h=byId('pdCmtHead');if(h)h.scrollIntoView({behavior:'smooth',block:'start'})}

  function renderIdeas(box){
    if(!hasRSS()){box.innerHTML=empty('订阅引擎还没加载。');return}
    const list=[...(RSS.ideas()||[])].sort((a,b)=>(b.ts||0)-(a.ts||0));
    if(!list.length){box.innerHTML=empty('收藏的灵感会攒在这里。');return}
    box.innerHTML='';
    for(const d of list){
      const link=safeUrl(d.link);
      const done=!!(d.opId&&openingExists(d.opId));
      const c=document.createElement('div');c.className='card fidea';
      c.innerHTML=`<div class="fttl">${esc(d.title||'（无标题）')}</div>
        ${d.note?`<div class="fnote">${esc(d.note)}</div>`:''}
        <div class="fmeta">${esc(d.src||'')}${d.src?' · ':''}${rel(d.ts)}</div>
        <div class="fops"><span class="ghost${done?' dim':''}" data-a="op">${done?'已转成开头':'转成开头'}</span>${link?`<a class="ghost" href="${esc(link)}" target="_blank" rel="noopener">原文</a>`:''}<span class="ghost" data-a="del" style="color:var(--danger)">删除</span></div>`;
      c.querySelector('[data-a=op]').onclick=()=>ideaToOpening(d.id);
      const del=c.querySelector('[data-a=del]');
      del.onclick=()=>{if(del.dataset.armed){ideaDel(d.id);return}arm(del,'删除')};
      box.appendChild(c);
    }
  }

  /* ── 刷新 ── */
  /* ── 下拉刷新：拉到顶再往下拽，指示行长出来；过阈值松手才拉 ── */
  const PTR_TH=58,PTR_MAX=96,PTR_HOLD=44;
  let ptrEl=null;
  function ptrLabel(t){if(ptrEl)ptrEl.firstElementChild.textContent=t}
  function ptrSet(h,anim){if(!ptrEl)return;ptrEl.style.transition=anim?'height .28s cubic-bezier(.2,.7,.3,1)':'none';ptrEl.style.height=h+'px'}
  function initPtr(){
    const sc=document.querySelector('#feed .scroll');if(!sc||ptrEl)return;
    ptrEl=document.createElement('div');ptrEl.className='ptr';ptrEl.innerHTML='<span>下拉刷新</span>';
    sc.insertBefore(ptrEl,sc.firstChild);
    let sy=0,active=false,pull=0;
    const start=y=>{if(busy||sc.scrollTop>0)return;sy=y;active=true;pull=0};
    const move=(y,ev)=>{
      if(!active)return;
      const dy=y-sy;
      if(dy<=0||sc.scrollTop>0){if(pull){pull=0;ptrSet(0,false)}return}
      pull=Math.min(PTR_MAX,dy*0.5);
      if(ev&&ev.cancelable)ev.preventDefault();
      ptrSet(pull,false);ptrLabel(pull>=PTR_TH?'松开刷新':'下拉刷新');
    };
    const end=()=>{
      if(!active)return;active=false;
      if(pull>=PTR_TH)refresh({pull:true});else ptrSet(0,true);
      pull=0;
    };
    sc.addEventListener('touchstart',e=>start(e.touches[0].clientY),{passive:true});
    sc.addEventListener('touchmove',e=>move(e.touches[0].clientY,e),{passive:false});
    sc.addEventListener('touchend',end);sc.addEventListener('touchcancel',end);
    // 回到顶部：滚过一屏多才浮出来
    const top=byId('feedTop');
    if(top)sc.addEventListener('scroll',()=>{top.classList.toggle('show',sc.scrollTop>sc.clientHeight*1.2)},{passive:true}); // 不走 rAF：页面隐藏时 rAF 冻结会让按钮状态滞后
    sc.addEventListener('mousedown',e=>start(e.clientY)); // 桌面调试用
    window.addEventListener('mousemove',e=>{if(active)move(e.clientY,null)});
    window.addEventListener('mouseup',end);
  }

  async function refresh(o){
    o=o||{};const quiet=!!o.quiet,pull=!!o.pull;
    if(!hasRSS()){if(!quiet)toast('订阅引擎还没加载');if(pull)ptrSet(0,true);return}
    if(busy){if(pull)ptrSet(0,true);return}
    if(!(RSS.feeds()||[]).some(f=>f.on!==false)){if(pull)ptrSet(0,true);if(!quiet){toast('还没有启用的订阅源——点右上「订阅」添加');openManage()}return}
    busy=true;
    const t0=Date.now();
    if(pull){ptrLabel('刷新中…');ptrSet(PTR_HOLD,true)}
    try{
      const r=(await RSS.refresh({force:!quiet}))||{};
      const errs=r.errors||[];
      const allFailed=errs.length&&!r.fetched&&!r.skipped;
      if(errs.length&&(!quiet||allFailed)){
        const e0=errs[0];
        const head=errs.length===1?`「${e0.name||'？'}」拉取失败`:`${errs.length} 个源拉取失败，如「${e0.name||'？'}」`;
        toast(`${head}：${String(e0.msg||'').slice(0,54)}${r.added?`；其余新增 ${r.added} 条`:''}。详情在「订阅」里`,5200);
      }else if(!quiet||r.added){
        toast(r.skipped&&!r.fetched&&!r.added?'刚刷过，十分钟内不重复拉':`新增 ${r.added||0} 条`,2400);
      }
    }catch(e){if(!quiet)toast('刷新失败：'+errMsg(e))}
    finally{
      busy=false;
      if(pull)setTimeout(()=>ptrSet(0,true),Math.max(0,600-(Date.now()-t0))); // 至少让人看见半秒
      _render();
      const sh=byId('feedsheet');if(sh&&sh.classList.contains('show'))renderManage();
    }
  }

  // 进屏静默拉取：走引擎的十分钟节流；只在有新条目或全部失败时说话
  let autoAt=0;
  function autoRefresh(){
    if(!hasRSS()||busy)return;
    if(Date.now()-autoAt<60e3)return;
    autoAt=Date.now();
    if(!(RSS.feeds()||[]).some(f=>f.on!==false))return;
    refresh({quiet:true});
  }

  /* ── 条目操作 ── */
  async function like(id){
    if(!hasRSS())return;
    try{await RSS.toggleLike(id)}catch(e){toast('操作失败：'+errMsg(e))}
    render();
  }
  async function idea(id){
    if(!hasRSS())return;
    const it=itemOf(id);
    if(it&&it.idea){ // 再点一次＝移出灵感；带笔记或已转成开头的要去灵感页删
      const mine=(RSS.ideas()||[]).filter(x=>x.itemId===id);
      if(mine.some(x=>x.note||x.opId)){toast('这条灵感带着笔记或已转成开头，要移出请去「灵感」里删');return}
      try{for(const x of mine)await RSS.removeIdea(x.id);toast('已移出灵感')}catch(e){toast('操作失败：'+errMsg(e))}
      render();return;
    }
    try{await RSS.addIdea(id,'');toast('已收进灵感')}catch(e){toast('收藏失败：'+errMsg(e))}
    render();
  }
  function say(id){
    if(!hasRSS())return;
    if(typeof People==='undefined'||!People.pick){toast('书中人模块还没加载');return}
    if(thinking.has(id)){toast('她还在想，稍等。');return}
    People.pick(async p=>{
      if(!p)return;
      thinking.set(id,p.name||'她');render();
      try{await RSS.comment(id,p)}
      catch(e){toast('没说出来：'+errMsg(e),3600)}
      finally{thinking.delete(id);render()}
    });
  }
  function toBook(id){
    if(!hasRSS())return;
    const it=itemOf(id);if(!it)return;
    if(typeof Writing==='undefined'||!Writing.openNewBook){toast('写作模块还没加载');return}
    Promise.resolve(Writing.openNewBook()).then(()=>{
      const t=byId('nbTitle'),o=byId('nbOpen');
      if(t)t.value='';
      if(o)o.value=((it.title||'')+'\n'+(bareUrl(it.text)?'':(it.text||''))).trim().slice(0,1500);
      if(typeof Openings!=='undefined'&&Openings.setSeg)Openings.setSeg('nbMode',1);
      toast('已带入开场指令，写个书名就能开写');
    }).catch(e=>toast('打开建书失败：'+errMsg(e)));
  }

  /* ── 灵感操作 ── */
  const openingExists=opId=>typeof Openings!=='undefined'&&Openings._list&&((Openings._list()||[]).some(o=>o&&o.id===opId));
  async function ideaToOpening(id){
    if(!hasRSS())return;
    const d=(RSS.ideas()||[]).find(x=>x.id===id);if(!d)return;
    if(typeof Openings==='undefined'||!Openings._list){toast('素材库还没加载');return}
    try{
      await Openings.load();
      if(d.opId&&openingExists(d.opId)){toast('已经转过了，在素材库「开头」里');return}
      const it=itemOf(d.itemId);
      const body=String(d.note||'').trim()||String((it&&it.text)||'');
      const text=((d.title||'')+'\n'+body).trim().slice(0,4000);
      const opId='op'+Math.random().toString(36).slice(2,8);
      Openings._list().push({id:opId,name:(d.title||'灵感').slice(0,20),text,mode:'cmd',wbId:null});
      await DB.set('op.list',Openings._list());
      if(RSS.updateIdea)await RSS.updateIdea(d.id,{opId});
      Openings.renderAssets();
      toast('已转成开头素材');
      render();
    }catch(e){toast('转换失败：'+errMsg(e))}
  }
  async function ideaDel(id){
    if(!hasRSS())return;
    try{await RSS.removeIdea(id)}catch(e){toast('删除失败：'+errMsg(e))}
    render();
  }

  /* ── 订阅管理 ── */
  const segIdx=id=>{const s=byId(id);return s?[...s.children].findIndex(c=>c.classList.contains('on')):0};
  function syncType(){ // 按类型切换 RSS 地址／子版块两个输入框
    const reddit=segIdx('fsType')===1;
    const u=byId('fsUrlField'),s=byId('fsSubField');
    if(u)u.style.display=reddit?'none':'';
    if(s)s.style.display=reddit?'':'none';
  }
  function openManage(){openSheet('feedsheet');syncType();renderManage()}
  function renderManage(){
    const box=byId('feedMgrList');if(!box)return;
    if(!hasRSS()){box.innerHTML=empty('订阅引擎还没加载。');return}
    const feeds=RSS.feeds()||[];
    box.innerHTML=feeds.length?'':empty('还没有订阅源，在下面添一个。');
    for(const f of feeds){
      const on=f.on!==false;
      const d=document.createElement('div');d.className='frow';
      const st=f.err?`<span class="ferr">${esc(String(f.err).slice(0,120))}</span>`:(f.lastFetch?'上次拉取 · '+rel(f.lastFetch):'尚未拉取');
      d.innerHTML=`<div class="frow-top"><span class="frow-name">${esc(f.name||'')}</span><span class="src">${f.type==='reddit'?'Reddit':'RSS'}</span></div>
        <div class="frow-st">${st}</div>
        <div class="frow-ops"><div class="seg fseg"><div class="${on?'on':''}" data-a="on">启用</div><div class="${on?'':'on'}" data-a="off">停用</div></div><span class="ghost" data-a="del" style="color:var(--danger)">删除</span></div>`;
      d.querySelector('[data-a=on]').onclick=()=>toggleFeed(f.id,true);
      d.querySelector('[data-a=off]').onclick=()=>toggleFeed(f.id,false);
      const del=d.querySelector('[data-a=del]');
      del.onclick=()=>{if(del.dataset.armed){removeFeed(f.id);return}arm(del,'删除')};
      box.appendChild(d);
    }
  }
  async function addFeed(){
    if(!hasRSS()){toast('订阅引擎还没加载');return}
    const type=segIdx('fsType')===1?'reddit':'rss';
    let name=(byId('fsName').value||'').trim();
    let url=(byId('fsUrl').value||'').trim();
    const sub=(byId('fsSub').value||'').trim().replace(/^\/?r\//i,'').replace(/\/+$/,'');
    const proxy=(byId('fsProxy').value||'').trim();
    if(type==='rss'){
      if(!url){toast('先填 RSS 地址');return}
      if(!/^https?:\/\//i.test(url))url='https://'+url;
    }else if(!sub){toast('先填子版块名，比如 writingprompts');return}
    // 名称留空交给引擎：先用域名顶着，第一次拉到源标题就换上
    let f=null;
    try{f=await RSS.addFeed({name,type,url:type==='rss'?url:'',sub:type==='reddit'?sub:'',proxy})}
    catch(e){toast('添加失败：'+errMsg(e));return}
    ['fsName','fsUrl','fsSub','fsProxy'].forEach(id=>{const el=byId(id);if(el)el.value=''});
    renderManage();
    toast('已添加，正在拉取…');
    try{
      const r=(await RSS.refresh({feedId:f&&f.id,force:true}))||{};
      const errs=r.errors||[];
      if(errs.length)toast('拉取失败：'+String(errs[0].msg||'').slice(0,80),4600);
      else toast(`新增 ${r.added||0} 条`);
    }catch(e){toast('拉取失败：'+errMsg(e),4600)}
    renderManage();_render();
  }
  async function toggleFeed(id,on){
    if(!hasRSS())return;
    const f=(RSS.feeds()||[]).find(x=>x.id===id);if(!f)return;
    const now=f.on!==false;
    const next=on===undefined?!now:!!on;
    if(next===now)return;
    try{await RSS.updateFeed(id,{on:next})}catch(e){toast('保存失败：'+errMsg(e))}
    renderManage();
  }
  async function removeFeed(id){
    if(!hasRSS())return;
    try{await RSS.removeFeed(id);toast('已删除订阅')}catch(e){toast('删除失败：'+errMsg(e))}
    renderManage();render();
  }

  /* ── 初始化：seg 通用切换、变更回调、进屏即渲染 ── */
  (()=>{
    ['ppGender','fsType'].forEach(id=>{
      const seg=byId(id);
      if(seg)[...seg.children].forEach(c=>c.onclick=()=>{[...seg.children].forEach(x=>x.classList.remove('on'));c.classList.add('on');if(id==='fsType')syncType()});
    });
    if(hasRSS()&&RSS.on)RSS.on(()=>render());
    const _g=go;
    go=id=>{
      _g(id);
      if(id==='feed'){initPtr();render();autoRefresh()}
      if(id==='postdetail')renderDetail();
      else if(detailId&&hasRSS()&&RSS.unpin){RSS.unpin(detailId)} // 离开详情就解钉（detailId 留着，回来还能看）
      if(id==='contacts'&&typeof People!=='undefined'&&People.renderList)People.renderList();
    };
  })();

  return{render,tab,refresh,openManage,renderManage,addFeed,toggleFeed,removeFeed,like,idea,say,toBook,ideaToOpening,ideaDel,rel,openDetail,renderDetail,detailSay,detailLike,detailStar,detailCmts,toTop,cover:coverHTML};
})();
