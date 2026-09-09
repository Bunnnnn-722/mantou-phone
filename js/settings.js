/* U3 设置页交互：模型列表拉取(顺带回填上下文窗口) + 通道多方案(平台一用完切平台二)。 */
const Settings=(()=>{
  let curCh=null,lastList=[];
  const F={main:['base','key','model','ctx','extra'],light:['base','key','model','ctx','extra'],img:['base','key','model'],tts:['base','key','model']};
  const el=(ch,f)=>document.querySelector(`[data-k="${ch}.${f}"]`);

  async function fetchModels(ch){
    const base=(await DB.get(`cfg.${ch}.base`))||'',key=(await DB.get(`cfg.${ch}.key`))||'';
    if(!base||base.trim()==='mock')return{mock:true,list:[{id:'mock-writer',ctx:200000},{id:'mock-lite',ctx:131072}]};
    const res=await fetch(base.replace(/\/+$/,'')+'/models',{headers:{Authorization:'Bearer '+key}});
    if(!res.ok)throw new Error(res.status+' '+(await res.text()).slice(0,120));
    const j=await res.json();
    const list=(j.data||j.models||[]).map(m=>({id:m.id||m.name,ctx:m.context_length||m.context_window||m.max_context_tokens||m.max_model_len||null})).filter(m=>m.id);
    return{list};
  }

  async function openModels(ch){
    curCh=ch;
    const sheet=document.getElementById('modelsheet'),list=document.getElementById('modellist');
    list.innerHTML='<div class="sub" style="text-align:center;margin-top:20px;font-family:var(--song)">拉取中…</div>';
    sheet.classList.add('show');
    const search=document.getElementById('modelsearch');if(search){search.value='';search.oninput=()=>renderModels(search.value.trim().toLowerCase())}
    try{
      const r=await fetchModels(ch);
      lastList=r.list;
      renderModels('');
    }catch(e){list.innerHTML=`<div class="sub" style="text-align:center;margin-top:20px;font-family:var(--song)">拉取失败，检查 BASE URL 和 Key 后再试。</div><div style="font-family:var(--mono);font-size:10.5px;color:var(--text-3);text-align:center;margin-top:8px;padding:0 20px;word-break:break-all">${esc(String(e.message||e).slice(0,140))}</div>`}
  }
  function renderModels(q){
    const ch=curCh,list=document.getElementById('modellist'),sheet=document.getElementById('modelsheet');
    const arr=q?lastList.filter(m=>m.id.toLowerCase().includes(q)):lastList;
    list.innerHTML='';
    if(!arr.length){list.innerHTML=`<div class="sub" style="text-align:center;margin-top:20px;font-family:var(--song)">${q?'没有匹配「'+esc(q)+'」的模型。':'服务商没返回模型列表，手填 model id 吧。'}</div>`;return}
    for(const m of arr){
      const d=document.createElement('div');d.className='mem';
      d.innerHTML=`<div class="idx" style="font-family:var(--mono);font-size:12px">${esc(m.id)}${m.ctx?`<span class="src" style="margin-left:auto;font-family:var(--sans)">${Math.round(m.ctx/1024)}K 窗口</span>`:''}</div>`;
      d.onclick=async()=>{
        const inp=el(ch,'model');if(inp){inp.value=m.id;await DB.set(`cfg.${ch}.model`,m.id)}
        const cx=el(ch,'ctx');if(m.ctx&&cx){cx.value=m.ctx;await DB.set(`cfg.${ch}.ctx`,String(m.ctx))}
        sheet.classList.remove('show');
      };
      list.appendChild(d);
    }
  }

  async function renderProf(){
    const ch=curCh,list=document.getElementById('proflist');
    const arr=(await DB.get('prof.'+ch))||[];
    list.innerHTML=arr.length?'':'<div class="sub" style="text-align:center;margin-top:16px;font-family:var(--song)">还没存过方案。先把上面表单填好，再在下面起个名保存。</div>';
    arr.forEach((p,i)=>{
      const d=document.createElement('div');d.className='mem';
      d.innerHTML=`<div class="idx"><span style="min-width:0;flex-shrink:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span><span class="src" style="margin-left:8px;font-family:var(--mono);font-size:10px;max-width:88px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.model||'')}</span><span class="ghost" data-a="use" style="margin-left:auto;padding:3px 11px;color:var(--jade);white-space:nowrap;flex-shrink:0">启用</span><span class="ghost" data-a="del" style="margin-left:6px;padding:3px 11px;color:var(--danger);white-space:nowrap;flex-shrink:0">删除</span></div><div class="detail" style="display:block;font-family:var(--mono);font-size:10.5px">${esc(p.base||'')}</div>`;
      d.querySelector('[data-a=use]').onclick=async ev=>{ev.stopPropagation();
        for(const f of F[ch]){if(p[f]!==undefined){await DB.set(`cfg.${ch}.${f}`,p[f]);const inp=el(ch,f);if(inp)inp.value=p[f]}}
        if(p.think!==undefined){await DB.set(`cfg.${ch}.think`,p.think);paintThink(ch,p.think)}
        await DB.set(`cfg.${ch}.profName`,p.name);paintProfName(ch,p.name);
        document.getElementById('profsheet').classList.remove('show');
      };
      const del=d.querySelector('[data-a=del]');
      del.onclick=async ev=>{ev.stopPropagation();
        if(del.dataset.armed){arr.splice(i,1);await DB.set('prof.'+ch,arr);renderProf();return}
        del.dataset.armed='1';del.textContent='确认删除？';del.style.cssText='margin-left:6px;padding:3px 11px;color:#fff;background:var(--danger);border-color:transparent';
        setTimeout(()=>{if(del.isConnected){delete del.dataset.armed;del.textContent='删除';del.style.cssText='margin-left:6px;padding:3px 11px;color:var(--danger)'}},2600);
      };
      list.appendChild(d);
    });
  }

  function openProf(ch){curCh=ch;document.getElementById('profsheet').classList.add('show');renderProf()}

  async function saveProfile(){
    const ch=curCh,inp=document.getElementById('profname'),name=inp.value.trim();
    if(!name)return;
    const p={name};
    for(const f of F[ch]){const e=el(ch,f);if(e)p[f]=e.value}
    const tk=await DB.get(`cfg.${ch}.think`);if(tk)p.think=tk;
    const arr=(await DB.get('prof.'+ch))||[];
    const i=arr.findIndex(x=>x.name===name);
    if(i>=0)arr[i]=p;else arr.push(p);
    await DB.set('prof.'+ch,arr);
    inp.value='';renderProf();
  }

  const THINK=['auto','on','off'];
  function paintThink(ch,v){
    const seg=document.querySelector(`[data-think="${ch}"]`);if(!seg)return;
    [...seg.children].forEach((c,i)=>c.classList.toggle('on',THINK[i]===(v||'auto')));
  }
  function paintProfName(ch,name){
    const btn=document.querySelector(`[data-prof="${ch}"]`);
    if(btn)btn.textContent=name?('方案 · '+name):'方案';
  }
  function bind(){
    document.querySelectorAll('[data-mact]').forEach(b=>b.onclick=()=>openModels(b.dataset.mact));
    document.querySelectorAll('[data-prof]').forEach(b=>b.onclick=()=>openProf(b.dataset.prof));
    document.querySelectorAll('[data-think]').forEach(seg=>{
      const ch=seg.dataset.think;
      [...seg.children].forEach((c,i)=>c.onclick=async()=>{await DB.set(`cfg.${ch}.think`,THINK[i]);paintThink(ch,THINK[i])});
    });
    (async()=>{
      for(const ch of ['main','light','img','tts']){
        paintProfName(ch,await DB.get(`cfg.${ch}.profName`));
        if(document.querySelector(`[data-think="${ch}"]`))paintThink(ch,await DB.get(`cfg.${ch}.think`));
      }
    })();
  }
  return{openModels,openProf,saveProfile,bind};
})();
Settings.bind();
