#!/usr/bin/env python3
"""Build a native, unsigned macOS Installer package; never installs or elevates."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile

BASELINE = 'a862053236c1d9ac723eec9cc336e4359ae436f1'
ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent

def source(name):
    return subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{BASELINE}:tools/execution-broker/{name}'])

def entries(manifest):
    result = []
    for line in manifest.decode('ascii').splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)', line)
        if not match or match[2] in {'.', '..'}:
            raise ValueError('invalid source manifest entry')
        if match[2] in [name for _, name in result]:
            raise ValueError('duplicate manifest entry')
        result.append(match.groups())
    if not result:
        raise ValueError('empty manifest')
    return result

def stage(destination):
    destination.mkdir()
    payload = destination / 'payload'
    payload.mkdir()
    manifest = source('SOURCE-SHA256SUMS')
    for digest, name in entries(manifest):
        data = source(name)
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError('baseline source mismatch: ' + name)
        (payload / name).write_bytes(data)
    (payload / 'SOURCE-SHA256SUMS').write_bytes(manifest)
    wrapper = (HERE / 'preinstall.sh').read_text()
    assert wrapper.count('@MANIFEST_SHA256@') == 1
    wrapper = wrapper.replace('@MANIFEST_SHA256@', hashlib.sha256(manifest).hexdigest())
    (destination / 'preinstall').write_text(wrapper)
    (destination / 'preinstall').chmod(0o755)
    return hashlib.sha256(manifest).hexdigest()

def main():
    if sys.platform != 'darwin' or len(sys.argv) != 2:
        raise SystemExit('usage on macOS: build.py NEW_OUTPUT_DIRECTORY')
    output = pathlib.Path(sys.argv[1]).resolve()
    output.mkdir()  # never overwrite an existing delivery
    with tempfile.TemporaryDirectory(prefix='rnfs-installer-build-') as temp:
        scripts = pathlib.Path(temp) / 'scripts'
        manifest_hash = stage(scripts)
        package = output / 'RNFS-Gate-B.pkg'
        subprocess.run(['/usr/bin/pkgbuild', '--nopayload', '--scripts', str(scripts),
                        '--identifier', 'org.rnfs.gate-b.installer', '--version', '1.0.0',
                        '--install-location', '/', str(package)], check=True)
        evidence = {'baselineCommit': BASELINE, 'sourceManifestSha256': manifest_hash,
                    'packageSha256': hashlib.sha256(package.read_bytes()).hexdigest(),
                    'preinstallSha256': hashlib.sha256((scripts / 'preinstall').read_bytes()).hexdigest(),
                    'wrapperSourceSha256': hashlib.sha256((HERE / 'preinstall.sh').read_bytes()).hexdigest(),
                    'builderSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
                    'signing': 'UNSIGNED', 'notarization': 'NOT_CLAIMED',
                    'installation': 'NOT_RUN', 'B3': 'NOT_RUN', 'B4': 'NOT_RUN'}
        (output / 'PACKAGE-EVIDENCE.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(output)

if __name__ == '__main__':
    main()
