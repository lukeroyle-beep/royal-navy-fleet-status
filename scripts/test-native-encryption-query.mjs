import assert from 'node:assert/strict';
import { verifyNativeEncryptionQuery, encryptionQueryToolInput } from './lib/native-encryption-query.mjs';

const now = Date.parse('2026-10-02T17:00:02Z'), mount = '/Volumes/Fixture Backup';
const plist = `<?xml version="1.0"?><plist><dict>
<key>FileVault</key><true/><key>Encryption</key><true/><key>Locked</key><false/>
<key>MountPoint</key><string>${mount}</string>
<key>DeviceIdentifier</key><string>disk7s2</string><key>DeviceNode</key><string>/dev/disk7s2</string>
<key>VolumeUUID</key><string>12345678-1234-1234-1234-123456789abc</string></dict></plist>`;
const records = [
  { type:'session_meta', payload:{id:'fixture-thread'} },
  { timestamp:'2026-10-02T17:00:00Z', type:'response_item', payload:{type:'custom_tool_call',name:'exec',call_id:'fixture-call',input:encryptionQueryToolInput(mount)} },
  { timestamp:'2026-10-02T17:00:01Z', type:'response_item', payload:{type:'custom_tool_call_output',call_id:'fixture-call',output:[{type:'input_text',text:JSON.stringify({exit_code:0,output:plist})}]} },
];
const options={records,threadId:'fixture-thread',callId:'fixture-call',mount,now};
assert.equal(verifyNativeEncryptionQuery(options).DeviceNode,'/dev/disk7s2');
const deny = change => {const x=structuredClone(options);change(x);assert.throws(()=>verifyNativeEncryptionQuery(x),/UNVERIFIED/);};
deny(x=>x.now+=60000);
deny(x=>x.now-=2000);
deny(x=>x.threadId='other-thread');
deny(x=>x.callId='other-call');
deny(x=>x.mount='/Volumes/Replacement');
deny(x=>x.records[1].payload.input='text({exit_code:0,output:"invented"});');
deny(x=>x.records[1].payload.input=x.records[1].payload.input.replace('4000','4000,"sandbox_permissions":"require_escalated"'));
deny(x=>x.records[2].payload.output[0].text=JSON.stringify({exit_code:1,output:plist}));
deny(x=>x.records[2].payload.output[0].text=JSON.stringify({exit_code:0,output:plist.replace('<key>Encryption</key><true/>','<key>Encryption</key><false/>')}));
deny(x=>x.records[2].payload.output[0].text=JSON.stringify({exit_code:0,output:plist.replace('/dev/disk7s2','/dev/disk8s2')}));
deny(x=>x.records[2].payload.output[0].text=JSON.stringify({exit_code:0,output:plist.replace('</dict>','<key>Locked</key><true/></dict>')}));
deny(x=>x.records.push(x.records[2]));
console.log('Native query provenance fixtures: exact tool invocation, thread/call identity, freshness, failed query, encryption and mount substitution rejected.');
