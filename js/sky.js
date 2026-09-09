/* 星空装帧（xingkong）：壁纸层真星空 + 装帧卡小星空。
   视觉承自 ~/codex/starry-chat.html（星点视差/眨眼/星轨/斜向流星/淡星云）。
   规则：只在 data-palette="xingkong" 时跑；页面不在前台就停；prefers-reduced-motion 只画一帧。
   视差来源：桌面=鼠标位置；手机=陀螺仪（iOS 13+ 要在用户点击里申请权限，见 askGyro）。
   能量：Sky.energy(n) 0=静候 1=有请求在跑（星轨拉出、流星变密），api.js 的任务队列会推它。 */
const Sky=(()=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const phone=document.getElementById('phone');
  let seed=825; const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  const mkStars=n=>Array.from({length:n},()=>({x:random(),y:random(),r:.15+random()*.45,z:.2+random()*.8,p:random()*6.28}));

  /* 一块星空 = 一个画布 + 自己的星表；主壁纸与装帧卡各一块 */
  function makeField(canvas,opt){
    const ctx=canvas.getContext('2d');
    const stars=mkStars(opt.stars);
    const f={canvas,ctx,stars,w:0,h:0,phase:random()*50,energy:0,target:0,last:0,frame:null,meteors:[],mClock:0,mNext:opt.meteorGap(),on:false};
    f.resize=()=>{
      const r=(opt.host||canvas).getBoundingClientRect();
      f.w=Math.round(r.width);f.h=Math.round(r.height); if(!f.w||!f.h)return;
      const d=Math.min(devicePixelRatio||1,2);
      canvas.width=f.w*d;canvas.height=f.h*d;ctx.setTransform(d,0,0,d,0,0);f.draw();
    };
    f.draw=()=>{
      const {w,h,phase,energy}=f; if(!w||!h)return;
      ctx.clearRect(0,0,w,h);
      if(opt.nebula){
        for(let i=0;i<6;i++){
          const x=w*(.12+i*.15),y=h*(.75-i*.1)+Math.sin(phase*.2+i)*12;
          const g=ctx.createRadialGradient(x,y,0,x,y,w*.26);
          g.addColorStop(0,i%2?'#6661b512':'#537cb815');g.addColorStop(1,'#10162600');
          ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
        }
      }
      const px=pointer.x,py=pointer.y;
      for(const s of stars){
        const x=((s.x*w+phase*s.z*4+(px-.5)*s.z*opt.parallax)%w+w)%w;
        const y=((s.y*h+Math.sin(phase*.15+s.p)*3+(py-.5)*s.z*opt.parallax*.7)%h+h)%h;
        const alpha=(.3+.55*(.5+.5*Math.sin(phase*(.7+energy)+s.p)))*opt.alpha;
        ctx.globalAlpha=alpha;ctx.fillStyle=(s.p*10|0)%5===0?'#bcc3ff':'#e2ebff';
        if(s.r>.5){ // 只有最亮的一成带一圈很窄的光晕
          const g=ctx.createRadialGradient(x,y,0,x,y,3);g.addColorStop(0,'#b6c9ff5c');g.addColorStop(1,'#b6c9ff00');
          ctx.fillStyle=g;ctx.fillRect(x-3,y-3,6,6);ctx.fillStyle='#e2ebff';
        }
        ctx.beginPath();ctx.arc(x,y,s.r,0,Math.PI*2);ctx.fill();
        if(energy>.05){ // 有请求在跑：拉出短短星轨
          ctx.strokeStyle='#afc5ff';ctx.lineWidth=s.r*.6;ctx.globalAlpha=alpha*.4*energy;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-energy*s.z*22,y+energy*s.z*8);ctx.stroke();
        }
      }
      ctx.globalAlpha=1;
    };
    f.meteor=dt=>{
      const {w,h}=f; f.mClock+=dt;
      if(f.mClock>=f.mNext){
        const n=random()<.3?2:1;
        for(let i=0;i<n;i++)f.meteors.push({x:.25+random()*.65,y:.03+random()*.35,age:-i*.45,life:1.3+random()*.7});
        f.mNext=f.mClock+(f.energy>.5?opt.meteorGap()*.35:opt.meteorGap());
      }
      f.meteors=f.meteors.filter(m=>m.age<m.life);
      for(const m of f.meteors){
        m.age+=dt;if(m.age<0)continue;
        const p=Math.min(m.age/m.life,1),travel=p*Math.min(w*.5,330),x=m.x*w-travel,y=m.y*h+travel*.48,len=Math.min(w*.2,110);
        ctx.globalAlpha=Math.sin(p*Math.PI)*.65*opt.alpha;
        const t=ctx.createLinearGradient(x,y,x+len,y-len*.48);
        t.addColorStop(0,'#e0ebff');t.addColorStop(.18,'#acc7ed99');t.addColorStop(1,'#acc7ed00');
        ctx.strokeStyle=t;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+len,y-len*.48);ctx.stroke();
        ctx.fillStyle='#e5efff';ctx.beginPath();ctx.arc(x,y,1.25,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    };
    f.loop=t=>{
      if(!f.on)return;
      if(t-f.last>opt.interval){
        const dt=Math.min((t-f.last)/1000,.06);
        f.phase+=.006+f.energy*.015;f.energy+=(f.target-f.energy)*.035;
        f.draw();f.meteor(dt);f.last=t;
      }
      f.frame=requestAnimationFrame(f.loop);
    };
    f.start=()=>{ if(f.on)return; f.on=true; f.resize(); if(reduced.matches){f.on=false;return} f.frame=requestAnimationFrame(f.loop); };
    f.stop=()=>{ f.on=false; cancelAnimationFrame(f.frame); };
    return f;
  }

  /* 视差指针：0..1，两轴；桌面鼠标 / 手机陀螺仪 */
  const pointer={x:.5,y:.5};
  let gyro='off'; // off | pending | on | denied | unsupported —— 只有收到真实数据才算 on,电脑上接口存在却永远不来数据,那时继续听鼠标
  let base=null; // 陀螺仪基线：拿起手机时的姿态当作正中
  function onOrient(e){
    if(e.gamma==null||e.beta==null)return;
    if(gyro!=='on'){gyro='on';if(typeof syncGyroChip==='function')syncGyroChip()}
    if(!base)base={g:e.gamma,b:e.beta};
    const dx=Math.max(-25,Math.min(25,e.gamma-base.g))/25;   // 左右倾 ±25° 走满
    const dy=Math.max(-25,Math.min(25,e.beta-base.b))/25;    // 前后倾 ±25° 走满
    pointer.x+=(.5+dx*.5-pointer.x)*.15; pointer.y+=(.5+dy*.5-pointer.y)*.15; // 缓动，别抖
  }
  function askGyro(){
    // 只在星空装帧下有意义；iOS 13+ 必须在用户手势里申请，所以由装帧卡点击触发
    if(!('DeviceOrientationEvent' in window)){gyro='unsupported';return Promise.resolve(gyro)}
    const D=window.DeviceOrientationEvent;
    const attach=()=>{if(gyro!=='on'&&gyro!=='pending'){base=null;addEventListener('deviceorientation',onOrient);gyro='pending'}return gyro};
    if(typeof D.requestPermission==='function'){
      return D.requestPermission().then(r=>r==='granted'?attach():(gyro='denied')).catch(()=>gyro='denied');
    }
    return Promise.resolve(attach());
  }
  addEventListener('pointermove',e=>{
    if(gyro==='on'||e.pointerType==='touch')return;
    pointer.x=e.clientX/Math.max(innerWidth,1);pointer.y=e.clientY/Math.max(innerHeight,1);
  });

  /* 主壁纸 */
  const mainCv=document.getElementById('sky');
  const main=makeField(mainCv,{host:phone,stars:200,parallax:18,alpha:1,nebula:true,interval:32,meteorGap:()=>7+random()*8});
  /* 装帧卡 */
  const cardCv=document.getElementById('skyCard');
  const card=cardCv?makeField(cardCv,{host:cardCv.parentElement,stars:46,parallax:6,alpha:.95,nebula:true,interval:48,meteorGap:()=>4+random()*5}):null;

  const active=()=>document.documentElement.dataset.palette==='xingkong'&&document.documentElement.dataset.theme!=='light';
  const bindingOpen=()=>{const b=document.getElementById('binding');return b&&b.classList.contains('active')};
  function sync(){
    const vis=!document.hidden;
    if(active()&&vis)main.start();else main.stop();
    if(card){ if(vis&&bindingOpen())card.start();else card.stop(); }
  }
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-palette','data-theme']});
  const bEl=document.getElementById('binding');
  if(bEl)new MutationObserver(sync).observe(bEl,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',sync);
  if('ResizeObserver' in window){const ro=new ResizeObserver(()=>{if(main.on)main.resize();if(card&&card.on)card.resize()});ro.observe(phone);if(cardCv)ro.observe(cardCv.parentElement)}
  else addEventListener('resize',()=>{main.resize();card&&card.resize()});
  reduced.addEventListener('change',sync);
  sync();

  /* 有请求在跑就推能量；api.js 的队列 exec 里 +1/-1 */
  let running=0;
  function busy(delta){running=Math.max(0,running+delta);main.target=running?.8:0;if(card)card.target=main.target}
  function energy(n){main.target=n;if(card)card.target=n}
  function gyroLabel(){return {off:'陀螺仪 · 点此开启',pending:'陀螺仪 · 未检测到，用鼠标',on:'陀螺仪 · 已开',denied:'陀螺仪 · 未授权',unsupported:'陀螺仪 · 此设备无'}[gyro]}
  return {busy,energy,askGyro,gyroLabel,get gyro(){return gyro},pointer,sync,_f:{main,card}};
})();
