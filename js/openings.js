/* 开头素材：名称＋开场文本＋形式（开场内容 reply／开场指令 cmd）＋世界书引用。
   开书选它＝整包带入；世界书快照机制推后，一期先直接引用。 */
const Openings=(()=>{
  let list=null,editingId=null,formWb=null;
  const rid=()=>'op'+Math.random().toString(36).slice(2,8);
  async function load(){if(!list)list=(await DB.get('op.list'))||[];return list}
  async function save(){await DB.set('op.list',list);renderAssets()}
  const get=id=>(list||[]).find(x=>x.id===id);

  const MODE_HINT=['这段文字＝模型写下的第一段，直接成为正文开头。','这段文字＝你发出的第一条指令，点它的 ↻ 让模型写出开头。'];
  function syncHint(id){const h=document.getElementById(id+'Hint');if(h)h.textContent=MODE_HINT[segIdx(id)]||''}
  function setSeg(id,idx){const seg=document.getElementById(id);if(seg)[...seg.children].forEach((c,i)=>c.classList.toggle('on',i===idx));syncHint(id)}
  function segIdx(id){const seg=document.getElementById(id);return seg?[...seg.children].findIndex(c=>c.classList.contains('on')):0}

  async function openNew(){
    await load();editingId=null;formWb=null;
    document.getElementById('opName').value='';
    document.getElementById('opText').value='';
    setSeg('opMode',0);
    WB.chips(document.getElementById('opWbChips'),null,v=>formWb=v);
    document.getElementById('opsheet').classList.add('show');
  }
  async function edit(id){
    await load();const o=get(id);if(!o)return;
    editingId=id;formWb=o.wbId||null;
    document.getElementById('opName').value=o.name;
    document.getElementById('opText').value=o.text;
    setSeg('opMode',o.mode==='cmd'?1:0);
    WB.chips(document.getElementById('opWbChips'),formWb,v=>formWb=v);
    document.getElementById('opsheet').classList.add('show');
  }
  async function saveFromForm(){
    await load();
    const name=(document.getElementById('opName').value||'').trim();
    const text=(document.getElementById('opText').value||'').slice(0,4000);
    if(!name||!text.trim())return;
    const mode=segIdx('opMode')===1?'cmd':'reply';
    if(editingId){const o=get(editingId);if(o)Object.assign(o,{name,text,mode,wbId:formWb})}
    else list.push({id:rid(),name,text,mode,wbId:formWb});
    editingId=null;await save();
    document.getElementById('opsheet').classList.remove('show');
  }

  /* 世界书被整本删除时，清掉开头里的引用 */
  async function clearWb(wbId){
    await load();let hit=false;
    for(const o of list)if(o.wbId===wbId){o.wbId=null;hit=true}
    if(hit)await save();
  }

  async function renderAssets(){
    const box=document.getElementById('opGroup');if(!box)return;
    await load();
    const q=((document.getElementById('assetSearch')||{}).value||'').trim().toLowerCase();
    const shown=list.filter(o=>!q||(o.name+o.text).toLowerCase().includes(q));
    box.innerHTML=shown.length?'':`<div class="sub" style="text-align:center;margin:6px 0 10px;font-family:var(--song)">${q?'没有匹配的开头。':'还没有开头。'}</div>`;
    for(const o of shown){
      const w=o.wbId&&WB.get?WB.get(o.wbId):null;
      const d=document.createElement('div');d.className='card';
      d.innerHTML=`<h4><span class="dot plum"></span>${esc(o.name)}<span class="src plum" style="margin-left:auto">${o.mode==='cmd'?'开场指令':'开场内容'}</span></h4>
        <div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--song)">${esc(o.text)}</div>
        ${w?`<div class="sub" style="margin-top:4px;color:var(--jade)">◈ ${esc(w.name)}</div>`:''}
        <div style="margin-top:10px"><span class="ghost" data-a="use" style="color:var(--jade)">用它开书</span><span class="ghost" data-a="edit" style="margin-left:8px">编辑</span><span class="ghost" data-a="del" style="margin-left:8px;color:var(--danger)">删除</span></div>`;
      d.querySelector('[data-a=use]').onclick=()=>Writing.openNewBook(o.id);
      d.querySelector('[data-a=edit]').onclick=()=>edit(o.id);
      const del=d.querySelector('[data-a=del]');
      del.onclick=async()=>{
        if(del.dataset.armed){list=list.filter(x=>x.id!==o.id);await save();return}
        del.dataset.armed='1';del.textContent='确认删除？';del.style.cssText='margin-left:8px;color:#fff;background:var(--danger);border-color:transparent';
        setTimeout(()=>{if(del.isConnected){delete del.dataset.armed;del.textContent='删除';del.style.cssText='margin-left:8px;color:var(--danger)'}},2600);
      };
      box.appendChild(d);
    }
  }

  (async()=>{
    // 表单里的形式 seg 通用切换
    ['opMode','nbMode'].forEach(id=>{
      const seg=document.getElementById(id);
      if(seg)[...seg.children].forEach(c=>c.onclick=()=>{[...seg.children].forEach(x=>x.classList.remove('on'));c.classList.add('on');syncHint(id)});
    });
    const as=document.getElementById('assetSearch');
    if(as)as.addEventListener('input',()=>{renderAssets();WB.renderAssets()});
    await load();renderAssets();
  })();
  return{load,get,openNew,edit,saveFromForm,renderAssets,setSeg,segIdx,clearWb,_list:()=>list};
})();
