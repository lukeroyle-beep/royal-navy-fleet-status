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
            mock('stat', '''if [ "$2" = %u ]; then echo 0;
elif [ "$2" = %l ]; then /usr/bin/stat "$@";
else case "$3" in */RNFSBroker-stage|*/INSTALL-RESULT.txt) /usr/bin/stat "$@";; *) echo 755;; esac; fi''')
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
print-disabled)
 if [ "$CASE" = launch-query-fails ]; then exit 1; fi
 if [ "$CASE" = launch-enabled ]; then echo '"org.rnfs.gate-b" => enabled';
 elif [ "$CASE" = launch-unknown ]; then echo '"org.rnfs.gate-b" => true';
 elif [ "$CASE" = launch-duplicate ]; then printf '"org.rnfs.gate-b" => disabled\n"org.rnfs.gate-b" => disabled\n';
 else printf '\n\tdisabled services = {\n\t\t"org.rnfs.gate-b" => disabled\n\t}\n'; fi;;
*) exit 99;; esac''')
            # Strip only ownership flags; chmod/copy behavior remains real.
            mock('install', 'shift 4; exec /usr/bin/install "$@"')
            if case == 'existing':
                (root / 'Library/RNFSBroker-stage').mkdir()
            stage = root / 'Library/RNFSBroker-stage'
            if case.startswith('recovery'):
                stage.mkdir(mode=0o700)
                (stage / 'INSTALL-RESULT.txt').write_text('FAILED_REQUIRES_REVIEW\n')
                (stage / 'INSTALL-RESULT.txt').chmod(0o444)
                if case == 'recovery-hardlink': os.link(stage / 'INSTALL-RESULT.txt', root / 'other-link')
                if case == 'recovery-symlink':
                    (stage / 'INSTALL-RESULT.txt').rename(root / 'outside-result')
                    (stage / 'INSTALL-RESULT.txt').symlink_to(root / 'outside-result')
                if case == 'recovery-extra': (stage / '.unexpected').write_text('retain me')
                if case == 'recovery-archive': (root / 'Library/RNFSBroker-stage-failed-r2').mkdir()
                if case == 'recovery-bad-result':
                    (stage / 'INSTALL-RESULT.txt').chmod(0o644)
                    (stage / 'INSTALL-RESULT.txt').write_text('wrong\n')
                    (stage / 'INSTALL-RESULT.txt').chmod(0o444)
            bundle = root / 'Library/RNFSBroker'
            script = 'exit 7\n' if case == 'late-failure' else f'mkdir "{bundle}"\nprintf fixture > "{bundle}/fixture"\n/usr/bin/shasum -a 256 "{bundle}/fixture" > "{bundle}/INSTALLED-SHA256SUMS"\n'

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
            if case in ['existing', 'collision', 'tamper', 'manifest-tamper', 'root-unavailable', 'root-disabled', 'recovery-extra', 'recovery-archive', 'recovery-bad-result', 'recovery-hardlink', 'recovery-symlink']:
                self.assertNotEqual(result.returncode, 0, result.stdout)
                expected = {'existing': b'existing installation', 'collision': b'reserved identity collision', 'tamper': b'payload differs', 'manifest-tamper': b'payload manifest differs', 'root-unavailable': b'status unavailable', 'root-disabled': b'did not confirm enabled', 'recovery-extra': b'unrecognised stage contents', 'recovery-archive': b'recovery archive already exists', 'recovery-bad-result': b'unrecognised stage result bytes', 'recovery-hardlink': b'unrecognised stage result metadata', 'recovery-symlink': b'missing or symlink prerequisite'}
                self.assertIn(expected[case], result.stderr)
                self.assertFalse((root / 'disabled').exists(), result.stderr)
                self.assertFalse((stage / 'install.sh').exists(), result.stderr)
            elif case in ['success', 'recovery']:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual((stage / 'INSTALL-RESULT.txt').read_text().strip(), 'INSTALLED_NOT_ACTIVATED_B3_B4_PENDING')
                if case == 'recovery':
                    self.assertEqual((root / 'Library/RNFSBroker-stage-failed-r2/INSTALL-RESULT.txt').read_text(), 'FAILED_REQUIRES_REVIEW\n')
            else:
                self.assertNotEqual(result.returncode, 0)
                self.assertTrue((root / 'disabled').exists(), result.stderr)
                self.assertEqual((stage / 'INSTALL-RESULT.txt').read_text().strip(), 'FAILED_REQUIRES_REVIEW')
                self.assertEqual((stage / 'install.sh').exists(), case == 'late-failure')

    def test_success_native_launchctl_format(self): self.run_case('success')
    def test_recovery_preserves_result(self): self.run_case('recovery')
    def test_recovery_hardlink_refused(self): self.run_case('recovery-hardlink')
    def test_recovery_symlink_refused(self): self.run_case('recovery-symlink')
    def test_recovery_extra_file_refused(self): self.run_case('recovery-extra')
    def test_recovery_archive_collision_refused(self): self.run_case('recovery-archive')
    def test_recovery_wrong_result_refused(self): self.run_case('recovery-bad-result')
    def test_launch_enabled_refused(self): self.run_case('launch-enabled')
    def test_launch_unknown_refused(self): self.run_case('launch-unknown')
    def test_launch_duplicate_refused(self): self.run_case('launch-duplicate')
    def test_launch_query_failure_refused(self): self.run_case('launch-query-fails')
    def test_root_unavailable_refused(self): self.run_case('root-unavailable')
    def test_root_disabled_refused(self): self.run_case('root-disabled')
    def test_existing_refused(self): self.run_case('existing')
    def test_identity_collision_refused(self): self.run_case('collision')
    def test_payload_tamper_refused(self): self.run_case('tamper')
    def test_manifest_tamper_refused(self): self.run_case('manifest-tamper')
    def test_late_failure_stays_disabled_with_evidence(self): self.run_case('late-failure')

if __name__ == '__main__': unittest.main()
