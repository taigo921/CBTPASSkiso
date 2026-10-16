const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dep=n=>require(process.env.FIREBASE_TEST_MODULES?path.join(process.env.FIREBASE_TEST_MODULES,n):n);
const {initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=dep('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,setDoc,deleteDoc,serverTimestamp,writeBatch}=dep('firebase/firestore');
(async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST);const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const rules=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const hashes=s=>[...s.matchAll(/["']([a-f0-9]{64})["']/g)].map(m=>m[1]).sort();assert.deepEqual(hashes(rules),hashes(html.slice(html.indexOf('const ALLOW ='),html.indexOf('// ================',html.indexOf('const ALLOW =')))));
 const env=await initializeTestEnvironment({projectId:'demo-cbtpass-access',firestore:{host,port:+port,rules}});
 const summary=()=>({username:'Test',avatar:'',answered:40,correct:24,accuracy:60,bestStreak:0,dayStreak:0,lastDay:null,game:{xp:100},updatedAt:serverTimestamp()});
 try{
  await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users','member'),{leaderboardVisible:false,progressDataV1:'private'});await setDoc(doc(c.firestore(),'users','other'),{progressDataV1:'private'});});
  const admin=env.authenticatedContext('owner',{email:'itaigo921@gmail.com',email_verified:true}).firestore();
  const member=env.authenticatedContext('member',{email:'i.taigo921+member@gmail.com',email_verified:true}).firestore();
  await ok(getDocs(collection(member,'leaderboard')));await ok(setDoc(doc(member,'leaderboard','member'),summary()));
  // Reproduce the actual legacy date mismatch against the production rules.
  await no(setDoc(doc(member,'leaderboard','member'),{...summary(),lastDay:'2026-9-22'}));
  const vm=require('node:vm'),context={safeAvatar:()=>''};vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function leaderboardDateKey('),html.indexOf('async function renderLeaderboard(')),context);
  const oldProgress={username:'Test',lastDay:'2026-9-22',answered:40,correct:24,game:{xp:100}};
  const normalized=JSON.parse(JSON.stringify(context.leaderboardPublicSummary(oldProgress)));
  assert.equal(normalized.lastDay,'2026-09-22');assert.equal(oldProgress.lastDay,'2026-9-22');
  const batch=writeBatch(admin);batch.set(doc(admin,'leaderboard','member'),{...normalized,updatedAt:serverTimestamp()});batch.set(doc(admin,'leaderboard','other'),{...summary(),lastDay:'2026-10-16'});await ok(batch.commit());

  await no(deleteDoc(doc(member,'leaderboard','member')));await no(setDoc(doc(member,'leaderboard','other'),summary()));
  await no(getDocs(collection(member,'users')));await no(getDoc(doc(member,'users','other')));await no(getDocs(collection(member,'accessControl')));
  await no(setDoc(doc(member,'leaderboard','member'),{...summary(),email:'private@test'}));
  await ok(setDoc(doc(admin,'leaderboard','other'),summary()));
  for(const [uid,email,verified] of [['outside','no@example.test',true],['unverified','itaigo921@gmail.com',false]]){
   const db=env.authenticatedContext(uid,{email,email_verified:verified}).firestore();await no(getDocs(collection(db,'leaderboard')));await no(setDoc(doc(db,'leaderboard',uid),summary()));
  }
  await no(getDocs(collection(env.unauthenticatedContext().firestore(),'leaderboard')));
  await ok(setDoc(doc(admin,'accessControl','member'),{blocked:true,updatedBy:'owner',updatedAt:serverTimestamp()}));
  await no(getDocs(collection(member,'leaderboard')));await no(setDoc(doc(member,'leaderboard','member'),summary()));await no(setDoc(doc(admin,'leaderboard','member'),summary()));
  await ok(deleteDoc(doc(admin,'leaderboard','member')));
  await ok(setDoc(doc(admin,'accessControl','member'),{blocked:false,updatedBy:'owner',updatedAt:serverTimestamp()}));await ok(getDocs(collection(member,'leaderboard')));
  assert.equal((await getDoc(doc(admin,'users','member'))).data().progressDataV1,'private');
  console.log('PASS rules: all approved verified members, no opt-out, admin backfill, blocked user denial, private progress/access management protected');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
