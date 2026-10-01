#!/usr/bin/env python3
"""Packaging and fail-closed tests. Never install/elevate; B3 remains untested."""
import hashlib
import importlib.util
import pathlib
import subprocess
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('builder', HERE / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class Packaging(unittest.TestCase):
    def test_reject_manifest_escape_duplicate_empty(self):
        h = 'a' * 64
        for data in [b'', f'{h}  ../escape\n'.encode(), f'{h}  /absolute\n'.encode(),
                     f'{h}  foo\n{h}  foo\n'.encode(), f'{h}  foo;evil\n'.encode()]:
            with self.assertRaises(ValueError):
                builder.entries(data)

    def test_source_tamper_rejected(self):
        real_source = builder.source
        builder.source = lambda name: b'tampered' if name == 'broker.m' else real_source(name)
        try:
            with tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
                builder.stage(pathlib.Path(tmp) / 'scripts')
        finally:
            builder.source = real_source

    def test_native_package_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            scripts = tmp / 'scripts'
            pin = builder.stage(scripts)
            subprocess.run(['/bin/sh', '-n', str(scripts / 'preinstall')], check=True)
            # Actual wrapper refuses without authentication before any mutation.
            refused = subprocess.run(['/bin/sh', str(scripts / 'preinstall'), 'unused', '/', '/'], capture_output=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn(b'administrator authentication required', refused.stderr)
            pkg = tmp / 'fixture.pkg'
            subprocess.run(['/usr/bin/pkgbuild', '--nopayload', '--scripts', str(scripts),
                            '--identifier', 'org.rnfs.gate-b.installer.test', '--version', '1', str(pkg)], check=True, capture_output=True)
            expanded = tmp / 'expanded'
            subprocess.run(['/usr/sbin/pkgutil', '--expand-full', str(pkg), str(expanded)], check=True)
            extracted = expanded / 'Scripts'
            self.assertEqual((extracted / 'preinstall').read_bytes(), (scripts / 'preinstall').read_bytes())
            manifest = (extracted / 'payload/SOURCE-SHA256SUMS').read_bytes()
            self.assertEqual(hashlib.sha256(manifest).hexdigest(), pin)
            for digest, name in builder.entries(manifest):
                self.assertEqual(hashlib.sha256((extracted / 'payload' / name).read_bytes()).hexdigest(), digest)

if __name__ == '__main__':
    unittest.main()
