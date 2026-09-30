// Explicit administrator-authorised B3 test client, not a schedule.
import fs from 'node:fs';
import crypto from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
import {exchange,POLICY,SOCKET} from './client.mjs';
const request=(operation='readiness_check')=>({operation,policyVersion:POLICY,requestId:crypto.randomUUID()});
const sendWire=text=>new Promise((resolve,reject)=>{const s=net.createConnection(SOCKET);let out='';s.setTimeout(18000,()=>s.destroy(new Error('TIMEOUT')));s.on('error',reject);s.on('connect',()=>s.write(text+'\n'));s.on('data',b=>{out+=b;if(out.length>16384)s.destroy(new Error('SIZE'));});s.on('end',()=>{try{resolve(out.replace(/\n$/,''));}catch{reject(new Error('INVALID_RESPONSE'));}});});
const sendRaw=async text=>JSON.parse(await sendWire(text));
const canon=r=>JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b))));
const evidence=[];
for(const operation of ['readiness_check','backup_restore_verify']){const r=request(operation),wire=await sendWire(canon(r)),receipt=JSON.parse(wire);assert(receipt.payloadBase64,'No successful receipt');const payload=JSON.parse(Buffer.from(receipt.payloadBase64,'base64'));assert.equal(payload.requestId,r.requestId);assert.equal(payload.enforcement,'installed-sandbox-required');assert.equal(payload.outcome,'PASS');fs.writeFileSync(`${r.requestId}.json`,wire,{flag:'wx',mode:0o600});evidence.push({request:r,receipt,receiptFile:`${r.requestId}.json`});}
for(const patch of [{operation:'collect'},{args:[';id']},{executable:'/bin/sh'},{requestId:'../escape'},{input:'/Users/lukesmacminim41/.ssh/id_ed25519'},{input:'/Users/lukesmacminim41/Documents/royal-navy-fleet-status/data/royal-navy/vessels.json'},{output:'/tmp/restore'}]){const r={...request(),...patch},out=await sendRaw(canon(r));assert.equal(out.outcome,'REJECTED');evidence.push({request:r,response:out});}
const same=request('backup_restore_verify');const wires=await Promise.all([sendWire(canon(same)),sendWire(canon(same))]);const pair=wires.map(w=>JSON.parse(w));for(let i=0;i<pair.length;i++)if(pair[i].payloadBase64)fs.writeFileSync(`${same.requestId}.json`,wires[i],{flag:'wx',mode:0o600});assert.equal(pair.filter(r=>r.payloadBase64).length,1);evidence.push({request:same,responses:pair});
const name=`gate-b-postinstall-${Date.now()}.json`;fs.writeFileSync(name,JSON.stringify({scope:'B3-client-evidence-not-authentication-or-scheduler-proof',evidence},null,2),{flag:'wx',mode:0o600});console.log(name);console.log('Client checks complete. Administrator MUST authenticate each successful request ID with installed verify, inspect identities/ownership and run sandbox-probe. This alone is not B3 PASS.');
