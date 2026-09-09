/* 书中人最小库：跨书共用的人物名片（名字＋性别＋描述），存 'people.list'。
   记忆条数一期固定显示 0，二期接记忆库；人物卡导入/头像另起单元。 */
const People=(()=>{
  let list=null,editingId=null,delTm=null;
  const GENDERS=['女','男',''];              // seg 三格顺序：女/男/不填
  const rid=()=>'pp'+Math.random().toString(36).slice(2,8);

  /* ── 数据 ── */
  async function load(){if(!list)list=(await DB.get('people.list'))||[];return list}
  const lst=()=>list||[];
  const get=id=>lst().find(p=>p.id===id);
  async function persist(){await DB.set('people.list',list)}

  async function save(o){
    await load();o=o||{};
    const name=String(o.name||'').trim().slice(0,40);
    const gender=GENDERS.includes(o.gender)?o.gender:'';
    const desc=String(o.desc||'').slice(0,2000);
    let p=o.id?get(o.id):null;
    if(p)Object.assign(p,{name,gender,desc,ts:Date.now()});
    else{p={id:rid(),name,gender,desc,ts:Date.now()};list.push(p)}
    await persist();return p;
  }
  async function remove(id){
    await load();
    list=list.filter(p=>p.id!==id);
    await persist();
  }
  /* 给提示词：名字（性别）：描述；没填性别就省掉括号 */
  function promptText(id){
    const p=get(id);if(!p)return'';
    return p.name+(p.gender?'（'+p.gender+'）':'')+'：'+(p.desc||'').trim();
  }

  /* ── 通用小件 ── */
  // 半窗是 absolute 于所在 .screen：从别的屏打开前先搬进当前屏
  function hoist(id){
    const s=document.getElementById(id);if(!s)return null;
    const scr=document.querySelector('.screen.active');
    if(scr&&s.parentElement!==scr)scr.appendChild(s);
    return s;
  }
  const close=id=>{const s=document.getElementById(id);if(s)s.classList.remove('show')};
  const firstLine=s=>String(s||'').split('\n')[0].trim();

  // 性别 seg：读写选中格
  function segPick(el){
    const seg=el&&el.parentElement;if(!seg)return;
    [...seg.children].forEach(x=>x.classList.remove('on'));
    el.classList.add('on');
  }
  function segSet(idx){
    const seg=document.getElementById('ppGender');if(!seg)return;
    [...seg.children].forEach((c,i)=>c.classList.toggle('on',i===idx));
  }
  function segIdx(){
    const seg=document.getElementById('ppGender');if(!seg)return 2;
    const i=[...seg.children].findIndex(c=>c.classList.contains('on'));
    return i<0?2:i;
  }
  function bindSeg(){
    const seg=document.getElementById('ppGender');
    if(seg)[...seg.children].forEach(c=>c.onclick=()=>segPick(c));
  }

  /* 删除 ghost 是常驻元素：每次开窗先解除武装，还原文字与样式 */
  function disarmDel(){
    clearTimeout(delTm);
    const d=document.getElementById('ppDel');if(!d)return;
    if(d.dataset.armed){
      delete d.dataset.armed;
      d.textContent=d.dataset.label||'删除';
      d.style.cssText=d.dataset.css||'';
    }
  }
  function bindDel(){
    const d=document.getElementById('ppDel');if(!d)return;
    d.onclick=async()=>{
      if(!editingId)return;
      if(d.dataset.armed){
        const id=editingId;disarmDel();
        await remove(id);editingId=null;
        close('peoplesheet');renderList();toast('已删除');
        return;
      }
      d.dataset.label=d.textContent;d.dataset.css=d.style.cssText;
      d.dataset.armed='1';d.textContent='确认删除？';
      d.style.cssText=d.dataset.css+';color:#fff;background:var(--danger);border-color:transparent';
      clearTimeout(delTm);
      delTm=setTimeout(()=>{if(d.isConnected)disarmDel()},2600);
    };
  }

  /* ── 列表（书中人屏 #peopleList）── */
  function renderList(){
    const box=document.getElementById('peopleList');if(!box)return;
    box.innerHTML='';
    if(!lst().length){
      box.innerHTML='<div class="sub" style="text-align:center;margin:26px 0;font-family:var(--song)">还没有书中人。点下面新建一位。</div>';
      return;
    }
    for(const p of lst()){
      const d=document.createElement('div');d.className='card chat-item';
      const brief=firstLine(p.desc).slice(0,40)||'还没写描述';
      d.innerHTML=`<span class="avatar${p.gender==='男'?' yu':''}">${esc((p.name||'').slice(0,1)||'？')}</span>
        <div class="col"><div class="name">${esc(p.name)}</div><div class="last">${esc(brief)} · 记忆 0 条</div></div>`;
      d.onclick=()=>edit(p.id);
      box.appendChild(d);
    }
  }

  /* ── 新建 / 编辑半窗 #peoplesheet ── */
  function fill(p){
    const n=document.getElementById('ppName'),t=document.getElementById('ppDesc');
    if(n)n.value=p?p.name:'';
    if(t)t.value=p?(p.desc||''):'';
    const gi=p?GENDERS.indexOf(p.gender):-1;
    segSet(gi<0?2:gi);
    const d=document.getElementById('ppDel');if(d)d.style.display=p?'':'none';
  }
  function openSheet(p){
    const s=hoist('peoplesheet');
    if(!s){toast('找不到书中人半窗');return}
    disarmDel();bindSeg();bindDel();
    fill(p);
    s.classList.add('show');
  }
  async function openNew(){await load();editingId=null;openSheet(null)}
  async function edit(id){
    await load();const p=get(id);
    if(!p){toast('这位书中人不在了');renderList();return}
    editingId=id;openSheet(p);
  }
  async function saveFromForm(){
    await load();
    const name=((document.getElementById('ppName')||{}).value||'').trim();
    if(!name){toast('先给她起个名字');return}
    const desc=(document.getElementById('ppDesc')||{}).value||'';
    const gender=GENDERS[segIdx()]||'';
    await save({id:editingId||undefined,name,gender,desc});
    editingId=null;disarmDel();
    close('peoplesheet');renderList();
  }

  /* ── 选人半窗 #peoplepick：chips 列全员，点一个回调 ── */
  async function pick(onPick){
    await load();
    const s=hoist('peoplepick');
    if(!s){toast('找不到选人半窗');return}
    const box=document.getElementById('ppPickList');
    if(box){
      box.innerHTML='';
      if(!lst().length){
        box.innerHTML='<div class="sub" style="font-family:var(--song);margin:4px 0 12px">还没有书中人</div>';
        const g=document.createElement('span');g.className='ghost';g.style.color='var(--jade)';g.textContent='去新建';
        g.onclick=()=>{close('peoplepick');go('contacts');openNew()};
        box.appendChild(g);
      }else{
        const chips=box.classList.contains('chips')?box:Object.assign(document.createElement('div'),{className:'chips'});
        for(const p of lst()){
          const c=document.createElement('span');c.className='chip';
          c.textContent=p.name+(p.gender?' · '+p.gender:'');
          c.onclick=()=>{close('peoplepick');if(typeof onPick==='function')onPick(p)};
          chips.appendChild(c);
        }
        if(chips!==box)box.appendChild(chips);
      }
    }
    s.classList.add('show');
  }

  (async()=>{
    await load();renderList();
  })();
  return{load,list:lst,get,save,remove,promptText,renderList,openNew,edit,saveFromForm,pick,segPick,_list:()=>list};
})();
