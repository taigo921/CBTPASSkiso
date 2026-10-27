const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');

const questions=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/C4-001-094.json'),'utf8'));
const byUid=uid=>questions.find(question=>question.uid===uid);
const imageBytes=question=>Buffer.from(String(question.image_base64).replace(/^data:[^;]+;base64,/,''),'base64');
const sha=question=>crypto.createHash('sha256').update(imageBytes(question)).digest('hex');

const typeThree=byUid('C4-083'),typeFour=byUid('C4-085'),typeTwo=byUid('C4-087');
assert.ok(typeThree?.image_base64&&typeFour?.image_base64&&typeTwo?.image_base64,'reported allergy questions keep their figures');
assert.notEqual(sha(typeTwo),sha(typeThree),'C4-087 type II figure must not reuse C4-083 type III figure');
assert.equal(sha(typeTwo),'060d2888fa928d3d508ba80393ead49f0fe3b46d65733a9fcf3bdc536f35fa9e','C4-087 keeps the verified NK cell / IgG / complement figure');
assert.equal(typeTwo.answer,'E');
assert.match(typeTwo.explanation_intro,/II型アレルギー/);
assert.equal(typeFour.answer,'D');
assert.match(typeFour.explanation_intro,/IV型アレルギー/);

console.log('PASS reported question images: C4-087 type II figure restored; C4-083/085 remain distinct and aligned');
