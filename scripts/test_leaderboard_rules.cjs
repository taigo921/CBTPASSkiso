// Retired public leaderboard must stay unreadable, even for an old member client.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dep=n=>require(process.env.FIREBASE_TEST_MODULES?path.join(process.env.FIREBASE_TEST_MODULES,n):n);
const {initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=dep('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,setDoc,deleteDoc}=dep('firebase/firestore');
(async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Local emulator required');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-cbtpass-access',firestore:{host,port:+port,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 try{
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users','learner'),{username:'Test',progressDataV1:'preserved'});await setDoc(doc(db,'leaderboard','learner'),{username:'Old summary'});});
  const admin=env.authenticatedContext('owner',{email:'itaigo921@gmail.com',email_verified:true}).firestore();
  const member=env.authenticatedContext('learner',{email:'itaigo921@gmail.com',email_verified:false}).firestore();
  const other=env.authenticatedContext('other',{email:'other@example.test',email_verified:true}).firestore();
  for(const db of [admin,member,other,env.unauthenticatedContext().firestore()]){
   await no(getDocs(collection(db,'leaderboard')));await no(getDoc(doc(db,'leaderboard','learner')));await no(setDoc(doc(db,'leaderboard','learner'),{username:'republish'}));
  }
  await no(getDocs(collection(member,'users')));await no(getDocs(collection(other,'users')));
  await ok(getDocs(collection(admin,'users')));assert.equal((await getDoc(doc(admin,'users','learner'))).data().progressDataV1,'preserved');
  await no(deleteDoc(doc(other,'leaderboard','learner')));await ok(deleteDoc(doc(member,'leaderboard','learner')));await ok(deleteDoc(doc(admin,'leaderboard','learner')));
  console.log('PASS retired ranking rules: old public reads and writes denied, admin private ranking retained, progress untouched, cleanup allowed');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
