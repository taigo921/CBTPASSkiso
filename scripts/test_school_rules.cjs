const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dependency=n=>require(process.env.FIREBASE_TEST_MODULES?path.join(process.env.FIREBASE_TEST_MODULES,n):n);
const {initializeTestEnvironment,assertSucceeds:ok,assertFails:no}=dependency('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,serverTimestamp}=dependency('firebase/firestore');
(async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Local emulator required');
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const base=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8');
 // Replace only the clock source, preserving the production authorization and timestamp validations.
 const cases=[['2026-10-19T08:39:59',true],['2026-10-19T08:40:00',false],['2026-10-19T10:09:59',false],['2026-10-19T10:10:00',true],['2026-10-19T10:25:00',false],['2026-10-19T11:55:00',true],['2026-10-19T12:55:00',false],['2026-10-19T14:25:00',true],['2026-10-19T14:40:00',false],['2026-10-19T16:10:00',true],['2026-10-18T09:00:00',true],['2026-11-03T09:00:00',true],['2027-03-22T09:00:00',true]];
 for(const [time,allowed] of cases){
  const stamp=Date.parse(time+'+09:00');
  const env=await initializeTestEnvironment({projectId:'demo-cbtpass-access',firestore:{host,port:+port,rules:base.replace('let local = request.time +',`let local = timestamp.value(${stamp}) +`)}});
  try{
   await env.clearFirestore();
   const admin=env.authenticatedContext('owner',{email:'itaigo921@gmail.com',email_verified:true}).firestore();
   const learner=env.authenticatedContext('learner',{email:'i.taigo921+school@gmail.com',email_verified:true}).firestore();
   const anonymous=env.unauthenticatedContext().firestore();
   await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'users','learner'),{progressDataV1:'retained'}));
   const check=allowed?ok:no;
   await check(getDoc(doc(learner,'users','learner')));
   await check(setDoc(doc(learner,'users','learner'),{progressDataV1:'retained'}));
   await check(getDoc(doc(learner,'leaderboard','learner')));
   await ok(getDoc(doc(admin,'users','learner')));
   await ok(getDoc(doc(learner,'schoolAccess','settings')));
   await no(getDoc(doc(anonymous,'schoolAccess','settings')));
   const config={enabled:true,exemptDates:[],updatedBy:'owner',updatedAt:serverTimestamp()};
   await no(setDoc(doc(learner,'schoolAccess','settings'),{...config,updatedBy:'learner'}));
   if(!allowed){
    const minutes=Number(time.slice(11,13))*60+Number(time.slice(14,16)),period=minutes<610?1:minutes<715?2:minutes<865?3:4;
    const key=Number(time.slice(0,10).replaceAll('-',''))*10+period;
    await no(setDoc(doc(learner,'schoolAccess','settings'),{...config,releasedPeriod:key,updatedBy:'learner'}));
    await no(setDoc(doc(admin,'schoolAccess','settings'),{...config,releasedPeriod:'invalid'}));
    await ok(setDoc(doc(admin,'schoolAccess','settings'),{...config,releasedPeriod:key}));
    await ok(getDoc(doc(learner,'users','learner')));
    await ok(getDoc(doc(learner,'leaderboard','learner')));
    await ok(setDoc(doc(admin,'schoolAccess','settings'),{...config,releasedPeriod:key-10}));
    await no(getDoc(doc(learner,'users','learner')));
    await ok(setDoc(doc(admin,'schoolAccess','settings'),{...config,releasedPeriod:period===1?key+1:key-1}));
    await no(getDoc(doc(learner,'users','learner')));
   }
   await ok(setDoc(doc(admin,'schoolAccess','settings'),{...config,exemptDates:[Number(time.slice(0,10).replaceAll('-',''))]}));
   await ok(getDoc(doc(learner,'users','learner')));
   await ok(setDoc(doc(admin,'schoolAccess','settings'),{...config,enabled:false}));
   await ok(getDoc(doc(learner,'users','learner')));
   assert.equal((await getDoc(doc(admin,'users','learner'))).data().progressDataV1,'retained');
  }finally{await env.cleanup();}
 }
 console.log('PASS server class access: 13 times/dates, owner bypass, policy permissions, overrides, records retained');
})().catch(e=>{console.error(e);process.exitCode=1;});
