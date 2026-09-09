/* U8 阅读 · 维基文库解析器（纯函数，不碰网络不碰 DB）：
   WS.url(params)            → api.php 请求 URL（统一 variant=zh-hans / redirects=1 / origin=*）
   WS.detect(html,page,tpls) → {kind:'versions'|'subpages'|'collection'|'single', chapters:[{n,title,page,extra}], versions:[{title,page}], intro:[段]}
   WS.paras(html)            → [{t:'p'|'poem'|'head', s:'文本'}]  章正文段落模型
   规则来源：U8-阅读书城-详稿.md 一之二。先剥导航／版权／脚注等壳，再从剩下的内容里取链接与段落。 */
const WS=(()=>{
  const API='https://zh.wikisource.org/w/api.php';
  const SKIP_NS=/^(作者|Author|Category|分类|Wikisource|Special|特殊|Help|帮助|Template|模板|Talk|讨论|Portal|Index|Page|File|文件|MediaWiki|Module|模块|User|用户):/i;
  // 剥离清单：编辑钮、打印隐藏、表格（导航／版权／姊妹计划都在表格里）、脚注、样式脚本、许可框、页头页脚壳、目录框
  const STRIP='.mw-editsection,.noprint,table.noprint,#headertemplate,#headerContainer,[id*="header"],.ws-header,.ws-title,.ws-author,[class*="header"],.mw-references-wrap,ol.references,sup.reference,.reference,style,script,.licenseContainer,.header,.navigation,[role="navigation"],.printfooter,#toc,.toc,.mw-empty-elt,.sistersitebox,.dablink,.hatnote,.ws-noexport,.wst-header,.wst-footer,.mw-cite-backlink,.mw-halign-right';
  function url(params){
    const q=Object.assign({format:'json',formatversion:'2',origin:'*',variant:'zh-hans',redirects:'1'},params||{});
    return API+'?'+Object.keys(q).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(q[k])).join('&');
  }
  const root=html=>{const d=new DOMParser().parseFromString(String(html||''),'text/html');const r=d.querySelector('.mw-parser-output')||d.body;r.querySelectorAll(STRIP).forEach(e=>e.remove());return r};
  const pageOf=href=>{try{let h=String(href||'');if(!/^\/wiki\//.test(h))return '';h=h.slice(6).split('#')[0];return decodeURIComponent(h).replace(/_/g,' ').trim()}catch(e){return ''}};
  const norm=s=>String(s||'').replace(/[\s ]+/g,' ').trim();
  // 内容里的站内链接，按出现顺序去重；跳过命名空间页、红链、外链、锚点
  // 篇目只认列表／表格里的链接，且只取**最大的那一组**（同作者其他作品、上一篇下一篇这类小列表被自然排除）；any＝不分组全取
  function links(el,any){
    const groups=new Map(),seen=new Set();
    for(const a of el.querySelectorAll('a[href]')){
      const href=a.getAttribute('href')||'';
      if(!/^\/wiki\//.test(href)||/redlink=1/.test(href)||a.classList.contains('new')||a.classList.contains('external'))continue;
      const page=pageOf(href);if(!page||SKIP_NS.test(page)||seen.has(page))continue;
      let key='*';
      if(!any){if(a.closest('p'))continue;const box=a.closest('table')||a.closest('ul,ol,dl');if(!box)continue;key=box}
      seen.add(page);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({page,text:norm(a.textContent)||page});
    }
    return [...groups.values()];
  }
  // 目录成组合并：子页书收所有「子页占比 ≥80%」的组（红楼梦目录分两张表）；合集收所有 ≥5 条的组；都没有就退回最大组
  function tocLinks(el,page){
    const gs=links(el,false);
    const subShare=g=>g.filter(l=>l.page.startsWith(page+'/')).length/g.length;
    const subG=gs.filter(g=>subShare(g)>=0.8);
    if(subG.some(g=>g.length>=3))return subG.flat(); // 有一组像目录，其余全是子页的小组（伪续卷）也一并收
    const big=gs.filter(g=>g.length>=5);
    if(big.length)return big.flat();
    let best=[];for(const g of gs)if(g.length>best.length)best=g;
    return best;
  }
  function textOf(node){ // <br> 作换行，其余按文本
    let s='';
    for(const c of node.childNodes){
      if(c.nodeType===3)s+=c.nodeValue;
      else if(c.nodeType===1){if(c.tagName==='BR')s+='\n';else s+=textOf(c)}
    }
    return s;
  }
  const POEM=/(^|\s)(poem|verse|shi|ci-poem|lyrics)(\s|$)/i;
  function pushPara(out,t,s){
    s=String(s||'').replace(/ /g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{2,}/g,'\n');
    if(t!=='poem')s=s.replace(/\s*\n\s*/g,' ');
    s=s.replace(/[ \t]{2,}/g,' ').trim();
    if(!s||!/[\p{L}\p{N}]/u.test(s))return; // 只有箭头／标点的行（←、→）丢
    if(t==='p'&&s.length<=6&&/^[〇一二三四五六七八九十百千零\d]+$/.test(s))t='head'; // 光秃秃的卷号行
    out.push({t,s});
  }
  const BLOCK=/^(P|DIV|SECTION|UL|OL|DL|DD|DT|LI|H[1-6]|BLOCKQUOTE|TABLE|PRE|CENTER|HR|FIGURE|BR)$/;
  function walk(el,out,inPoem){
    let run=''; // 行内连续节点（文本、a、span、b、i…）攒成一段，遇到块级元素才落段
    const flush=()=>{if(norm(run))pushPara(out,inPoem?'poem':'p',run);run=''};
    for(const c of el.childNodes){
      if(c.nodeType===3){run+=c.nodeValue;continue}
      if(c.nodeType!==1)continue;
      const tag=c.tagName;
      if(!BLOCK.test(tag)){ // 行内元素：并入当前行
        if(tag==='IMG'){flush();pushPara(out,'p','〔图〕');continue}
        if(tag==='SUP')continue; // 脚注角标
        run+=textOf(c);continue;
      }
      flush();
      if(tag==='BR'||tag==='HR')continue;
      if(/^H[1-6]$/.test(tag)){pushPara(out,'head',c.textContent);continue}
      if(tag==='FIGURE'){pushPara(out,'p','〔图〕');continue}
      const cls=typeof c.className==='string'?c.className:'';
      if(POEM.test(cls)&&!inPoem){pushPara(out,'poem',textOf(c));continue} // 诗块整块合一段，行间换行
      if(tag==='P'||tag==='BLOCKQUOTE'||tag==='DD'||tag==='LI'||tag==='DT'||tag==='PRE'){
        const s=textOf(c);
        const tl=norm(s).length,ll=[...c.querySelectorAll('a')].reduce((a,x)=>a+norm(x.textContent).length,0);
        if(tl<60&&ll>=tl*0.6)continue; // 导航行：回目录／上一回／下一回
        if(/^(回目[录錄]|上一[回章]|下一[回章]|目[录錄])(\s|$)/.test(norm(s)))continue;
        const lines=s.split('\n').map(x=>x.trim()).filter(Boolean);
        const poemish=lines.length>=3&&lines.reduce((a,b)=>a+b.length,0)/lines.length<22;
        pushPara(out,poemish||inPoem?'poem':'p',s);
        continue;
      }
      // DIV/SECTION/UL/OL/DL/CENTER/TABLE：下钻
      walk(c,out,inPoem);
    }
    flush();
  }
  function paras(html,opt){
    opt=opt||{};
    const out=[];walk(root(html),out,false);
    // 页头残留：作者行、日期行、「本作品收录于…」、与章名相同的标题行
    const HEADJUNK=/^((作者|譯者|译者|作者小傳|作者小传)[：:]?\s*|[（(]?\d{4}年(\d{1,2}月(\d{1,2}日)?)?[。）)]?|本作品(收录|收錄)于.{0,80}|←|→)$/;
    while(out.length&&(HEADJUNK.test(norm(out[0].s))||(opt.title&&norm(out[0].s)===norm(opt.title))))out.shift();
    // 尾部的「注释／註釋／參考」小标题及其后内容不算正文（脚注本体已剥，只剩空标题）
    for(let i=out.length-1;i>=Math.max(0,out.length-3);i--){if(out[i].t==='head'&&/^(注释|註釋|注釋|参考|參考|参考文献|參考文獻|脚注|腳註)/.test(out[i].s)){out.length=i;break}}
    return out;
  }
  // 目录页 → 书型与章表
  function detect(html,page,templates){
    page=String(page||'').replace(/_/g,' ').trim();
    const tpls=(templates||[]).map(t=>typeof t==='string'?t:(t&&t.title)||'');
    const el=root(html);
    let ls=tocLinks(el,page);if(ls.length<3)ls=links(el,true).flat();
    if(tpls.some(t=>/Template:Versions$/i.test(t))){
      const vs=ls.filter(l=>l.page!==page);const dup=new Set(vs.map(v=>v.text)).size<vs.length;
      return{kind:'versions',chapters:[],versions:vs.map(l=>({title:dup?l.page:l.text,page:l.page})),intro:[]};
    }
    const sub=ls.filter(l=>l.page.startsWith(page+'/'));
    const top=ls.filter(l=>!l.page.startsWith(page+'/')&&l.page!==page);
    const own=paras(html);
    const ownLen=own.reduce((a,p)=>a+p.s.length,0);
    const mk=(arr)=>arr.map((l,i)=>({n:i+1,title:l.text,page:l.page,extra:/^(序|自序|自敘|自叙|序言|小引|凡例|附錄|附录|後記|后记|跋|題辭|题辞|作者小傳|作者小传|作者自志|前言|引言|例言|總目|总目)|(序|小引|凡例|附錄|附录|後記|后记|跋|題辭|题辞|前言|引言|例言|總目|总目)$/.test(l.text)}));
    if(sub.length>=3&&sub.length>=top.length)return{kind:'subpages',chapters:mk(sub),versions:[],intro:[]};
    if(top.length+sub.length>=5){ // 合集至少 5 篇：上一篇／下一篇＋版本链接这种 3–4 条的小列表不算 // 合集：正文里的作品链接按序即篇目；页面自带的序言留作 intro
      const all=ls.filter(l=>l.page!==page);
      return{kind:'collection',chapters:mk(all),versions:[],intro:ownLen>=300?own:[]};
    }
    return{kind:'single',chapters:[{n:1,title:page.split('/').pop(),page,extra:false}],versions:[],intro:[]};
  }
  return{url,detect,paras,links:html=>links(root(html),true).flat(),pageOf,_root:root};
})();
