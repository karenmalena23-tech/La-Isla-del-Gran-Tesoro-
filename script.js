(()=>{
'use strict';

const URL='https://byvfpocakysizleuzypp.supabase.co';
const KEY='sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk';
const $=id=>document.getElementById(id);

const S={
  db:null,ch:null,code:'',id:crypto.randomUUID(),
  role:'fire',ready:false,peers:{},level:0,keys:{},
  gems:new Set(),key:false,lever:false,
  local:{x:90,y:420,vx:0,vy:0,ground:false,face:1},
  remote:{x:150,y:420,face:-1},last:0
};

const L=[
{
 title:'El puente de las dos llamas',
 p:[[0,475,960,65],[80,385,170,16],[315,320,145,16],[555,380,160,16],[770,300,160,16]],
 h:[[265,450,70,'water'],[480,450,70,'fire'],[720,450,75,'water']],
 g:[[160,350],[380,285],[830,265]],k:[630,340],s:[355,285],d:[905,430]
},
{
 title:'Las cavernas espejo',
 p:[[0,475,960,65],[70,380,150,16],[285,315,150,16],[510,375,155,16],[745,300,160,16],[395,215,155,16]],
 h:[[230,450,80,'fire'],[445,450,85,'water'],[690,450,85,'fire']],
 g:[[140,345],[580,340],[465,180]],k:[820,265],s:[430,180],d:[905,430]
},
{
 title:'El santuario de la tormenta',
 p:[[0,475,960,65],[100,380,150,16],[320,315,150,16],[545,375,150,16],[770,295,150,16],[420,205,150,16]],
 h:[[270,450,85,'water'],[485,450,85,'fire'],[705,450,80,'water']],
 g:[[165,345],[385,280],[840,255]],k:[610,340],s:[455,170],d:[905,430]
}
];

function screen(n){
  ['lobby','waiting','game'].forEach(x=>
    $(x).classList.toggle('hidden',x!==n)
  );
}

document.querySelectorAll('.choice').forEach(b=>{
  b.onclick=()=>{
    S.role=b.dataset.role;
    document.querySelectorAll('.choice').forEach(x=>
      x.classList.toggle('active',x===b)
    );
  };
});

function player(){
  return {
    name:$('nickname').value.trim()||'Explorador',
    role:S.role,
    ready:S.ready
  };
}

function send(event,payload={}){
  S.ch?.send({
    type:'broadcast',
    event,
    payload:{...payload,from:S.id}
  });
}

function slots(){
  let a=Object.entries(S.peers)
    .sort((x,y)=>x[0]===S.id?-1:y[0]===S.id?1:0)
    .slice(0,2);

  [0,1].forEach(i=>{
    let el=$('p'+i),p=a[i]?.[1];
    el.classList.toggle('ready',!!p?.ready);
    el.innerHTML=p
      ?`${p.name}${a[i][0]===S.id?' (tú)':''}<small>${p.role==='fire'?'Brasa':'Onda'} · ${p.ready?'✓ LISTO':'AÚN NO'}</small>`
      :'Esperando jugador...<small>Comparte el código</small>';
  });
}

function checkStart(){
  let a=Object.values(S.peers);
  if(a.length>=2&&a.every(p=>p.ready)){
    send('start');
    start();
  }
}

async function enter(code){
  if(!window.supabase){
    $('lobbyMsg').textContent='No se pudo cargar Supabase. Revisa internet.';
    return;
  }

  if(!/^[A-Z0-9]{4,6}$/.test(code)){
    $('lobbyMsg').textContent='Código inválido: 4 a 6 letras o números.';
    return;
  }

  try{
    S.db??=supabase.createClient(URL,KEY);
    S.code=code;

    if(S.ch)await S.db.removeChannel(S.ch);

    S.ch=S.db.channel('isla-'+code,{
      config:{
        broadcast:{self:false},
        presence:{key:S.id}
      }
    });

    S.ch.on('broadcast',{event:'hello'},({payload:p})=>{
      if(p.from===S.id)return;
      S.peers[p.from]=p.player;
      slots();
    });

    S.ch.on('broadcast',{event:'player'},({payload:p})=>{
      if(p.from!==S.id){
        S.peers[p.from]=p.player;
        slots();
        checkStart();
      }
    });

    S.ch.on('broadcast',{event:'ready'},({payload:p})=>{
      if(p.from!==S.id&&S.peers[p.from]){
        S.peers[p.from].ready=p.ready;
        slots();
        checkStart();
      }
    });

    S.ch.on('broadcast',{event:'start'},({payload:p})=>{
      if(p.from!==S.id)start();
    });

    S.ch.on('broadcast',{event:'pos'},({payload:p})=>{
      if(p.from!==S.id){
        S.remote={x:p.x,y:p.y,face:p.face};
      }
    });

    S.ch.on('broadcast',{event:'progress'},({payload:p})=>{
      if(p.from!==S.id&&p.level===S.level){
        p.gems.forEach(n=>S.gems.add(n));
        S.key||=p.key;
        S.lever||=p.lever;
        hud();
      }
    });

    S.ch.on('broadcast',{event:'next'},({payload:p})=>{
      if(p.from!==S.id){
        S.level=p.level;
        load();
      }
    });

    S.ch.subscribe(async status=>{
      if(status==='SUBSCRIBED'){
        S.peers[S.id]=player();
        await S.ch.track({id:S.id});
        send('hello',{player:player()});

        setTimeout(()=>send('hello',{player:player()}),500);

        $('roomCode').textContent=code;
        screen('waiting');
        slots();
        $('status').textContent='Sala '+code;
      }
    });

  }catch(e){
    $('lobbyMsg').textContent='Error: '+e.message;
  }
}

$('create').onclick=()=>{
  enter(Math.random().toString(36).slice(2,8).toUpperCase());
};

$('join').onclick=()=>{
  enter($('code').value.trim().toUpperCase());
};

$('code').oninput=e=>{
  e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
};

$('ready').onclick=()=>{
  S.ready=!S.ready;
  S.peers[S.id]=player();

  $('ready').textContent=S.ready
    ?'Ya estoy listo ✓'
    :'Estoy listo ✓';

  send('player',{player:player()});
  send('ready',{ready:S.ready});
  slots();
  checkStart();
};

$('copy').onclick=()=>{
  navigator.clipboard?.writeText(S.code).then(()=>
    $('waitMsg').textContent='Código copiado. ¡Compártelo!'
  );
};

function leave(){
  S.db?.removeChannel(S.ch);
  S.ch=null;
  S.ready=false;
  S.peers={};
  $('status').textContent='Aventura para dos';
  screen('lobby');
}

$('leave').onclick=leave;
$('quit').onclick=leave;

const c=$('world');
const ctx=c.getContext('2d');

function start(){
  S.level=0;
  screen('game');
  load();

  if(!S.loop){
    S.loop=true;
    requestAnimationFrame(tick);
  }
}

function load(){
  S.gems=new Set();
  S.key=false;
  S.lever=false;

  S.local={
    x:85,y:420,vx:0,vy:0,ground:false,face:1
  };

  S.remote={x:145,y:420,face:-1};

  $('levelTitle').textContent=L[S.level].title;
  $('win').classList.add('hidden');
  hud();
}

function hud(){
  $('gems').textContent=S.gems.size;
  $('keyStatus').textContent=S.key
    ?'Llave obtenida'
    :'Busca la llave';
}

function toast(t){
  $('toast').textContent=t;
  $('toast').classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>
    $('toast').classList.remove('show'),1600
  );
}

function progress(){
  send('progress',{
    level:S.level,
    gems:[...S.gems],
    key:S.key,
    lever:S.lever
  });
}

function near(x,y,dist=55){
  return Math.hypot(S.local.x-x,S.local.y-y)<dist;
}

function interact(){
  let l=L[S.level];

  if(!S.key&&near(...l.k)){
    S.key=true;
    toast('¡Llave conseguida!');
    progress();
    hud();
  }

  if(near(...l.s)){
    S.lever=true;
    toast('¡Interruptor activado!');
    progress();
  }

  doorCheck();
}

window.addEventListener('keydown',e=>{
  let k=e.key.toLowerCase();

  if(['arrowleft','arrowright','arrowup',' '].includes(k))
    e.preventDefault();

  S.keys[k]=true;

  if(k==='e')interact();
});

window.addEventListener('keyup',e=>{
  S.keys[e.key.toLowerCase()]=false;
});

document.querySelectorAll('.mobile button').forEach(b=>{
  b.onpointerdown=e=>{
    e.preventDefault();
    S.keys[b.dataset.k]=true;
  };

  ['pointerup','pointerleave','pointercancel'].forEach(ev=>
    b.addEventListener(ev,()=>S.keys[b.dataset.k]=false)
  );
});

function doorCheck(){
  let d=L[S.level].d;

  if(
    S.key&&S.lever&&near(...d,75)&&
    Math.hypot(S.remote.x-d[0],S.remote.y-d[1])<100
  ){
    $('win').classList.remove('hidden');
  }
}

$('next').onclick=()=>{
  if(S.level<L.length-1){
    S.level++;
    send('next',{level:S.level});
    load();
  }else{
    toast('¡Tesoro encontrado! ¡Aventura completada!');
    $('win').classList.add('hidden');
  }
};

function draw(){
  let l=L[S.level];
  let gr=ctx.createLinearGradient(0,0,0,540);

  gr.addColorStop(0,['#16394e','#252c50','#1d4054'][S.level]);
  gr.addColorStop(1,['#28616a','#55548a','#4b7886'][S.level]);

  ctx.fillStyle=gr;
  ctx.fillRect(0,0,960,540);

  for(let i=0;i<7;i++){
    ctx.fillStyle='#d9f6ff12';
    ctx.beginPath();
    ctx.arc(i*160+35,95+(i%3)*42,48,0,7);
    ctx.fill();
  }

  l.p.forEach(([x,y,w,h])=>{
    ctx.fillStyle='#193e4d';
    ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#a6d9c4';
    ctx.fillRect(x,y,w,7);
    ctx.fillStyle='#ffffff18';

    for(let q=x+14;q<x+w-10;q+=28)
      ctx.fillRect(q,y+12,12,3);
  });

  l.h.forEach(([x,y,w,type])=>{
    ctx.fillStyle=type==='fire'?'#ff794b':'#40cbed';
    ctx.beginPath();
    ctx.ellipse(x+w/2,y+10,w/2,12,0,0,7);
    ctx.fill();

    ctx.fillStyle='#fff9';

    for(let i=0;i<4;i++){
      ctx.beginPath();
      ctx.arc(
        x+12+i*(w-24)/3,
        y+5+Math.sin(performance.now()/130+i)*3,
        3,0,7
      );
      ctx.fill();
    }
  });

  l.g.forEach(([x,y],i)=>{
    if(!S.gems.has(i)){
      ctx.save();
      ctx.translate(x,y);
      ctx.rotate(.78);
      ctx.shadowBlur=14;
      ctx.shadowColor='#9affff';
      ctx.fillStyle='#9bf7f2';
      ctx.fillRect(-8,-8,16,16);
      ctx.restore();

      if(Math.hypot(S.local.x-x,S.local.y-y)<26){
        S.gems.add(i);
        hud();
        progress();
      }
    }
  });

  if(!S.key){
    ctx.strokeStyle='#ffdf82';
    ctx.lineWidth=6;
    ctx.beginPath();
    ctx.arc(l.k[0]-8,l.k[1],8,0,7);
    ctx.moveTo(l.k[0],l.k[1]);
    ctx.lineTo(l.k[0]+22,l.k[1]);
    ctx.lineTo(l.k[0]+22,l.k[1]+7);
    ctx.stroke();
  }

  ctx.fillStyle=S.lever?'#8cf0bd':'#ffca73';
  ctx.fillRect(l.s[0]-8,l.s[1],16,14);

  ctx.strokeStyle='#d9e8ec';
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.moveTo(l.s[0],l.s[1]+3);
  ctx.lineTo(l.s[0]+(S.lever?12:-10),l.s[1]-17);
  ctx.stroke();

  ctx.fillStyle=S.key&&S.lever?'#72dcb4':'#20324b';
  ctx.fillRect(l.d[0]-23,l.d[1]-48,46,80);

  ctx.strokeStyle='#e1c48c';
  ctx.lineWidth=4;
  ctx.strokeRect(l.d[0]-23,l.d[1]-48,46,80);

  drawHero(
    S.remote,
    S.role==='fire'?'water':'fire',
    S.role==='fire'?'ONDA':'BRASA'
  );

  drawHero(
    S.local,
    S.role,
    $('nickname').value||'TÚ'
  );

  ctx.fillStyle='#eaf8ffbb';
  ctx.font='12px sans-serif';
  ctx.fillText(
    'E: recoger llave y activar palanca · Los dos deben llegar al portal',
    22,28
  );
}

function drawHero(p,role,name){
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.scale(p.face||1,1);

  ctx.fillStyle='#07132666';
  ctx.beginPath();
  ctx.ellipse(0,1,18,5,0,0,7);
  ctx.fill();

  if(role==='fire'){
    ctx.fillStyle='#ff8148';
    ctx.beginPath();
    ctx.moveTo(-14,-24);
    ctx.quadraticCurveTo(-25,-51,-6,-43);
    ctx.quadraticCurveTo(0,-59,9,-43);
    ctx.quadraticCurveTo(24,-42,14,-22);
    ctx.fill();

    let g=ctx.createLinearGradient(0,-30,0,0);
    g.addColorStop(0,'#ffe1a2');
    g.addColorStop(1,'#f05c3c');
    ctx.fillStyle=g;
  }else{
    ctx.fillStyle='#45c9eb';
    ctx.beginPath();
    ctx.moveTo(-14,-24);
    ctx.quadraticCurveTo(-27,-43,-9,-48);
    ctx.quadraticCurveTo(2,-59,9,-42);
    ctx.quadraticCurveTo(24,-38,14,-20);
    ctx.fill();

    let g=ctx.createLinearGradient(0,-30,0,0);
    g.addColorStop(0,'#e3ffff');
    g.addColorStop(1,'#45b9e3');
    ctx.fillStyle=g;
  }

  ctx.beginPath();
  ctx.roundRect(-15,-32,30,34,12);
  ctx.fill();

  ctx.fillStyle='#fff';
  ctx.beginPath();
  ctx.arc(-5,-18,3,0,7);
  ctx.arc(6,-18,3,0,7);
  ctx.fill();

  ctx.fillStyle='#25344c';
  ctx.fillRect(-4,-9,8,2);

  ctx.fillStyle=role==='fire'?'#a83d37':'#287da9';
  ctx.beginPath();
  ctx.roundRect(-12,0,24,12,5);
  ctx.fill();

  ctx.scale(p.face||1,1);
  ctx.fillStyle='white';
  ctx.textAlign='center';
  ctx.font='11px sans-serif';
  ctx.fillText(name,0,-54);

  ctx.restore();
}

function physics(p,role,keys){
  let left=keys[0],right=keys[1],jump=keys[2];

  p.vx=left?-3.1:right?3.1:0;

  if(p.vx)p.face=p.vx>0?1:-1;

  if(jump&&p.ground){
    p.vy=-10.5;
    p.ground=false;
  }

  p.vy=Math.min(12,p.vy+.48);
  p.x+=p.vx;
  p.y+=p.vy;
  p.ground=false;

  for(let [x,y,w,h] of L[S.level].p){
    if(
      p.x+12>x&&p.x-12<x+w&&
      p.y>=y&&p.y<=y+14&&p.vy>=0
    ){
      p.y=y;
      p.vy=0;
      p.ground=true;
    }
  }

  p.x=Math.max(12,Math.min(948,p.x));

  if(p.y>540){
    p.x=80;
    p.y=400;
    p.vy=0;
    toast('¡Vuelve a intentarlo!');
  }

  for(let [x,y,w,t] of L[S.level].h){
    if(
      p.x+10>x&&p.x-10<x+w&&
      p.y>y-24&&p.y<y+20&&
      ((t==='fire'&&role==='water')||
       (t==='water'&&role==='fire'))
    ){
      p.x=80;
      p.y=400;
      p.vy=0;
      toast('¡Ese elemento no puede cruzar!');
    }
  }
}

function tick(){
  requestAnimationFrame(tick);

  if(!$('game').classList.contains('hidden')){
    physics(
      S.local,
      S.role,
      [
        S.keys.a||S.keys.arrowleft||S.keys.left,
        S.keys.d||S.keys.arrowright||S.keys.right,
        S.keys.w||S.keys.arrowup||S.keys.up
      ]
    );

    let now=performance.now();

    if(now-S.last>100){
      S.last=now;
      send('pos',{
        x:S.local.x,
        y:S.local.y,
        face:S.local.face
      });
    }

    doorCheck();
    draw();
  }
}

requestAnimationFrame(tick);

})();
