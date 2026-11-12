const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const tabs=['answer','mock','dictionary','dentalMaterials'].map(book=>({dataset:{book},hidden:false}));
const screens=Object.fromEntries(['mockExam','mockSubjectPractice','dictionaryPractice'].map(id=>[id,{classList:{contains:()=>true}}]));
let homes=0,toasts=[];
const context={
  console:{warn(){},log(){}},Date,JSON,Math,Map,Set,Object,Number,String,URL,
  location:{href:'https://app.test/index.html'},history:{replaceState(){}},
  window:{cbtUser:{uid:'learner',email:'learner@example.test',extraMaterials:false}},
  document:{querySelector:()=>null,querySelectorAll:selector=>selector.includes('.book-tab')?tabs:[]},
  el:id=>screens[id],toast:message=>toasts.push(message),renderHome:()=>{homes++;},
  mockHomeSelected:false,dictionaryHomeSelected:false,dentalMaterialsHomeSelected:false,
  settings:{activeBook:'book1'},activeBook:'book1',session:null,QUESTIONS:[],
  saveSession(){},saveStats(){},saveSettings(){},cloudSyncSoon(){},
};
vm.createContext(context);
vm.runInContext(`${slice('const BOOKS =', '// 模試は通常')}
const DEFAULT_QUESTIONS_BY_BOOK=Object.fromEntries(QUESTION_BOOK_KEYS.map(book=>[book,[]]));
const emptyStats=()=>({perQ:{},rankAttempts:[],answered:0,correct:0,curStreak:0,bestStreak:0,dayStreak:0,lastDay:null});
let statsByBook=Object.fromEntries(QUESTION_BOOK_KEYS.map(book=>[book,emptyStats()]));
let stats=statsByBook.book1;
function questionsLoaded(book){return DEFAULT_QUESTIONS_BY_BOOK[book].length>0;}
async function loadDefaultQuestions(){}
function resolveQuestions(){return DEFAULT_QUESTIONS_BY_BOOK[activeBook]||[];}
${slice('function isAccessOwner(', 'function isLeaderboardMember(')}
${slice('async function switchBook(', '/* ============ セッション ============ */')}
const qkey=q=>q.uid||q.id;
${slice('function planQuestions()', 'function planQuestion(')}
${slice('function latestQuestionOutcome(', 'function fullStatsPayload(')}
${slice('function mergeStatsTarget(', 'function cbtMergeCloud(')}
${slice('function mockKeyFor(', 'function progressBackupData(')}
${slice('function mergeCloudPayloads(', '// Detailed progress is loaded by UID')}
`,context);

(async()=>{
  vm.runInContext('updateExtraMaterialsAccess(false)',context);
  assert.ok(tabs.every(tab=>tab.hidden),'ANSWER tab is hidden without extra-material permission');
  await vm.runInContext("switchBook('answer')",context);
  assert.equal(context.activeBook,'book1','rejected ANSWER switch keeps book1 active');
  assert.deepEqual(toasts,['この教材は管理者の許可が必要です']);

  context.window.cbtUser.extraMaterials=true;
  vm.runInContext('updateExtraMaterialsAccess(false)',context);
  assert.ok(tabs.every(tab=>!tab.hidden),'approved users see the ANSWER tab');
  vm.runInContext(`
    DEFAULT_QUESTIONS_BY_BOOK.answer1=[{uid:'ANS1-001',id:'ANS1-001',question:'dummy',choices:{A:'a',B:'b'},answer:'A'}];
    BOOKS.answer1.files=['data/answer1-dummy.json'];
  `,context);
  await vm.runInContext("switchBook('answer')",context);
  assert.equal(context.activeBook,'answer1','ANSWER tab selects the remembered/default volume');
  assert.ok(homes>0,'selecting an available ANSWER volume renders the normal home');
  assert.equal(vm.runInContext("answerVolumeReady('answer1')",context),true);
  assert.equal(vm.runInContext("answerVolumeReady('answer3')",context),false,'empty volumes remain unavailable');

  vm.runInContext(`
    const record=statsByBook.answer1.perQ['ANS1-001']={correct:1,wrong:0,last:'correct',history:[{correct:true,at:100}],fav:false};
    statsByBook.answer1.answered=1;statsByBook.answer1.correct=1;
  `,context);
  const payload=vm.runInContext('compactBooksPayload()',context);
  assert.equal(payload.answer1.perQ['ANS1-001'].c,1,'dummy answer is recorded in statsByBook.answer1 and included in payload');
  assert.equal(payload.answer2,undefined,'empty ANSWER volumes are omitted from payload');
  context.answerPayload=payload.answer1;
  const restored=vm.runInContext("mergeStatsTarget(emptyStats(),answerPayload)",context);
  assert.equal(restored.perQ['ANS1-001'].correct,1,'ANSWER progress restores through the production merge');

  context.oldPayload={activeBook:'book1',books:{book1:{perQ:{Q1:{c:1,w:0,h:{correct:true,at:1}}}}},studyPlans:{},studyTime:{days:{}},game:{xp:10}};
  const oldMerged=vm.runInContext('mergeCloudPayloads({},oldPayload)',context);
  assert.equal(oldMerged.books.book1.perQ.Q1.c,1,'payloads created before ANSWER remain compatible');
  assert.equal(oldMerged.books.answer1,undefined,'old payload merge does not add empty ANSWER data');

  assert.equal(vm.runInContext("planBookForUid('ANS1-001')",context),null,'ANSWER UID is not a route book');
  assert.equal(vm.runInContext("planQuestions().some(q=>q.uid==='ANS1-001')",context),false,'ANSWER questions are excluded from route catalogs');
  assert.match(source,/function updateStudyPlan\(uid,correct\)\{\s*if\(!planBookForUid\(uid\)\)return;/,'route updates reject non-route UIDs');
  assert.match(source,/if\(planBookForUid\(qkey\(q\)\)&&planFor\(\)\.active\)updateStudyPlan/,'normal ANSWER submissions cannot enter the route');
  assert.match(source,/if\(isAnswerBook\(activeBook\)&&!canUseExtraMaterials\(\)\)\{settings\.answerBook=activeBook;activeBook=settings\.activeBook='book1';\}/,'restored ANSWER selection remembers its volume and falls back before startup loading');

  const beforeRevocation=homes;
  context.window.cbtUser.extraMaterials=false;
  vm.runInContext('updateExtraMaterialsAccess()',context);
  assert.equal(context.activeBook,'book1','permission revocation falls back to book1');
  assert.equal(homes,beforeRevocation+1,'permission revocation returns to the book home');
  console.log('PASS ANSWER books: access, volume selection, stats/payload/merge, old payload, route exclusion');
})().catch(error=>{console.error(error);process.exitCode=1;});
