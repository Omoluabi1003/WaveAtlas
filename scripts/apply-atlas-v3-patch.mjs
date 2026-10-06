import fs from 'node:fs';

function replaceExact(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(before)) throw new Error(`Expected patch anchor missing in ${file}: ${before.slice(0, 80)}`);
  fs.writeFileSync(file, source.replace(before, after));
}

replaceExact(
  'components/AtlasAssistant.tsx',
  "if (typeof window === 'undefined' || isIOSFamily()) { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; return; }",
  "if (typeof window === 'undefined') { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; return; }"
);
replaceExact(
  'components/AtlasAssistant.tsx',
  "let spoken = false; if (isIOSFamily()) spoken = await speakSystem(text); else { if (await waitForNeuralVoice()) spoken = await speakNeural(text); if (!spoken) spoken = await speakSystem(text); }",
  "let spoken = false; if (await waitForNeuralVoice()) spoken = await speakNeural(text); if (!spoken) spoken = await speakSystem(text);"
);
replaceExact(
  'components/AtlasAssistant.tsx',
  "{stationLabel}{neuralState === 'loading' ? ' · voice warming' : ''}",
  "{stationLabel}{neuralState === 'loading' ? ' · Omoluabi Paul warming' : neuralState === 'ready' ? ' · Omoluabi Paul' : ''}"
);
replaceExact(
  'components/AtlasAssistant.tsx',
  '>ATLAS VOICE</div>',
  '>ATLAS VOICE · OMOLUABI PAUL</div>'
);

replaceExact(
  'public/atlas-voice-clone.html',
  "const pcm=await decodeAndResample(file,SAMPLE_RATE,MAX_REFERENCE_SECONDS);const transfer=pcm.buffer.slice(pcm.byteOffset,pcm.byteOffset+pcm.byteLength);",
  "const pcm=await decodeAndResample(file,SAMPLE_RATE,MAX_REFERENCE_SECONDS);await saveReference(pcm);const transfer=pcm.buffer.slice(pcm.byteOffset,pcm.byteOffset+pcm.byteLength);"
);
replaceExact(
  'public/atlas-voice-clone.html',
  "function concatChunks(parts){",
  "function openVoiceDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('waveatlas-atlas-voice-v1',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('references'))db.createObjectStore('references')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Voice storage unavailable'))})}\nasync function saveReference(pcm){const db=await openVoiceDb();try{const copy=pcm.slice();await new Promise((resolve,reject)=>{const tx=db.transaction('references','readwrite');tx.objectStore('references').put({pcm:copy,sampleRate:SAMPLE_RATE,updatedAt:Date.now()},'omoluabi-paul');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Could not save voice reference'))})}finally{db.close()}localStorage.setItem('waveatlas:atlas-voice','omoluabi-paul')}\nfunction concatChunks(parts){"
);
replaceExact(
  'public/atlas-voice-clone.html',
  "setStatus('Omoluabi Paul enrolled for this browser session. Ready for a short test.');",
  "setStatus('Omoluabi Paul enrolled on this device. Atlas will use the clone when the neural engine is available.');"
);
replaceExact(
  'public/atlas-voice-clone.html',
  "This is a qualification gate, not the production Atlas voice selector. Omoluabi Paul will only be connected to Atlas after this engine survives repeated generation on the target device and the clone is recognizably faithful.",
  "Enrollment is stored only in this browser on this device. Production Atlas now attempts Omoluabi Paul first and falls back to the stable system voice if the local neural engine cannot start."
);

console.log('Atlas v3 integration patch applied.');
