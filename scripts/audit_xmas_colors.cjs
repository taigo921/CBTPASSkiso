#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const files=[
  'index.html',
  'features/dictionary-practice/dictionary-practice.css',
  'features/dictionary-practice/dictionary-practice.js'
];
const blueHex=[
  '0B1640','10213E','172033','172554','173977','173A78','1A73E8','1D4ED8','1E3A8A','243B78','244F82',
  '35445E','3B1C6E','3B5BDB','3B82F6','4285F4','496BA8','4D5D78','52647F','526A84','60728D','60A5FA',
  '65758D','687086','78879A','85A9E6','89A9D0','8A98AD','8B96A8','929CAD','B8C6D9','BFD2F2',
  'CAD9EF','CBD8EA','CBD8F3','CDDCF5','D4E1F5','D5E1F3','D7E0EE','D8E4F5','DCE6F3','DCE6F6',
  'DFE6F1','DFE7F2','E0E7F1','E1E8F2','E2E8F1','E2EAF6','E5EBF5','E6ECF5','E7EFFA',
  'EAF0FA','EAF2FF','EEF1FA','EEF3FA','EEF4FF','EEF3FF','F1F6FF','F2F6FF','F3F7FF','F4F7FC','F4F8FF','F5F8FD','F6F8FC'
];
const colorPattern=new RegExp(`#(?:${blueHex.join('|')})\\b|rgba?\\(\\s*(?:11\\s*,\\s*22\\s*,\\s*64|12\\s*,\\s*29\\s*,\\s*66|23\\s*,\\s*37\\s*,\\s*84|25\\s*,\\s*55\\s*,\\s*110|26\\s*,\\s*115\\s*,\\s*232|29\\s*,\\s*78\\s*,\\s*216|59\\s*,\\s*28\\s*,\\s*110|66\\s*,\\s*133\\s*,\\s*244)\\s*,[^)]*\\)`,'ig');

const results={overridden:[],offOnly:[],unhandled:[]};
for(const file of files){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const lines=source.split(/\r?\n/);
  const xmasStart=file==='index.html'?lines.findIndex(line=>line.includes('html.xmas{')):-1;
  const xmasEnd=file==='index.html'?lines.findIndex((line,index)=>index>xmasStart&&line.includes('@keyframes xmasSnowFall')):-1;
  lines.forEach((line,index)=>{
    const colors=[...line.matchAll(colorPattern)].map(match=>match[0]);
    if(!colors.length)return;
    const item=`${file}:${index+1} ${colors.join(', ')} ${line.trim()}`;
    if(file==='index.html'&&index>=xmasStart&&index<xmasEnd){
      results.unhandled.push(item);
    }else if(/classList\.contains\(['"]xmas['"]\)/.test(line)){
      results.offOnly.push(item);
    }else if((file.endsWith('.css'))||(file==='index.html'&&index<xmasStart)){
      results.overridden.push(item);
    }else{
      results.unhandled.push(item);
    }
  });
}

const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const required=[
  '--green:#166534','--green-d:#14532D','--green-l:#22A35A','--xmas-red:#B91C1C','--xmas-red-d:#7F1D1D',
  '--xmas-gold:#D4A017','--xmas-gold-l:#F5D06F','--bg:#FBF8F1','--line:#EDE5D8','--ink:#2A1F1A','--muted:#6B5E55'
];
for(const token of required)if(!index.includes(token))results.unhandled.push(`index.html: missing required palette token ${token}`);
const xmasBlock=index.slice(index.indexOf('html.xmas{'),index.indexOf('@keyframes xmasSnowFall'));
for(const protectedName of ['--correct:','--correct-bg:','--wrong:','--wrong-bg:']){
  if(xmasBlock.includes(protectedName))results.unhandled.push(`index.html: protected semantic color overridden in xmas block: ${protectedName}`);
}
function relativeLuminance(hex){
  const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
}
function contrastRatio(a,b){
  const first=relativeLuminance(a),second=relativeLuminance(b);
  return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);
}
const secondaryButton=xmasBlock.match(/html\.xmas \.btn\.sec\{([^}]+)\}/)?.[1]||'';
const secondaryBackground=secondaryButton.match(/background:(#[0-9A-Fa-f]{6})/)?.[1];
const secondaryColor=secondaryButton.match(/(?:^|;)color:(#[0-9A-Fa-f]{6})/)?.[1];
if(!secondaryBackground||!secondaryColor)results.unhandled.push('index.html: xmas .btn.sec must declare literal background and color');
else if(secondaryBackground.toLowerCase()===secondaryColor.toLowerCase())results.unhandled.push('index.html: xmas .btn.sec color equals background');
else if(contrastRatio(secondaryBackground,secondaryColor)<4.5)results.unhandled.push(`index.html: xmas .btn.sec contrast is below 4.5:1 (${contrastRatio(secondaryBackground,secondaryColor).toFixed(2)}:1)`);

for(const [name,items] of Object.entries(results)){
  console.log(`${name}: ${items.length}`);
  for(const item of items)console.log(`  ${item}`);
}
if(results.unhandled.length){
  console.error(`Xmas color audit failed: ${results.unhandled.length} unhandled blue literal(s) or contract error(s).`);
  process.exitCode=1;
}else{
  console.log('Xmas color audit passed: no blue literal is active while html.xmas is present.');
}
