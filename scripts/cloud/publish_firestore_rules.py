"""Publish only Firestore rules using a short-lived gcloud access token."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import urllib.error
import urllib.request

PROJECT = 'cbtpass-a680e'
BASE = 'https://firebaserules.googleapis.com/v1/'
RELEASE = f'projects/{PROJECT}/releases/cloud.firestore'


def publish(source, request):
    previous = request('GET', RELEASE)
    old_name = previous['rulesetName']
    prefix = f'projects/{PROJECT}/rulesets/'
    if not old_name.startswith(prefix):
        raise ValueError('Unexpected project in current release')
    created = request('POST', f'projects/{PROJECT}/rulesets',
                      {'source': {'files': [{'name': 'firestore.rules', 'content': source}]}})
    name = created['name']
    if not name.startswith(prefix):
        raise ValueError('Unexpected project in created ruleset')
    print('Previous ruleset:', old_name)
    print('Candidate ruleset:', name)
    # UpdateReleaseRequest wraps the Release object, as in the official Firebase CLI.
    request('PATCH', RELEASE, {'release': {'name': RELEASE, 'rulesetName': name}})
    live = request('GET', RELEASE)
    if live['rulesetName'] != name:
        raise ValueError('Published release does not match candidate; inspect the recorded ruleset names')
    files = request('GET', name)['source']['files']
    if len(files) != 1 or files[0]['name'] != 'firestore.rules' or files[0]['content'] != source:
        raise ValueError('Published source differs; inspect the recorded ruleset names')
    print('Verified Firestore rules SHA256:', hashlib.sha256(source.encode()).hexdigest())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('file', type=pathlib.Path)
    parser.add_argument('--check', action='store_true', help='Read current release without changes')
    args = parser.parse_args()
    source = args.file.read_text()
    if not source.strip() or len(source.encode()) > 250000:
        raise ValueError('Empty or oversized rules file')
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    if not token:
        raise ValueError('No access token available')

    def request(method, resource, body=None):
        payload = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(BASE + resource, data=payload, method=method,
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)

    if args.check:
        print('Read-only connection verified. Current ruleset:', request('GET', RELEASE)['rulesetName'])
    else:
        publish(source, request)


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        raise SystemExit(f'Firebase Rules API rejected the request: HTTP {error.code}') from None
