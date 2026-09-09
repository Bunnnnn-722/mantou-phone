/* 场景装帧总控：雨夜(yuye)/雪日(xueri)/深海(shenhai)/白日梦(bairimeng)。
   每个场景=一块垫在 .wallpaper 上的画布,只在自己的 data-palette 下跑;不在前台即停;reduced-motion 只画一帧。
   装帧页里每张场景卡也各跑一份缩小版(只在装帧屏打开时跑),卡片本身就是效果预览。
   雨/雪可换背景图与亮度(IndexedDB scene.<key>.bg / .bright),并按图片主色自动映射主题色(scene.<key>.accent 可手调)。
   视觉承自 ~/codex/{rain,snow,deep-sea-light-study,cloud-post}-chat.html(Codex 生成);
   雨窗算法在 js/scene-rain-lib.js(Codrops RainEffect),深海焦散改自 WaterThreeJS(MIT),云层为独立实现。
   能量:Scenes.busy(±1) 与 Sky.busy 同源,api.js 队列推;各场景自定义"有请求在跑"的反应。 */
const Scenes=(()=>{
  const phone=document.getElementById('phone');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const MAP={yuye:'rain',xueri:'snow',shenhai:'ocean',bairimeng:'cloud'};
  const CARD={rain:'palYuye',snow:'palXueri',ocean:'palShenhai',cloud:'palBairimeng'};
  const loadImg=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
  const canFilter=(()=>{try{return 'filter' in document.createElement('canvas').getContext('2d')}catch(e){return false}})();
  /* 模糊:支持 ctx.filter 就直接糊;不支持(旧 Safari)就先缩小再放大,效果接近 */
  function blurred(img,w,h,blur){
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');
    if(blur>0&&canFilter){c.filter=`blur(${blur}px)`;c.drawImage(img,-blur*2,-blur*2,w+blur*4,h+blur*4);c.filter='none';return cv}
    if(blur>0){const k=Math.max(2,Math.round(blur/1.2));const s=document.createElement('canvas');s.width=Math.max(1,Math.round(w/k));s.height=Math.max(1,Math.round(h/k));s.getContext('2d').drawImage(img,0,0,s.width,s.height);c.drawImage(s,0,0,w,h);return cv}
    c.drawImage(img,0,0,w,h);return cv;
  }
  function cover(ctx,img,w,h){const s=Math.max(w/img.width,h/img.height);ctx.drawImage(img,(w-img.width*s)/2,(h-img.height*s)/2,img.width*s,img.height*s)}
  const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};

  /* 宿主:主壁纸(装在 .wallpaper 之上,量 #phone) 或 装帧卡(装在卡里,量卡) */
  function hostMain(){return {el:phone,card:false,mount:c=>phone.querySelector('.wallpaper').after(c)}}
  function hostCard(id){const el=document.getElementById(id);return el?{el,card:true,mount:c=>el.prepend(c)}:null}
  function mkCanvas(host,key){const c=document.createElement('canvas');c.className='scene off';c.dataset.scene=key;c.setAttribute('aria-hidden','true');host.mount(c);return c}
  function sizeOf(host){const r=host.el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}}

  /* ── 用户背景图、亮度、主色(雨/雪) ── */
  const Prefs={
    async image(key){try{return (await DB.get('scene.'+key+'.bg'))||null}catch(e){return null}},
    async setImage(key,dataURL){try{if(dataURL)await DB.set('scene.'+key+'.bg',dataURL);else await DB.del('scene.'+key+'.bg')}catch(e){}},
    async bright(key){try{const v=await DB.get('scene.'+key+'.bright');return typeof v==='number'?v:100}catch(e){return 100}},
    async setBright(key,v){try{await DB.set('scene.'+key+'.bright',v)}catch(e){}},
    async accent(key){try{return (await DB.get('scene.'+key+'.accent'))||null}catch(e){return null}},
    async setAccent(key,hex){try{if(hex)await DB.set('scene.'+key+'.accent',hex);else await DB.del('scene.'+key+'.accent')}catch(e){}}
  };
  function fileToDataURL(file,max){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{const i=new Image();i.onload=()=>{const s=Math.min(1,max/Math.max(i.width,i.height));const c=document.createElement('canvas');c.width=Math.round(i.width*s);c.height=Math.round(i.height*s);c.getContext('2d').drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.86))};i.onerror=rej;i.src=r.result};r.onerror=rej;r.readAsDataURL(file)})}

  /* ── 颜色小工具:图片主色 → 色相 → 一套令牌 ── */
  function dominant(img){
    const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');x.drawImage(img,0,0,32,32);
    const d=x.getImageData(0,0,32,32).data;let sum=[0,0,0],wt=0;
    for(let i=0;i<d.length;i+=4){const mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]);const w=.25+(mx-mn)/255;sum[0]+=d[i]*w;sum[1]+=d[i+1]*w;sum[2]+=d[i+2]*w;wt+=w}
    return sum.map(v=>v/wt);
  }
  function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4}h*=60}return [h,s*100,l*100]}
  function hsl2hex(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return '#'+[f(0),f(8),f(4)].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')}
  function hex2hsl(hex){const n=parseInt(hex.slice(1),16);return rgb2hsl(n>>16&255,n>>8&255,n&255)}
  /* 由色相派生整套令牌:深色(雨夜)与浅色(雪日)各一版;饱和度跟着图片走但压在一个舒服的区间 */
  function tokensFor(key,h,s){
    s=Math.max(18,Math.min(48,s));
    if(key==='rain')return {'--jade':hsl2hex(h,s,74),'--on-jade':hsl2hex(h,30,12),'--bg':hsl2hex(h,s*.7,13),'--panel':hsl2hex(h,s*.6,18),'--panel-2':hsl2hex(h,s*.55,23),'--panel-3':hsl2hex(h,s*.7,9),
      '--sk-accent':`linear-gradient(135deg,${hsl2hex(h,s,84)},${hsl2hex(h,s,74)} 60%,${hsl2hex(h,s,64)})`,'--glass':`hsla(${h.toFixed(0)},${(s*.6).toFixed(0)}%,16%,.62)`};
    return {'--jade':hsl2hex(h,s*.8,44),'--bg':hsl2hex(h,s,92),'--panel':hsl2hex(h,s,97),'--panel-2':hsl2hex(h,s,94),'--panel-3':hsl2hex(h,s*.9,89),
      '--text':hsl2hex(h,s*.6,28),'--text-2':hsl2hex(h,s*.5,42),'--text-3':hsl2hex(h,s*.4,58),
      '--sk-accent':`linear-gradient(145deg,${hsl2hex(h,s*.7,56)},${hsl2hex(h,s*.8,44)})`,'--glass':`hsla(${h.toFixed(0)},${s.toFixed(0)}%,97%,.72)`};
  }
  const accent={rain:{auto:null,pick:null,applied:[]},snow:{auto:null,pick:null,applied:[]}}; // auto=图片算出的 hex,pick=用户手调 hex
  function currentHex(key){return accent[key].pick||accent[key].auto}
  function applyAccent(key){ // 只在该装帧生效时把令牌写到根元素上;别的装帧一律不碰
    const st=document.documentElement.style;const a=accent[key];
    for(const k of a.applied)st.removeProperty(k);a.applied=[];
    const hex=currentHex(key);if(!hex||MAP[document.documentElement.dataset.palette]!==key)return;
    const [h,s]=hex2hsl(hex);const t=tokensFor(key,h,s);for(const k in t){st.setProperty(k,t[k]);a.applied.push(k)}
    if(typeof syncThemeColor==='function')syncThemeColor();
    syncAccentUI(key);
  }
  function clearAccents(){for(const k in accent){const st=document.documentElement.style;for(const p of accent[k].applied)st.removeProperty(p);accent[k].applied=[]}}
  function syncAccentUI(key){const el=document.getElementById(key==='rain'?'accRain':'accSnow');if(el){const hex=currentHex(key);if(hex)el.value=hex;el.classList.toggle('auto',!accent[key].pick)}
    const tag=document.getElementById(key==='rain'?'accRainTag':'accSnowTag');if(tag)tag.textContent=accent[key].pick?'主色 · 手调':'主色 · 随图'}
  function accentFromImage(key,img){const [r,g,b]=dominant(img);const [h,s]=rgb2hsl(r,g,b);accent[key].auto=key==='rain'?hsl2hex(h,Math.max(18,Math.min(48,s)),74):hsl2hex(h,Math.max(18,Math.min(48,s))*.8,44);applyAccent(key)}

  /* ══════ 雨夜:窗上有雨(WebGL 折射 + 水滴模拟) ══════ */
  function Rain(host){
    const R=typeof RainLib!=='undefined'?RainLib:null;let cv,raindrops,renderer,assets,frame=null,last=0,w=0,h=0,on=false,bg=null,bgSrc='',bright=100,en=0;
    async function load(){if(assets)return assets;const [alpha,color]=await Promise.all([loadImg('scenes/rain-drop-alpha.png'),loadImg('scenes/rain-drop-color.png')]);assets={alpha,color};return assets}
    async function pickBg(){const custom=await Prefs.image('rain');const src=custom||'scenes/rain-city.jpg';if(src===bgSrc&&bg)return;bg=await loadImg(src);bgSrc=src;if(!host.card)accentFromImage('rain',bg)}
    function build(){
      if(!R)return;const s=sizeOf(host);if(!s.w||!s.h)return;w=s.w;h=s.h;cv.width=w;cv.height=h;
      const k=host.card?.45:1;
      raindrops=new R.Raindrops(w,h,1,assets.alpha,assets.color,{minR:9*k+3,maxR:32.4*k+6,maxDrops:Math.round(240*k),rainChance:.24,rainLimit:2,dropletsRate:Math.round(12*k),dropletsSize:[1.8,3.6],trailRate:1,trailScaleRange:[.2,.45],collisionRadius:.45,dropletsCleaningRadiusMultiplier:.28});
      for(let i=0;i<Math.min(650,w*h/1100);i++)raindrops.drawDroplet(R.random(w),R.random(h),R.random(1.8,3.6,n=>n*n)); // 先把窗淋湿
      for(let i=0;i<(host.card?8:16);i++)raindrops.addDrop(raindrops.createDrop({x:R.random(w),y:R.random(h),r:R.random(9,18.9)*k+3,momentum:i%4===0?2:0}));
      raindrops.clearCanvas();raindrops.updateDrops(1);
      const th=Math.round(384*bg.height/bg.width),fg=blurred(bg,384,th,.5),bgt=blurred(bg,384,th,8);
      if(renderer){renderer.width=w;renderer.height=h;renderer.canvasLiquid=raindrops.canvas;renderer.gl.gl.viewport(0,0,w,h);renderer.gl.createUniform('2f','resolution',w,h);setBg(fg,bgt,th)}
      else renderer=new R.RainRenderer(cv,raindrops.canvas,fg,bgt,null,{brightness:1.04,alphaMultiply:6,alphaSubtract:3,minRefraction:256,maxRefraction:512});
      energy(en);renderer.draw();
    }
    function setBg(fg,bgt,th){renderer.imageFg=fg;renderer.imageBg=bgt;renderer.textures[1].img=fg;renderer.textures[2].img=bgt;renderer.gl.createUniform('1f','textureRatio',384/th);renderer.updateTextures()}
    function loop(t){if(!on)return;if(t-last>=33){const dt=Math.min(2,(t-last)/16.667);last=t;raindrops.clearCanvas();raindrops.updateDrops(dt);renderer.draw()}frame=requestAnimationFrame(loop)}
    function applyBright(){if(cv)cv.style.filter=`brightness(${bright/100})`}
    async function start(){
      if(on)return;on=true;if(!cv)cv=mkCanvas(host,'rain');cv.classList.remove('off');host.el.classList.add('live');
      try{await load();await pickBg();bright=await Prefs.bright('rain')}catch(e){console.warn('雨夜素材未载入',e);return}
      if(!on)return;const s=sizeOf(host);if(!renderer||s.w!==w||s.h!==h)build();applyBright();
      if(reduced.matches)return;last=performance.now();frame=requestAnimationFrame(loop);
    }
    function stop(){on=false;cancelAnimationFrame(frame);frame=null;if(cv)cv.classList.add('off');host.el.classList.remove('live')}
    function resize(){if(on&&assets&&bg){const s=sizeOf(host);if(s.w&&s.h&&(!renderer||s.w!==w||s.h!==h))build()}} // 卡片在隐藏列表里先量到 0,等它显出来再建
    function energy(n){en=n;if(raindrops)raindrops.options.rainChance=.24+n*.3} // 有请求在跑:雨下得急一点
    async function setImage(){bgSrc='';await pickBg();if(on&&renderer)build()}
    function setBright(v){bright=v;applyBright()}
    return {start,stop,resize,energy,setImage,setBright,key:'rain'};
  }

  /* ══════ 雪日:雪落窗景(2D) ══════ */
  function Snow(host){
    let cv,ctx,on=false,frame=null,last=0,w=0,h=0,t=0,bg=null,bgSrc='',land=null,landKey='',bright=100,en=0;
    const rnd=mulberry(825);
    const flakes=Array.from({length:host.card?26:58},(_,i)=>{const n=host.card?26:58,z=i<n*.57?.25:i<n*.9?.6:1;return{x:rnd(),y:rnd(),z,r:(.55+rnd()*1.1)*z*2.5,speed:8+z*23+rnd()*9,phase:rnd()*6.28,sway:5+rnd()*12}});
    const sprites=[.25,.6,1].map(z=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.translate(32,32);if(z===1&&canFilter)x.filter='blur(2px)';x.strokeStyle='#f8fcff';x.lineWidth=z===.25?2:1.5;x.lineCap='round';for(let i=0;i<6;i++){x.save();x.rotate(i*Math.PI/3);x.beginPath();x.moveTo(0,0);x.lineTo(0,-23);for(const y of[-10,-17]){x.moveTo(0,y);x.lineTo(-5,y-5);x.moveTo(0,y);x.lineTo(5,y-5)}x.stroke();x.restore()}return c});
    async function pickBg(){const custom=await Prefs.image('snow');const src=custom||'scenes/snow-default.jpg';if(src===bgSrc&&bg)return;bg=await loadImg(src);bgSrc=src;landKey='';if(!host.card)accentFromImage('snow',bg)}
    function landscape(){
      if(landKey===w+':'+h)return;landKey=w+':'+h;land=document.createElement('canvas');land.width=w;land.height=h;const lc=land.getContext('2d');
      if(bg){const pad=24,big=document.createElement('canvas');big.width=w+pad*2;big.height=h+pad*2;cover(big.getContext('2d'),bg,big.width,big.height);lc.drawImage(blurred(big,big.width,big.height,9),-pad,-pad);lc.fillStyle='#edf4fa24';lc.fillRect(0,0,w,h);return}
      const g=lc.createLinearGradient(0,0,w,h);g.addColorStop(0,'#c1d3e6');g.addColorStop(.5,'#a4bdd5');g.addColorStop(1,'#829eb9');lc.fillStyle=g;lc.fillRect(0,0,w,h);
      lc.save();if(canFilter)lc.filter='blur(12px)';lc.strokeStyle='#304d6870';lc.lineCap='round';
      const branch=(x,y,len,angle,width,depth)=>{const xx=x+Math.sin(angle)*len,yy=y-Math.cos(angle)*len;lc.lineWidth=width;lc.beginPath();lc.moveTo(x,y);lc.quadraticCurveTo(x+Math.sin(angle-.12)*len*.5,y-len*.45,xx,yy);lc.stroke();if(depth>0){branch(xx,yy,len*.7,angle-.52,width*.55,depth-1);branch(xx,yy,len*.64,angle+.65,width*.5,depth-1)}};
      branch(w*.22,h*1.25,h*.65,.22,25,3);branch(w*1.12,h*1.05,h*.58,-.45,19,3);lc.restore();
      const haze=lc.createLinearGradient(0,0,w,0);haze.addColorStop(0,'#eaf3fa25');haze.addColorStop(.5,'#d9e8f34a');haze.addColorStop(1,'#eaf3fa10');lc.fillStyle=haze;lc.fillRect(0,0,w,h);
    }
    function draw(){
      if(!w||!h)return;landscape();ctx.clearRect(0,0,w,h);ctx.drawImage(land,0,0);
      const sc=host.card?.6:1;
      for(const f of flakes){
        const x=((f.x*w+t*(2+f.z*3)+Math.sin(t*.23+f.phase)*f.sway+Math.sin(t*.09+f.phase*2)*9)%(w+30)+w+30)%(w+30)-15,y=(f.y*(h+40)+t*f.speed)%(h+40)-20;
        const sz=(f.z===.25?4+f.r*3:f.z===.6?10+f.r*5:18+f.r*5)*sc;ctx.globalAlpha=f.z===.25?.5:f.z===.6?.78:.65;
        ctx.drawImage(sprites[f.z===.25?0:f.z===.6?1:2],x-sz/2,y-sz/2,sz,sz);
      }
      ctx.globalAlpha=1;
    }
    function loop(now){if(!on)return;if(now-last>33){t+=Math.min((now-last)/1000,.12)*(1+en*.7);draw();last=now}frame=requestAnimationFrame(loop)}
    function fit(){const s=sizeOf(host);if(!s.w||!s.h)return;if(s.w!==w||s.h!==h){w=s.w;h=s.h;cv.width=w;cv.height=h;landKey=''}}
    function applyBright(){if(cv)cv.style.filter=`brightness(${bright/100})`}
    async function start(){
      if(on)return;on=true;if(!cv){cv=mkCanvas(host,'snow');ctx=cv.getContext('2d')}cv.classList.remove('off');host.el.classList.add('live');
      try{await pickBg();bright=await Prefs.bright('snow')}catch(e){console.warn('雪日背景未载入',e);bg=null}
      if(!on)return;fit();applyBright();draw();
      if(reduced.matches)return;last=performance.now();frame=requestAnimationFrame(loop);
    }
    function stop(){on=false;cancelAnimationFrame(frame);frame=null;if(cv)cv.classList.add('off');host.el.classList.remove('live')}
    function resize(){if(on){fit();draw()}}
    function energy(n){en=n}
    async function setImage(){bgSrc='';await pickBg();if(on){landKey='';draw()}}
    function setBright(v){bright=v;applyBright()}
    return {start,stop,resize,energy,setImage,setBright,key:'snow'};
  }

  /* ══════ 深海:海面之下的焦散光柱 + 浮游微粒(WebGL + 2D 合成) ══════ */
  function Ocean(host){
    let cv,ctx,on=false,frame=null,last=0,w=0,h=0,sec=0,gl=null,water,soft,sctx,uRes,uTime,en=0;
    const rnd=mulberry(825);const dots=Array.from({length:17},()=>({x:rnd(),y:rnd(),z:.2+rnd()*.8,p:rnd()*6.28}));
    const FRAG=`precision highp float;uniform vec2 resolution;uniform float time;
float caustics(vec2 uv,float t){vec2 p=mod(uv*6.2831853,6.2831853)-250.0;vec2 i=vec2(p);float c=1.0;float inten=0.0045;
 for(int n=0;n<3;n++){float tt=t*(1.0-(3.5/float(n+1)));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));c+=1.0/length(vec2(p.x/(sin(i.x+tt)/inten),p.y/(cos(i.y+tt)/inten)));}
 c/=3.0;c=1.17-pow(c,1.4);float v=pow(abs(c),8.0);return clamp(v,0.0,1.0);}
void main(){vec2 uv=gl_FragCoord.xy/resolution;float depth=1.-uv.y;float t=time*.22;float center=.5;float projected=center+(uv.x-center)/(1.+depth*.7);float acc=0.;
 for(int j=0;j<20;j++){float z=(float(j)+.5)/20.;float wave=sin(depth*4.-t*.9+z*3.)*.009+sin(depth*7.+t*.6-z*4.)*.005;vec2 sp=vec2((projected+wave)*2.4,z*.46+depth*.19-t*.055);float light=caustics(sp,t*.85);acc+=light*exp(-z*.9);}
 acc/=12.;float key=exp(-pow((uv.x-center)/(.34+depth*.34),2.))*exp(-depth*2.7);float glow=exp(-pow((uv.x-center)/.24,2.)-depth*13.);
 float rays=pow(max(acc,0.),.85)*1.15*key;float crown=caustics(vec2(uv.x*1.8,depth*.32+t*.015),t*.6);float surface=crown*exp(-depth*30.)*.11;
 vec3 base=mix(vec3(.025,.105,.15),vec3(.012,.035,.058),smoothstep(0.,1.,depth));vec3 col=base+vec3(.15,.30,.34)*key*.65+vec3(.28,.49,.53)*(rays+glow*.16+surface);gl_FragColor=vec4(col,1.);}`;
    function initGL(){
      water=document.createElement('canvas');try{gl=water.getContext('webgl',{alpha:false,antialias:false})}catch(e){gl=null}if(!gl)return;
      try{const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(o));return o};
        const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(p);gl.useProgram(p);
        const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
        uRes=gl.getUniformLocation(p,'resolution');uTime=gl.getUniformLocation(p,'time')}catch(e){console.warn('深海着色器失败',e);gl=null}
      soft=document.createElement('canvas');sctx=soft.getContext('2d');
    }
    function draw(){
      if(!w||!h)return;ctx.clearRect(0,0,w,h);
      if(gl){
        const rw=Math.min(host.card?260:480,Math.round(w*.75)),rh=Math.round(rw*h/w);
        if(water.width!==rw||water.height!==rh){water.width=rw;water.height=rh;gl.viewport(0,0,rw,rh)}
        gl.uniform2f(uRes,rw,rh);gl.uniform1f(uTime,sec);gl.drawArrays(gl.TRIANGLES,0,6);ctx.drawImage(water,0,0,w,h);
        if(canFilter){ // 海面附近再糊一层,光柱边缘柔和
          if(soft.width!==rw||soft.height!==rh){soft.width=rw;soft.height=rh}
          sctx.clearRect(0,0,rw,rh);sctx.globalCompositeOperation='source-over';sctx.filter='blur(7px)';sctx.drawImage(water,-10,-10,rw+20,rh+20);sctx.filter='none';
          const fade=sctx.createLinearGradient(0,0,0,rh*.48);fade.addColorStop(0,'rgba(0,0,0,.9)');fade.addColorStop(.5,'rgba(0,0,0,.6)');fade.addColorStop(1,'rgba(0,0,0,0)');
          sctx.globalCompositeOperation='destination-in';sctx.fillStyle=fade;sctx.fillRect(0,0,rw,rh);sctx.globalCompositeOperation='source-over';ctx.drawImage(soft,0,0,w,h);
        }
      }else{const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#0b2d41');g.addColorStop(1,'#03101c');ctx.fillStyle=g;ctx.fillRect(0,0,w,h)}
      ctx.save();ctx.fillStyle='#c4e4e9';
      for(const p of dots){const x=p.x*w+Math.sin(sec*.12+p.p)*7,y=((p.y*h-sec*(.5+p.z*.6))%h+h)%h;const light=Math.exp(-Math.pow((x/w-.5)/.4,2))*Math.exp(-y/h*2.7);ctx.globalAlpha=.02+light*.27;ctx.beginPath();ctx.ellipse(x,y,.35+p.z*.4,.5+p.z*.5,p.p,0,Math.PI*2);ctx.fill()}
      ctx.restore();
    }
    function loop(now){if(!on)return;if(now-last>40){sec+=Math.min((now-last)/1000,.12)*(1+en*.6);draw();last=now}frame=requestAnimationFrame(loop)}
    function fit(){const s=sizeOf(host);if(!s.w||!s.h)return;if(s.w!==w||s.h!==h){w=s.w;h=s.h;cv.width=w;cv.height=h}}
    function start(){if(on)return;on=true;if(!cv){cv=mkCanvas(host,'ocean');ctx=cv.getContext('2d');initGL()}cv.classList.remove('off');host.el.classList.add('live');fit();draw();if(reduced.matches)return;last=performance.now();frame=requestAnimationFrame(loop)}
    function stop(){on=false;cancelAnimationFrame(frame);frame=null;if(cv)cv.classList.add('off');host.el.classList.remove('live')}
    function resize(){if(on){fit();draw()}}
    function energy(n){en=n}
    return {start,stop,resize,energy,key:'ocean'};
  }

  /* ══════ 白日梦:蓝白两色的抖动云层(WebGL) ══════ */
  function Cloud(host){
    let cv,gl=null,on=false,frame=null,last=0,time=0,uRes,uTime,w=0,h=0,en=0;
    const FRAG=`precision mediump float;uniform vec2 u_resolution;uniform float u_time;
float lattice(vec2 cell){return fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);}
float field(vec2 at){vec2 base=floor(at),f=fract(at);vec2 ease=f*f*f*(f*(f*6.0-15.0)+10.0);float south=mix(lattice(base),lattice(base+vec2(1.,0.)),ease.x);float north=mix(lattice(base+vec2(0.,1.)),lattice(base+vec2(1.,1.)),ease.x);return mix(south,north,ease.y);}
void main(){vec2 uv=gl_FragCoord.xy/u_resolution.y;float time=u_time*2.0;vec2 drift=vec2(time*.013,time*.004);vec2 domain=uv*2.65+drift;
 vec2 bend=vec2(field(domain*.72+vec2(8.1,2.4)),field(domain*.72+vec2(3.2,9.7)))-.5;domain+=bend*.48;
 float vapor=field(domain)*.57;vapor+=field(domain*2.13+vec2(7.3,-time*.009))*.27;vapor+=field(domain*4.37+vec2(-3.8,time*.012))*.12;vapor+=field(domain*8.91+vec2(12.6,2.1))*.04;
 float shade=smoothstep(.27,.73,vapor);vec2 pixel=floor(gl_FragCoord.xy);float threshold=0.0;float weight=.25;
 for(int level=0;level<3;level++){vec2 bit=mod(pixel,2.0);float code=2.0*abs(bit.x-bit.y)+bit.y;threshold+=code*weight;weight*=.25;pixel=floor(pixel*.5);}
 float ink=step(threshold+.0078125,shade);gl_FragColor=vec4(mix(vec3(.369,.651,.898),vec3(1.),ink),1.);}`;
    function initGL(){
      try{gl=cv.getContext('webgl',{alpha:false,antialias:false})}catch(e){gl=null}if(!gl)return;
      try{const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(o));return o};
        const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,'attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}'));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(p);gl.useProgram(p);
        const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const a=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
        uRes=gl.getUniformLocation(p,'u_resolution');uTime=gl.getUniformLocation(p,'u_time')}catch(e){console.warn('云层着色器失败',e);gl=null}
    }
    function draw(){if(!gl||!w||!h)return;gl.uniform2f(uRes,w,h);gl.uniform1f(uTime,time);gl.drawArrays(gl.TRIANGLES,0,6)}
    function fit(){const s=sizeOf(host);if(!s.w||!s.h)return;if(s.w!==w||s.h!==h){w=s.w;h=s.h;cv.width=w;cv.height=h;if(gl)gl.viewport(0,0,w,h)}}
    function loop(now){if(!on)return;if(now-last>40){time+=Math.min((now-last)/1000,.1)*(1+en*.8);draw();last=now}frame=requestAnimationFrame(loop)}
    function start(){if(on)return;on=true;if(!cv){cv=mkCanvas(host,'cloud');initGL()}cv.classList.remove('off');host.el.classList.add('live');fit();draw();if(reduced.matches)return;last=performance.now();frame=requestAnimationFrame(loop)}
    function stop(){on=false;cancelAnimationFrame(frame);frame=null;if(cv)cv.classList.add('off');host.el.classList.remove('live')}
    function resize(){if(on){fit();draw()}}
    function energy(n){en=n}
    return {start,stop,resize,energy,key:'cloud'};
  }

  /* ── 总控:主壁纸一份 + 装帧卡各一份 ── */
  const F={rain:Rain,snow:Snow,ocean:Ocean,cloud:Cloud};
  const main={},cards={};
  for(const k in F){main[k]=F[k](hostMain());const hc=hostCard(CARD[k]);if(hc)cards[k]=F[k](hc)}
  const active=()=>MAP[document.documentElement.dataset.palette]||null;
  const bindingOpen=()=>{const b=document.getElementById('binding');return b&&b.classList.contains('active')};
  function sync(){
    const key=active(),vis=!document.hidden;
    for(const k in main){if(k===key&&vis)main[k].start();else main[k].stop()}
    for(const k in cards){if(vis&&bindingOpen())cards[k].start();else cards[k].stop()}
    phone.classList.toggle('has-scene',!!key);
    if(key==='rain'||key==='snow')applyAccent(key);else clearAccents();
  }
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-palette','data-theme']});
  const bEl=document.getElementById('binding');if(bEl)new MutationObserver(sync).observe(bEl,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  if('ResizeObserver' in window){
    new ResizeObserver(()=>{const k=active();if(k)main[k].resize()}).observe(phone);
    for(const k in cards){const el=document.getElementById(CARD[k]);if(el)new ResizeObserver(()=>cards[k].resize()).observe(el)}
  }else addEventListener('resize',()=>{const k=active();if(k)main[k].resize();for(const c in cards)cards[c].resize()});
  sync();

  /* 能量:与 Sky 同源 */
  let running=0;
  function busy(delta){running=Math.max(0,running+delta);const n=running?1:0;for(const k in main)main[k].energy(n);if(typeof Sky!=='undefined')Sky.busy(delta)}

  /* 装帧卡控件:换图 / 恢复原图 / 亮度 / 主色 */
  const both=(key,fn)=>{const ps=[];if(main[key]&&main[key][fn])ps.push(main[key][fn]());if(cards[key]&&cards[key][fn])ps.push(cards[key][fn]());return Promise.all(ps)};
  async function pickImage(key,input){
    const f=input.files&&input.files[0];if(!f)return;
    try{const url=await fileToDataURL(f,1600);await Prefs.setImage(key,url);await both(key,'setImage');if(typeof toast==='function')toast('背景已换成你的图片，只存在本机。主色已随图重算。')}
    catch(e){if(typeof toast==='function')toast('图片没读出来，换一张 JPG／PNG 试试。')}
    input.value='';
  }
  async function resetImage(key){await Prefs.setImage(key,null);await both(key,'setImage');if(typeof toast==='function')toast('已恢复原图。')}
  let brtTimer=null;
  function setBright(key,v){v=Number(v);main[key].setBright(v);if(cards[key])cards[key].setBright(v);clearTimeout(brtTimer);brtTimer=setTimeout(()=>Prefs.setBright(key,v),300)}
  let accTimer=null;
  function setAccent(key,hex){accent[key].pick=hex;applyAccent(key);syncAccentUI(key);clearTimeout(accTimer);accTimer=setTimeout(()=>Prefs.setAccent(key,hex),300)}
  async function autoAccent(key){accent[key].pick=null;await Prefs.setAccent(key,null);applyAccent(key);syncAccentUI(key);if(typeof toast==='function')toast('主色已改回随图片自动。')}
  (async()=>{
    for(const key of ['rain','snow']){
      const el=document.getElementById(key==='rain'?'brtRain':'brtSnow');if(el)el.value=await Prefs.bright(key);
      accent[key].pick=await Prefs.accent(key);
      if(!accent[key].auto){try{const custom=await Prefs.image(key);const img=await loadImg(custom||(key==='rain'?'scenes/rain-city.jpg':'scenes/snow-default.jpg'));accentFromImage(key,img)}catch(e){}}
      syncAccentUI(key);
    }
  })();

  return {busy,pickImage,resetImage,setBright,setAccent,autoAccent,_main:main,_cards:cards,active};
})();
