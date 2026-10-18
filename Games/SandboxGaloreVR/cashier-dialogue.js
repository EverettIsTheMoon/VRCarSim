/* Sandbox Galore cashier dialogue: tiny local matcher + optional browser speech recognition.
   No AI model, API key, or continuous microphone capture. Press LEFT Y near a worker to talk. */
(function(){
  'use strict';
  const normalise = value => String(value || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  let library = null, recognition = null, listening = false, lastTriggerAt = 0;
  let currentWorker = null, bubble = null, bubbleTexture = null, bubbleCanvas = null, bubbleCtx = null;
  let bubbleMode = 'hidden', bubbleUntil = 0, bubbleText = '';
  let lastY = false, lastPrompt = 0, lastWorkerScan = 0, nearWorker = null, promptVisible = false;
  let fallbackMenu = false, fallbackIndex = 0, lastFallbackX = false, lastFallbackLeft = false, lastFallbackRight = false, fallbackAxisReady = true, lastFallbackMove = 0;
  const flatTriggers = [];
  const fallback = [
    "What?", "I don't know what you're talking about.", "Dude, I just work here.",
    "Can you say that differently?", "I'm going to need more information than that.",
    "Sorry, my brain's buffering.", "I understood the words, not the point.",
    "That's above my pay grade.", "I'm not really trained for this conversation.",
    "I don't know. I just work here.", "Could you be a little more specific?",
    "I'm a cashier, not a mind reader."
  ];
  function loadLibrary(){
    fetch(new URL('cashier-responses.json', document.currentScript?.src || location.href))
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(data => {
        library = data;
        (data.categories || []).forEach(cat => (cat.triggers || []).forEach(trigger => {
          const phrase = normalise(trigger);
          if(phrase) flatTriggers.push({phrase, category:cat});
        }));
        flatTriggers.forEach(indexTrigger);
        console.info('[Cashier] Loaded '+flatTriggers.length+' voice triggers across '+triggersByFirstWord.size+' word groups.');
      })
      .catch(err => { console.warn('[Cashier] Could not load response library:',err); library = {categories:[]}; });
  }
  // Index triggers by their first word so the larger dialogue library stays cheap to search on Quest.
  const triggersByFirstWord = new Map();
  function indexTrigger(item){
    const first = item.phrase.split(' ')[0];
    if(!triggersByFirstWord.has(first)) triggersByFirstWord.set(first, []);
    triggersByFirstWord.get(first).push(item);
  }
  function chooseResponse(text){
    const words = normalise(text).split(' ').filter(Boolean);
    const candidates = [];
    const seen = new Set();
    for(const word of words){
      const list = triggersByFirstWord.get(word);
      if(!list) continue;
      for(const item of list) if(!seen.has(item.phrase)){seen.add(item.phrase);candidates.push(item);}
    }
    candidates.sort((a,b)=>b.phrase.length-a.phrase.length);
    const q = ' ' + words.join(' ') + ' ';
    for(const item of candidates){
      if(q.includes(' '+item.phrase+' ')){
        const arr = item.category.responses || [];
        if(arr.length) return arr[Math.floor(Math.random()*arr.length)];
      }
    }
    return fallback[Math.floor(Math.random()*fallback.length)];
  }
  function getWorkers(){
    try { return crowd.filter(e => e && e.worker && e.g && e.g.visible !== false); }
    catch(_) { return []; }
  }
  function worldPosition(worker){
    const p = new T.Vector3();
    worker.g.updateWorldMatrix(true,false);
    worker.g.getWorldPosition(p);
    return p;
  }
  function playerPosition(){
    try { return (onFoot ? rig.position : carP).clone(); }
    catch(_) { return new T.Vector3(99999,99999,99999); }
  }
  function findNearestWorker(){
    const pp = playerPosition();
    let best = null, bestD = 5.0;
    for(const w of getWorkers()){
      const wp = worldPosition(w);
      const d = Math.hypot(pp.x-wp.x, pp.z-wp.z);
      if(d < bestD){ bestD=d; best=w; }
    }
    return best;
  }
  function makeBubble(){
    if(bubble || !window.THREE || typeof scene==='undefined') return;
    bubbleCanvas = document.createElement('canvas');
    bubbleCanvas.width = 768; bubbleCanvas.height = 300;
    bubbleCtx = bubbleCanvas.getContext('2d');
    bubbleTexture = new T.CanvasTexture(bubbleCanvas);
    bubbleTexture.minFilter = T.LinearFilter;
    bubble = new T.Sprite(new T.SpriteMaterial({map:bubbleTexture,transparent:true,depthTest:false,depthWrite:false}));
    bubble.scale.set(2.8,1.1,1);
    bubble.renderOrder = 999;
    bubble.visible = false;
    scene.add(bubble);
    drawBubble('PRESS LEFT Y TO TALK', true);
  }
  function drawBubble(text, prompt){
    if(!bubbleCtx || !bubbleTexture) return;
    bubbleText = String(text || '').slice(0,220);
    const c = bubbleCtx, w=bubbleCanvas.width, h=bubbleCanvas.height;
    c.clearRect(0,0,w,h);
    c.fillStyle = prompt ? 'rgba(24,30,38,.94)' : 'rgba(250,252,255,.97)';
    c.strokeStyle = prompt ? 'rgba(255,255,255,.92)' : 'rgba(22,29,38,.9)';
    c.lineWidth = 7;
    c.beginPath(); c.roundRect(18,15,w-36,h-52,28); c.fill(); c.stroke();
    c.beginPath();
    if(prompt){ c.moveTo(w*.48,h-38); c.lineTo(w*.52,h-38); c.lineTo(w*.5,h-8); }
    else { c.moveTo(w*.48,h-38); c.lineTo(w*.52,h-38); c.lineTo(w*.5,h-8); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = prompt ? '#ffffff' : '#171c23';
    c.font = prompt ? 'bold 31px system-ui, sans-serif' : 'bold 34px system-ui, sans-serif';
    c.textAlign='center'; c.textBaseline='middle';
    const words = bubbleText.split(/\s+/), lines=[]; let line='';
    for(const word of words){
      const test=line ? line+' '+word : word;
      if(c.measureText(test).width > w-90 && line){ lines.push(line); line=word; }
      else line=test;
    }
    if(line) lines.push(line);
    const maxLines=4, shown=lines.slice(0,maxLines);
    if(lines.length>maxLines) shown[maxLines-1]=shown[maxLines-1].replace(/[.!?]*$/,'…');
    const lineHeight=43, startY=(h-42)/2 - ((shown.length-1)*lineHeight)/2;
    shown.forEach((ln,i)=>c.fillText(ln,w/2,startY+i*lineHeight,w-76));
    bubbleTexture.needsUpdate=true;
  }
  function showBubble(text, duration=4200, prompt=false){
    makeBubble();
    if(!bubble) return;
    drawBubble(text,prompt);
    bubbleMode=prompt?'prompt':'dialogue';
    bubbleUntil=performance.now()+duration;
    bubble.visible=true;
  }
  function positionBubble(worker){
    if(!bubble || !worker){ if(bubble) bubble.visible=false; return; }
    const p=worldPosition(worker);
    p.y += 2.15;
    bubble.position.copy(p);
    bubble.visible=true;
  }
  function speakReply(transcript){
    if(!transcript || !transcript.trim()) return;
    const answer=chooseResponse(transcript);
    showBubble(answer,5200,false);
    // Intentionally no speech synthesis: replies are text bubbles only.
    try { window.dispatchEvent(new CustomEvent('rl-cashier-reply',{detail:{heard:transcript,reply:answer}})); } catch(_){}
  }
  function startListening(){
    if(listening || performance.now()-lastTriggerAt<900) return;
    lastTriggerAt=performance.now();
    const SR=window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){
      fallbackMenu = true;
      fallbackIndex = Math.max(0, flatTriggers.findIndex(x => x.phrase === 'hello'));
      showFallbackPrompt();
      console.warn('[Cashier] SpeechRecognition unavailable; controller phrase-picker enabled.');
      return;
    }
    try{
      if(!recognition){
        recognition=new SR();
        recognition.lang='en-US';
        recognition.continuous=false;
        recognition.interimResults=false;
        recognition.maxAlternatives=1;
        recognition.onstart=()=>{listening=true;showBubble('Listening… say something!',8000,false);};
        recognition.onresult=e=>{
          const result=e.results && e.results[0] && e.results[0][0];
          const transcript=result && result.transcript ? result.transcript.trim() : '';
          listening=false;
          if(transcript){
            showBubble('You said: '+transcript,2100,false);
            setTimeout(()=>speakReply(transcript),1150);
          } else showBubble("I didn't catch that. Press Y and try again.",3800,false);
        };
        recognition.onerror=e=>{
          listening=false;
          let msg='Microphone problem. Check browser permissions and try again.';
          if(e.error==='not-allowed'||e.error==='service-not-allowed') msg='Microphone access was blocked. Allow it in the browser settings.';
          else if(e.error==='network') msg='Voice recognition needs a working internet connection in this browser.';
          else if(e.error==='no-speech') msg="I didn't hear anything. Press Y and try again.";
          showBubble(msg,6500,false);
        };
        recognition.onend=()=>{listening=false;};
      }
      recognition.start();
    }catch(e){
      listening=false;
      showBubble('Could not start voice recognition. Try pressing Y again.',5000,false);
      console.warn('[Cashier] start failed:',e);
    }
  }
  function showFallbackPrompt(){
    const item=flatTriggers[fallbackIndex];
    const phrase=item ? item.phrase : 'hello';
    showBubble('VOICE INPUT UNAVAILABLE — choose a phrase with the LEFT STICK, then press X: "'+phrase+'"',120000,false);
  }
  function fallbackController(){
    if(!fallbackMenu) return;
    let leftX=false, leftStick=0, leftTrigger=false;
    const objs=[left,sec].filter(Boolean);
    for(const o of objs){
      try{
        if(o.src && o.src.handedness==='left' && !o.src.hand && o.gp){
          const gp=o.gp;
          leftX=!!gp.buttons?.[4]?.pressed;
          leftTrigger=!!gp.buttons?.[0]?.pressed;
          const axes=gp.axes||[];
          leftStick=Math.abs(axes[2]||0)>Math.abs(axes[0]||0)?(axes[2]||0):(axes[0]||0);
        }
      }catch(_){}
    }
    leftX=leftX||!!keys?.KeyX;
    const leftKey=!!keys?.ArrowLeft, rightKey=!!keys?.ArrowRight;
    const now=performance.now();
    if(now-lastFallbackMove>260){
      if(leftStick < -0.55 || (leftKey && !lastFallbackLeft)){
        fallbackIndex=(fallbackIndex-1+flatTriggers.length)%Math.max(1,flatTriggers.length);
        lastFallbackMove=now; showFallbackPrompt();
      } else if(leftStick > 0.55 || (rightKey && !lastFallbackRight)){
        fallbackIndex=(fallbackIndex+1)%Math.max(1,flatTriggers.length);
        lastFallbackMove=now; showFallbackPrompt();
      }
    }
    if(leftX && !lastFallbackX){
      const item=flatTriggers[fallbackIndex];
      fallbackMenu=false;
      if(item) speakReply(item.phrase);
      else showBubble('I could not load the phrase list. Please refresh the game.',5000,false);
    }
    // The trigger also confirms, for controllers whose X button mapping differs.
    if(leftTrigger && !lastFallbackLeft && !leftX){
      const item=flatTriggers[fallbackIndex];
      fallbackMenu=false;
      if(item) speakReply(item.phrase);
    }
    lastFallbackX=leftX;
    lastFallbackLeft=leftKey||leftTrigger;
    lastFallbackRight=rightKey;
  }
  function handleTalkButton(){
    const objs=[left,sec].filter(Boolean);
    let pressed=false;
    for(const o of objs){
      try{
        if(o.src && o.src.handedness==='left' && !o.src.hand && o.gp && o.gp.buttons && o.gp.buttons[5]?.pressed) pressed=true;
      }catch(_){}
    }
    // Desktop keyboard fallback; avoids adding a keyboard UI in VR.
    pressed = pressed || !!keys?.KeyY;
    if(pressed && !lastY){
      const worker=findNearestWorker();
      if(worker && onFoot && !menuOpen && !dead){
        currentWorker=worker;
        startListening();
      }
    }
    lastY=pressed;
    fallbackController();
  }
  function tick(){
    try{
      const now=performance.now();
      if(now-lastWorkerScan>180){
        lastWorkerScan=now;
        nearWorker=(onFoot && !menuOpen && !dead) ? findNearestWorker() : null;
      }
      handleTalkButton();
      if(nearWorker && onFoot && !menuOpen && !dead){
        currentWorker=nearWorker;
        if(!bubble || bubbleMode==='prompt' || now>bubbleUntil){
          if(now-lastPrompt>1300){
            lastPrompt=now;
            showBubble('PRESS LEFT Y TO TALK',1500,true);
          }
        }
        if(bubble && bubble.visible) positionBubble(currentWorker);
      } else if(bubble && now>bubbleUntil){
        bubble.visible=false; bubbleMode='hidden';
      } else if(bubble && bubble.visible && currentWorker && now<=bubbleUntil){
        positionBubble(currentWorker);
      }
    }catch(e){ /* dialogue must never interrupt the main render loop */ }
    setTimeout(tick,100);
  }
  // Optional desktop test button; it is hidden during immersive VR and is not needed on Quest.
  function addDesktopButton(){
    const b=document.createElement('button');
    b.textContent='🎙 Talk to cashier';
    b.setAttribute('aria-label','Talk to cashier using microphone');
    Object.assign(b.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'9999',display:'none',padding:'12px 16px',border:'1px solid #fff8',borderRadius:'12px',background:'#202832',color:'#fff',font:'bold 15px system-ui',cursor:'pointer',pointerEvents:'auto'});
    b.addEventListener('click',()=>startListening());
    document.body.appendChild(b);
    const update=()=>{ b.style.display=(renderer && renderer.xr && renderer.xr.isPresenting) ? 'none' : 'block'; };
    setInterval(update,1000);
  }
  window.RLCashierDialogue={
    startListening,
    respond: speakReply,
    get ready(){return !!library;},
    get triggerCount(){return flatTriggers.length;},
    get speechRecognitionAvailable(){return !!(window.SpeechRecognition || window.webkitSpeechRecognition);},
    closePhrasePicker(){fallbackMenu=false;}
  };
  loadLibrary();
  const waitForScene=setInterval(()=>{
    try{
      if(window.THREE && typeof scene!=='undefined' && typeof crowd!=='undefined' && typeof rig!=='undefined'){
        clearInterval(waitForScene);
        makeBubble();
        addDesktopButton();
        tick();
      }
    }catch(_){}
  },500);
})();