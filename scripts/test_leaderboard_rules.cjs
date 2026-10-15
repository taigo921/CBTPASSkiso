// Local Firestore emulator only; no live project or real user records.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const modules=process.env.FIREBASE_TEST_MODULES;
const dependency=name=>require(modules?path.join(modules,name):name);
const {initializeTestEnvironment,assertSucceeds,assertFails}=dependency('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp}=dependency('firebase/firestore');
const root=path.resolve(__dirname,'..');
(async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator is required');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const hashes=text=>[...text.matchAll(/["']([a-f0-9]{64})["']/g)].map(m=>m[1]).sort();
 assert.deepEqual(hashes(rules),hashes(source.slice(source.indexOf('const ALLOW ='),source.indexOf('// ================',source.indexOf('const ALLOW =')))),'client/server approved hash lists match');
 const env=await initializeTestEnvironment({projectId:'demo-cbtpass-member-ranking',firestore:{host,port:+port,rules}});
 const profile=()=>({username:'Test',avatar:'',answered:40,correct:24,accuracy:60,bestStreak:6,dayStreak:2,lastDay:'2026-10-15',game:{xp:100},updatedAt:serverTimestamp()});
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();await setDoc(doc(db,'users','other'),{email:'private@example.test',progressDataV1:'private'});
   await setDoc(doc(db,'leaderboard','other'),profile());
  });
  const learner=env.authenticatedContext('learner',{email:'i.taigo921+ranking@gmail.com',email_verified:true}).firestore();
  await assertSucceeds(getDocs(collection(learner,'leaderboard')));
  await assertFails(setDoc(doc(learner,'leaderboard','learner'),profile()));
  const optIn=writeBatch(learner);optIn.set(doc(learner,'users','learner'),{leaderboardVisible:true},{merge:true});optIn.set(doc(learner,'leaderboard','learner'),profile());await assertSucceeds(optIn.commit());
  await assertSucceeds(setDoc(doc(learner,'leaderboard','learner'),profile()));
  await assertFails(getDoc(doc(learner,'users','other')));await assertFails(getDocs(collection(learner,'users')));
  await assertFails(setDoc(doc(learner,'leaderboard','other'),profile()));
  for(const extra of [{email:'private@example.test'},{perQ:{a:1}},{progressDataV1:'private'},{studyPlans:{}},{mockExams:{}}]){
   await assertFails(setDoc(doc(learner,'leaderboard','learner'),{...profile(),...extra}));
  }
  await assertFails(setDoc(doc(learner,'leaderboard','learner'),{...profile(),correct:100}));
  await assertFails(setDoc(doc(learner,'leaderboard','learner'),{...profile(),game:{xp:1.5}}));
  await assertFails(setDoc(doc(learner,'leaderboard','learner'),{...profile(),game:{xp:10,privateData:'hidden'}}));
  await assertFails(setDoc(doc(learner,'leaderboard','learner'),{...profile(),avatar:'https://invalid.example/image'}));
  await assertFails(updateDoc(doc(learner,'leaderboard','learner'),{email:'private@example.test',updatedAt:serverTimestamp()}));
  for(const [uid,claims] of [['outsider',{email:'unapproved@example.test',email_verified:true}],['unverified',{email:'itaigo921@gmail.com',email_verified:false}],['missing',{}]]){
   const db=env.authenticatedContext(uid,claims).firestore();
   await assertFails(getDocs(collection(db,'leaderboard')));await assertFails(setDoc(doc(db,'leaderboard',uid),profile()));
  }
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(),'leaderboard')));
  const optOut=writeBatch(learner);optOut.set(doc(learner,'users','learner'),{leaderboardVisible:false},{merge:true});optOut.delete(doc(learner,'leaderboard','learner'));await assertSucceeds(optOut.commit());
  assert.equal((await getDoc(doc(learner,'leaderboard','learner'))).exists(),false);
  await assertFails(setDoc(doc(learner,'leaderboard','learner'),profile()));
  const optInAgain=writeBatch(learner);optInAgain.set(doc(learner,'users','learner'),{leaderboardVisible:true},{merge:true});optInAgain.set(doc(learner,'leaderboard','learner'),profile());await assertSucceeds(optInAgain.commit());
  const unverifiedOwner=env.authenticatedContext('learner',{email:'itaigo921@gmail.com',email_verified:false}).firestore();
  const remove=writeBatch(unverifiedOwner);remove.set(doc(unverifiedOwner,'users','learner'),{leaderboardVisible:false},{merge:true});remove.delete(doc(unverifiedOwner,'leaderboard','learner'));await assertSucceeds(remove.commit());
  await assertFails(deleteDoc(doc(learner,'leaderboard','other')));
  const alias=env.authenticatedContext('alias',{email:'itaigo921@googlemail.com',email_verified:true}).firestore();
  await assertSucceeds(getDocs(collection(alias,'leaderboard')));
  const admin=env.authenticatedContext('admin',{email:'itaigo921@gmail.com',email_verified:true}).firestore();
  await assertSucceeds(getDoc(doc(admin,'users','other')));await assertSucceeds(getDocs(collection(admin,'leaderboard')));
  console.log('PASS rules: approved verified members only, Gmail aliases, private progress isolated, owner-only whitelisted summaries, old admin access retained');
 }finally{await env.cleanup();}
})().catch(error=>{console.error(error);process.exitCode=1;});
