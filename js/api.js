/* U2 请求层：四通道队列 / OpenAI 兼容流式 / 429与超时退避降速 / 全局日志 200 条。
   BASE URL 留空或填 mock ＝ 内置假通道(开发演示用，零费用)。Key 只从 IndexedDB 读，永不出现在代码里。 */

function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function nowHM(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}

/* ── 日志：kv 里一个数组，新在前，封顶 200 ── */
const Log=(()=>{
  let cache=null,filter={err:false,src:null};
  async function all(){if(!cache)cache=(await DB.get('log.entries'))||[];return cache}
  async function save(){await DB.set('log.entries',cache);render()}
  async function add(e){const a=await all();e.id=e.id||('lg'+Math.random().toString(36).slice(2,9));a.unshift(e);if(a.length>200)a.length=200;await save();return e}
  async function patch(id,p){const a=await all();const e=a.find(x=>x.id===id);if(e){Object.assign(e,p);await save()}return e}
  async function render(){
    const box=document.querySelector('#log .scroll');if(!box)return;
    box.querySelectorAll('.log-item,.log-empty').forEach(n=>n.remove());
    const a=(await all()).filter(e=>(!filter.err||e.err)&&(!filter.src||e.source===filter.src));
    if(!a.length){const d=document.createElement('div');d.className='sub log-empty';d.style.cssText='text-align:center;margin-top:40px;font-family:var(--song)';d.textContent='还没有请求。落笔之后，这里会记下每一次调用。';box.appendChild(d);return}
    for(const e of a){
      const d=document.createElement('div');d.className='card log-item'+(e.err?' err':'');
      d.innerHTML=`<div class="row1"><span>${esc(e.t)}</span><span class="src ${e.ch==='main'?'jade':'amber'}">${esc(e.chName)}</span><span class="src">${esc(e.source||'')}</span>${e.err?'<span class="src err">失败</span>':(e.st==='run'?'<span class="src jade">进行中</span>':'')}${e.cut?'<span class="src amber">截断·请续写</span>':''}</div>
      <div class="instr">${esc(e.instr||'')}</div>
      <div class="resp"${e.err?' style="font-family:var(--mono);font-size:11px"':''}>${esc((e.err||e.resp||'').slice(0,160))}${(e.err||e.resp||'').length>160?'…':''}</div>
      <div class="acts"><span class="ghost" data-act="copy">复制${e.err?'完整报错':'响应'}</span></div>`;
      d.querySelector('[data-act=copy]').onclick=()=>navigator.clipboard.writeText(e.err||e.resp||'');
      box.appendChild(d);
    }
  }
  function bindFilters(){
    document.querySelectorAll('#log .fchip').forEach(ch=>{ch.onclick=()=>{
      document.querySelectorAll('#log .fchip').forEach(c=>c.classList.remove('on'));ch.classList.add('on');
      const t=ch.textContent;filter.err=(t==='仅报错');filter.src=(t==='全部'||t==='仅报错')?null:t;render();};});
  }
  return{add,patch,render,bindFilters};
})();

