const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dependency=n=>require(process.env.FIREBASE_TEST_MODULES?path.join(process.env.FIREBASE_TEST_MODULES,n):n);
const {initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=dependency('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,runTransaction,serverTimestamp}=dependency('firebase/firestore');
(async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Local emulator required');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-cbtpass-access',firestore:{host,port:+port,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 try{
  await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'schoolAccess','settings'),{enabled:false,exemptDates:[]});});
  await env.withSecurityRulesDisabled(async c=>{for(const uid of ['owner','learner','other'])await setDoc(doc(c.firestore(),'users',uid),{progressDataV1:'untouched'});});
  const admin=env.authenticatedContext('owner',{email:'itaigo921@gmail.com',email_verified:true}).firestore();
  const learner=env.authenticatedContext('learner',{email:'learner@example.test',email_verified:true}).firestore();
  const unverified=env.authenticatedContext('owner',{email:'itaigo921@gmail.com',email_verified:false}).firestore();
  const anonymous=env.unauthenticatedContext().firestore();
  const record=b=>({blocked:b,updatedBy:'owner',updatedAt:serverTimestamp()});
  await ok(getDoc(doc(learner,'accessControl','learner')));
  await ok(getDoc(doc(learner,'users','learner')));
  await ok(updateDoc(doc(learner,'users','learner'),{score:10}));
  const chunk={version:2,generation:'v2-test',index:0,data:'{"version":1,"data":{}}'};
  await ok(setDoc(doc(learner,'users','learner','progressChunks','chunk0'),chunk));
  await ok(getDoc(doc(learner,'users','learner','progressChunks','chunk0')));
  await ok(getDoc(doc(admin,'users','learner','progressChunks','chunk0')));
  await no(getDocs(collection(learner,'users','learner','progressChunks')));
  await no(getDoc(doc(learner,'users','other','progressChunks','chunk0')));
  await no(setDoc(doc(learner,'users','other','progressChunks','chunk0'),chunk));
  await no(setDoc(doc(learner,'users','learner','progressChunks','invalid'),chunk));
  await no(setDoc(doc(learner,'users','learner','progressChunks','chunk1'),{...chunk,extra:true}));
  await ok(runTransaction(learner,async transaction=>{
    const root=doc(learner,'users','learner');await transaction.get(root);
    transaction.update(root,{progressDataV2:{version:2,generation:'v2-transaction',chunkCount:2,charLength:42}});
    transaction.set(doc(learner,'users','learner','progressChunks','chunk0'),{...chunk,generation:'v2-transaction'});
    transaction.set(doc(learner,'users','learner','progressChunks','chunk1'),{...chunk,generation:'v2-transaction',index:1});
  }));
  for(const db of [learner,unverified,anonymous]){await no(getDocs(collection(db,'accessControl')));await no(setDoc(doc(db,'accessControl','learner'),record(true)));}
  await no(getDoc(doc(learner,'accessControl','other')));
  await no(setDoc(doc(admin,'accessControl','owner'),record(true)));
  await no(setDoc(doc(admin,'accessControl','missing'),record(true)));
  for(const extra of [{blocked:'true'},{updatedBy:'learner'},{updatedAt:0},{extra:'no'}])await no(setDoc(doc(admin,'accessControl','learner'),{...record(true),...extra}));
  await ok(setDoc(doc(admin,'accessControl','learner'),record(true)));
  await ok(getDocs(collection(admin,'accessControl')));
  await ok(getDoc(doc(learner,'accessControl','learner')));
  await no(getDoc(doc(learner,'users','learner')));
  await no(updateDoc(doc(learner,'users','learner'),{score:999}));
  await no(deleteDoc(doc(learner,'accessControl','learner')));
  await no(setDoc(doc(learner,'accessControl','learner'),{blocked:false}));
  await no(getDoc(doc(learner,'users','other')));await no(getDocs(collection(learner,'users')));
  assert.equal((await getDoc(doc(admin,'users','learner'))).data().progressDataV1,'untouched');
  await ok(setDoc(doc(admin,'accessControl','learner'),record(false)));
  await ok(getDoc(doc(learner,'users','learner')));await ok(updateDoc(doc(learner,'users','learner'),{score:11}));
  await ok(deleteDoc(doc(learner,'users','learner','progressChunks','chunk0')));
  await ok(deleteDoc(doc(learner,'users','learner','progressChunks','chunk1')));
  await no(deleteDoc(doc(admin,'accessControl','learner')));
  console.log('PASS access rules: verified admin, self/schema protection, block/unblock, private data and progress preserved');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
