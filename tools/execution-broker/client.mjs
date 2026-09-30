// Untrusted stdio MCP transport; this process receives no signing key or worker authority.
import net from 'node:net';
import readline from 'node:readline';
export const POLICY = 'rnfs-gate-b-v1';
export const SOCKET = '/private/var/db/rnfs-broker/service.sock';
const names = ['readiness_check', 'backup_restore_verify'];
const object = x => x && typeof x === 'object' && !Array.isArray(x);
export function validate(name, a) {
  return names.includes(name) && object(a) && Object.keys(a).sort().join(',') === 'operation,policyVersion,requestId' &&
    a.operation === name && a.policyVersion === POLICY && typeof a.requestId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.requestId);
}
export function exchange(a) {
  return new Promise((resolve,reject) => {
    const socket=net.createConnection(SOCKET); let bytes=0, parts=[];
    socket.setTimeout(18000,()=>socket.destroy(new Error('TIMEOUT')));
    socket.on('error',reject);
    socket.on('connect',()=>socket.write(JSON.stringify({operation:a.operation,policyVersion:a.policyVersion,requestId:a.requestId})+'\n'));
    socket.on('data',b=>{ bytes+=b.length; if(bytes>16384) socket.destroy(new Error('SIZE')); else parts.push(b); });
    socket.on('end',()=>{ try {resolve(JSON.parse(Buffer.concat(parts).toString()));} catch {reject(new Error('INVALID_RESPONSE'));} });
  });
}
export async function dispatch(m, call=exchange) {
  if(!object(m)||m.jsonrpc!=='2.0'||!['string','number'].includes(typeof m.id)||Object.keys(m).some(k=>!['jsonrpc','id','method','params'].includes(k))) return null;
  const reply=result=>({jsonrpc:'2.0',id:m.id,result});
  if(m.method==='initialize') return reply({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'rnfs-gate-b',version:'1.0.0'}});
  if(m.method==='ping') return reply({});
  if(m.method==='tools/list') return reply({tools:names.map(name=>({name,description:'Isolated Gate B local verification only; no collection or publication authority.',inputSchema:{type:'object',properties:{operation:{const:name,type:'string'},policyVersion:{const:POLICY,type:'string'},requestId:{type:'string'}},required:['operation','policyVersion','requestId'],additionalProperties:false}}))});
  const p=m.params;
  if(m.method!=='tools/call'||!object(p)||Object.keys(p).some(k=>!['name','arguments','_meta'].includes(k))||('_meta' in p&&!object(p._meta))||!validate(p.name,p.arguments)) return reply({isError:true,content:[{type:'text',text:'REJECTED'}]});
  try { const r=await call(p.arguments); return reply({isError:r.outcome==='REJECTED',content:[{type:'text',text:JSON.stringify(r)}]}); }
  catch { return reply({isError:true,content:[{type:'text',text:'BROKER_UNAVAILABLE'}]}); }
}
if(process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) {
  // Sequential adapter, with bounded lines; independent adapters still meet OS locking.
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  let chain=Promise.resolve();
  rl.on('line',line=>{ if(line.length>8192) {rl.close();process.stdin.destroy();return;} chain=chain.then(async()=>{try {const r=await dispatch(JSON.parse(line));if(r) process.stdout.write(JSON.stringify(r)+'\n');}catch {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');}}); });
}
