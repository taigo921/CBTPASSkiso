const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');

const path=require('node:path');
const questions=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/C4-001-094.json'),'utf8'));
const e3Questions=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/E3.json'),'utf8'));
const byUid=uid=>questions.find(question=>question.uid===uid);
const e3ByUid=uid=>e3Questions.find(question=>question.uid===uid);
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

const articulator=e3ByUid('E3-4-2-106');
assert.ok(articulator?.image_base64,'E3-4-2-106 keeps its complete articulator figure');
assert.equal(sha(articulator),'b03ee3d2386b7a1f084398c8abc1f309b4e2deda4c4030ad00d916c4efd47da6','E3-4-2-106 keeps the reviewed figure containing labels （ア）〜（オ）');
assert.deepEqual(articulator.choices,{A:'（ア）',B:'（イ）',C:'（ウ）',D:'（エ）',E:'（オ）'});
assert.equal(articulator.answer,'A');

const pulpitis=e3ByUid('E3-3-2-049');
assert.equal(sha(pulpitis),'2b714a7025c84034cb3fd7e40ed50087bd8b637448ca40de3d4449602cccb2bb','E3-3-2-049 keeps the source-matched radiograph');
assert.equal(pulpitis.answer,'C');

const curette=e3ByUid('E3-3-3-097');
assert.equal(sha(curette),'327d965f72febcbf6e65700db343352d6a54014d73d0eb9e0a9032884bb0cbef','E3-3-3-097 keeps the complete figure containing labels （ア）〜（オ）');
assert.deepEqual(curette.choices,{A:'（ア）',B:'（イ）',C:'（ウ）',D:'（エ）',E:'（オ）'});
assert.equal(curette.answer,'C');

const restPosition=e3ByUid('E3-4-2-098');
assert.equal(sha(restPosition),'a9c906a9d69f67b1ca4477024745e44c5752ffc0f7dd7b446ad5a751caccc720','E3-4-2-098 keeps both rest-position and denture-wearing photographs');
assert.equal(restPosition.answer,'E');

console.log('PASS reported question images: allergy, pulpitis, curette, rest-position, and articulator figures are aligned');
