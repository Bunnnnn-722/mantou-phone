/* U5 世界书：多本素材（每本＝通用描述＋细分词条）＋编辑器＋素材库组。
   书通过 bk.{id}.wb 存引用；开书/设定库可换。旧单本数据自动迁移成第一本。 */
const WB=(()=>{
  let list=null,editingId=null,editEntryId=null,editGen=false,q='';
  const rid=()=>'wb'+Math.random().toString(36).slice(2,8);

  async function load(){
    if(list)return list;
    list=(await DB.get('wb.list'))||null;
    if(!list){
      const le=(await DB.get('wb.b1'))||[],lg=(await DB.get('wb.b1.general'))||'';
      list=(le.length||lg)?[{id:'wb1',name:'我的世界书',general:lg,entries:le}]:[];
      await DB.set('wb.list',list);
      if(list.length){
        const bl=(await DB.get('bk.list'))||[];
        for(const b of bl)await DB.set(`bk.${b.id}.wb`,'wb1');
      }
    }
    return list;
  }
  async function save(){await DB.set('wb.list',list);renderEditor();renderAssets()}
  const get=id=>(list||[]).find(w=>w.id===id);

  /* 给写作模板：通用描述在前，启用词条在后 */
  async function activeTextFor(id){
    await load();const w=get(id);if(!w)return'';
    const parts=[];
    if((w.general||'').trim())parts.push(w.general.trim());
    for(const e of w.entries)if(e.on)parts.push(e.name+'：'+e.text);
    return parts.join('\n');
  }

  async function setEditing(id){
    await load();editingId=id;editEntryId=null;editGen=false;q='';
    const t=document.getElementById('wbTitle'),w=get(id);
    if(t)t.textContent=w?('世界书 · '+w.name):'世界书';
    const si=document.getElementById('wbSearch');if(si)si.value='';
    renderEditor();go('wbedit');
  }
  async function createNew(){
    await load();
    const w={id:rid(),name:'新世界书',general:'',entries:[]};
    list.push(w);await DB.set('wb.list',list);
    renderAssets();setEditing(w.id);
  }

  /* ── 编辑器（wbedit 屏，作用于 editingId）── */
  const TA='width:100%;min-height:110px;border-radius:var(--r);border:1px solid var(--line);background:var(--panel-3);padding:11px 13px;font-family:var(--song);font-size:13px;line-height:1.9;color:var(--text);outline:none;resize:none';
  async function renderEditor(){
    const box=document.getElementById('wblist');if(!box)return;
    await load();const w=get(editingId);
    if(!w){box.innerHTML='<div class="sub" style="text-align:center;margin-top:40px;font-family:var(--song)">从素材库选一本世界书，或新建一本。</div>';return}
    const a=w.entries.filter(e=>!q||(e.name+e.text).toLowerCase().includes(q));
    box.innerHTML='';
    if(!q){
      const g=document.createElement('div');g.className='card';g.style.borderLeft='2px solid var(--jade)';
      if(editGen){
        g.innerHTML=`<h4><span class="dot jade"></span>通用描述<span style="margin-left:auto;color:var(--jade);font-size:12px;cursor:pointer" data-a="gclose">收起</span></h4>
          <div class="field"><label>世界书名</label><input data-f="wname" value="${esc(w.name)}"></div>
          <div class="field"><label>一段话说清你的世界 · 默认拼入模板</label><textarea data-f="gtext" style="${TA}" placeholder="这个世界是什么样的…">${esc(w.general||'')}</textarea></div>
          <div style="margin-top:12px"><button class="btn" data-a="gsave">保存</button><span class="ghost" data-a="wdel" style="margin-left:8px;color:var(--danger)">删除整本</span></div>`;
        g.querySelector('[data-a=gclose]').onclick=()=>{editGen=false;renderEditor()};
        const wdel=g.querySelector('[data-a=wdel]');
        wdel.onclick=async()=>{
          if(wdel.dataset.armed){await deleteBook(w.id);return}
          wdel.dataset.armed='1';wdel.textContent='确认删除整本？';wdel.style.cssText='margin-left:8px;color:#fff;background:var(--danger);border-color:transparent';
          setTimeout(()=>{if(wdel.isConnected){delete wdel.dataset.armed;wdel.textContent='删除整本';wdel.style.cssText='margin-left:8px;color:var(--danger)'}},2600);
        };
        g.querySelector('[data-a=gsave]').onclick=async()=>{
          w.name=g.querySelector('[data-f=wname]').value.trim()||w.name;
          w.general=g.querySelector('[data-f=gtext]').value.slice(0,4000);
          editGen=false;await save();
          const t=document.getElementById('wbTitle');if(t)t.textContent='世界书 · '+w.name;
        };
      }else{
        g.style.cursor='pointer';
        g.innerHTML=`<h4><span class="dot jade"></span>通用描述<span class="src jade" style="margin-left:8px">默认拼入</span><span style="margin-left:auto;color:var(--text-3);font-size:12px">编辑</span></h4>
          <div class="sub" style="${w.general?'':'color:var(--text-3);'}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--song)">${w.general?esc(w.general):'一段话说清你的世界——不想拆词条就全写在这。'}</div>`;
        g.onclick=()=>{editGen=true;renderEditor()};
      }
      box.appendChild(g);
    }
    if(!a.length){
      const d=document.createElement('div');d.className='sub';
      d.style.cssText='text-align:center;margin-top:26px;font-family:var(--song)';
      d.textContent=q?'没有匹配的词条。':'细分词条（Wiki 式）可以不建；要建点右上「新增条目」。';
      box.appendChild(d);
    }
    for(const e of a){
      const d=document.createElement('div');d.className='card';
      if(editEntryId===e.id){
        d.style.borderLeft='2px solid var(--jade)';
        d.innerHTML=`<h4><span class="dot ${e.on?'jade':''}"${e.on?'':' style="background:var(--text-3)"'}></span>${esc(e.name)}<span style="margin-left:auto;color:var(--jade);font-size:12px;cursor:pointer" data-a="close">收起</span></h4>
          <div class="field"><label>条目名</label><input data-f="name" value="${esc(e.name)}"></div>
          <div class="field"><label>状态</label><div class="seg" data-f="on" style="margin-top:2px"><div class="${e.on?'on':''}">启用 · 拼入模板</div><div class="${e.on?'':'on'}">停用</div></div></div>
          <div class="field"><label>内容 · 上限 2000</label><textarea data-f="text" style="${TA}">${esc(e.text)}</textarea></div>
          <div style="margin-top:12px"><button class="btn" data-a="save">保存</button><span class="ghost" data-a="del" style="margin-left:8px;color:var(--danger)">删除条目</span></div>`;
        const seg=d.querySelector('[data-f=on]');
        [...seg.children].forEach((c,i)=>c.onclick=()=>{[...seg.children].forEach(x=>x.classList.remove('on'));c.classList.add('on');seg.dataset.v=i===0?'1':''});
        seg.dataset.v=e.on?'1':'';
        d.querySelector('[data-a=close]').onclick=()=>{editEntryId=null;renderEditor()};
        d.querySelector('[data-a=save]').onclick=async()=>{
          e.name=d.querySelector('[data-f=name]').value.trim()||e.name;
          e.text=d.querySelector('[data-f=text]').value.slice(0,2000);
          e.on=!!seg.dataset.v;
          editEntryId=null;await save();
        };
        const del=d.querySelector('[data-a=del]');
        del.onclick=async()=>{
          if(del.dataset.armed){w.entries=w.entries.filter(x=>x.id!==e.id);editEntryId=null;await save();return}
          del.dataset.armed='1';del.textContent='确认删除？';del.style.cssText='margin-left:8px;color:#fff;background:var(--danger);border-color:transparent';
          setTimeout(()=>{if(del.isConnected){delete del.dataset.armed;del.textContent='删除条目';del.style.cssText='margin-left:8px;color:var(--danger)'}},2600);
        };
      }else{
        d.style.cursor='pointer';if(!e.on)d.style.opacity='.55';
        d.innerHTML=`<h4><span class="dot ${e.on?'jade':''}"${e.on?'':' style="background:var(--text-3)"'}></span>${esc(e.name)}<span class="src ${e.on?'jade':''}" style="margin-left:8px">${e.on?'启用':'停用'}</span><span style="margin-left:auto;color:var(--text-3);font-size:12px">展开</span></h4>
          <div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.text)}</div>`;
        d.onclick=()=>{editEntryId=e.id;renderEditor()};
      }
      box.appendChild(d);
    }
  }

  /* 删除整本：连带清掉书与开头的引用（引用清空＝不关联，正文不受影响） */
  async function deleteBook(id){
    await load();
    list=list.filter(x=>x.id!==id);
    await DB.set('wb.list',list);
    const bl=(await DB.get('bk.list'))||[];
    for(const b of bl)if((await DB.get(`bk.${b.id}.wb`))===id)await DB.del(`bk.${b.id}.wb`);
    if(typeof Openings!=='undefined')await Openings.clearWb(id);
    editingId=null;editEntryId=null;editGen=false;
    renderEditor();renderAssets();go('wshelf');
  }

  /* 新增条目页（作用于当前编辑中的世界书） */
  function segPick(el){
    const seg=el.parentElement;
    [...seg.children].forEach(x=>x.classList.remove('on'));
    el.classList.add('on');
  }
  async function addFromForm(){
    await load();const w=get(editingId);
    if(!w){toast('先在素材库选一本世界书');return}
    const name=(document.getElementById('wbnName').value||'').trim();
    const text=(document.getElementById('wbnText').value||'').slice(0,2000);
    if(!name||!text)return;
    const on=document.querySelector('#wbnOn div.on').textContent.includes('启用');
    w.entries.push({id:'w'+Math.random().toString(36).slice(2,9),name,text,on});
    await save();
    document.getElementById('wbnName').value='';document.getElementById('wbnText').value='';
    go('wbedit');
  }

  /* 素材库组 */
  async function renderAssets(){
    const box=document.getElementById('wbGroup');if(!box)return;
    await load();
    const q=((document.getElementById('assetSearch')||{}).value||'').trim().toLowerCase();
    const shown=list.filter(w=>!q||(w.name+(w.general||'')+w.entries.map(e=>e.name).join('')).toLowerCase().includes(q));
    box.innerHTML=shown.length?'':`<div class="sub" style="text-align:center;margin:6px 0 10px;font-family:var(--song)">${q?'没有匹配的世界书。':'还没有世界书。'}</div>`;
    for(const w of shown){
      const on=w.entries.filter(e=>e.on).length;
      const d=document.createElement('div');d.className='card';d.style.cursor='pointer';
      d.innerHTML=`<h4><span class="dot jade"></span>${esc(w.name)}<span class="src jade" style="margin-left:auto">${w.entries.length} 词条 · 启用 ${on}</span></h4>
        <div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--song)">${esc(w.general||'（还没写通用描述）')}</div>`;
      d.onclick=()=>setEditing(w.id);
      box.appendChild(d);
    }
  }

  /* 选择 chips（建书/建开头/换书共用） */
  async function chips(el,selected,onPick,noneLabel){
    if(!el)return;await load();
    el.innerHTML='';
    const mk=(label,val)=>{
      const c=document.createElement('span');
      c.className='chip'+(selected===val?' on':'');
      c.textContent=label;
      c.onclick=()=>{[...el.children].forEach(x=>x.classList.remove('on'));c.classList.add('on');onPick(val)};
      el.appendChild(c);
    };
    mk(noneLabel||'不关联',null);
    for(const w of list)mk(w.name,w.id);
  }

  (async()=>{
    const si=document.getElementById('wbSearch');
    if(si)si.addEventListener('input',()=>{q=si.value.trim().toLowerCase();renderEditor()});
    await load();renderAssets();
  })();
  return{load,get,activeTextFor,setEditing,createNew,addFromForm,segPick,renderAssets,chips,_list:()=>list};
})();
