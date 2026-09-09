/* 通用排版封面引擎（十六式 × 八色池）：浮生记条目卡与阅读书架共用。
   Cover.html({id,title,tag,src,author,ts,ex,mode:'feed'|'book',tpl}) → 一张 .xc 封面的 HTML
   式样与配色只由 id 决定（同一条／同一本永远一张脸）；book 模式不印日期／编号／索引，落款只写作者。 */
const Cover=(()=>{
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const PALS=['xp-zhu','xp-gao','xp-yue','xp-hu','xp-ye','xp-mo','xp-lan','xp-ou'];
  const TAGS={WP:'写作提示',SP:'简单提示',EU:'既有宇宙',CW:'限制写作',TT:'主题周四',RF:'现实虚构',PI:'受提示启发',PM:'求提示',MP:'媒体提示',IP:'图片提示',CC:'求点评',OT:'闲聊',WW:'练笔'};
  const BUCKETS={ // 中文按字数（含空格与标点）分短／中／中长／长；英文按词数。书脊 t13 与打字机 t6 左侧占位大，只给 12 字以内
    cjk:{s:['t1','t15','t8','t10'],m:['t2','t5','t7','t13','t12','t6'],m2:['t2','t5','t7','t12'],l:['t9','t17','t19','t20','t5','t7']},
    lat:{s:['t15','t8','t10','t5'],m:['t5','t7','t13','t12','t6','t17'],l:['t9','t19','t20','t7','t5']}
  };
  function hash(str){let h=2166136261;str=String(str||'');for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  // 中文判定连标点一起数：「弯道超车」这种被括起来的短题也算中文
  const isCJK=t=>{t=String(t||'');const c=(t.match(/[぀-ヿ㐀-鿿豈-﫿　-〿！-｠]/g)||[]).length;return c>=Math.max(1,t.replace(/\s/g,'').length*0.4)};
  // 式样与配色只由条目 id 决定：同一条在信息流／赞过／详情三处永远一张脸
  function pickCover(it,title){
    const cjk=isCJK(title);
    const n=cjk?title.length:title.split(/\s+/).filter(Boolean).length;
    const b=BUCKETS[cjk?'cjk':'lat'];
    const list=cjk?(n<=7?b.s:n<=12?b.m:n<=16?b.m2:b.l):(n<=5?b.s:n<=14?b.m:b.l);
    const h=hash(it.id);
    const tpl=(it._tpl&&/^t\d+$/.test(it._tpl))?it._tpl:list[(h>>>3)%list.length]; // _tpl 只给调试与打样用，不入库
    return{tpl,pal:PALS[h%PALS.length],cjk,long:cjk?n>16:n>14};
  }
  const dateCN=ts=>{const d=new Date(ts||Date.now());return (d.getMonth()+1)+'月'+d.getDate()+'日'};
  const ini=s=>{const t=String(s||'').replace(/^r\//,'').trim();const m=t.match(/[\u3400-\u9fff]/);return (m?m[0]:(Array.from(t)[0]||'？')).toUpperCase()};
  function html(o){
    o=o||{};
    const it={id:o.id||'',_tpl:o.tpl};
    const title=String(o.title||'（无标题）');
    const cv=pickCover(it,title);
    const book=o.mode==='book';
    const tag=o.tag||'';
    const src=book?(o.author||o.src||''):(o.src||'未知源'),T=esc(title),S=esc(src),tagH=tag?`<div class="xk">${esc(tag)}</div>`:'';
    const ex=esc(String(o.ex||'').replace(/\s+/g,' ').trim().slice(0,cv.cjk?80:180));
    const au=o.author?esc(String(o.author).slice(0,24)):'';
    const no=String(1+hash(it.id)%899).padStart(3,'0');
    const date=book?'':dateCN(o.ts);
    const idx=book?(au||S):esc(o.src||'')+(au?' · '+au:'');
    const noTxt=book?'':'NO.'+no;
    const no2=book?esc(ini(src)):esc(ini(src))+'-'+no;
    let inner='';
    switch(cv.tpl){
      case 't1':inner=`<span class="xr"></span><div class="xin"><div class="xttl">${T}</div></div><span class="xseal">${esc(ini(src))}</span>`;break;
      case 't2':inner=`<span class="xflag"></span><div class="xin"><div class="xttl">${T}</div></div><div class="xsig">${S}</div>`;break;
      case 't5':inner=`<div class="xin">${tagH||`<div class="xk">${S}</div>`}<div class="xttl">${T}</div><div class="xg"></div></div>${tagH?`<div class="xsig">${S}</div>`:''}`;break;
      case 't6':inner=`<span class="xnums"><span>01</span><span>02</span><span>03</span><span>04</span><span>05</span></span><span class="xr2"></span><div class="xin">${tagH}<div class="xttl">${T}<span class="xcur"></span></div></div>`;break;
      case 't7':inner=`<span class="xb"></span><span class="xh"><i></i><i></i><i></i><i></i></span><div class="xin"><div class="xttl">${T}</div><div class="xsub">${tag?esc(tag)+' · ':''}${au||S}</div></div>`;break;
      case 't8':inner=`<span class="xfr"></span><div class="xin"><div class="xk">${esc(tag||'扉 页')}</div><div class="xttl">${T}</div><div class="xhr"></div><div class="xsub">${S}</div></div>`;break;
      case 't9':inner=`<div class="xhead"><span class="xhn">${S}</span><small>${date}</small></div><div class="xin"><div class="xttl">${T}</div>${ex?`<div class="xcols">${ex}</div>`:''}</div>`;break;
      case 't10':inner=`<span class="xtape"></span><div class="xnote">${tagH}<div class="xttl">${T}</div><div class="xsub">${S}</div></div>`;break;
      case 't12':inner=`<span class="xperf"></span><div class="xin">${tagH}<div class="xttl">${T}</div></div><span class="xst"><span>${esc(cv.cjk?src.slice(0,4):ini(src))}</span><span>${date||esc(src.slice(0,6))}</span></span>`;break;
      case 't13':inner=`<div class="xspine"><span>${S}</span></div><div class="xin">${tagH}<div class="xttl">${T}</div></div>${au?`<div class="xsig">${au}</div>`:''}`;break;
      case 't15':inner=`<div class="xin"><div class="xk">${esc(tag||'灯 下')}</div><div class="xttl">${T}</div><div class="xhr"></div></div><div class="xsig">${S}</div>`;break;
      case 't17':inner=`<span class="xfr"></span><span class="xno">${noTxt}</span><div class="xin"><div class="xk">${esc(tag||'藏 书 票')}</div><div class="xttl">${T}</div><div class="xsub">${S}</div></div>`;break;
      case 't19':inner=`<span class="xtop"></span><span class="xno2">${no2}</span><div class="xin"><div class="xttl">${T}</div><div class="xsub">${book?idx:'索引：'+idx}</div></div>`;break; // 打孔装饰放大后像两个没头没脑的圈，去掉
      case 't20':inner=`<div class="xin">${tagH||`<div class="xk">版 权 页</div>`}<div class="xttl">${T}</div></div><div class="xfine">${book?'著者：'+(au||S)+'<br>版本：维基文库':'来源：'+S+'<br>'+(au?'作者：'+au+'<br>':'')+'日期：'+date}</div>`;break;
      default:inner=`<div class="xin">${tagH}<div class="xttl">${T}</div></div><div class="xsig">${S}</div>`;
    }
    return `<div class="xc xc-${cv.tpl} ${cv.pal}${cv.cjk?'':' lat'}">${inner}</div>`;
  }
  return{html,pick:pickCover,hash,isCJK,PALS};
})();
