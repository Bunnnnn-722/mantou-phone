/* U8 阅读界面胶水：书架（shelf）／发现（store）／书页半窗（booksheet）／阅读器（reader）。数据在 RD，封面在 Cover，网络在 Net，解析在 WS。 */
const ReadUI=(()=>{
  const byId=id=>document.getElementById(id);
  const errMsg=e=>String((e&&e.message)||e||'未知错误').slice(0,90);
  function hoist(id){const s=byId(id);const act=document.querySelector('.screen.active');if(s&&act&&s.parentElement!==act)act.appendChild(s);return s}
  const openSheet=id=>{const s=hoist(id);if(s)s.classList.add('show')};
  const closeSheet=id=>{const s=byId(id);if(s)s.classList.remove('show')};
  let cur={id:null,ch:1};

  /* ── 书架 ── */
  function bookCard(b){
    const d=document.createElement('div');d.className='post';d.dataset.id=b.id;
    const line=b.fetched<b.n?`已拉 ${b.fetched}／${b.n} 章`:(b.prog&&b.prog.ch>1?`读到 ${b.prog.ch}／${b.n} 章`:`共 ${b.n} 章`);
    d.innerHTML=`${Cover.html({id:b.id,title:b.title,author:b.author,mode:'book'})}<div class="meta"><div class="cap">${esc(b.title)}${b.author?' · '+esc(b.author):''}</div><div class="who"><span class="src-n">${esc(line)}</span>${b.err?'<span class="acts"><span class="cnt" style="color:var(--danger)">拉取受阻</span></span>':''}</div></div>`;
    d.onclick=()=>open(b.id);
    return d;
  }
  async function renderShelf(){
    const box=byId('shelfList');if(!box)return;
    await RD.load();
    const books=RD.books().filter(b=>!b.archived).sort((a,b)=>(b.readAt||b.ts)-(a.readAt||a.ts));
    const arch=RD.books().filter(b=>b.archived);
    if(!books.length){box.className='';box.innerHTML='<div class="sub fempty">书架还空着——去「发现」挑一本，或上传 TXT。</div>'}
    else{
      box.className='feed';box.innerHTML='<div class="col"></div><div class="col"></div>';
      const cols=[...box.children],hidden=!box.offsetParent;
      books.forEach((b,i)=>{const c=hidden?cols[i%2]:(cols[0].offsetHeight<=cols[1].offsetHeight?cols[0]:cols[1]);c.appendChild(bookCard(b))});
    }
    let ab=byId('shelfArch');if(!ab){ab=document.createElement('div');ab.id='shelfArch';box.parentElement.insertBefore(ab,box.nextSibling)}
    if(!arch.length){ab.innerHTML='';return}
    ab.innerHTML=`<div class="k" style="margin:18px 2px 8px;cursor:pointer" data-a="tg">归 档 · ${arch.length} 本 <span style="font-family:var(--sans);letter-spacing:0">${archOpen?'收起':'展开'}</span></div><div data-a="list" style="display:${archOpen?'':'none'}"></div>`;
    ab.querySelector('[data-a=tg]').onclick=()=>{archOpen=!archOpen;renderShelf()};
    const list=ab.querySelector('[data-a=list]');
    for(const b of arch){const d=document.createElement('div');d.className='mem';d.innerHTML=`<div class="idx">${esc(b.title)}${b.author?' · '+esc(b.author):''}<span class="src" style="margin-left:auto">读到 ${b.prog?b.prog.ch:1}／${b.n}</span></div><div class="detail" style="display:block"><div class="fops" style="margin-top:0"><span class="ghost" data-a="open">继续读</span><span class="ghost" data-a="un">移回书架</span></div></div>`;d.querySelector('[data-a=open]').onclick=()=>open(b.id);d.querySelector('[data-a=un]').onclick=async()=>{await RD.archive(b.id,false);renderShelf()};list.appendChild(d)}
  }
  let archOpen=false;

  /* ── 发现：书单 + 搜索 ── */
  function renderStore(){
    renderGuess();
    const box=byId('stList');if(!box)return;
    box.className='feed';box.innerHTML='<div class="col"></div><div class="col"></div>';
    const cols=[...box.children],hidden=!box.offsetParent;
    BOOKLIST.forEach((b,i)=>{
      const d=document.createElement('div');d.className='post';
      d.innerHTML=`${Cover.html({id:'ws:'+b.page,title:b.title,author:b.author,mode:'book'})}<div class="meta"><div class="cap">${esc(b.title)} · ${esc(b.author)}</div></div>`;
      d.onclick=()=>openBook(b.page,{title:b.title,author:b.author,pick:b.pick});
      const c=hidden?cols[i%2]:(cols[0].offsetHeight<=cols[1].offsetHeight?cols[0]:cols[1]);c.appendChild(d);
    });
  }
  // 猜你喜欢：零模型——书单里没上架的，按今天的日期洗牌取 4 本；书架里有同作者的排前面
  function renderGuess(){
    const box=byId('stGuess');if(!box)return;
    const have=new Set(RD.books().map(b=>b.page));const authors=new Set(RD.books().map(b=>b.author).filter(Boolean));
    const seed=Math.floor(Date.now()/864e5);
    const pool=BOOKLIST.filter(b=>!have.has(b.page)).map((b,i)=>({b,k:((i*9301+seed*49297)%233280)/233280-(authors.has(b.author)?1:0)})).sort((x,y)=>x.k-y.k).slice(0,4).map(x=>x.b);
    if(!pool.length){box.innerHTML='';return}
    box.innerHTML='<div class="k" style="margin:6px 2px 10px">猜 你 喜 欢</div>'+pool.map(b=>`<div class="mem" style="cursor:pointer" data-p="${esc(b.page)}"><div class="idx">${esc(b.title)}<span class="src" style="margin-left:auto">${esc(b.author)}</span></div></div>`).join('');
    box.querySelectorAll('[data-p]').forEach(el=>{const b=BOOKLIST.find(x=>x.page===el.dataset.p);el.onclick=()=>openBook(b.page,{title:b.title,author:b.author,pick:b.pick})});
  }
  async function search(){
    const q=(byId('stQ').value||'').trim(),box=byId('stRes');if(!box)return;
    if(!q){box.innerHTML='';return}
    box.innerHTML='<div class="sub" style="margin:6px 2px">搜索中…</div>';
    // 作者页：有就先列作品（只认篇目列表里的链接，剔掉分类／作者等命名空间）
    let authorHtml='';
    try{
      const {res}=await Net.get(WS.url({action:'parse',page:'作者:'+q.replace(/^作者[：:]\s*/,''),prop:'text'}),{ms:12000});
      const j=await res.jsonT();
      if(j.parse){const ls=WS.links(j.parse.text).filter(l=>!/^(作者|Author):/.test(l.page)&&!l.page.includes(' (消歧義)')).slice(0,40);
        if(ls.length)authorHtml=`<div class="k" style="margin:6px 2px 8px">作 者 · ${esc(q)} · ${ls.length} 部</div><div class="chips" style="margin-bottom:12px">${ls.map(l=>`<span class="chip" data-p="${esc(l.page)}">${esc(l.text)}</span>`).join('')}</div>`}
    }catch(e){}
    try{
      const {res}=await Net.get(WS.url({action:'query',list:'search',srsearch:q,srlimit:12}));
      const j=await res.jsonT();const hits=(j.query&&j.query.search)||[];
      if(!hits.length){box.innerHTML=authorHtml+'<div class="sub" style="margin:6px 2px">维基文库没有这本；试试繁体或换个关键词。</div>';box.querySelectorAll('.chip[data-p]').forEach(c=>c.onclick=()=>openBook(c.dataset.p,{}));return}
      hits.sort((a,b)=>(a.title.includes('/')?1:0)-(b.title.includes('/')?1:0));
      box.innerHTML=authorHtml;
      box.querySelectorAll('.chip[data-p]').forEach(c=>c.onclick=()=>openBook(c.dataset.p,{}));
      for(const h of hits){
        const d=document.createElement('div');d.className='mem';
        d.innerHTML=`<div class="idx">${esc(h.title)}<span class="src" style="margin-left:auto">约 ${Math.max(1,Math.round(h.size/3/10000*10)/10)} 万字</span></div>`;
        d.onclick=()=>openBook(h.title,{});box.appendChild(d);
      }
    }catch(e){box.innerHTML=`<div class="sub" style="margin:6px 2px;color:var(--danger)">拉不到维基文库：${esc(errMsg(e))}</div><div style="margin:8px 2px"><span class="ghost" onclick="go('settings')">去设置配转发代理</span></div>`}
  }

  /* ── 书页半窗：即开，异步补目录 ── */
  let bookCtx=null;
  async function openBook(page,meta){
    meta=meta||{};
    bookCtx={page,meta,info:null,pick:meta.pick||''};
    byId('bsTitle').textContent=meta.title||page;
    byId('bsAuthor').textContent=meta.author||'';
    byId('bsInfo').innerHTML='<div class="sub" style="margin:0">取目录中…</div>';
    byId('bsVersions').innerHTML='';
    const btn=byId('bsAdd');
    const have=RD.get('ws:'+page)||RD.books().find(b=>b.page===page);
    btn.textContent=have?'去读':'加入书架';btn.disabled=!have;btn.classList.toggle('dim',!have);
    openSheet('wsbook');
    try{
      let info=await RD.inspect(page);
      if(info.kind==='versions'){
        const vs=info.versions;
        byId('bsVersions').innerHTML='<div class="k" style="margin:10px 2px 6px">有几个版本，选一个</div><div class="chips">'+vs.map((v,i)=>`<span class="chip${(bookCtx.pick?v.page===bookCtx.pick:i===0)?' on':''}" data-p="${esc(v.page)}">${esc(v.title)}</span>`).join('')+'</div>';
        if(!bookCtx.pick)bookCtx.pick=vs[0]&&vs[0].page;
        byId('bsVersions').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{byId('bsVersions').querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');bookCtx.pick=c.dataset.p});
        info=await RD.inspect(bookCtx.pick);
      }
      bookCtx.info=info;
      if(!meta.title)byId('bsTitle').textContent=info.title;
      const kindTxt={subpages:'分章',collection:'合集',single:'单篇',versions:'版本页'}[info.kind]||info.kind;
      const first=info.chapters.slice(0,3).map(c=>esc(c.title)).join(' · ');
      byId('bsInfo').innerHTML=`<div class="sub" style="margin:0">${kindTxt} · ${info.chapters.length} 章${first?'<br>'+first+(info.chapters.length>3?' …':''):''}<br><span style="color:var(--text-3)">文本来自维基文库 · <a class="ghost" style="padding:2px 9px" href="https://zh.wikisource.org/wiki/${encodeURIComponent(info.page)}" target="_blank" rel="noopener">原页</a></span></div>`;
      const have2=RD.get('ws:'+info.page);
      btn.textContent=have2?'去读':'加入书架';btn.disabled=false;btn.classList.remove('dim');
    }catch(e){
      byId('bsInfo').innerHTML=`<div class="sub" style="margin:0;color:var(--danger)">${esc(errMsg(e))}</div><div style="margin-top:8px"><span class="ghost" onclick="go('settings')">去设置配转发代理</span></div>`;
    }
  }
  async function addBook(){
    if(!bookCtx)return;
    const page=(bookCtx.info&&bookCtx.info.page)||bookCtx.page;
    const have=RD.get('ws:'+page);
    if(have){closeSheet('wsbook');open(have.id);return}
    const btn=byId('bsAdd');btn.textContent='入库中…';btn.disabled=true;
    try{
      const b=await RD.addWikisource({page:bookCtx.pick||bookCtx.page,pick:bookCtx.pick,title:bookCtx.meta.title||(bookCtx.info&&bookCtx.info.title),author:bookCtx.meta.author||''});
      toast('已加入书架，前三章可读，其余在后台拉');
      btn.textContent='去读';btn.disabled=false;
      renderShelf();
    }catch(e){toast('加入失败：'+errMsg(e),4200);btn.textContent='加入书架';btn.disabled=false}
  }

  /* ── 阅读器 ── */
  async function open(id,ch){
    const b=RD.get(id);if(!b){toast('书不在书架');return}
    cur={id,ch:ch||(b.prog&&b.prog.ch)||1};
    go('reader');
    await renderChapter();
  }
  const paraHTML=p=>p.t==='head'?`<div class="read-head">${esc(p.s)}</div>`:p.t==='poem'?`<div class="read-poem">${esc(p.s)}</div>`:`<p class="read-para">${esc(p.s)}</p>`;
  async function renderChapter(){
    const b=RD.get(cur.id);if(!b)return;
    applyReadCfg();
    const toc=await RD.toc(cur.id);
    const ch=toc.find(c=>c.n===cur.ch)||toc[0];if(!ch)return;cur.ch=ch.n;
    byId('rdTtl').textContent=ch.title;
    byId('rdTool').textContent=`${cur.ch}／${b.n}`;
    const box=byId('rdScroll');
    box.innerHTML=`<div class="sub" style="margin:20px 2px">${Net.online()?'拉取中…':'还没拉到，联网后继续'}</div>`;
    let data;
    try{data=await RD.chapter(cur.id,cur.ch)}
    catch(e){box.innerHTML=`<div class="sub" style="margin:20px 2px;color:var(--danger)">${esc(errMsg(e))}</div><div style="margin:10px 2px"><span class="ghost" onclick="ReadUI.reload()">重试</span></div>`;return}
    const prev=toc.find(c=>c.n===cur.ch-1),next=toc.find(c=>c.n===cur.ch+1);
    box.innerHTML=data.p.map(paraHTML).join('')+`<div class="rdnav">${prev?`<span class="ghost" onclick="ReadUI.goCh(${prev.n})">上一章</span>`:'<span></span>'}${next?`<span class="ghost" onclick="ReadUI.goCh(${next.n})">下一章</span>`:'<span class="sub" style="margin:0">全书完</span>'}</div>`;
    const para=(cur.ch===(b.prog&&b.prog.ch))?(b.prog.para||0):0;
    requestAnimationFrame(()=>{const el=box.querySelectorAll('.read-para,.read-poem,.read-head')[para];box.scrollTop=el?el.offsetTop-box.offsetTop-8:0});
    RD.progress(cur.id,cur.ch,para);
    applyNotes();
  }
  /* ── 笔记渲染：把本章划线包成 span.uline（按段序＋引文定位） ── */
  async function applyNotes(){
    const box=byId('rdScroll');if(!box||!cur.id)return;
    const els=[...box.querySelectorAll('.read-para,.read-poem,.read-head')];
    const ns=(await RD.notes(cur.id)).filter(n=>n.ch===cur.ch&&(n.kind==='line'||n.kind==='idea')&&n.quote);
    for(const n of ns){
      let el=els[n.para];
      if(!el||!el.textContent.includes(n.quote))el=els.find(e=>e.textContent.includes(n.quote));
      if(!el)continue;
      wrapQuote(el,n.quote,n.id,n.kind==='idea');
    }
    await applyCmts(els);
    renderChapterReview();
    watchEnd();
  }
  async function applyCmts(els){
    const cs=(await RD.cmts(cur.id)).filter(c=>c.ch===cur.ch);
    const byQ=new Map();
    for(const c of cs.filter(x=>x.kind==='para'&&x.quote)){const k=c.quote;if(!byQ.has(k))byQ.set(k,[]);byQ.get(k).push(c)}
    for(const [quote,list] of byQ){
      let el=els[list[0].para];if(!el||!el.textContent.includes(quote))el=els.find(e=>e.textContent.includes(quote));if(!el)continue;
      const sp=wrapRange(el,quote,'cline');
      if(sp){sp.onclick=e=>{e.stopPropagation();openIdeas(quote)};const ct=document.createElement('span');ct.className='ct';ct.textContent=list.length;sp.appendChild(ct)}
    }
    // 章末：书中人的话
    const box=byId('rdScroll');let host=box.querySelector('.rdcast');
    if(!host){host=document.createElement('div');host.className='rdcast';const rv=box.querySelector('.rdreview');if(rv)box.insertBefore(host,rv);else box.appendChild(host)}
    const b=RD.get(cur.id);const g=(await RD.gen(cur.id))[cur.ch];
    const chapterCmts=cs.filter(x=>x.kind==='chapter');
    if(!b.coRead||!(b.cast||[]).length){host.innerHTML='';return}
    let st='';
    if(g==='running')st='<div class="fpend">书中人在读这一章…</div>';
    else if(g==='failed')st=`<div class="sub" style="margin:0;color:var(--danger)">这章的评论没生成${b.genErr?'：'+esc(b.genErr):''}</div><div class="fops" style="margin-top:6px"><span class="ghost" onclick="ReadUI.retryGen()">点击重试</span></div>`;
    else if(g==='todo')st='<div class="fpend">排队中…</div>';
    else if(!g&&!(b.read&&b.read[cur.ch]))st='<div class="sub" style="margin:0">读完这一章，她们会来说话。</div>';
    host.innerHTML=`<div class="k" style="margin:26px 2px 10px">书 中 人 的 话${chapterCmts.length?' · '+chapterCmts.length+' 条':''}</div><div class="fcmts">${chapterCmts.map(c=>`<div class="fcmt"><span class="avatar">${esc((c.name||'？').slice(0,1))}</span><div class="fcbody"><div class="fcname">${esc(c.name)}</div><div class="fctext">${esc(c.text)}</div></div></div>`).join('')}</div>${st}`;
  }
  // 读完判定：章末导航进入视口停留 ≥1.5 秒，或翻下一章时本章已滚过 30%
  let endT=null,endObs=null;
  function watchEnd(){
    const box=byId('rdScroll');const nav=box&&box.querySelector('.rdnav');if(!nav)return;
    if(endObs)endObs.disconnect();
    endObs=new IntersectionObserver(es=>{for(const e of es){if(e.isIntersecting){clearTimeout(endT);endT=setTimeout(()=>markReadNow(),1500)}else clearTimeout(endT)}},{root:box,threshold:.5});
    endObs.observe(nav);
  }
  async function markReadNow(){if(!cur.id)return;const ok=await RD.markRead(cur.id,cur.ch);if(ok)applyNotesSoft()}
  async function applyNotesSoft(){const box=byId('rdScroll');const els=[...box.querySelectorAll('.read-para,.read-poem,.read-head')];await applyCmts(els)}
  function retryGen(){RD.retryGen(cur.id,cur.ch)}
  // 在 el 的文本里找 quote（可跨已有的 span），包成 span.cls；返回 span 或 null
  function wrapRange(el,quote,cls){
    const full=el.textContent;const at=full.indexOf(quote);if(at<0)return null;
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,pos=0,start=null,end=null;
    while(node=walker.nextNode()){
      const len=node.nodeValue.length;
      if(start===null&&at<pos+len)start=[node,at-pos];
      if(start!==null&&at+quote.length<=pos+len){end=[node,at+quote.length-pos];break}
      pos+=len;
    }
    if(!start||!end)return null;
    const r=document.createRange();r.setStart(start[0],start[1]);r.setEnd(end[0],end[1]);
    const sp=document.createElement('span');sp.className=cls;
    try{const frag=r.extractContents();sp.appendChild(frag);r.insertNode(sp);el.normalize();el.querySelectorAll('.uline:empty,.cline:empty').forEach(x=>x.remove());return sp}catch(e){return null}
  }
  function wrapQuote(el,quote,nid,hasIdea){
    if(el.querySelector('.uline[data-nid="'+nid+'"]'))return;
    const sp=wrapRange(el,quote,'uline'+(hasIdea?' idea':''));
    if(!sp)return;
    sp.dataset.nid=nid;sp.onclick=e=>{e.stopPropagation();openIdeas(quote)};
  }
  function wrapQuoteOld(el,quote,nid,hasIdea){
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
      const i=node.nodeValue.indexOf(quote);if(i<0)continue;
      if(node.parentElement.classList.contains('uline'))return;
      const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+quote.length);
      const sp=document.createElement('span');sp.className='uline'+(hasIdea?' idea':'');sp.dataset.nid=nid;
      sp.onclick=e=>{e.stopPropagation();openIdeas(quote)};
      try{r.surroundContents(sp)}catch(e){}
      return;
    }
  }
  /* 选区浮条：selectionchange 去抖，不依赖 touchend */
  let selT=null,selInfo=null;
  function onSel(){
    clearTimeout(selT);
    selT=setTimeout(()=>{
      const bar=byId('rdSel');if(!bar)return;
      const sel=document.getSelection();const box=byId('rdScroll');
      const txt=sel&&!sel.isCollapsed?String(sel.toString()).trim():'';
      if(!txt||!box||!box.contains(sel.anchorNode)||!byId('reader').classList.contains('active')){bar.classList.remove('show');selInfo=null;return}
      const el=(sel.anchorNode.nodeType===3?sel.anchorNode.parentElement:sel.anchorNode).closest('.read-para,.read-poem,.read-head');
      const els=[...box.querySelectorAll('.read-para,.read-poem,.read-head')];
      selInfo={quote:txt.slice(0,300),para:Math.max(0,els.indexOf(el))};
      const rect=sel.getRangeAt(0).getBoundingClientRect(),ph=byId('phone').getBoundingClientRect();
      bar.style.top=Math.max(60,rect.top-ph.top-44)+'px';bar.classList.add('show');
    },400);
  }
  async function markLine(){if(!selInfo||!cur.id)return;await RD.addNote(cur.id,{kind:'line',ch:cur.ch,para:selInfo.para,quote:selInfo.quote});clearSel();toast('已划线');reload()}
  function copySel(){if(!selInfo)return;try{navigator.clipboard.writeText(selInfo.quote)}catch(e){}clearSel();toast('已复制')}
  function clearSel(){const s=document.getSelection();if(s)s.removeAllRanges();const bar=byId('rdSel');if(bar)bar.classList.remove('show')}
  function markIdea(){if(!selInfo||!cur.id)return;const q=selInfo.quote,pa=selInfo.para;clearSel();openIdeas(q,pa)}
  // 想法半窗：引文＋已有想法（可改可删）＋新写一条
  let ideaQ='',ideaPara=0;
  async function openIdeas(quote,para){
    ideaQ=quote;if(para!=null)ideaPara=para;
    byId('idQuote').textContent='「'+quote+'」';
    const ns=(await RD.notes(cur.id)).filter(n=>n.quote===quote&&n.ch===cur.ch);
    const list=byId('idList');list.innerHTML='';
    for(const c of (await RD.cmts(cur.id)).filter(x=>x.ch===cur.ch&&x.kind==='para'&&x.quote===quote)){
      const d=document.createElement('div');d.className='fcmt';
      d.innerHTML=`<span class="avatar">${esc((c.name||'？').slice(0,1))}</span><div class="fcbody"><div class="fcname">${esc(c.name)}</div><div class="fctext">${esc(c.text)}</div></div>`;
      list.appendChild(d);
    }
    for(const n of ns.filter(x=>x.kind==='idea')){
      const d=document.createElement('div');d.className='fcmt';
      d.innerHTML=`<span class="avatar">我</span><div class="fcbody"><div class="fcname">我的想法 · ${FeedUI.rel(n.ts)}</div><div class="fctext">${esc(n.text)}</div><div class="fops" style="margin-top:6px"><span class="ghost" data-a="edit">改</span><span class="ghost" data-a="del" style="color:var(--danger)">删</span></div></div>`;
      d.querySelector('[data-a=edit]').onclick=()=>{byId('idText').value=n.text;byId('idText').dataset.nid=n.id;byId('idText').focus()};
      const del=d.querySelector('[data-a=del]');del.onclick=async()=>{if(del.dataset.armed){await RD.removeNote(cur.id,n.id);openIdeas(quote);reload();return}del.dataset.armed='1';del.textContent='确认删？';setTimeout(()=>{delete del.dataset.armed;del.textContent='删'},2600)};
      list.appendChild(d);
    }
    const line=ns.find(x=>x.kind==='line');
    byId('idUnline').style.display=line?'':'none';byId('idUnline').dataset.nid=line?line.id:'';
    byId('idText').value='';delete byId('idText').dataset.nid;
    openSheet('ideasheet');
  }
  async function saveIdea(){
    const ta=byId('idText');const text=(ta.value||'').trim();if(!text){toast('先写点什么');return}
    if(ta.dataset.nid)await RD.updateNote(cur.id,ta.dataset.nid,{text});
    else await RD.addNote(cur.id,{kind:'idea',ch:cur.ch,para:ideaPara,quote:ideaQ,text});
    toast('想法记下了');openIdeas(ideaQ);reload();
  }
  async function unline(){const nid=byId('idUnline').dataset.nid;if(!nid)return;await RD.removeNote(cur.id,nid);closeSheet('ideasheet');toast('已取消划线');reload()}
  // 章评（章末）
  async function renderChapterReview(){
    const box=byId('rdScroll');if(!box)return;
    let host=box.querySelector('.rdreview');if(!host){host=document.createElement('div');host.className='rdreview';const nav=box.querySelector('.rdnav');if(nav)box.insertBefore(host,nav);else box.appendChild(host)}
    const n=(await RD.notes(cur.id)).find(x=>x.kind==='chapter'&&x.ch===cur.ch);
    host.innerHTML=`<div class="k" style="margin:26px 2px 10px">我 的 章 评</div>${n&&n.text?`<div class="fnote">${esc(n.text)}</div>`:''}<div class="fops" style="margin-top:8px"><span class="ghost" data-a="w">${n&&n.text?'改章评':'写章评'}</span></div><div class="rdedit" style="display:none"><textarea class="fta" id="chText" placeholder="这一章读完，想说什么…"></textarea><div class="fops" style="margin-top:8px"><button class="btn" data-a="save">保存</button><span class="ghost" data-a="cancel">算了</span></div></div>`;
    const ed=host.querySelector('.rdedit');
    host.querySelector('[data-a=w]').onclick=()=>{ed.style.display='';host.querySelector('#chText').value=(n&&n.text)||'';host.querySelector('#chText').focus()};
    host.querySelector('[data-a=cancel]').onclick=()=>{ed.style.display='none'};
    host.querySelector('[data-a=save]').onclick=async()=>{const t=(host.querySelector('#chText').value||'').trim();await RD.addNote(cur.id,{kind:'chapter',ch:cur.ch,text:t});toast('章评已存');renderChapterReview()};
  }
  // 书评（书信息半窗）
  /* 阅读设置：字号三档／行距两档（全局，cfg.read.*）＋繁简（书级，仅书城书） */
  async function applyReadCfg(){
    const fs=Number(await DB.get('cfg.read.fs'))||17,lh=Number(await DB.get('cfg.read.lh'))||2.3;
    const sc=byId('rdScroll');if(sc){sc.style.setProperty('--rd-fs',fs+'px');sc.style.setProperty('--rd-lh',String(lh))}
  }
  async function renderReadSet(){
    const host=byId('biSet');if(!host||!cur.id)return;
    const b=RD.get(cur.id);const fs=Number(await DB.get('cfg.read.fs'))||17,lh=Number(await DB.get('cfg.read.lh'))||2.3;
    host.innerHTML=`<div class="k" style="margin:14px 2px 8px">排 版</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <div class="seg" style="max-width:200px" data-a="fs">${[15,17,19].map(n=>`<div class="${n===fs?'on':''}">${n===15?'小':n===17?'中':'大'}</div>`).join('')}</div>
        <div class="seg" style="max-width:160px" data-a="lh">${[2.0,2.3].map(n=>`<div class="${Math.abs(n-lh)<.01?'on':''}">${n===2?'紧':'松'}</div>`).join('')}</div>
        ${b.src==='wikisource'?`<div class="seg" style="max-width:160px" data-a="hant"><div class="${b.hant?'':'on'}">简</div><div class="${b.hant?'on':''}">繁</div></div>`:''}
      </div>`;
    [...host.querySelector('[data-a=fs]').children].forEach((c,i)=>c.onclick=async()=>{await DB.set('cfg.read.fs',[15,17,19][i]);applyReadCfg();renderReadSet()});
    [...host.querySelector('[data-a=lh]').children].forEach((c,i)=>c.onclick=async()=>{await DB.set('cfg.read.lh',[2.0,2.3][i]);applyReadCfg();renderReadSet()});
    const h=host.querySelector('[data-a=hant]');if(h)[...h.children].forEach((c,i)=>c.onclick=async()=>{if(!!b.hant===(i===1))return;await RD.setHant(cur.id,i===1);toast(i===1?'切到繁体，正在重拉':'切到简体，正在重拉');closeSheet('bookinfosheet');renderChapter()});
  }
  async function renderCoRead(){
    const host=byId('biCo');if(!host||!cur.id)return;
    const b=RD.get(cur.id);const all=(typeof People!=='undefined'&&People.list)?(People.list()||[]):[];
    const picked=new Set((b.cast||[]).map(c=>c.pid));
    const dens=b.density!=null?b.density:Math.max(0,Math.min(3,Number(await DB.get('cfg.read.density'))||1));
    host.innerHTML=`<div class="k" style="margin:14px 2px 8px">共 读</div>
      <div class="seg" style="max-width:160px" data-a="seg"><div class="${b.coRead?'on':''}">开</div><div class="${b.coRead?'':'on'}">关</div></div>
      <div class="sub" style="margin:8px 0 6px">谁来一起读（最多 5 位）</div>
      <div class="chips" data-a="cast">${all.length?all.map(p=>`<span class="chip${picked.has(p.id)?' on':''}" data-pid="${esc(p.id)}">${esc(p.name)}</span>`).join(''):'<span class="sub" style="margin:0">还没有书中人，去「书中人」里建一位</span>'}</div>
      <div class="sub" style="margin:10px 0 6px">每章每人段评上限</div>
      <div class="seg" style="max-width:220px" data-a="dens">${[0,1,2,3].map(n=>`<div class="${n===dens?'on':''}">${n===0?'不划':n+' 处'}</div>`).join('')}</div>`;
    const seg=host.querySelector('[data-a=seg]');[...seg.children].forEach((c,i)=>c.onclick=async()=>{if(i===0&&!(b.cast||[]).length){toast('先挑一位书中人');return}if(i===0){const base=String((await DB.get('cfg.light.base'))||(await DB.get('cfg.main.base'))||'').trim();if(!base){toast('未配置 API——去设置里给通道填 BASE URL、Key 与模型');closeSheet('bookinfosheet');go('settings');return}}await RD.setCoRead(cur.id,i===0);renderCoRead();applyNotesSoft()});
    host.querySelectorAll('[data-a=cast] .chip').forEach(ch=>ch.onclick=async()=>{const pid=ch.dataset.pid;const cur2=(RD.get(cur.id).cast||[]).slice();const i=cur2.findIndex(c=>c.pid===pid);if(i>=0)cur2.splice(i,1);else{if(cur2.length>=5){toast('最多 5 位');return}const p=all.find(x=>x.id===pid);cur2.push({pid,name:p.name})}await RD.setCast(cur.id,cur2);renderCoRead()});
    const ds=host.querySelector('[data-a=dens]');[...ds.children].forEach((c,i)=>c.onclick=async()=>{await RD.setDensity(cur.id,i);renderCoRead()});
  }
  async function renderNoteList(){
    const host=byId('biNotes');if(!host||!cur.id)return;
    const ns=(await RD.notes(cur.id)).filter(n=>n.kind!=='book').sort((a,b)=>(a.ch-b.ch)||(a.para-b.para)||(a.ts-b.ts));
    if(!ns.length){host.innerHTML='';return}
    const toc=await RD.toc(cur.id);const tt=n=>(toc.find(c=>c.n===n)||{}).title||('第 '+n+' 章');
    let html=`<div class="k" style="margin:14px 2px 8px;cursor:pointer" data-a="tg">笔 记 · ${ns.length} 条 <span style="font-family:var(--sans);letter-spacing:0">${notesOpen?'收起':'展开'}</span></div><div data-a="list" style="display:${notesOpen?'':'none'}">`;
    let last=null;
    for(const n of ns){if(n.ch!==last){html+=`<div class="sub" style="margin:8px 2px 4px;color:var(--text-3)">${esc(tt(n.ch))}</div>`;last=n.ch}html+=`<div class="mem" style="cursor:pointer" data-ch="${n.ch}"><div class="idx">${n.kind==='chapter'?'章评':(n.kind==='idea'?'想法':'划线')}<span class="src" style="margin-left:auto">${FeedUI.rel(n.ts)}</span></div><div class="detail" style="display:block">${n.quote?`<div class="anno-quote" style="margin-bottom:${n.text?'6px':'0'}">「${esc(n.quote)}」</div>`:''}${n.text?esc(n.text):''}</div></div>`}
    host.innerHTML=html+'</div>';
    host.querySelector('[data-a=tg]').onclick=()=>{notesOpen=!notesOpen;renderNoteList()};
    host.querySelectorAll('[data-ch]').forEach(el=>el.onclick=()=>{closeSheet('bookinfosheet');goCh(Number(el.dataset.ch))});
  }
  let notesOpen=false;
  async function renderBookReview(){
    const host=byId('biReview');if(!host||!cur.id)return;
    const n=(await RD.notes(cur.id)).find(x=>x.kind==='book');
    host.innerHTML=`<div class="k" style="margin:14px 2px 8px">书 评</div>${n&&n.text?`<div class="fnote">${esc(n.text)}</div>`:''}<div class="fops" style="margin-top:8px"><span class="ghost" data-a="w">${n&&n.text?'改书评':'写书评'}</span><span class="ghost${n&&n.done?' jade':''}" data-a="done">${n&&n.done?'读完了 ✓':'标为读完'}</span><span class="ghost" data-a="exp">导出笔记</span></div><div class="rdedit" style="display:none"><textarea class="fta" id="bkText" placeholder="整本读下来…（不打分，只写话）"></textarea><div class="fops" style="margin-top:8px"><button class="btn" data-a="save">保存</button><span class="ghost" data-a="cancel">算了</span></div></div>`;
    const ed=host.querySelector('.rdedit');
    host.querySelector('[data-a=w]').onclick=()=>{ed.style.display='';host.querySelector('#bkText').value=(n&&n.text)||'';host.querySelector('#bkText').focus()};
    host.querySelector('[data-a=cancel]').onclick=()=>{ed.style.display='none'};
    host.querySelector('[data-a=save]').onclick=async()=>{const t=(host.querySelector('#bkText').value||'').trim();await RD.addNote(cur.id,{kind:'book',text:t,done:!!(n&&n.done)});toast('书评已存');renderBookReview()};
    host.querySelector('[data-a=done]').onclick=async()=>{await RD.addNote(cur.id,{kind:'book',text:(n&&n.text)||'',done:!(n&&n.done)});renderBookReview()};
    host.querySelector('[data-a=exp]').onclick=()=>exportNotes(cur.id);
  }
  async function exportNotes(id){
    try{
      const {name,text}=await RD.exportMd(id);
      const blob=new Blob([text],{type:'text/markdown'});
      const file=new File([blob],name,{type:'text/markdown'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:name});return}catch(e){if(e&&e.name==='AbortError')return}}
      const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
      if(!standalone){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('已导出 '+name);return}
      await navigator.clipboard.writeText(text);toast('已复制到剪贴板，粘到备忘录或 Obsidian 即可',4200);
    }catch(e){toast('导出失败：'+errMsg(e),4200)}
  }
  function goCh(n){
    const box=byId('rdScroll');
    if(box&&n>cur.ch&&box.scrollTop+box.clientHeight>=box.scrollHeight*0.3)RD.markRead(cur.id,cur.ch);
    cur.ch=n;renderChapter();
  }
  const reload=()=>renderChapter();
  // 进度：滚动停 500ms 记当前段序
  let scrollT=null;
  function onScroll(){
    clearTimeout(scrollT);
    scrollT=setTimeout(()=>{
      const box=byId('rdScroll');if(!box||!cur.id)return;
      const els=[...box.querySelectorAll('.read-para,.read-poem,.read-head')];
      const top=box.scrollTop+box.offsetTop;
      let idx=0;for(let i=0;i<els.length;i++){if(els[i].offsetTop<=top+8)idx=i;else break}
      RD.progress(cur.id,cur.ch,idx);
    },500);
  }
  async function openInfo(){
    const b=RD.get(cur.id);if(!b)return;
    byId('biTitle').textContent=b.title;
    byId('biNote').textContent=`读到 ${cur.ch}／${b.n} 章${b.fetched<b.n?' · 已拉 '+b.fetched+'／'+b.n:''}${b.err?' · '+b.err:''}`;
    const toc=await RD.toc(cur.id);
    const box=byId('rdToc');box.innerHTML='';
    for(const c of toc){
      const has=await DB.get('rd.'+cur.id+'.ch.'+c.n);
      const d=document.createElement('div');d.className='mem';d.style.cursor='pointer';
      d.innerHTML=`<div class="idx"${c.n===cur.ch?' style="color:var(--jade)"':(has?'':' style="color:var(--text-3)"')}>${esc(c.title)}${c.extra?'<span class="src" style="margin-left:6px">附</span>':''}${has?'':'<span class="src" style="margin-left:auto">未拉</span>'}</div>`;
      d.onclick=()=>{closeSheet('bookinfosheet');goCh(c.n)};
      box.appendChild(d);
    }
    openSheet('bookinfosheet');
    renderReadSet();
    renderCoRead();
    renderBookReview();
    renderNoteList();
  }
  function removeCur(){const b=RD.get(cur.id);if(!b)return;RD.remove(cur.id).then(()=>{toast('已移出书架');closeSheet('bookinfosheet');go('shelf')})}

  /* ── 上传 TXT：选文件 → 解析 → 预览页 → 入库开读 ── */
  let upl=null;
  function pickFile(){let f=byId('rdFile');if(!f){f=document.createElement('input');f.type='file';f.id='rdFile';f.accept='.txt,.epub,.pdf';f.style.display='none';document.body.appendChild(f);f.onchange=()=>{if(f.files[0])previewUpload(f.files[0]);f.value=''}}f.click()}
  async function previewUpload(file){
    try{upl=await RD.parseUpload(file)}catch(e){toast(errMsg(e),4200);return}
    go('parsepre');
    byId('ppEnc').textContent=upl.enc+' · 自动识别';
    byId('ppCut').textContent=upl.chapters.length+' 章 · '+(upl.mode==='regex'?'正则「第X章」':'按 3000 字兜底');
    byId('ppFirst').textContent=upl.chapters.slice(0,3).map(c=>c.title).join('　·　')+(upl.chapters.length>3?'　……':'');
    byId('ppTitle').value=upl.title;
  }
  async function confirmUpload(){
    if(!upl)return;
    const btn=byId('ppGo');btn.disabled=true;btn.textContent='入库中…';
    try{const b=await RD.addUpload(upl,{title:(byId('ppTitle').value||'').trim()||upl.title});toast('已入库');upl=null;open(b.id)}
    catch(e){toast('入库失败：'+errMsg(e),4200)}
    finally{btn.disabled=false;btn.textContent='入库开读'}
  }

  (()=>{
    const _g=go;
    go=id=>{_g(id);if(id==='shelf')renderShelf();if(id==='store')renderStore()};
    const sc=byId('rdScroll');if(sc)sc.addEventListener('scroll',onScroll,{passive:true});
    document.addEventListener('selectionchange',onSel);
    if(typeof RD!=='undefined'&&RD.on)RD.on(e=>{
      if(e.type==='book'||e.type==='queue'){const s=byId('shelf');if(s&&s.classList.contains('active'))renderShelf()}
      if(e.type==='gen'&&e.id===cur.id&&e.ch===cur.ch&&byId('reader').classList.contains('active')){if(e.st==='done')reload();else applyNotesSoft()}
    });
  })();
  return{renderShelf,renderStore,search,openBook,addBook,open,goCh,reload,openInfo,removeCur,pickFile,confirmUpload,markLine,markIdea,copySel,saveIdea,unline,exportNotes,openIdeas,retryGen,renderCoRead};
})();