/* ── 队列与通道 ── */
const API=(()=>{
  const CH={main:{name:'主力',conc:1},light:{name:'轻量',conc:2},img:{name:'生图',conc:1},tts:{name:'语音',conc:2}};
  const st={run:{main:0,light:0,img:0,tts:0},limited:{},tasks:[]};
  let mock429=0; // 调试：让 mock 通道先失败 N 次演练退避

  async function cfg(ch){return{base:(await DB.get(`cfg.${ch}.base`))||'',key:(await DB.get(`cfg.${ch}.key`))||'',model:(await DB.get(`cfg.${ch}.model`))||''}}
  const isMock=c=>c.base.trim()==='mock'; // 罐头只给开发测试:显式填 mock 才走;留空=未配置,直接拦

  async function persist(){await DB.set('queue.tasks',st.tasks.map(t=>({id:t.id,ch:t.ch,label:t.label,source:t.source,st:t.st,err:t.err||'',payload:t.payload||null})))}

  function renderQ(){
    const live=st.tasks.filter(t=>t.st!=='done');
    const bub=document.getElementById('qbub');
    if(bub){bub.classList.toggle('show',live.length>0);const n=bub.querySelector('.n');if(n)n.textContent=live.length}
    const panel=document.querySelector('#qpanel [style*="overflow-y"]');if(!panel)return;
    panel.innerHTML=live.length?'':'<div class="sub" style="text-align:center;margin-top:24px;font-family:var(--song)">队列空空，岁月静好。</div>';
    for(const t of live){
      const row=document.createElement('div');row.className='qrow';if(t.st==='failed')row.style.borderLeft='2px solid var(--danger)';
      const stTxt=t.st==='running'?'生成中':t.st==='limited'?'限流中 · 已降速':t.st==='failed'?('失败 · '+esc((t.err||'').slice(0,24))):t.st==='restored'?'上次中断 · 可重试':'排队中';
      row.innerHTML=`<div class="top">${esc(t.label)}<span class="src ${t.ch==='main'?'jade':'amber'}">${CH[t.ch].name}</span><span class="st${t.st==='running'?' on':''}"${t.st==='failed'?' style="color:var(--danger)"':''}>${stTxt}</span></div><div class="pbar"><i style="width:${t.st==='running'?55:0}%"></i></div>`;
      if(t.st==='failed'||t.st==='restored'){const b=document.createElement('div');b.style.marginTop='9px';b.innerHTML=`<span class="ghost" style="padding:3px 11px">重试</span><span class="ghost" style="padding:3px 11px;margin-left:6px">复制报错</span>`;
        b.children[0].onclick=()=>{t.st='queued';t.tries=0;renderQ();pump(t.ch)};b.children[1].onclick=()=>navigator.clipboard.writeText(t.err||'');row.appendChild(b)}
      panel.appendChild(row);
    }
  }

  function conc(ch){return st.limited[ch]?1:CH[ch].conc}
  function pump(ch){while(st.run[ch]<conc(ch)){const t=st.tasks.find(x=>x.ch===ch&&x.st==='queued');if(!t)break;exec(t)}}

  async function exec(t){
    t.st='running';st.run[t.ch]++;renderQ();persist();
    try{
      const out=await transport(t);
      t.st='done';st.limited[t.ch]=false;t.resolve&&t.resolve(out);
    }catch(e){
      const retriable=e&&(e.status===429||e.name==='AbortError'||e.timeout);
      if(retriable&&(t.tries||0)<3){
        t.tries=(t.tries||0)+1;st.limited[t.ch]=true;t.st='limited';renderQ();
        setTimeout(()=>{t.st='queued';renderQ();pump(t.ch)},1000*Math.pow(2,t.tries));
      }else{
        t.st='failed';t.err=String(e&&e.message||e);
        if(t.logId)Log.patch(t.logId,{err:t.err,st:'end'});
        t.reject&&t.reject(e);
      }
    }finally{st.run[t.ch]--;renderQ();persist();pump(t.ch)}
  }

  /* 真通道：OpenAI 兼容，流式优先，失败降级非流式 */
  async function realChat(t,c,entry){
    const url=c.base.replace(/\/+$/,'')+'/chat/completions';
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),120000);
    const body={model:c.model,messages:t.payload.messages,stream:true};
    const thinkMode=await DB.get(`cfg.${t.ch}.think`);
    if(thinkMode==='on')body.enable_thinking=true;else if(thinkMode==='off')body.enable_thinking=false;
    const extra=await DB.get(`cfg.${t.ch}.extra`);
    if(extra){try{Object.assign(body,JSON.parse(extra))}catch(e){}}
    let res;
    try{res=await fetch(url,{method:'POST',signal:ctrl.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.key},body:JSON.stringify(body)})}
    catch(e){clearTimeout(timer);if(ctrl.signal.aborted){const err=new Error('请求超时(120s)');err.timeout=true;throw err}throw e}
    if(res.status===429){clearTimeout(timer);const err=new Error('429 '+(await res.text()).slice(0,300));err.status=429;throw err}
    if(!res.ok){clearTimeout(timer);throw new Error(res.status+' '+(await res.text()).slice(0,300))}
    let text='',think='',fin='';
    const ctype=res.headers.get('content-type')||'';
    if(ctype.includes('event-stream')&&res.body){
      const rd=res.body.getReader(),dec=new TextDecoder();let buf='';
      for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});
        let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);
          if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(data==='[DONE]')continue;
          try{const j=JSON.parse(data);const d=j.choices&&j.choices[0];if(!d)continue;
            const delta=d.delta||{};
            if(delta.reasoning_content){think+=delta.reasoning_content;t.onThink&&t.onThink(delta.reasoning_content)}
            if(delta.content){text+=delta.content;t.onDelta&&t.onDelta(delta.content)}
            if(d.finish_reason)fin=d.finish_reason;
          }catch(e){}}}
    }else{
      const j=await res.json();const d=j.choices&&j.choices[0];
      text=(d&&d.message&&d.message.content)||'';fin=(d&&d.finish_reason)||'';
      if(d&&d.message&&d.message.reasoning_content)think=d.message.reasoning_content;
    }
    clearTimeout(timer);
    await Log.patch(entry.id,{resp:text,st:'end',cut:fin==='length'});
    return{text,think,finish:fin};
  }

  /* 假通道：流式吐样例文，可预演 429 退避 */
  async function mockChat(t,entry){
    if(mock429>0){mock429--;const err=new Error('429 mock rate limit(演练)');err.status=429;throw err}
    const thinkSample='作者要的是：'+(t.label||'续写')+'。先铺一个具体的画面，让物件说话；未接来电当悬念物，不点破。第二段加动作细节，句子收短。结尾停在一个没说完的动作上。';
    const tick=ms=>document.hidden?Promise.resolve():new Promise(r=>setTimeout(r,ms)); // 后台页定时器被冻结,免延迟直出
    for(const piece of thinkSample.match(/[\s\S]{1,6}/g)){await tick(45);t.onThink&&t.onThink(piece)}
    const sample='雨还没有停。'+(t.label||'')+'——这是假通道生成的演示文本，配好真 BASE URL 后这里就是模型的真实回复。\n他把伞收了又撑开，像在数一件事的正反面。第二段用来验换行：流式过程中就应该分段。\n最后一段收尾。字会一段一段流出来，写作页边收边落盘。';
    let text='';
    for(const piece of sample.match(/[\s\S]{1,7}/g)){await tick(60);text+=piece;t.onDelta&&t.onDelta(piece)}
    await Log.patch(entry.id,{resp:text,st:'end'});
    return{text,think:'',finish:'stop'};
  }

  async function transport(t){
    const c=await cfg(t.ch);
    if(!c.base.trim()){const err=new Error(`未配置 API — 去设置里给「${CH[t.ch].name}」填 BASE URL、Key 与模型`);err.noApi=true;throw err}
    if(!t.logId){const entry=await Log.add({t:nowHM(),ch:t.ch,chName:CH[t.ch].name,source:t.source||'',instr:t.label||'',resp:'',st:'run'});t.logId=entry.id}
    const entry={id:t.logId};
    return isMock(c)?mockChat(t,entry):realChat(t,c,entry);
  }

  /* 对上层的口子：U4 写作引擎就调这个 */
  function chat(ch,{messages,source,label,onDelta,onThink}){
    return new Promise((resolve,reject)=>{
      const t={id:'tk'+Math.random().toString(36).slice(2,9),ch,st:'queued',tries:0,source,label,payload:{messages},onDelta,onThink,resolve,reject};
      st.tasks.push(t);renderQ();persist();pump(ch);
    });
  }

  /* 测试连接：GET {base}/models */
  async function test(ch){
    const c=await cfg(ch);
    if(!c.base.trim())return{ok:false,empty:true,msg:'未配置'};
    if(isMock(c))return{ok:true,mock:true};
    try{const res=await fetch(c.base.replace(/\/+$/,'')+'/models',{headers:{Authorization:'Bearer '+c.key}});
      if(res.ok)return{ok:true};
      return{ok:false,msg:res.status+' '+(await res.text()).slice(0,120)};
    }catch(e){return{ok:false,msg:String(e).slice(0,120)}}
  }
  function bindTests(){
    document.querySelectorAll('[data-test]').forEach(btn=>{
      const ch=btn.dataset.test;
      btn.onclick=async()=>{btn.textContent='测试中…';btn.style.color='';
        const r=await test(ch);
        btn.textContent=r.ok?(r.mock?'已连通 · 假通道':'已连通'):'失败';
        btn.style.color=r.ok?'var(--jade)':'var(--danger)';
        if(!r.ok&&r.msg)btn.title=r.msg;};
    });
  }

  /* 刷新恢复：上次没跑完的任务standing为可重试 */
  async function restore(){
    const saved=(await DB.get('queue.tasks'))||[];
    for(const t of saved){if(t.st==='done')continue;
      st.tasks.push({...t,st:(t.st==='failed'?'failed':'restored'),tries:0});}
    renderQ();
  }
  return{chat,test,bindTests,restore,_setMock429:n=>{mock429=n},_st:st};
})();

(async()=>{try{await API.restore();Log.bindFilters();await Log.render();API.bindTests()}catch(e){console.error('api boot',e)}})();
