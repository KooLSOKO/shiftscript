import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {geminiJson,defaultModel} from '../server/gemini.js';
import {analyze,sampleAnalysis,sampleTranscript} from '../server/analyze.js';
import {validateAudio,transcribe,MAX_AUDIO_BYTES} from '../server/audio.js';
import {createApp} from '../server/app.js';
import {LocalStore} from '../server/store.js';
function wav(){const b=Buffer.alloc(64);b.write('RIFF');b.writeUInt32LE(56,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(20,40);return{name:'format-test.wav',mimeType:'audio/wav',data:b.toString('base64')};}
const meeting={title:'Voice review',date:'2026-10-09',type:'Project review',transcript:sampleTranscript};
test('Gemini sends strict JSON contract, configured model, no storage and bounded timeout',async()=>{
 let captured;const client={interactions:{create:async(body,options)=>{captured={body,options};return{status:'completed',output_text:'{"ok":true}'};}}};
 const result=await geminiJson({input:'fictional input',schema:{type:'object'},instruction:'Extract',maxTokens:500},client);
 assert.equal(result.ok,true);assert.equal(captured.body.model,process.env.GEMINI_MODEL||defaultModel);assert.equal(captured.body.store,false);assert.equal(captured.body.response_format.mime_type,'application/json');assert.equal(captured.options.maxRetries,0);assert.equal(captured.options.timeout,45000);
});
test('Gemini quota errors are readable and never leak upstream key strings',async()=>{
 const client={interactions:{create:async()=>{throw Object.assign(new Error('secret upstream diagnostic'),{status:429});}}};
 await assert.rejects(()=>geminiJson({input:'x',schema:{}},client),e=>e.status===429&&/quota/.test(e.message)&&!e.message.includes('secret'));
});
test('malformed or refused Gemini output does not become tasks',async()=>{
 const client={interactions:{create:async()=>({status:'completed',output_text:'not json'})}};
 await assert.rejects(()=>geminiJson({input:'x',schema:{}},client),e=>e.status===502);
 await assert.rejects(()=>analyze(meeting,'gemini',async()=>({...sampleAnalysis,actions:[{...sampleAnalysis.actions[0],evidence:'An invented quote that was never spoken.'}]})),/excerpt/);
});
test('audio MIME, encoding, file signatures and size boundaries',()=>{
 const audio=wav();assert.equal(validateAudio(audio).mimeType,'audio/wav');
 assert.throws(()=>validateAudio({...audio,mimeType:'audio/m4a'}),/format/);
 assert.throws(()=>validateAudio({...audio,data:'not-base64'}));
 assert.throws(()=>validateAudio({...audio,data:Buffer.alloc(MAX_AUDIO_BYTES+1).toString('base64')}));
});
test('transcription passes audio to Gemini and preserves editable text',async()=>{
 let payload;const text=await transcribe(wav(),'gemini',async p=>{payload=p;return{transcript:sampleTranscript};});
 assert.equal(text,sampleTranscript);assert.equal(payload.input[1].type,'audio');assert.equal(payload.input[1].mime_type,'audio/wav');
 await assert.rejects(()=>transcribe(wav(),'sample'),/needs Gemini/);
 await assert.rejects(()=>transcribe(wav(),'gemini',async()=>({transcript:''})),/clear transcript/);
});
test('audio API -> reviewed transcript -> stored meeting source; no raw audio persisted',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'shiftscript-audio-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const repo=new LocalStore(join(dir,'workspace.json'));let transcribed=false;
 const app=createApp({store:repo,storage:'local',provider:'gemini',transcriber:async()=>{transcribed=true;return sampleTranscript;},analyzer:(i)=>analyze(i,'sample')});
 const res=await request(app).post('/api/transcribe').send(wav()).expect(200);assert.equal(transcribed,true);assert.equal(res.body.transcript,sampleTranscript);
 const stored=await request(app).post('/api/meetings').send({...meeting,source:res.body.source}).expect(201);
 assert.equal(stored.body.meeting.source.kind,'audio');assert.equal(stored.body.meeting.source.name,'format-test.wav');assert.equal(stored.body.meeting.proposals.length,3);
 const raw=JSON.stringify(await repo.list());assert.ok(!raw.includes(wav().data));
});
