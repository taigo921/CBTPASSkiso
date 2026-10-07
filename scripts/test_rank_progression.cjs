const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const booksCode=source.slice(source.indexOf('const BOOKS ='),source.indexOf('// 模試は通常'));
const ctx={game:{xp:0}};vm.createContext(ctx);
vm.runInContext(booksCode+source.slice(source.indexOf('function levelThreshold('),source.indexOf('function renderGameCard(')),ctx);
const books=vm.runInContext('BOOKS',ctx);
for(const book of Object.values(books)){
 const count=book.files.reduce((n,file)=>n+JSON.parse(fs.readFileSync(path.join(root,file),'utf8')).length,0);
 assert.equal(book.questionCount,count,'rank reference count matches shipped questions');
}
const steps=ctx.rankStepsWithXp();assert.equal(steps.length,32);
for(const name of ['ブロンズ','シルバー','ゴールド','プラチナ','ダイヤ','プロ']){
 for(let n=1;n<=5;n++)assert.ok(steps.some(step=>step.name===name+n));
}
assert.equal(steps.at(-1).name,'マスター');assert.equal(steps.at(-2).name,'プロ5');
for(let i=1;i<steps.length;i++){
 assert.ok(steps[i].xp>steps[i-1].xp);
 ctx.game.xp=steps[i].xp-1;assert.equal(ctx.rankInfo().name,steps[i-1].name);
 ctx.game.xp=steps[i].xp;assert.equal(ctx.rankInfo().name,steps[i].name);
}
ctx.game.xp=23609;assert.equal(ctx.rankInfo().name,'シルバー3');assert.equal(ctx.game.xp,23609);assert.equal(ctx.levelInfo().level,41);assert.equal(ctx.levelThreshold(2),100);
assert.ok(steps.find(step=>step.name==='ダイヤ1').xp>2*23575);
assert.equal(steps.at(-1).xp,78080);
console.log('PASS ranks: 32 stages, both book counts, all XP boundaries, existing XP preserved, slower diamond, pro before master');
