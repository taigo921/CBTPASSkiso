const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const tabs=['mock','dictionary','dentalMaterials'].map(book=>({dataset:{book},hidden:false}));
const screens=Object.fromEntries(['mockExam','mockSubjectPractice','dictionaryPractice'].map(id=>[id,{classList:{contains:()=>true}}]));
let homes=0,toasts=[];
const context={
  window:{cbtUser:{uid:'learner',email:'learner@example.test',extraMaterials:false}},
  document:{querySelector:()=>null,querySelectorAll:selector=>selector.includes('.book-tab')?tabs:[]},
  el:id=>screens[id],renderHome:()=>{homes++;},toast:message=>toasts.push(message),
  mockHomeSelected:false,dictionaryHomeSelected:false,dentalMaterialsHomeSelected:false,
  BOOKS:{book1:{title:'問題集1'},book2:{title:'問題集2'}},activeBook:'book1'
};
vm.createContext(context);
vm.runInContext(slice('function isAccessOwner(', 'function isLeaderboardMember('),context);
vm.runInContext(slice('async function switchBook(', '/* ============ セッション ============ */'),context);

(async()=>{
  vm.runInContext('updateExtraMaterialsAccess(false)',context);
  assert.ok(tabs.every(tab=>tab.hidden),'non-approved users cannot see any extra-material tab');
  await vm.runInContext("switchBook('mock')",context);
  assert.deepEqual(toasts,['この教材は管理者の許可が必要です']);
  assert.equal(context.mockHomeSelected,false,'rejected switch does not select the mock exam');

  context.window.cbtUser.extraMaterials=true;
  vm.runInContext('updateExtraMaterialsAccess(false)',context);
  assert.ok(tabs.every(tab=>!tab.hidden),'approved users see all extra-material tabs');
  await vm.runInContext("switchBook('dictionary')",context);
  assert.equal(context.dictionaryHomeSelected,true,'approved users can switch to an extra material');

  context.window.cbtUser={uid:'owner',email:'itaigo921@gmail.com',extraMaterials:false};
  vm.runInContext('updateExtraMaterialsAccess(false)',context);
  assert.ok(tabs.every(tab=>!tab.hidden),'the administrator always sees extra materials');

  context.window.cbtUser={uid:'learner',email:'learner@example.test',extraMaterials:false};
  context.dictionaryHomeSelected=true;screens.dictionaryPractice.classList.contains=()=>false;
  const before=homes;vm.runInContext('updateExtraMaterialsAccess()',context);
  assert.equal(context.dictionaryHomeSelected,false);
  assert.equal(homes,before+1,'revocation while studying returns to the regular-book home');
  assert.ok(tabs.every(tab=>tab.hidden));

  assert.match(source,/function renderHome\(\)\{\s*if\(!canUseExtraMaterials\(\)\)/,'renderHome independently rejects restored extra-material state');
  console.log('PASS extra materials access: hidden tabs, guarded switch, approved/admin access, live revocation');
})().catch(error=>{console.error(error);process.exitCode=1;});
