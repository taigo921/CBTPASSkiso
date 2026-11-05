const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');

const path=require('node:path');
const questions=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/C4-001-094.json'),'utf8'));
const e2Questions=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/E2.json'),'utf8'));
const e3Questions=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/E3.json'),'utf8'));
const e4Questions=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/E4.json'),'utf8'));
const byUid=uid=>questions.find(question=>question.uid===uid);
const e2ByUid=uid=>e2Questions.find(question=>question.uid===uid);
const e3ByUid=uid=>e3Questions.find(question=>question.uid===uid);
const e4ByUid=uid=>e4Questions.find(question=>question.uid===uid);
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

const salivaryStone=e2ByUid('E2-4-8-157');
assert.equal(sha(salivaryStone),'83c9d80c8344c0acaa4bd1f3c8f1f755a9c76f5e7b5c87444b73dab815159dfc','E2-4-8-157 keeps the complete panoramic radiograph');
assert.equal(salivaryStone.choices.A,'唾石症');
assert.equal(salivaryStone.answer,'A');

const condylarFracture=e2ByUid('E2-4-2-036');
assert.equal(sha(condylarFracture),'d96938f36dc61891d3bee248ed80ed632968c497fdcc909d0e597bda65925608','E2-4-2-036 keeps the complete panoramic radiograph');
assert.equal(condylarFracture.choices.E,'外側翼突筋');
assert.equal(condylarFracture.answer,'E');

const luxatedTeeth=e2ByUid('E2-4-2-041');
assert.equal(sha(luxatedTeeth),'e4fc356e1f6a6415fd8fc333de6aa307f2f50ca03fd697c7208a5e743ae2a15f','E2-4-2-041 keeps the initial, reduced, and wire-splint photographs');
assert.equal(luxatedTeeth.choices.A,'歯の脱臼');
assert.equal(luxatedTeeth.answer,'A');

const missingPremolar=e4ByUid('E4-2-021');
assert.equal(sha(missingPremolar),'9584221deb13ed9bdf11d64b8c5ba2826d5872a0946e4c70dcd3f525d273093f','E4-2-021 keeps the complete panoramic radiograph');
assert.equal(missingPremolar.choices.D,'下顎左側第二小臼歯');
assert.equal(missingPremolar.answer,'D');

console.log('PASS reported question images: allergy, trauma, full panoramic radiographs, salivary stone, pulpitis, curette, rest-position, and articulator figures are aligned');
