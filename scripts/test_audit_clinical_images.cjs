const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const expected = {
  'E1-2-023': ['E1.json', 'D', '76570dabfdb39463c0632888ffb8f3caca93e50519600f2082ef4899893c34f7'],
  'E1-2-039': ['E1.json', 'D', '7d449a6996e08b92a726de9b389fcc04fc9f7175218e64fbc9da802d608dba2b'],
  'E1-2-043': ['E1.json', 'C', '88104330c9bf32299dff3d41262d2e5f7eb074a44101b4ba905c5f6c88c598ca'],
  'E1-5-008': ['E1.json', 'C', 'be74703d6c36aed0dd743f7c97c3473d0917d95cdaef12cd357184150618f7ae'],
  'E2-1-021': ['E2.json', 'B', '45468123d54a4db4dff946d33d97c11197fed6e43b7c7c47bb0ab1fb1c7d0353'],
  'E2-2-014': ['E2.json', 'D', '17dc88c7d2355bcd63e9f2e07c7ed867b8e195319ef38feedb9106c4b4b2733b'],
  'E2-4-1-024': ['E2.json', 'C', '993afa968c9cc28679cf4097266021ce49fd8c033196b650716f8b58f1747e48'],
  'E2-4-1-025': ['E2.json', 'D', '1681e8743ebddb4f20c29623c761a0ddfd78d9eac391ef8ee1e88814054a6c69'],
  'E2-4-5-111': ['E2.json', 'C', 'f0d0216dbaaad6393892fbeb1b981641d48fa19114afd66bf5f76c96644d0a2d'],
  'E2-4-5-112': ['E2.json', 'E', 'cb77f8ebb7236a935f25562b8ab9b58cbf994682bf448fea33d580b2ef2ae600'],
  'E2-4-10-188': ['E2.json', 'B', '002f9f4f52cedbe0bd0188f8aef45800894592e51908ea4b5ffbbe3d901e65d0'],
  'E2-4-10-190': ['E2.json', 'E', 'bd07b7e7f44c05e225f8f6041ebbd9d44ac899e572b8aaa8b032a1b9f2829e4a'],
  'E3-1-028': ['E3.json', 'E', '680f7cac36a57908e10defc0b70144f91a47d81b2d6dfe776119b3a02781fff7'],
  'E3-3-3-080': ['E3.json', 'A', '8d1fd05f5d9cb6265bab2a38ea9cc304b7a93a66feeabd9aa074a08d89773b17'],
  'E3-3-3-100': ['E3.json', 'A', '958d85c1e648d172c8e4c2f571765fedb1bff5808e3588f607aa3431aae56155'],
  'E3-3-3-112': ['E3.json', 'E', 'a4cfbb388ef6c4e7cec802da296ae094df74e2e26dd361ad2d114858ec364b11'],
  'E3-3-3-116': ['E3.json', 'C', '8d55c07f5a747b7d73d9eb7f1c8aff64b329ec0ff8b3ac81641558ed49b9de9c'],
  'E3-4-1-001': ['E3.json', 'C', '0e926fcd6983321c9d9afed6c4f52a50efba773009a8ffcc70be2fdbce735532'],
  'E3-4-2-083': ['E3.json', 'C', '625d4cd8ce05b73c546c5061b870488131dea0a409d017d1da6cde551da516e0'],
  'E3-4-2-091': ['E3.json', 'D', 'df73564794f02b42b09e4d74d65d459131aa1b74a54610a71586801cd0039ff5'],
  'E4-1-026': ['E4.json', 'A', '0135913d985bf7c95cd05c4f490afe51d09d06268d38bd57b564941890e16bba'],
  'E4-1-035': ['E4.json', 'B', '81696dc82cb492e4fd7949bb4e51837f9e62bb141bd537658a82878ee6021640'],
  'E4-1-043': ['E4.json', 'C', '1a5997da8ed4c1f2a4211f8ca6913031f252ee0bd9db16916b62521d67d11c88'],
  'E5-2-009': ['E5.json', 'E', 'c91598f6c1007635818143b0bd682b8f01e2893b4684f00dd2e416aa526a50b8'],
};

const cache = new Map();
const questions = filename => {
  if (!cache.has(filename)) {
    cache.set(filename, JSON.parse(fs.readFileSync(path.join(__dirname, '../data', filename), 'utf8')));
  }
  return cache.get(filename);
};
const imageBytes = question => Buffer.from(
  String(question.image_base64).replace(/^data:[^;]+;base64,/, ''),
  'base64',
);
const sha = question => crypto.createHash('sha256').update(imageBytes(question)).digest('hex');

for (const [uid, [filename, answer, expectedSha]] of Object.entries(expected)) {
  const matches = questions(filename).filter(question => question.uid === uid);
  assert.equal(matches.length, 1, `${uid} must exist exactly once in ${filename}`);
  const question = matches[0];
  assert.match(question.image_base64, /^data:image\/webp;base64,/, `${uid} must use a WebP data URI`);
  assert.equal(question.answer, answer, `${uid} answer must remain unchanged`);
  assert.equal(sha(question), expectedSha, `${uid} must keep the visually reviewed complete figure`);
}

const e1Questions = questions('E1.json');
const e1_2_038 = e1Questions.find(question => question.uid === 'E1-2-038');
const e1_2_039 = e1Questions.find(question => question.uid === 'E1-2-039');
assert.ok(e1_2_038 && e1_2_039, 'E1-2-038 and E1-2-039 must both exist');
assert.notEqual(sha(e1_2_039), sha(e1_2_038), 'E1-2-039 must not reuse E1-2-038 image');

console.log(`PASS audit clinical images: ${Object.keys(expected).length} reviewed figures keep fixed SHA-256 and answers`);
