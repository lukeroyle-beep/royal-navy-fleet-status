// Maintenance helper for macOS: generates display copies, retaining originals.
// Copies are committed, so builds and CI do not require sips.
import { readdirSync, mkdirSync, statSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../public/photos/', import.meta.url));
const target = `${source}cards/`;
mkdirSync(target, {recursive:true});
let before=0,after=0;
for(const name of readdirSync(source).filter(name=>name.endsWith('.jpg'))){
  execFileSync('sips',['-Z','720','-s','formatOptions','65',`${source}${name}`,'--out',`${target}${name}`],{stdio:'ignore'});
  if(statSync(`${target}${name}`).size>statSync(`${source}${name}`).size)copyFileSync(`${source}${name}`,`${target}${name}`);
  before+=statSync(`${source}${name}`).size;after+=statSync(`${target}${name}`).size;
}
console.log(JSON.stringify({originalBytes:before,cardBytes:after}));
