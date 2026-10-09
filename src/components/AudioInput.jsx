import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Upload,Headphones,RefreshCw,X} from './Icons.jsx';
import {api} from '../lib.js';
const formats={mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/m4a',aac:'audio/aac',ogg:'audio/ogg',flac:'audio/flac',webm:'audio/webm'};
export default function AudioInput({config,disabled,onTranscript,onBusy}){
 const [file,setFile]=useState(null),[url,setUrl]=useState(''),[recording,setRecording]=useState(false),[busy,setBusy]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
 const recorder=useRef(null),stream=useRef(null),chunks=useRef([]),mounted=useRef(true),interval=useRef(null);
 const limit=config?.maxAudioBytes||2500000;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearInterval(interval.current);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());onBusy(false);};},[]);
 useEffect(()=>{if(!file){setUrl('');return;}const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u);},[file]);
 function choose(f){setError('');if(!f)return;const ext=f.name.split('.').pop().toLowerCase();if(!formats[ext])return setError('Choose MP3, WAV, M4A, AAC, OGG, FLAC or WebM.');if(f.size>limit)return setError('Audio must be 2.5 MB or smaller. Trim or compress the file.');setFile(f);}
 async function record(){
  setError('');
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return setError('Microphone recording is unavailable here. Upload an audio file instead. Use localhost or HTTPS.');
  try{
   stream.current=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!mounted.current){stream.current.getTracks().forEach(t=>t.stop());return;}
   const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw new Error('Unsupported recording format. Upload an audio file instead.');
   const rec=new MediaRecorder(stream.current,{mimeType:mime,audioBitsPerSecond:48000});recorder.current=rec;chunks.current=[];let bytes=0;let elapsed=0;setSeconds(0);
   rec.ondataavailable=e=>{if(e.data.size){chunks.current.push(e.data);bytes+=e.data.size;if(bytes>limit&&rec.state==='recording')rec.stop();}};
   rec.onstop=()=>{clearInterval(interval.current);stream.current?.getTracks().forEach(t=>t.stop());if(!mounted.current)return;setRecording(false);onBusy(false);const ext=mime.includes('ogg')?'ogg':mime.includes('mp4')?'m4a':'webm';const f=new File(chunks.current,['voice-note',Date.now()].join('-')+'.'+ext,{type:formats[ext]});choose(f);};
   rec.onerror=()=>{setError('Recording stopped unexpectedly. Try uploading a file.');if(rec.state==='recording')rec.stop();};
   rec.start(1000);setRecording(true);onBusy(true);
   interval.current=setInterval(()=>{elapsed++;setSeconds(elapsed);if(elapsed>=300&&rec.state==='recording')rec.stop();},1000);
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());setRecording(false);onBusy(false);setError(e.name==='NotAllowedError'?'Microphone access was declined. You can upload an audio file instead.':e.message);}
 }
 async function transcribe(){if(!file)return;setBusy(true);onBusy(true);setError('');try{
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(new Error('Could not read this audio file.'));r.readAsDataURL(file);});
  const mimeType=formats[file.name.split('.').pop().toLowerCase()];
  const result=await api('/transcribe',{method:'POST',body:JSON.stringify({name:file.name,mimeType,data})});
  onTranscript(result.transcript,result.source);
 }catch(e){setError(e.message);}finally{setBusy(false);onBusy(false);}}
 return <section className="audio-input" aria-label="Voice input">
  <div className="audio-heading"><span className="audio-icon"><Headphones size={23}/></span><div><h3>Start with the spoken conversation</h3><p>Upload a short recording, or record a voice note here.</p></div></div>
  <div className="flex flex-wrap gap-2 mt-4"><label className={'button small upload '+(disabled||busy||recording?'disabled':'')}><Upload size={15}/>Choose audio<input aria-label="Upload audio file" type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.webm" disabled={disabled||busy||recording} onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/></label>
   {recording?<button type="button" className="button recording-button small" onClick={()=>recorder.current?.stop()}><Square size={14}/>Stop recording · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</button>:<button type="button" className="button small" disabled={disabled||busy} onClick={record}><Mic size={15}/>Record voice</button>}
  </div>
  {recording&&<div className="voice-wave" role="status" aria-label="Recording microphone"><span/><span/><span/><span/><span/><span/><span/><p>Recording · automatically stops at 5 minutes</p></div>}
  {file&&<div className="audio-preview"><div className="flex items-center justify-between gap-3"><p>{file.name} <span>· {(file.size/1000000).toFixed(2)} MB</span></p><button type="button" className="icon-button" aria-label="Remove audio" disabled={busy||recording} onClick={()=>setFile(null)}><X size={15}/></button></div><audio controls src={url} preload="metadata"/><button type="button" className="button primary small" disabled={busy||disabled||recording||config?.provider!=='gemini'} onClick={transcribe}>{busy?<RefreshCw className="spin" size={15}/>:<FileGlyph/>}{busy?'Transcribing voice…':'Transcribe to text'}</button></div>}
  <p className="hint mt-3">MP3, WAV, M4A, AAC, OGG, FLAC, WebM · maximum 2.5 MB. {config?.provider==='gemini'?'Review the transcript before processing tasks.':'Enable Gemini in .env to transcribe voice.'}</p>
  {error&&<p className="form-error" role="alert">{error}</p>}
 </section>;
}
function FileGlyph(){return <Headphones size={15}/>;}
