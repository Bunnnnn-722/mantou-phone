/* U4 写作最小闭环：卡片槽引擎。
   节点=指令/回复各自独立，卡片槽(版本卡数组+激活指针),无树；重试=按激活链生成新卡顶替展示。
   U4 模板=系统人设+正文历史(激活链)+指令；世界书/人物/前情压缩 U5 接入。 */

/* 记忆口子：U6 接管前是空实现，全机统一从这里报事 */
function emitMemoryEvent(source,payload){}

const Writing=(()=>{
  let BID='b1';
  const K=n=>`bk.${BID}.${n}`;
  let nodes=[],books=[],digestCache=null,busy=false,batch=false,bsel=null,pendingRb=-1,editing=null,stick=true;
  const scEl=()=>{const b=document.getElementById('wstream');return b&&b.parentElement};
  const nearBottom=()=>{const sc=scEl();return sc?(sc.scrollHeight-sc.scrollTop-sc.clientHeight<80):true};
  const $=s=>document.querySelector(s);
  const hm=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
  const nid=()=>'n'+Math.random().toString(36).slice(2,9);
  const act=n=>n.cards[n.active];

  /* ── 图标 ── */
  const I={
    edit:'<svg width="12" height="12" viewBox="0 0 14 14"><path d="M2.2 11.8l.7-2.9 7.2-7.2 2.2 2.2-7.2 7.2-2.9.7z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    copy:'<svg width="11" height="11" viewBox="0 0 13 13"><rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8.5 2.5h-6a1 1 0 0 0-1 1v6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    back:'<svg width="13" height="12" viewBox="0 0 15 13"><path d="M5 1.5 1.8 4.7 5 7.9M1.8 4.7H9.2a3.7 3.7 0 0 1 0 7.4H6.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    del:'<svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    retry:'<svg width="12" height="12" viewBox="0 0 14 14"><path d="M12.2 7A5.2 5.2 0 1 1 10.4 3M12.2 1.4v3h-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dots:'<svg width="13" height="4" viewBox="0 0 14 4"><circle cx="2" cy="2" r="1.4" fill="currentColor"/><circle cx="7" cy="2" r="1.4" fill="currentColor"/><circle cx="12" cy="2" r="1.4" fill="currentColor"/></svg>',
    stack:'<svg width="11" height="11" viewBox="0 0 13 13"><rect x="3.5" y="3.5" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M9.5 1.8h-7a1 1 0 0 0-1 1v7" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
    trash:'<svg width="11" height="12" viewBox="0 0 12 13"><path d="M1.5 3h9M4.5 3V1.8h3V3M2.5 3l.7 8.2h5.6L9.5 3M4.8 5.2v4.4M7.2 5.2v4.4" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
    chk:'<svg width="11" height="11" viewBox="0 0 13 13"><rect x="1.5" y="1.5" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 6.6l1.8 1.8L9.3 5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevD:'<svg width="11" height="7" viewBox="0 0 12 8"><path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevU:'<svg width="11" height="7" viewBox="0 0 12 8"><path d="M1.5 6.5 6 2l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    spark:'<svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 1v10M1.7 3.5l8.6 5M10.3 3.5l-8.6 5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
    tw:'<svg class="tw" width="10" height="6" viewBox="0 0 11 7"><path d="M1.5 1.5 5.5 5.5 9.5 1.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  async function load(){
    BID=(await DB.get('bk.current'))||'b1';
    books=(await DB.get('bk.list'))||null;
    if(!books){books=[{id:'b1',title:'落潮之城'}];await DB.set('bk.list',books)}
    nodes=(await DB.get(K('nodes')))||[];
    digestCache=(await DB.get(K('digest')))||null;
    const t=document.getElementById('wtitle');
    if(t){const b=books.find(x=>x.id===BID);t.textContent=b?b.title:'未命名'}
  }
  async function save(){
    await DB.set(K('nodes'),nodes);
    const chars=nodes.reduce((sum,n)=>sum+((act(n)||{}).text||'').length,0);
    await DB.set(K('stat'),{chars});
  }

  /* ── 静态模板拼接：①人设文风 ②世界书全量 ③(人物卡·U6) ④背景+前情提要 ⑤正文激活链 ⑥指令 ── */
  const DEF_TPL='你是一位中文小说作家，正在与作者接力写一部长篇。以克制的白描推进，多写动作与物件，少写心理直陈；对话短，标点收着用。每次续写一段(三百到八百字),直接输出正文，不要任何解释、标题或列表。';
  async function buildMessages(uptoExclusive){
    let sys=((await DB.get('cfg.tpl.global'))||'').trim()||DEF_TPL;
    const wbId=await DB.get(K('wb'));
    const wb=(typeof WB!=='undefined'&&wbId)?await WB.activeTextFor(wbId):'';
    if(wb)sys+='\n\n【世界设定】\n'+wb;
    const cast=((await DB.get(K('cast')))||'').trim();
    if(cast)sys+='\n\n【人物】\n'+cast;
    const digest=(await DB.get(K('digest')))||null;
    let start=0;
    if(digest&&digest.text){
      const di=nodes.findIndex(n=>n.id===digest.upToId);
      if(di>=0&&uptoExclusive>di+1){ // 只有目标在提要之后才用提要；重试被压区间内节点=拼原文防剧透未来
        sys+='\n\n【前情提要】\n'+digest.text;
        start=di+1;
      }
    }
    const msgs=[{role:'system',content:sys}];
    for(let i=start;i<uptoExclusive;i++){
      const n=nodes[i],c=act(n);
      if(!c||!c.text)continue;
      msgs.push({role:n.type==='cmd'?'user':'assistant',content:c.text});
    }
    return msgs;
  }

  /* ── 自动压缩：水位检测→最早比例段并成前情提要(首压/追压) ── */
  const estTok=msgs=>msgs.reduce((s,m)=>s+m.content.length,0); // 中文粗估 1字≈1token,按95%余量兜
  async function cfgWrite(){
    const ctx=Number(await DB.get('cfg.main.ctx'))||200000; // 主模型上下文上限,设置里拉模型列表会回填
    const pct=Number(await DB.get('cfg.write.cpct'))||80;
    return{cwin:Math.floor(ctx*pct/100),
           ratio:(Number(await DB.get('cfg.write.ratio'))||50)/100};
  }
  async function updateGauge(){
    // 顶栏亮牌:主通道没填 BASE URL=「未配置 API」,显式 mock=「演示通道」(点击去设置)
    const mk=document.getElementById('wmock');
    if(mk){const base=((await DB.get('cfg.main.base'))||'').trim();
      mk.style.display=(!base||base==='mock')?'':'none';
      mk.textContent=base==='mock'?'演示通道':'未配置 API'}
    // 前情提要按钮(写作顶栏+设定库)随有无提要置灰
    const hasD=!!(digestCache&&digestCache.text);
    ['digestBtn','digestBtn2'].forEach(id=>{const b=document.getElementById(id);if(b)b.classList.toggle('dim',!hasD)});
    const {cwin}=await cfgWrite();
    const est=estTok(await buildMessages(nodes.length));
    const fill=document.getElementById('gaugeFill'),note=document.getElementById('gaugeNote');
    if(fill)fill.style.width=Math.min(100,Math.round(est/cwin*100))+'%';
    if(note)note.textContent=nodes.length?`模板约 ${(est/1024).toFixed(1)}K / 窗口 ${(cwin/1024)|0}K · 距压缩 ${Math.max(0,((cwin*0.95-est)/1024)).toFixed(1)}K`:'还没落笔';
    return est;
  }
  async function compressIfNeeded(){
    const {cwin,ratio}=await cfgWrite();
    const est=await updateGauge();
    if(est<=cwin*0.95)return;
    const digest=(await DB.get(K('digest')))||null;
    const startIdx=digest?nodes.findIndex(n=>n.id===digest.upToId)+1:0;
    const hist=nodes.slice(Math.max(0,startIdx));
    const total=hist.reduce((s,n)=>s+((act(n)||{}).text||'').length,0);
    if(!total)return;
    const seg=[];let acc=0,upToId=null;
    for(const n of hist){
      if(acc>=total*ratio)break;
      const t=(act(n)||{}).text||'';if(!t)continue;
      seg.push((n.type==='cmd'?'[作者指令]':'')+t);acc+=t.length;upToId=n.id;
    }
    if(!upToId||!seg.length)return;
    const body=seg.join('\n');
    const prompt=digest&&digest.text
      ?`已有前情提要：\n${digest.text}\n\n新增正文：\n${body}\n\n把两者合并成一份新的前情提要，600字以内，保留主线事件、人物关系与未回收的伏笔，直接输出提要本身。`
      :`把下面的小说正文压缩成前情提要，600字以内，保留主线事件、人物关系与未回收的伏笔，直接输出提要本身：\n\n${body}`;
    const r=await API.chat('light',{messages:[{role:'user',content:prompt}],source:'写作',label:'前情压缩'});
    await DB.set(K('digest'),{upToId,text:(r.text||'').trim()});digestCache={upToId,text:(r.text||'').trim()};
    await updateGauge();
  }

  /* 前情提要半窗(写作页与设定库两处入口:打开时搬进当前屏,否则在别的屏上点了没反应) */
  async function openDigest(){
    const d=(await DB.get(K('digest')))||null;
    if(!d||!d.text){toast('还没有前情提要——正文到压缩线才会生成');return}
    const sh=document.getElementById('digestsheet');
    const scr=document.querySelector('.screen.active');
    if(scr&&sh.closest('.screen')!==scr)scr.appendChild(sh);
    document.getElementById('digestText').value=d.text;
    sh.classList.add('show');
  }
  async function saveDigest(){
    const d=(await DB.get(K('digest')))||null;
    const t=document.getElementById('digestText').value.trim();
    if(d){d.text=t;await DB.set(K('digest'),d);digestCache=d}
    document.getElementById('digestsheet').classList.remove('show');
    updateGauge();
  }
  async function redoDigest(){
    const d=(await DB.get(K('digest')))||null;if(!d)return;
    const di=nodes.findIndex(n=>n.id===d.upToId);if(di<0)return;
    const body=nodes.slice(0,di+1).map(n=>((n.type==='cmd'?'[作者指令]':'')+((act(n)||{}).text||''))).filter(Boolean).join('\n');
    document.getElementById('digestText').value='重新归纳中…';
    const r=await API.chat('light',{messages:[{role:'user',content:`把下面的小说正文压缩成前情提要，600字以内，保留主线事件、人物关系与未回收的伏笔，直接输出提要本身：\n\n${body}`}],source:'写作',label:'提要重做'});
    d.text=(r.text||'').trim();await DB.set(K('digest'),d);digestCache=d;
    document.getElementById('digestText').value=d.text;
    updateGauge();
  }

  /* ── 渲染 ── */
  function vvHTML(n){return n.cards.length>1?`<span class="vv"><b data-a="prev">‹</b> ${n.active+1} / ${n.cards.length} <b data-a="next">›</b></span>`:''}
  function popHTML(items){return `<span class="more" data-a="more">${I.dots}<span class="pop">${items}</span></span>`}
  const pi=(icon,txt,a,danger)=>`<span class="pi${danger?' danger':''}" data-a="${a}">${icon}${txt}</span>`;

  function paras(text){
    const parts=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    return parts.map(p=>`<p class="para">${esc(p)}</p>`).join('')||'';
  }

  function renderNode(n,idx){
    const c=act(n);
    if(n.type==='cmd'){
      const d=document.createElement('div');
      d.className='cmd';d.dataset.nid=n.id;
      d.innerHTML=`<span class="txt">${esc(c.text)}</span><span class="hint">${I.chevD}</span>`+
        `<span class="foot">${vvHTML(n)}<span class="iops">`+
        `<span data-a="retry">${I.retry}</span>`+
        `<span data-a="edit">${I.edit}</span>`+
        `<span data-a="rollback">${I.back}</span>`+
        popHTML(pi(I.copy,'复制','copy')+pi(I.del,'删除当前版本','delcur',1)+pi(I.stack,'删除未展示版本','delothers',1)+pi(I.trash,'删除整条指令','delnode',1)+pi(I.chk,'批量管理','batch'))+
        `</span><span class="fold2" data-a="fold">${I.chevU}</span></span>`;
      d.onclick=()=>d.classList.toggle('open');
      d.querySelector('.foot').onclick=e=>e.stopPropagation();
      bindOps(d,n,idx);
      return d;
    }
    const d=document.createElement('div');
    d.className='rblk';d.dataset.nid=n.id;
    const showThink=c.think||c.gen;
    d.innerHTML=(showThink?`<div class="think${c.gen&&!c.text?' open':''}" data-a="think">${I.spark}${c.gen&&!c.text&&!c.think?'构思中…':'思考过程'}${I.tw}</div><div class="think-body">${esc(c.think||'')}</div>`:'')+
      `<div class="pbox">${paras(c.text)||(c.gen?'<p class="para" style="color:var(--text-3)">…</p>':'')}</div>`+
      (c.err?`<div class="sub" style="color:var(--danger);margin:4px 0 8px">生成失败：${esc(c.err.slice(0,80))}<span class="ghost" data-a="retry" style="margin-left:8px;padding:2px 10px">重试</span></div>`:'')+
      (c.fin==='length'?`<div class="sub" style="color:var(--amber);margin:4px 0 8px">被截断了，点重试或下一条指令写「续写」。</div>`:'')+
      `<div class="bar"><span class="meta">${esc(c.ts||'')}${c.model?' · '+esc(c.model):''}</span>${vvHTML(n)}<span class="iops">`+
      `<span data-a="retry">${I.retry}</span>`+
      `<span data-a="edit">${I.edit}</span>`+
      popHTML(pi(I.copy,'复制','copy')+pi(I.back,'回溯到此','rollback')+pi(I.del,'删除当前版本','delcur',1)+pi(I.stack,'删除未展示版本','delothers',1)+pi(I.trash,'删除整段正文','delnode',1)+pi(I.chk,'批量管理','batch'))+
      `</span></div>`;
    const tk=d.querySelector('[data-a=think]');
    if(tk)tk.onclick=()=>{tk.dataset.user='1';tk.classList.toggle('open')};
    bindOps(d,n,idx);
    return d;
  }

  function bindOps(d,n,idx){
    d.querySelectorAll('[data-a]').forEach(b=>{
      const a=b.dataset.a;
      if(a==='think'||a==='fold'&&0)return;
      b.addEventListener('click',async e=>{
        if(a==='think')return;
        e.stopPropagation();
        if(a==='more'){const pop=b.querySelector('.pop');
          const host=b.closest('.screen')||document.body,hr=host.getBoundingClientRect(),br=b.getBoundingClientRect();
          pop.classList.toggle('left',br.right-hr.left<190); // 左侧放不下 158px 菜单就向右展开
          pop.classList.toggle('down',br.top-hr.top<250);      // 上方放不下就向下弹
          pop.classList.toggle('show');return}
        if(a==='fold'){d.classList.remove('open');return}
        if(a==='prev'||a==='next'){n.active=Math.max(0,Math.min(n.cards.length-1,n.active+(a==='next'?1:-1)));await save();renderAll();return}
        if(a==='copy'){navigator.clipboard.writeText(act(n).text||'');return}
        if(a==='edit'){editing={n};$('#editText').value=act(n).text||'';$('#editfull').classList.add('show');return}
        if(a==='rollback'){pendingRb=idx;$('#rbQuote').textContent='「'+(act(n).text||'').slice(0,42)+'…」之后的内容都会被删掉';$('#backsheet').classList.add('show');return}
        if(a==='retry'){retry(n);return}
        if(a==='delcur'){n.cards.splice(n.active,1);if(!n.cards.length){nodes.splice(idx,1)}else{n.active=Math.min(n.active,n.cards.length-1)}await save();renderAll();return}
        if(a==='delothers'){n.cards=[act(n)];n.active=0;await save();renderAll();return}
        if(a==='delnode'){nodes.splice(idx,1);await save();renderAll();return}
        if(a==='batch'){document.querySelectorAll('.pop.show').forEach(p=>p.classList.remove('show'));batchEnter();return}
      });
    });
  }

  function renderAll(){
    const box=$('#wstream');if(!box)return;
    box.innerHTML='';
    if(!nodes.length){
      box.innerHTML='<div class="sub" style="text-align:center;margin-top:80px;font-family:var(--song);line-height:2.2">还没有开始。<br>在下面输入第一条指令，让故事落笔。</div>';
      return;
    }
    let foldCount=0;
    if(digestCache){const di=nodes.findIndex(n=>n.id===digestCache.upToId);if(di>=0)foldCount=di+1}
    nodes.forEach((n,i)=>{
      box.appendChild(renderNode(n,i));
      if(foldCount&&i===foldCount-1){
        const f=document.createElement('div');f.className='folddiv';
        f.textContent=`以上 ${foldCount} 段已并入前情提要 · 点击查看`;
        f.onclick=()=>openDigest();
        box.appendChild(f);
      }
    });
    if(batch)paintBatch();
    if(stick)box.parentElement.scrollTop=box.parentElement.scrollHeight;
  }

  /* ── 批量管理 ── */
  function paintBatch(){
    const box=$('#wstream');
    [...box.children].forEach(el=>{
      if(!el.dataset.nid)return;
      el.classList.add('bpick');
      el.classList.toggle('bon',bsel.has(el.dataset.nid));
      el.addEventListener('click',batchPick,true);
    });
    const bb=$('#batchbar');bb.classList.add('show');
    $('#bbCount').textContent='已选 '+bsel.size;
    const d=$('#bbDel');delete d.dataset.armed;d.textContent='删除';d.style.color='var(--danger)';d.style.background='';
  }
  function batchPick(e){
    e.stopPropagation();e.preventDefault();
    const el=e.currentTarget;
    const id=el.dataset.nid;
    if(bsel.has(id))bsel.delete(id);else bsel.add(id);
    el.classList.toggle('bon',bsel.has(id));
    $('#bbCount').textContent='已选 '+bsel.size;
  }
  function batchEnter(){batch=true;bsel=new Set();renderAll()}
  function batchAll(){nodes.forEach(n=>bsel.add(n.id));renderAll()}
  function batchExit(){batch=false;bsel=null;$('#batchbar').classList.remove('show');renderAll()}
  async function batchDel(){
    if(!bsel||!bsel.size)return;
    const d=$('#bbDel');
    if(!d.dataset.armed){d.dataset.armed='1';d.textContent=`确认删 ${bsel.size} 项？`;d.style.color='#fff';d.style.background='var(--danger)';
      setTimeout(()=>{if(d.isConnected&&batch){delete d.dataset.armed;d.textContent='删除';d.style.color='var(--danger)';d.style.background=''}},2600);return}
    nodes=nodes.filter(n=>!bsel.has(n.id));
    await save();batchExit();updateGauge();
  }

  /* ── 生成 ── */
  async function generate(n){
    const idx=nodes.indexOf(n);if(idx<0)return;
    const card=act(n);busy=true;syncSend();
    try{await compressIfNeeded()}catch(e){console.warn('压缩失败，先照常写',e)}
    const msgs=await buildMessages(idx);
    const d=$(`[data-nid="${n.id}"]`);
    const pbox=d&&d.querySelector('.pbox'),tbody=d&&d.querySelector('.think-body'),tline=d&&d.querySelector('[data-a=think]');
    const scroll=()=>{const sc=scEl();if(sc&&stick)sc.scrollTop=sc.scrollHeight};
    const genState={folded:false};
    // 流式分段：按换行切段同步进 DOM,格式即时正确
    const syncStream=()=>{
      if(!pbox)return;
      const segs=String(card.text).split(/\n+/).map(x=>x.trim()).filter(Boolean);
      if(!segs.length){pbox.innerHTML='<p class="para" style="color:var(--text-3)">…</p>';return}
      if(pbox.children.length===1&&pbox.firstChild.textContent==='…')pbox.innerHTML='';
      while(pbox.children.length<segs.length){const np=document.createElement('p');np.className='para';pbox.appendChild(np)}
      while(pbox.children.length>segs.length)pbox.removeChild(pbox.lastChild);
      for(let i=0;i<segs.length;i++){const el=pbox.children[i];if(el.textContent!==segs[i])el.textContent=segs[i]}
    };
    try{
      const label=(()=>{for(let i=idx-1;i>=0;i--)if(nodes[i].type==='cmd')return act(nodes[i]).text.slice(0,24);return '续写'})();
      const r=await API.chat('main',{messages:msgs,source:'写作',label,
        onThink:t=>{card.think+=t;if(tbody){tbody.textContent=card.think;if(tline&&!tline.textContent.includes('思考'))tline.childNodes[1].textContent='思考过程'}scroll()},
        onDelta:t=>{card.text+=t;
          // 正文开始时把思考自动收起，只收这一次；用户手动碰过就永远听用户的
          if(!genState.folded&&tline&&!tline.dataset.user&&tline.classList.contains('open')&&card.text.length>2){tline.classList.remove('open');genState.folded=true}
          syncStream();scroll()}});
      card.text=r.text||card.text;card.think=r.think||card.think;card.fin=r.finish;
      card.model=(await DB.get('cfg.main.model'))||'';
      card.gen=false;
      emitMemoryEvent('写作',{type:'reply',nodeId:n.id});
    }catch(e){
      card.gen=false;card.err=String((e&&e.message)||e).slice(0,200);
    }
    busy=false;syncSend();await save();renderAll();updateGauge();
  }

  async function drop(){
    const inp=$('#cmdInput'),text=(inp.value||'').trim();
    if(!text||busy)return;
    const base=((await DB.get('cfg.main.base'))||'').trim();
    if(!base){toast('还没配置模型——先去设置里给「生文 · 主力」填好 BASE URL、Key 与模型。');go('settings');return}
    if(text.length>5000){toast('指令超 5000 字上限');return}
    inp.value='';syncSend();
    stick=true; // 自己落笔=想看着它写
    nodes.push({id:nid(),type:'cmd',cards:[{text,ts:hm()}],active:0});
    const rn={id:nid(),type:'reply',cards:[{text:'',think:'',ts:hm(),gen:true}],active:0};
    nodes.push(rn);
    await save();renderAll();
    generate(rn);
  }
  function dropFull(){
    const ta=$('#cmdFullText');
    $('#cmdInput').value=ta.value;ta.value='';
    $('#cmdfull').classList.remove('show');
    drop();
  }
  async function retry(n){
    if(busy)return;
    if(n.type==='cmd'){
      const idx=nodes.indexOf(n);
      let rn=nodes[idx+1];
      if(!rn||rn.type!=='reply'){ // 下方回复节点不在了，原位补一个
        rn={id:nid(),type:'reply',cards:[],active:0};
        nodes.splice(idx+1,0,rn);
      }
      return retry(rn); // 结果作为该回复节点的新版本卡顶替展示
    }
    n.cards.push({text:'',think:'',ts:hm(),gen:true});
    n.active=n.cards.length-1;
    await save();renderAll();
    generate(n);
  }
  async function saveEdit(){
    if(!editing)return;
    act(editing.n).text=$('#editText').value;
    editing=null;$('#editfull').classList.remove('show');
    await save();renderAll();
  }
  async function confirmRollback(){
    if(pendingRb<0)return;
    nodes=nodes.slice(0,pendingRb+1);
    pendingRb=-1;$('#backsheet').classList.remove('show');
    await save();renderAll();
  }

  function syncSend(){
    const inp=$('#cmdInput'),btn=inp&&inp.closest('.inputbar').querySelector('.send');
    if(btn)btn.disabled=busy||!inp.value.trim();
    const fta=$('#cmdFullText'),ftool=document.querySelector('#cmdfull .app-head .tool');
    if(ftool&&fta)ftool.classList.toggle('dim',busy||!fta.value.trim());
  }
  /* ── 书架 ── */
  async function renderShelf(){
    const box=document.getElementById('shelfList');if(!box)return;
    const q=((document.getElementById('shelfSearch')||{}).value||'').trim();
    box.innerHTML='';
    for(const b of books){
      if(q&&!b.title.includes(q))continue;
      const st=(await DB.get(`bk.${b.id}.stat`))||{chars:0};
      const d=document.createElement('div');d.className='book-cover';
      d.innerHTML=`<div class="bdel">✕</div><div class="bt">${esc(b.title)}</div><div class="ba">${(st.chars/1000).toFixed(1)}K 字</div>${b.id===BID?'<div class="ba" style="color:var(--jade)">正在写</div>':''}`;
      d.onclick=()=>switchBook(b.id);
      const del=d.querySelector('.bdel');
      del.onclick=ev=>{
        ev.stopPropagation();
        if(busy&&b.id===BID){toast('正在生成，等这一段写完再删。');return}
        if(del.dataset.armed){deleteBook(b.id);return}
        del.dataset.armed='1';del.textContent='确认删？';del.classList.add('armed');
        setTimeout(()=>{if(del.isConnected){delete del.dataset.armed;del.textContent='✕';del.classList.remove('armed')}},2600);
      };
      box.appendChild(d);
    }
    const add=document.createElement('div');add.className='upload-slot';
    add.innerHTML='<span class="plus">＋</span>新建书<br>空白开始';
    add.onclick=()=>openNewBook();
    box.appendChild(add);
  }
  async function deleteBook(id){
    books=books.filter(b=>b.id!==id);
    await DB.set('bk.list',books);
    for(const k of ['nodes','digest','stat','wb','cast'])await DB.del(`bk.${id}.${k}`);
    if(id===BID){
      if(!books.length){
        const nid='b'+Math.random().toString(36).slice(2,8);
        books.push({id:nid,title:'未命名之书'});
        await DB.set('bk.list',books);
      }
      await DB.set('bk.current',books[0].id);
      stick=true;await load();renderAll();updateGauge();
    }
    renderShelf();
  }
  let nbWb=null,nbOp=null;
  async function openNewBook(opId){
    await Openings.load();await WB.load();
    nbOp=null;nbWb=null;
    $('#nbTitle').value='';$('#nbOpen').value='';
    Openings.setSeg('nbMode',0);
    const oc=$('#nbOpChips');oc.innerHTML='';
    const mkOp=(label,val)=>{
      const c=document.createElement('span');
      c.className='chip'+(nbOp===val?' on':'');
      c.textContent=label;
      c.onclick=()=>{[...oc.children].forEach(x=>x.classList.remove('on'));c.classList.add('on');nbOp=val;applyOp(val)};
      oc.appendChild(c);
    };
    mkOp('不关联',null);
    for(const o of Openings._list())mkOp(o.name,o.id);
    WB.chips($('#nbWbChips'),null,v=>nbWb=v);
    if(opId){nbOp=opId;[...oc.children].forEach(x=>x.classList.toggle('on',x.textContent===(Openings.get(opId)||{}).name));applyOp(opId)}
    go('wshelf');
    $('#booksheet').classList.add('show');
  }
  function applyOp(id){
    const o=id?Openings.get(id):null;
    if(!o){return}
    $('#nbOpen').value=o.text;
    Openings.setSeg('nbMode',o.mode==='cmd'?1:0);
    nbWb=o.wbId||null;
    WB.chips($('#nbWbChips'),nbWb,v=>nbWb=v);
  }
  async function switchBook(id){
    if(busy){toast('正在生成，等这一段写完再切换。');return}
    await DB.set('bk.current',id);
    stick=true;await load();renderAll();updateGauge();go('write');
  }
  async function createBook(){
    if(busy){toast('正在生成，等这一段写完再建新书。');return}
    const title=(document.getElementById('nbTitle').value||'').trim()||'未命名之书';
    const open=(document.getElementById('nbOpen').value||'').trim();
    const mode=Openings.segIdx('nbMode')===1?'cmd':'reply';
    const id='b'+Math.random().toString(36).slice(2,8);
    books.push({id,title});await DB.set('bk.list',books);
    if(nbWb)await DB.set(`bk.${id}.wb`,nbWb);
    if(open){ // 开局文本=这本书的第一个节点(内容=回复节点/指令=指令节点)
      await DB.set(`bk.${id}.nodes`,[{id:nid(),type:mode==='cmd'?'cmd':'reply',cards:[{text:open,ts:hm()}],active:0}]);
    }
    document.getElementById('booksheet').classList.remove('show');
    await switchBook(id);
  }
  async function exportTxt(){
    const b=books.find(x=>x.id===BID)||{title:'未命名'};
    const body=nodes.filter(n=>n.type==='reply').map(n=>(act(n)||{}).text||'').filter(Boolean).join('\n\n');
    const blob=new Blob(['《'+b.title+'》\n\n'+body],{type:'text/plain'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=b.title+'.txt';a.click();URL.revokeObjectURL(a.href);
  }
  /* 设定库：打开前填数据 */
  async function openCards(){
    await WB.load();
    const wbId=await DB.get(K('wb'));
    const w=wbId?WB.get(wbId):null;
    const nm=document.getElementById('cardsWbName'),ct=document.getElementById('cardsWbCount');
    if(nm)nm.textContent=w?w.name:'未关联世界书';
    if(ct){ct.textContent=w?`${w.entries.length} 词条`:'';ct.style.display=w?'':'none'}
    const dm=document.getElementById('digestMeta');
    if(dm){
      if(digestCache&&digestCache.text){
        const di=nodes.findIndex(n=>n.id===digestCache.upToId);
        dm.textContent=`最早 ${di+1} 段（指令与正文）已并入提要，约 ${digestCache.text.length} 字。`;
      }else dm.textContent='正文还没到压缩线，暂无提要。';
    }
    const castEl=document.getElementById('castText');
    if(castEl)castEl.value=(await DB.get(K('cast')))||'';
    // 文风:空值预填默认(所见即所发),并渲染预设 chips
    const tt=document.getElementById('tplText');
    if(tt&&!tt.value.trim()){tt.value=DEF_TPL;await DB.set('cfg.tpl.global',DEF_TPL)}
    await tplRender();
    syncCompressLbl();updateGauge();
    go('cards');
  }

  /* ── 文风预设:可存多套切换,默认一键恢复 ── */
  async function tplRender(){
    const box=document.getElementById('tplChips');if(!box)return;
    const cur=(document.getElementById('tplText').value||'').trim();
    const list=(await DB.get('cfg.tpl.presets'))||[];
    box.innerHTML='';
    const mk=(label,text,delId)=>{
      const c=document.createElement('span');
      c.className='chip'+(cur===text.trim()?' on':'');
      c.textContent=label;
      c.onclick=async()=>{const tt=document.getElementById('tplText');tt.value=text;await DB.set('cfg.tpl.global',text);tplRender();updateGauge()};
      if(delId){
        const x=document.createElement('span');x.textContent='✕';x.style.cssText='margin-left:6px;opacity:.6';
        x.onclick=async ev=>{ev.stopPropagation();
          if(x.dataset.armed){const l=((await DB.get('cfg.tpl.presets'))||[]).filter(p=>p.id!==delId);await DB.set('cfg.tpl.presets',l);tplRender();return}
          x.dataset.armed='1';x.textContent='确认删？';x.style.cssText='margin-left:6px;color:#fff;background:var(--danger);border-radius:99px;padding:1px 7px';
          setTimeout(()=>{if(x.isConnected){delete x.dataset.armed;x.textContent='✕';x.style.cssText='margin-left:6px;opacity:.6'}},2600)};
        c.appendChild(x);
      }
      box.appendChild(c);
    };
    mk('默认',DEF_TPL);
    for(const p of list)mk(p.name,p.text,p.id);
  }
  /* 命名走页内行内表单,不用浏览器原生弹窗 */
  function tplMsg(t){
    const m=document.getElementById('tplMsg');if(!m)return;
    m.textContent=t;setTimeout(()=>{if(m.textContent===t)m.textContent=''},2600);
  }
  function tplSaveStart(){
    const cur=(document.getElementById('tplText').value||'').trim();
    if(!cur){tplMsg('文风还空着');return}
    if(cur===DEF_TPL){tplMsg('这就是默认那套，不用另存');return}
    const row=document.getElementById('tplSaveRow');
    row.style.display='';const inp=document.getElementById('tplName');inp.value='';inp.focus();
  }
  function tplSaveCancel(){document.getElementById('tplSaveRow').style.display='none'}
  async function tplSaveDo(){
    const cur=(document.getElementById('tplText').value||'').trim();
    const name=(document.getElementById('tplName').value||'').trim();
    if(!name){document.getElementById('tplName').focus();return}
    const list=(await DB.get('cfg.tpl.presets'))||[];
    const old=list.find(p=>p.name===name);
    if(old)old.text=cur;else list.push({id:'tp'+Math.random().toString(36).slice(2,8),name,text:cur});
    await DB.set('cfg.tpl.presets',list);await tplRender();
    document.getElementById('tplSaveRow').style.display='none';
    tplMsg(`已存「${name}」`);
  }
  async function tplReset(){
    const tt=document.getElementById('tplText');
    tt.value=DEF_TPL;await DB.set('cfg.tpl.global',DEF_TPL);
    tplRender();updateGauge();
  }
  /* 设定库压缩滑杆：标签实时联动（窗口＝主模型上下文上限×百分比），改完刷新水位 */
  async function syncCompressLbl(){
    const cw=document.querySelector('#cards [data-k="write.cpct"]'),ra=document.querySelector('#cards [data-k="write.ratio"]');
    const ctx=Number(await DB.get('cfg.main.ctx'))||200000;
    const cl=document.getElementById('cwinLbl'),rl=document.getElementById('ratioLbl');
    if(cl&&cw)cl.textContent=`模型上限的 ${cw.value}% ≈ ${Math.round(ctx*cw.value/100/1024)}K`;
    if(rl&&ra)rl.textContent=`压最早 ${ra.value}% 成提要`;
  }
  async function editBookWb(){
    const wbId=await DB.get(K('wb'));
    if(wbId)WB.setEditing(wbId);else changeWb();
  }
  async function changeWb(){
    const cur=await DB.get(K('wb'));
    WB.chips(document.getElementById('wbPickChips'),cur||null,async v=>{
      if(v)await DB.set(K('wb'),v);else await DB.del(K('wb'));
      document.getElementById('wbpick').classList.remove('show');
      openCards();updateGauge();
    });
    document.getElementById('wbpick').classList.add('show');
  }

  function bindInput(){
    const ss=document.getElementById('shelfSearch');
    if(ss)ss.addEventListener('input',renderShelf);
    const inp=$('#cmdInput');
    if(inp){inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();drop()}});
      inp.addEventListener('input',syncSend)}
    const fta=$('#cmdFullText');
    if(fta)fta.addEventListener('input',syncSend);
    const sc=scEl();
    if(sc)sc.addEventListener('scroll',()=>{stick=nearBottom()},{passive:true});
    syncSend();
  }

  (async()=>{if(!$('#wstream'))return;await load();renderAll();bindInput();updateGauge();renderShelf();
    // 随行浮窗：书中人通电(U6)前先藏，免得静态演示内容误导
    const cp=document.querySelector('#write .copill'),cd=document.getElementById('codot');
    if(cp)cp.style.display='none';if(cd)cd.style.display='none';
    // 进书架屏时刷新书单
    const _go=go;go=id=>{_go(id);if(id==='wshelf')renderShelf()};
    // 设定库压缩滑杆：拖动实时改标签，松手刷新水位
    document.querySelectorAll('#cards [data-k="write.cpct"],#cards [data-k="write.ratio"]').forEach(el=>{
      el.addEventListener('input',syncCompressLbl);
      el.addEventListener('change',()=>updateGauge());
    });
    // 人物设定：书级存储，改完即存并刷新水位
    const cast=document.getElementById('castText');
    if(cast)cast.addEventListener('change',async()=>{await DB.set(K('cast'),cast.value);updateGauge()});
    // 文风手改后刷新预设选中态与水位
    const tt=document.getElementById('tplText');
    if(tt)tt.addEventListener('change',()=>{tplRender();updateGauge()});
  })();
  return{drop,dropFull,saveEdit,confirmRollback,openDigest,saveDigest,redoDigest,
    createBook,switchBook,exportTxt,openCards,openNewBook,editBookWb,changeWb,batchAll,batchDel,batchExit,
    tplSaveStart,tplSaveDo,tplSaveCancel,tplReset,
    _nodes:()=>nodes,_build:buildMessages};
})();
