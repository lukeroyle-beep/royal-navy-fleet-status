#!/usr/bin/env python3
"""Unprivileged simulated OS calls: ordering/rejection/failure tests, NOT B3.
The production wrapper is rendered with disposable paths and mocked identity,
permissions, directory services and launchctl. Real root/launchd tests stay pending.
"""
import hashlib
import os
import pathlib
import subprocess
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent

class Lifecycle(unittest.TestCase):
    def run_case(self, case):
        with tempfile.TemporaryDirectory(prefix='rnfs-installer-fixture-', dir='/private/tmp') as temp:
            root = pathlib.Path(temp)
            mocks = root / 'mocks'; mocks.mkdir()
            payload = root / 'payload'; payload.mkdir()
            for name in ['Library/LaunchDaemons', 'private/var/db', 'sdk', 'tools']:
                (root / name).mkdir(parents=True, exist_ok=True)
            def mock(name, text):
                p = mocks / name; p.write_text('#!/bin/sh\n' + text + '\n'); p.chmod(0o755)
            mock('id', 'echo 0')
            mock('stat', 'if [ "$2" = %u ]; then echo 0; else echo 755; fi')
            mock('ls', 'echo protected')
            mock('csrutil', '''if [ "$1" = status ]; then echo 'System Integrity Protection status: enabled.';
elif [ "$CASE" = root-unavailable ]; then echo 'No macOS installations found' >&2; exit 1;
elif [ "$CASE" = root-disabled ]; then echo 'Authenticated Root status: disabled';
else echo 'Authenticated Root status: enabled'; fi''')
            mock('xcode-select', 'echo "$FIXTURE/tools"')
            mock('xcrun', 'echo ' + str(root / 'sdk'))
            mock('dscl', 'if [ "$CASE" = collision ]; then echo "_rnfsbroker 499"; else echo "root 0"; fi')
            mock('launchctl', '''case "$1" in
print) exit 1;;
disable) echo disabled > "$FIXTURE/disabled";;
print-disabled) [ -f "$FIXTURE/disabled" ] && echo '"org.rnfs.gate-b" => true';;
*) exit 99;; esac''')
            # Strip only ownership flags; chmod/copy behavior remains real.
            mock('install', 'shift 4; exec /usr/bin/install "$@"')
            if case == 'existing':
                (root / 'Library/RNFSBroker-stage').mkdir()
            script = 'exit 7\n' if case == 'late-failure' else 'exit 0\n'
            (payload / 'install.sh').write_text(script)
            manifest = hashlib.sha256(script.encode()).hexdigest() + '  install.sh\n'
            (payload / 'SOURCE-SHA256SUMS').write_text(manifest)
            wrapper = (HERE / 'preinstall.sh').read_text().replace('@MANIFEST_SHA256@', hashlib.sha256(manifest.encode()).hexdigest())
            if case == 'tamper': (payload / 'install.sh').write_text('exit 0 # changed\n')
            if case == 'manifest-tamper': (payload / 'SOURCE-SHA256SUMS').write_text('changed')
            wrapper = wrapper.replace('PATH=/usr/bin:/bin:/usr/sbin:/sbin', f'PATH={mocks}:/usr/bin:/bin:/usr/sbin:/sbin')
            for path in ['/Library', '/private/var/db']:
                wrapper = wrapper.replace(path, str(root) + path)
            wrapper = wrapper.replace('/usr/bin/xcrun', str(mocks / 'xcrun'))
            wrapper = wrapper.replace('/usr/bin/install', str(mocks / 'install'))
            # Existing installer is a fixture stub, so create its expected output for success case.
            script_path = root / 'preinstall'; script_path.write_text(wrapper)
            env = dict(os.environ, FIXTURE=str(root), CASE=case)
            result = subprocess.run(['/bin/sh', str(script_path), 'pkg', '/', '/'], env=env, capture_output=True)
            stage = root / 'Library/RNFSBroker-stage'
            if case in ['existing', 'collision', 'tamper', 'manifest-tamper', 'root-unavailable', 'root-disabled']:
                self.assertNotEqual(result.returncode, 0, result.stdout)
                expected = {'existing': b'existing installation', 'collision': b'reserved identity collision', 'tamper': b'payload differs', 'manifest-tamper': b'payload manifest differs', 'root-unavailable': b'status unavailable', 'root-disabled': b'did not confirm enabled'}
                self.assertIn(expected[case], result.stderr)
                self.assertFalse((root / 'disabled').exists(), result.stderr)
                self.assertFalse((stage / 'install.sh').exists(), result.stderr)
            else:
                self.assertNotEqual(result.returncode, 0)
                self.assertTrue((root / 'disabled').exists(), result.stderr)
                self.assertEqual((stage / 'INSTALL-RESULT.txt').read_text().strip(), 'FAILED_REQUIRES_REVIEW')
                self.assertTrue((stage / 'install.sh').exists())

    def test_root_unavailable_refused(self): self.run_case('root-unavailable')
    def test_root_disabled_refused(self): self.run_case('root-disabled')
    def test_existing_refused(self): self.run_case('existing')
    def test_identity_collision_refused(self): self.run_case('collision')
    def test_payload_tamper_refused(self): self.run_case('tamper')
    def test_manifest_tamper_refused(self): self.run_case('manifest-tamper')
    def test_late_failure_stays_disabled_with_evidence(self): self.run_case('late-failure')

if __name__ == '__main__': unittest.main()
