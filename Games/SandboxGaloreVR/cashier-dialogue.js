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
  let library = null, recognition = null, listening = false, lastTriggerAt = 0, badWordEntries = [];
  // Experimental local Whisper tiny.en model. Audio is processed in this browser; no speech API is used.
  let moonshineEnabled = true, moonshineModulePromise = null, moonshineMic = null, moonshineLoaded = false, moonshineStarting = false, moonshineFinalizing = false, moonshineSawText = false;
  let whisperWorker = null, whisperWorkerUrl = null, whisperWorkerReady = null, whisperWorkerRequest = 0, whisperWorkerPending = new Map();
  let whisperRecording = false, whisperStream = null, whisperRecorder = null, whisperChunks = [];
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
    const scriptBase = document.currentScript?.src || location.href;
    fetch(new URL('cashier-bad-words.json', scriptBase))
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(data => { badWordEntries = Array.isArray(data.entries) ? data.entries : []; console.info('[Cashier] Loaded '+badWordEntries.length+' bad-word rules from separate dictionary.'); })
      .catch(err => console.warn('[Cashier] Could not load bad-word dictionary:',err));
    fetch(new URL('cashier-responses.json', scriptBase))
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
    if(phraseOpen && phraseKeyboard){p.copy(phraseKeyboard.position);p.y+=1.18;}
    bubble.position.copy(p);
    bubble.visible=true;
  }
  function matchBadWord(text){
    const q=' '+normalise(text)+' ';
    for(const entry of badWordEntries) for(const phrase of (entry.phrases||[])){
      const p=normalise(phrase); if(p && q.includes(' '+p+' ')) return entry;
    }
    return null;
  }
  function speakReply(transcript){
    if(!transcript || !transcript.trim()) return;
    let answer;
    if(/\bthis is a robbery\b/i.test(normalise(transcript))){
      try { window.dispatchEvent(new CustomEvent('rl-cashier-robbery')); } catch(_){}
      answer='OH NO! THE POLICE ARE COMING! GET OUT OF HERE!';
    } else {
      const insult=matchBadWord(transcript);
      if(insult){
        answer=insult.reply || 'Yo dude, what is wrong with you?!';
        try { window.dispatchEvent(new CustomEvent('rl-cashier-insult',{detail:{phrase:transcript,action:insult.action||'draw_pistol'}})); } catch(_){}
      } else answer=chooseResponse(transcript);
    }
    showBubble(answer,5200,false);
    // Lightweight device TTS: no downloaded neural model or cloud API.
    // Prefer an installed local English voice; pitch/rate give it a robotic character.
    try{
      if('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window){
        window.speechSynthesis.cancel();
        const utterance=new SpeechSynthesisUtterance(answer);
        utterance.lang='en-US';
        utterance.rate=1.04;
        utterance.pitch=0.58;
        utterance.volume=1;
        const voices=window.speechSynthesis.getVoices()||[];
        const english=voices.filter(v=>/^en(-|_)/i.test(v.lang||''));
        const local=english.find(v=>v.localService) || english.find(v=>/english|us english|united states/i.test(v.name+' '+v.lang));
        if(local) utterance.voice=local;
        window.speechSynthesis.speak(utterance);
      }
    }catch(err){ console.warn('[Cashier] Device speech synthesis unavailable:',err); }
    try { window.dispatchEvent(new CustomEvent('rl-cashier-reply',{detail:{heard:transcript,reply:answer}})); } catch(_){}
  }
  // Low-cost phrase keyboard: no neural speech models, WASM, or microphone processing.
  let phraseKeyboard=null, phraseKeys=[], phraseDraft='', phraseOpen=false, phraseRaycaster=null, phrasePointerLine=null;
  let phraseInput=null, phraseSend=null, phraseClose=null, phraseControllerHooks=[];
  const phraseMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'') && !/OculusBrowser|Quest|Meta Quest/i.test(navigator.userAgent||'');
  function phraseDraftChanged(){
    if(phraseInput && phraseInput.value!==phraseDraft) phraseInput.value=phraseDraft;
    if(currentWorker) showBubble(phraseDraft ? 'You: '+phraseDraft : 'Type a message using the floating keyboard',60000,false);
  }
  function phraseKeyTexture(label){
    const cv=document.createElement('canvas'); cv.width=256; cv.height=160;
    const cx=cv.getContext('2d');
    cx.fillStyle='#202a36'; cx.fillRect(0,0,256,160);
    cx.strokeStyle='#c6d5e6'; cx.lineWidth=7; cx.strokeRect(4,4,248,152);
    cx.fillStyle='#fff'; cx.font='bold 58px system-ui'; cx.textAlign='center'; cx.textBaseline='middle';
    cx.fillText(label,128,80,225);
    const tex=new T.CanvasTexture(cv); tex.minFilter=T.LinearFilter;
    return tex;
  }
  function addPhraseKey(label,x,y,w,action){
    const mesh=new T.Mesh(new T.PlaneGeometry(w,.27),new T.MeshBasicMaterial({map:phraseKeyTexture(label),transparent:false,side:T.DoubleSide}));
    mesh.position.set(x,y,.025); mesh.userData.phraseAction=action; phraseKeyboard.add(mesh); phraseKeys.push(mesh);
  }
  function buildPhraseKeyboard(){
    if(phraseKeyboard) return;
    phraseKeyboard=new T.Group(); phraseKeyboard.name='CashierFloatingPhraseKeyboard';
    const bg=new T.Mesh(new T.PlaneGeometry(3.2,1.95),new T.MeshBasicMaterial({color:0x101820,transparent:true,opacity:.97,side:T.DoubleSide}));
    bg.position.z=-.01; phraseKeyboard.add(bg);
    const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
    rows.forEach((row,ri)=>{
      const keyW=.26, gap=.025, total=row.length*(keyW+gap)-gap, offset=-total/2+keyW/2;
      for(let i=0;i<row.length;i++){
        const label=row[i],x=offset+i*(keyW+gap),y=.55-ri*.34;
        addPhraseKey(label,x,y,keyW,()=>{phraseDraft+=label.toLowerCase();phraseDraftChanged()});
      }
    });
    addPhraseKey('SPACE',-.77,-.67,.82,()=>{phraseDraft+=' ';phraseDraftChanged()});
    addPhraseKey('⌫',-.16,-.67,.38,()=>{phraseDraft=phraseDraft.slice(0,-1);phraseDraftChanged()});
    addPhraseKey('CLEAR',.30,-.67,.48,()=>{phraseDraft='';phraseDraftChanged()});
    addPhraseKey('SEND',.87,-.67,.48,submitPhrase);
    addPhraseKey('CLOSE',1.30,.79,.42,closePhraseKeyboard);
    if(typeof scene==='undefined' || !scene || typeof scene.add!=='function') throw new Error('Game scene is not ready for the cashier keyboard.');
    scene.add(phraseKeyboard);
    phraseRaycaster=new T.Raycaster();
    if(!phrasePointerLine){
      const geo=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(0,0,-3)]);
      phrasePointerLine=new T.Line(geo,new T.LineBasicMaterial({color:0x75d9ff,transparent:true,opacity:.95,depthTest:false}));
      phrasePointerLine.frustumCulled=false; phrasePointerLine.renderOrder=1000; phrasePointerLine.visible=false; scene.add(phrasePointerLine);
    }
    // XR controller select events work with the in-game 3D keys, not the headset system keyboard.
    try{
      if(renderer && renderer.xr && renderer.xr.getController){
        for(let i=0;i<2;i++){
          const controller=renderer.xr.getController(i);
          const handler=()=>{ if(!phraseOpen)return; controller.updateWorldMatrix(true,false); phraseRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld); phraseRaycaster.ray.direction.set(0,0,-1).transformDirection(controller.matrixWorld); const hits=phraseRaycaster.intersectObjects(phraseKeys,false); if(hits.length) hits[0].object.userData.phraseAction(); };
          controller.addEventListener('selectstart',handler);
          phraseControllerHooks.push([controller,handler]);
        }
      }
    }catch(e){console.warn('[Cashier] Could not attach keyboard controller input:',e)}
    // Mouse/touch raycasting lets the same 3D keyboard be tested outside VR.
    const canvas=renderer && renderer.domElement;
    if(canvas && !canvas.dataset.phraseKeyboardClick){
      canvas.dataset.phraseKeyboardClick='1';
      canvas.addEventListener('pointerdown',event=>{
        if(!phraseOpen || renderer?.xr?.isPresenting) return;
        const rect=canvas.getBoundingClientRect();
        const cam=getPhraseCamera(); const rayCam=cam && cam.isArrayCamera && cam.cameras && cam.cameras.length ? cam.cameras[0] : cam; if(!rayCam) return; phraseRaycaster.setFromCamera({x:((event.clientX-rect.left)/rect.width)*2-1,y:-((event.clientY-rect.top)/rect.height)*2+1},rayCam);
        const hits=phraseRaycaster.intersectObjects(phraseKeys,false);
        if(hits.length){event.preventDefault();event.stopPropagation();hits[0].object.userData.phraseAction()}
      },true);
    }
  }
  function makePhraseMobileInput(){
    if(phraseInput) return;
    const wrap=document.createElement('div');
    Object.assign(wrap.style,{position:'fixed',left:'10px',right:'10px',bottom:'12px',zIndex:'10020',display:'none',gap:'7px',alignItems:'center',pointerEvents:'auto'});
    phraseInput=document.createElement('input'); phraseInput.type='text'; phraseInput.autocomplete='off'; phraseInput.autocapitalize='sentences'; phraseInput.placeholder='Type to cashier…';
    Object.assign(phraseInput.style,{flex:'1',minWidth:'0',padding:'13px',font:'16px system-ui',borderRadius:'10px',border:'2px solid #b9c9dc',background:'#f7f9fc',color:'#111'});
    phraseInput.addEventListener('input',()=>{phraseDraft=phraseInput.value;phraseDraftChanged()});
    phraseInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submitPhrase()}});
    phraseSend=document.createElement('button'); phraseSend.textContent='Send';
    Object.assign(phraseSend.style,{padding:'13px 14px',borderRadius:'10px',border:'0',background:'#286bd6',color:'#fff',font:'bold 15px system-ui'});
    phraseSend.addEventListener('click',submitPhrase);
    phraseClose=document.createElement('button'); phraseClose.textContent='×';
    Object.assign(phraseClose.style,{padding:'10px 13px',borderRadius:'10px',border:'0',background:'#303b49',color:'#fff',font:'bold 20px system-ui'});
    phraseClose.addEventListener('click',closePhraseKeyboard);
    wrap.append(phraseInput,phraseSend,phraseClose); document.body.appendChild(wrap);
    phraseInput._wrap=wrap;
  }
  function getPhraseCamera(){
    // The game names its main camera `cam`, not `camera`. Prefer that stable camera;
    // only use the XR camera as a fallback when the main camera is unavailable.
    try { if(typeof cam!=='undefined' && cam) return cam; } catch(_){}
    try { if(typeof camera!=='undefined' && camera) return camera; } catch(_){}
    try { if(typeof renderer!=='undefined' && renderer && renderer.xr && renderer.xr.getCamera){ const xrCam=renderer.xr.getCamera(); if(xrCam) return xrCam; } } catch(_){}
    return null;
  }
  function openPhraseKeyboard(){
    if(!currentWorker) currentWorker=findNearestWorker();
    phraseDraft=''; phraseOpen=true;
    buildPhraseKeyboard(); makePhraseMobileInput();
    const cam=getPhraseCamera();
    if(cam){
      if(typeof cam.updateWorldMatrix==='function') cam.updateWorldMatrix(true,false);
      const pos=new T.Vector3(),dir=new T.Vector3(); cam.getWorldPosition(pos); cam.getWorldDirection(dir);
      phraseKeyboard.position.copy(pos).addScaledVector(dir,1.35);
      phraseKeyboard.position.y-=.12;
      const face=pos.clone(); phraseKeyboard.lookAt(face);
    } else phraseKeyboard.position.set(0,1.5,-1.4);
    phraseKeyboard.visible=true;
    if(phraseInput && phraseMobile() && !(renderer && renderer.xr && renderer.xr.isPresenting)){
      phraseInput._wrap.style.display='flex';
      // Focus only on phones; the native mobile keyboard is deliberately not opened in VR.
      setTimeout(()=>{if(phraseOpen && !(renderer && renderer.xr && renderer.xr.isPresenting))phraseInput.focus({preventScroll:true})},80);
    } else if(phraseInput) phraseInput._wrap.style.display='none';
    phraseDraftChanged();
  }
  function closePhraseKeyboard(){
    phraseOpen=false;
    if(phraseKeyboard) phraseKeyboard.visible=false;
    if(phrasePointerLine) phrasePointerLine.visible=false;
    if(phraseInput){phraseInput.blur();phraseInput._wrap.style.display='none'}
  }
  function submitPhrase(){
    const phrase=phraseDraft.trim();
    closePhraseKeyboard();
    if(phrase) speakReply(phrase);
    else showBubble('Tap the floating letter keys to type a phrase.',3500,false);
  }
  function startListening(){
    if(listening || moonshineStarting || performance.now()-lastTriggerAt<900) return;
    lastTriggerAt=performance.now();
    const worker=findNearestWorker();
    if(worker && onFoot && !menuOpen && !dead){currentWorker=worker;openPhraseKeyboard();}
    else openPhraseKeyboard();
  }

  // Run Whisper inside a Web Worker so WASM inference doesn't block the game's render loop.
  // The model stays local in the browser and is cached after the first download.
  function ensureWhisperWorker(){
    if(whisperWorker && whisperWorkerReady) return whisperWorkerReady;
    const workerSource = `
      let pipe = null;
      self.onmessage = async (event) => {
        const msg = event.data || {};
        try {
          if (msg.type === 'init') {
            if (!pipe) {
              const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
              pipe = await mod.pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
                device: 'wasm', dtype: 'q8',
                progress_callback: p => self.postMessage({type:'progress', progress:p})
              });
            }
            self.postMessage({type:'ready'});
          } else if (msg.type === 'transcribe') {
            if (!pipe) throw new Error('Whisper model is not ready.');
            const result = await pipe(new Float32Array(msg.audio), {sampling_rate:16000});
            self.postMessage({type:'transcript', id:msg.id, text:String(result && (result.text || result[0]?.text) || '')});
          }
        } catch (err) {
          self.postMessage({type:'error', id:msg.id, message:String(err && (err.message || err) || err)});
        }
      };
    `;
    whisperWorkerUrl = URL.createObjectURL(new Blob([workerSource], {type:'text/javascript'}));
    whisperWorker = new Worker(whisperWorkerUrl);
    whisperWorkerReady = new Promise((resolve,reject)=>{
      const onMessage = event => {
        const data=event.data||{};
        if(data.type==='progress'){
          const p=data.progress;
          if(p && typeof p.progress==='number') showBubble('Downloading local Whisper model… '+Math.round(p.progress)+'%',2600,false);
          else if(p && p.status==='ready') showBubble('Whisper model ready.',1800,false);
        } else if(data.type==='ready'){
          whisperWorker.removeEventListener('message',onMessage);
          resolve();
        } else if(data.type==='error' && data.id == null){
          whisperWorker.removeEventListener('message',onMessage);
          whisperWorkerReady=null;
          reject(new Error(data.message||'Whisper worker failed to load.'));
        } else if(data.type==='transcript' || data.type==='error'){
          const pending=whisperWorkerPending.get(data.id);
          if(pending){
            whisperWorkerPending.delete(data.id);
            if(data.type==='error') pending.reject(new Error(data.message||'Transcription failed.'));
            else pending.resolve(data.text||'');
          }
        }
      };
      whisperWorker.addEventListener('message',onMessage);
      whisperWorker.addEventListener('error',event=>{
        whisperWorkerReady=null;
        reject(new Error(event.message||'Whisper worker crashed.'));
      },{once:true});
      whisperWorker.postMessage({type:'init'});
    });
    return whisperWorkerReady;
  }
  function transcribeWhisper(audio){
    return new Promise((resolve,reject)=>{
      const id=++whisperWorkerRequest;
      whisperWorkerPending.set(id,{resolve,reject});
      // Transfer the audio buffer to the worker instead of copying it.
      const buffer=audio.buffer.slice(audio.byteOffset,audio.byteOffset+audio.byteLength);
      whisperWorker.postMessage({type:'transcribe',id,audio:buffer},[buffer]);
    });
  }
  async function startWhisperListening(){
    if(whisperRecording || moonshineStarting || listening) return;
    moonshineStarting=true;
    whisperRecording=true;
    showBubble('Preparing local Whisper… first use downloads the model.',12000,false);
    let stream=null, recorder=null;
    try{
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser does not expose microphone capture.');
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      whisperStream=stream;
      await ensureWhisperWorker();
      if(!moonshineEnabled) return;
      const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
      whisperRecorder=recorder; whisperChunks=[];
      recorder.ondataavailable=e=>{if(e.data&&e.data.size)whisperChunks.push(e.data)};
      showBubble('Recording 3.5 seconds… speak now!',4200,false);
      const blobPromise=new Promise((resolve,reject)=>{
        recorder.onerror=e=>reject(e.error||new Error('Microphone recording failed.'));
        recorder.onstop=()=>resolve(new Blob(whisperChunks,{type:recorder.mimeType||'audio/webm'}));
      });
      recorder.start();
      listening=true;
      await new Promise(resolve=>setTimeout(resolve,3500));
      if(recorder.state!=='inactive') recorder.stop();
      const blob=await blobPromise;
      listening=false;
      if(!blob.size) throw new Error('The microphone recording was empty. Check microphone permission.');
      showBubble('Transcribing locally… game should stay responsive.',10000,false);
      const audioContext=new (window.AudioContext||window.webkitAudioContext)();
      let decoded;
      try{decoded=await audioContext.decodeAudioData(await blob.arrayBuffer())}
      finally{try{await audioContext.close()}catch(_){}}
      const sampleRate=16000, frameCount=Math.ceil(decoded.duration*sampleRate);
      const offline=new OfflineAudioContext(1,Math.max(1,frameCount),sampleRate);
      const source=offline.createBufferSource(); source.buffer=decoded; source.connect(offline.destination); source.start(0);
      const resampled=await offline.startRendering();
      const transcript=String(await transcribeWhisper(resampled.getChannelData(0))).trim();
      if(transcript){showBubble('You said: '+transcript,2600,false);setTimeout(()=>speakReply(transcript),700)}
      else showBubble("Whisper didn't catch that. Press talk and try again.",4200,false);
    }catch(err){
      listening=false;
      const detail=String(err && (err.message||err) || 'unknown error').slice(0,150);
      showBubble('Local Whisper failed: '+detail,7000,false);
      console.warn('[Cashier] Local Whisper failed:',err);
    }finally{
      listening=false; whisperRecording=false; moonshineStarting=false;
      if(whisperRecorder && whisperRecorder.state!=='inactive'){try{whisperRecorder.stop()}catch(_){}}
      whisperRecorder=null; whisperChunks=[];
      if(stream){try{stream.getTracks().forEach(t=>t.stop())}catch(_){}}
      whisperStream=null;
    }
  }
  async function stopWhisperListening(){
    listening=false;
    try{if(whisperRecorder && whisperRecorder.state!=='inactive')whisperRecorder.stop()}catch(_){}
    try{if(whisperStream)whisperStream.getTracks().forEach(t=>t.stop())}catch(_){}
    whisperStream=null;
  }

  // Moonshine Voice runs locally in WebAssembly. Model files are downloaded once
  // and cached by the browser; microphone audio is never sent to a server.
  async function startMoonshineListening(){
    if(moonshineStarting || listening) return;
    moonshineStarting=true;
    showBubble('Preparing Moonshine… first use downloads the local model.',12000,false);
    try{
      if(!moonshineModulePromise){
        moonshineModulePromise=import('https://cdn.jsdelivr.net/npm/@moonshine-ai/moonshine-wasm/dist/index.js').catch(err=>{moonshineModulePromise=null;throw err;});
      }
      const {MicTranscriber,ModelArch}=await moonshineModulePromise;
      if(!moonshineMic){
        moonshineMic=new MicTranscriber()
          .language('en')
          .modelArch(ModelArch.TinyStreaming)
          .onProgress(fraction=>{
            const pct=Math.max(0,Math.min(100,Math.round(fraction*100)));
            showBubble('Loading Moonshine speech model… '+pct+'%',2500,false);
          })
          .onText(text=>{
            const partial=String(text||'').trim();
            if(moonshineEnabled && listening && partial){
              moonshineSawText=true;
              showBubble('I hear: '+partial,1800,false);
            }
          })
          .onLine(line=>{
            const transcript=String(line && line.text || '').trim();
            // onLine is documented as a completed-line callback; don't rely on extra flags.
            if(!moonshineEnabled || !listening || moonshineFinalizing || !transcript) return;
            moonshineFinalizing=true;
            listening=false;
            showBubble('You said: '+transcript,2600,false);
            Promise.resolve(moonshineMic.stop()).catch(()=>{}).finally(()=>{
              setTimeout(()=>speakReply(transcript),700);
              moonshineFinalizing=false;
            });
          })
          .onError(err=>{
            listening=false;
            const detail=String(err && err.message || err || 'unknown error').slice(0,140);
            showBubble('Moonshine error: '+detail,7000,false);
            console.warn('[Cashier] Moonshine callback error:',err);
          });
      }
      // Explicit load lets us show model-download progress before opening the mic.
      if(!moonshineLoaded && typeof moonshineMic.load==='function'){
        await moonshineMic.load();
        moonshineLoaded=true;
      }
      if(!moonshineEnabled) return;
      // Set this before start(): microphone callbacks may begin before start() resolves.
      listening=true;
      moonshineSawText=false;
      showBubble('Microphone starting…',3000,false);
      await moonshineMic.start();
      if(!moonshineEnabled){ await stopMoonshineListening(); return; }
      showBubble('Listening… speak now.',1800,false);
      // If Moonshine opens the mic but never returns even a partial transcript,
      // automatically try the browser's recognizer (or the built-in phrase picker).
      setTimeout(async()=>{
        if(!moonshineEnabled || !listening || moonshineSawText || moonshineFinalizing) return;
        listening=false;
        moonshineEnabled=false;
        updateSpeechModeLabel();
        try{await stopMoonshineListening();}catch(_){}
        showBubble('Moonshine gave no transcript. Trying browser speech instead…',3500,false);
        setTimeout(()=>startListening(),1100);
      },10000);
    }catch(err){
      listening=false;
      // Allow retry after a failed model load or microphone initialization.
      moonshineMic=null;
      moonshineLoaded=false;
      const detail=String(err && err.message || err || 'unknown error').slice(0,150);
      const isolationHint=(!window.crossOriginIsolated || typeof SharedArrayBuffer==='undefined')
        ? ' This site may need cross-origin isolation for Moonshine WASM.'
        : '';
      moonshineEnabled=false;
      updateSpeechModeLabel();
      showBubble('Moonshine failed: '+detail+isolationHint+' Switching to browser speech…',6500,false);
      console.warn('[Cashier] Moonshine Voice failed; falling back to browser speech:',err);
      // Give the error bubble a moment to be readable, then try the supported
      // browser recognizer; if unavailable, startListening opens the phrase picker.
      setTimeout(()=>startListening(),1200);
    }finally{
      moonshineStarting=false;
    }
  }
  async function stopMoonshineListening(){
    listening=false;
    if(moonshineMic){ try{await moonshineMic.stop();}catch(_){} }
  }
  function setMoonshineEnabled(enabled){
    moonshineEnabled=!!enabled;
    if(!moonshineEnabled){ stopWhisperListening(); stopMoonshineListening(); }
    updateSpeechModeLabel();
    showBubble(moonshineEnabled
      ? 'Local Whisper tiny.en selected — runs in browser, first use downloads model'
      : 'Browser speech fallback selected',3200,false);
  }
  let speechModeButton=null;
  function updateSpeechModeLabel(){
    if(speechModeButton){
      speechModeButton.textContent=moonshineEnabled?'🧪 Local Whisper tiny.en ON':'↩ Speech: Browser fallback';
      speechModeButton.setAttribute('aria-pressed',moonshineEnabled?'true':'false');
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
      if(phraseInput && renderer && renderer.xr && renderer.xr.isPresenting && phraseInput._wrap.style.display!=='none'){ phraseInput.blur(); phraseInput._wrap.style.display='none'; }
      if(phraseKeyboard && phraseOpen && !phraseKeyboard.visible) phraseKeyboard.visible=true;
      if(phrasePointerLine){
        phrasePointerLine.visible=!!(phraseOpen && renderer && renderer.xr && renderer.xr.isPresenting);
        if(phrasePointerLine.visible){
          let origin=null,dir=null;
          try{
            const handObj=[left,sec].find(o=>o&&o.src&&o.src.handedness==='left');
            if(handObj&&handObj.src.hand){
              const joints=renderer.xr.getHand(handObj.i).joints,tip=joints&&joints['index-finger-tip'],base=joints&&joints['index-finger-metacarpal'];
              if(tip&&base){rig.updateWorldMatrix(true,false);origin=tip.position.clone();base.position;rig.localToWorld(origin);const bp=base.position.clone();rig.localToWorld(bp);dir=origin.clone().sub(bp).normalize();}
            } else if(handObj&&handObj.c){
              handObj.c.updateWorldMatrix(true,false);origin=new T.Vector3().setFromMatrixPosition(handObj.c.matrixWorld);dir=new T.Vector3(0,0,-1).transformDirection(handObj.c.matrixWorld);
            } else {
              let ctrl=null;for(let i=0;i<2;i++){const test=renderer.xr.getController(i);if(test&&test.userData&&test.userData.inputSource&&test.userData.inputSource.handedness==='left'){ctrl=test;break;}}
              if(!ctrl)ctrl=renderer.xr.getController(0);
              if(ctrl){ctrl.updateWorldMatrix(true,false);origin=new T.Vector3().setFromMatrixPosition(ctrl.matrixWorld);dir=new T.Vector3(0,0,-1).transformDirection(ctrl.matrixWorld);}
            }
          }catch(_){}
          if(origin&&dir){const end=origin.clone().addScaledVector(dir,3);const a=phrasePointerLine.geometry.attributes.position;a.setXYZ(0,origin.x,origin.y,origin.z);a.setXYZ(1,end.x,end.y,end.z);a.needsUpdate=true;phrasePointerLine.geometry.computeBoundingSphere();}
        }
      }
      if(nearWorker && onFoot && !menuOpen && !dead){
        currentWorker=nearWorker;
        if(listening || moonshineStarting){
          if(!bubble || now>bubbleUntil) showBubble('Listening… speak now.',1800,false);
        } else if(!bubble || bubbleMode==='prompt' || now>bubbleUntil){
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
    b.textContent='⌨ Talk / Type to cashier';
    b.setAttribute('aria-label','Open floating cashier keyboard');
    Object.assign(b.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'9999',display:'none',padding:'12px 16px',border:'1px solid #fff8',borderRadius:'12px',background:'#202832',color:'#fff',font:'bold 15px system-ui',cursor:'pointer',pointerEvents:'auto'});
    b.addEventListener('click',()=>startListening());
    document.body.appendChild(b);
    const update=()=>{
      const visible=!(renderer && renderer.xr && renderer.xr.isPresenting);
      b.style.display=visible?'block':'none';
    };
    setInterval(update,500);
  }
  window.RLCashierDialogue={
    startListening,
    respond: speakReply,
    get ready(){return !!library;},
    get triggerCount(){return flatTriggers.length;},
    get speechRecognitionAvailable(){return !!(window.SpeechRecognition || window.webkitSpeechRecognition);},
    closePhrasePicker(){fallbackMenu=false;},
    setMoonshineEnabled,
    get moonshineEnabled(){return moonshineEnabled;},
    stopListening: stopWhisperListening
  };
  loadLibrary();
  const waitForScene=setInterval(()=>{
    try{
      if(window.THREE && typeof scene!=='undefined' && typeof crowd!=='undefined' && typeof rig!=='undefined'){
        clearInterval(waitForScene);
        makeBubble();
        addDesktopButton();
        makePhraseMobileInput();
        tick();
      }
    }catch(_){}
  },500);
})();