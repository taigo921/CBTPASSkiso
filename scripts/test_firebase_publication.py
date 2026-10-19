"""No network or real credentials: validate the publication sequence and failure handling."""
import importlib.util
import pathlib
import unittest
import os
import subprocess
import tempfile
import json

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publisher', ROOT / 'scripts/cloud/publish_firestore_rules.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class Publication(unittest.TestCase):
    def run_case(self, mode='success'):
        calls = []
        old = f'projects/{publisher.PROJECT}/rulesets/old'
        new = f'projects/{publisher.PROJECT}/rulesets/new'
        source = "rules_version = '2'; tested source"

        def request(method, resource, body=None):
            calls.append((method, resource, body))
            if method == 'POST':
                if mode == 'create-fails':
                    raise RuntimeError('creation rejected')
                self.assertEqual(body['source']['files'][0]['content'], source)
                return {'name': new}
            if method == 'PATCH':
                self.assertEqual(body, {'name': publisher.RELEASE, 'rulesetName': new})
                return body
            if resource == new:
                return {'source': {'files': [{'name': 'firestore.rules', 'content': source if mode != 'bad-source' else 'wrong'}]}}
            if len(calls) == 1:
                return {'rulesetName': old if mode != 'wrong-project' else 'projects/other/rulesets/old'}
            return {'rulesetName': new if mode != 'bad-release' else old}

        if mode == 'success':
            publisher.publish(source, request)
            self.assertEqual([c[0] for c in calls], ['GET', 'POST', 'PATCH', 'GET', 'GET'])
        else:
            with self.assertRaises((ValueError, RuntimeError)):
                publisher.publish(source, request)
            if mode in ('create-fails', 'wrong-project'):
                self.assertNotIn('PATCH', [c[0] for c in calls])

    def test_success(self):
        self.run_case()

    def test_creation_failure_never_publishes(self):
        self.run_case('create-fails')

    def test_cross_project_rejected(self):
        self.run_case('wrong-project')

    def test_mismatched_release_fails(self):
        self.run_case('bad-release')

    def test_mismatched_contents_fail(self):
        self.run_case('bad-source')

    def test_cloud_shell_setup_commands_without_real_iam(self):
        for existing in (False, True):
            with tempfile.TemporaryDirectory() as tmp:
                fake = pathlib.Path(tmp) / 'gcloud'
                fake.write_text("#!/usr/bin/env python3\nimport json,os,sys\na=sys.argv[1:]\nwith open(os.environ['FAKE_LOG'],'a') as f:f.write(json.dumps(a)+'\\n')\nif a[:2]==['projects','describe']:print('123456789');sys.exit(0)\nif 'describe' in a:sys.exit(0 if os.environ['FAKE_EXISTING']=='1' else 1)\n")
                fake.chmod(0o700)
                log = pathlib.Path(tmp) / 'calls'
                env = dict(os.environ, PATH=tmp+os.pathsep+os.environ['PATH'], FAKE_LOG=str(log), FAKE_EXISTING='1' if existing else '0')
                result = subprocess.run(['bash', str(ROOT / 'scripts/cloud/setup_firebase_federation.sh')], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('FIREBASE_WIF_PROVIDER=projects/123456789/', result.stdout)
                self.assertIn('FIREBASE_DEPLOY_SERVICE_ACCOUNT=', result.stdout)
                calls = [json.loads(line) for line in log.read_text().splitlines()]
                provider = next(c for c in calls if any(op in c for op in ['create-oidc','update-oidc']))
                self.assertIn('update-oidc' if existing else 'create-oidc', provider)
                self.assertTrue(any('assertion.workflow_ref' in v for v in provider))
                self.assertFalse(any('keys' in c for c in calls))

    def test_trust_and_workflow_constraints(self):
        workflow = (ROOT / '.github/workflows/firebase-rules.yml').read_text()
        setup = (ROOT / 'scripts/cloud/setup_firebase_federation.sh').read_text()
        self.assertIn('needs: tests', workflow)
        self.assertIn('default: false', workflow)
        self.assertIn('id-token: write', workflow)
        self.assertNotIn('pull_request_target', workflow)
        for claim in ['repository_id', 'repository_owner_id', 'ref', 'workflow_ref']:
            self.assertIn('assertion.' + claim, setup)
        self.assertNotIn('keys create', setup)
        self.assertNotIn('roles/editor', setup)
        self.assertNotIn('roles/owner', setup)


if __name__ == '__main__':
    unittest.main()
