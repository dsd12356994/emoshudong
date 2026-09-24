"""Deploy only the application and runtime dependency; never package private notes."""
import hashlib, json, os, pathlib, re, subprocess, tarfile, tempfile, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOME = pathlib.Path.home()
SECRET = HOME / '.config' / 'shudong' / '.env'
CONFIG_PATH = HOME / '.config' / 'shudong' / 'deploy.json'
if not CONFIG_PATH.exists():
    raise SystemExit('Create ~/.config/shudong/deploy.json from deploy/config.example.json first.')
CONFIG = json.loads(CONFIG_PATH.read_text(encoding='utf-8-sig'))
HOST = CONFIG['host']
OPTIONS = ['-F', 'NUL' if os.name == 'nt' else '/dev/null', '-i', str(pathlib.Path(CONFIG['identityFile']).expanduser()), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(pathlib.Path(CONFIG['knownHostsFile']).expanduser())]

def ssh(command):
    return subprocess.run(['ssh', *OPTIONS, HOST, command], check=True)

def upload(source, destination):
    subprocess.run(['scp', *OPTIONS, str(source), HOST + ':' + destination], check=True)

with tempfile.TemporaryDirectory(prefix='shudong-deploy-') as temp:
    temp = pathlib.Path(temp)
    archive = temp / 'app.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        for rel in ['server.mjs', 'lib', 'knowledge', 'public', 'package.json', 'package-lock.json', 'node_modules/lunar-javascript']:
            tar.add(ROOT / rel, arcname=rel)
    ssh('mkdir -p /opt/shudong/app /opt/shudong/runtime')
    probe = subprocess.run(['ssh', *OPTIONS, HOST, 'test -x /opt/shudong/node/bin/node'], capture_output=True)
    if probe.returncode:
        base = 'https://nodejs.org/dist/latest-v22.x/'
        checksums = urllib.request.urlopen(base + 'SHASUMS256.txt', timeout=40).read().decode()
        line = next(line for line in checksums.splitlines() if re.search(r'node-v22\.[\d.]+-linux-x64\.tar\.xz$', line))
        digest, filename = line.split()
        runtime = temp / filename
        print('Downloading verified Node.js 22 runtime...', flush=True)
        with urllib.request.urlopen(base + filename, timeout=90) as response, runtime.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if hashlib.sha256(runtime.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Runtime checksum mismatch')
        upload(runtime, '/opt/shudong/runtime/' + filename)
        folder = filename.removesuffix('.tar.xz')
        ssh(f'tar -xJf /opt/shudong/runtime/{filename} -C /opt/shudong/runtime && ln -sfn /opt/shudong/runtime/{folder} /opt/shudong/node')
    upload(archive, '/opt/shudong/app.tar.gz')
    ssh('tar -xzf /opt/shudong/app.tar.gz -C /opt/shudong/app')
    # API keys travel over SSH, never in command-line arguments or printed output.
    if SECRET.exists():
        secret_text = SECRET.read_text(encoding='utf-8-sig')
        if re.search(r'^DEEPSEEK_API_KEY\s*=\s*\S+', secret_text, re.M):
            upload(SECRET, '/etc/shudong.env')
            ssh('chmod 600 /etc/shudong.env')
        else:
            ssh("test -e /etc/shudong.env || printf 'HOST=127.0.0.1\nPORT=3080\n' > /etc/shudong.env")
    upload(ROOT / 'deploy' / 'shudong.service', '/etc/systemd/system/shudong.service')
    ssh('id shudong >/dev/null 2>&1 || useradd --system --home /opt/shudong --shell /usr/sbin/nologin shudong')
    ssh('mkdir -p /opt/shudong/app/data && chown shudong:shudong /opt/shudong/app/data && chmod 700 /opt/shudong/app/data && chmod 600 /etc/shudong.env && systemctl daemon-reload && systemctl enable --now shudong && systemctl restart shudong')
    ssh("systemctl is-active shudong && /opt/shudong/node/bin/node --version")
    print('Deployed. Service listens only on loopback; use SSH forwarding.', flush=True)
