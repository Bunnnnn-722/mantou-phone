/* 共享网络层：浮生记（rss.js）与书城（阅读）共用。
   Net.fetchT(url,init,ms)      带超时的 fetch，超时覆盖到正文读完（正文经 r.buf()／r.jsonT() 读）
   Net.viaProxy(tpl,url)        把 url 塞进转发代理模板（{url} 占位；整条 URL encodeURIComponent）
   Net.proxyTpl()               读设置里的全局模板 cfg.rss.proxy
   Net.get(url,{proxy,host,init,ms}) 直连→转发代理；同一 host 直连失败一次后本会话直接走代理（粘性），下次启动再试直连
   Net.online()                 navigator.onLine 的保守判断 */
const Net=(()=>{
  const TIMEOUT=20000;
  const sticky=new Map(); // host → true＝本会话直连已失败，直接走代理
  async function fetchT(url,init,ms){
    const ctrl=new AbortController();const t=ms||TIMEOUT;const timer=setTimeout(()=>ctrl.abort(),t);
    const wrap=e=>ctrl.signal.aborted?new Error('请求超时（'+Math.round(t/1000)+'s）'):e;
    let r;
    try{r=await fetch(url,Object.assign({cache:'no-store',signal:ctrl.signal},init||{}))}
    catch(e){clearTimeout(timer);throw wrap(e)}
    let bufP=null;
    r.buf=()=>bufP||(bufP=r.arrayBuffer().then(b=>{clearTimeout(timer);return b},e=>{clearTimeout(timer);throw wrap(e)}));
    r.jsonT=async()=>JSON.parse(new TextDecoder().decode(await r.buf()));
    r.textT=async()=>new TextDecoder().decode(await r.buf());
    return r;
  }
  const viaProxy=(tpl,url)=>tpl.includes('{url}')?tpl.split('{url}').join(encodeURIComponent(url)):tpl+encodeURIComponent(url);
  const hostOf=u=>{try{return new URL(u).host}catch(e){return ''}};
  async function proxyTpl(){try{return String((await DB.get('cfg.rss.proxy'))||'').trim()}catch(e){return ''}};
  const msg=e=>String((e&&e.message)||e||'未知错误');
  // 直连→代理。返回 {res,via:'direct'|'proxy'}；两条路都不通抛可读错误
  async function get(url,o){
    o=o||{};
    const host=o.host||hostOf(url);
    const tpl=o.proxy!=null?String(o.proxy).trim():await proxyTpl();
    let direct='';
    if(!sticky.get(host)){
      try{const r=await fetchT(url,o.init,o.ms);if(r.ok)return{res:r,via:'direct'};direct='HTTP '+r.status}
      catch(e){direct=msg(e)}
      if(tpl)sticky.set(host,true); // 有代理可走才记粘性；没代理就每次都试直连
    }else direct='本会话直连已失败，直接走代理';
    if(!tpl)throw new Error('直连被拦且未配置转发代理（'+direct+'）');
    try{const r=await fetchT(viaProxy(tpl,url),o.init,o.ms);if(!r.ok)throw new Error('HTTP '+r.status);return{res:r,via:'proxy'}}
    catch(e){throw new Error('直连失败（'+direct+'），转发代理也失败（'+msg(e)+'）')}
  }
  const online=()=>typeof navigator==='undefined'||navigator.onLine!==false;
  const resetSticky=()=>sticky.clear();
  return{fetchT,viaProxy,proxyTpl,get,online,resetSticky,TIMEOUT};
})();
