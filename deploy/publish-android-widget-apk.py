"""Publish one verified preview APK on the existing authorized Tessavie host.

Run as root after building and verifying the APK. No private keys or accounts
are used. The existing nginx site is backed up locally and restored on error.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile


LOCATION = '''    # Tessavie Android widget companion: explicit preview artifact only.
    location = /downloads/tessavie-widgets-preview.apk {
        alias /opt/business-control/mobile/tessavie-widgets-preview.apk;
        default_type application/vnd.android.package-archive;
        add_header Content-Disposition 'attachment; filename="tessavie-widgets-preview.apk"';
        add_header Cache-Control "no-cache";
        add_header X-Content-Type-Options nosniff;
    }

'''


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('sha256')
    args = parser.parse_args()
    assert os.geteuid() == 0, 'Requires the authorized deployment operator'
    import fcntl
    deployment_lock = open('/run/business-control-deploy.lock', 'a')
    fcntl.flock(deployment_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    assert args.apk.resolve().parent == Path('/tmp'), 'Expected separately staged APK'
    assert hashlib.sha256(args.apk.read_bytes()).hexdigest() == args.sha256, 'APK hash mismatch'
    with zipfile.ZipFile(args.apk) as package:
        assert {'AndroidManifest.xml', 'classes.dex'} <= set(package.namelist()), 'Not a compiled APK'
    site = Path('/etc/nginx/sites-enabled/business-control').resolve()
    assert site == Path('/etc/nginx/sites-available/business-control'), 'Unexpected nginx site'
    original = site.read_bytes()
    text = original.decode()
    if LOCATION not in text:
        assert '/downloads/tessavie-widgets-preview.apk' not in text, 'Conflicting download configuration'
        anchor = '    location / {\n'
        assert text.count(anchor) == 1, 'Unexpected proxy layout'
        text = text.replace(anchor, LOCATION + anchor, 1)
    target = Path('/opt/business-control/mobile/tessavie-widgets-preview.apk')
    backup = Path('/var/lib/business-control/backups') / ('pre-android-widget-apk-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700)
    (backup / 'business-control.nginx.conf').write_bytes(original)
    previous = target.exists()
    if previous:
        shutil.copyfile(target, backup / 'previous.apk')
    target.parent.mkdir(mode=0o755, exist_ok=True)
    changed = False
    try:
        staged = target.with_suffix('.apk.next')
        shutil.copyfile(args.apk, staged)
        staged.chmod(0o644)
        os.replace(staged, target)
        changed = True
        site.write_text(text, encoding='utf-8')
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        with urllib.request.urlopen('https://control.e-rd.ru/downloads/tessavie-widgets-preview.apk', timeout=30) as response:
            assert response.status == 200
            assert response.headers.get_content_type() == 'application/vnd.android.package-archive'
            digest = hashlib.sha256()
            for chunk in iter(lambda: response.read(65536), b''):
                digest.update(chunk)
            assert digest.hexdigest() == args.sha256, 'Published APK differs'
    except Exception:
        if changed:
            site.write_bytes(original)
            if previous:
                shutil.copyfile(backup / 'previous.apk', target)
            elif target.exists():
                target.unlink()
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    receipt = {'published': True, 'kind': 'preview_apk', 'sha256': args.sha256,
               'url': 'https://control.e-rd.ru/downloads/tessavie-widgets-preview.apk',
               'backup': str(backup)}
    (backup / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    run()
