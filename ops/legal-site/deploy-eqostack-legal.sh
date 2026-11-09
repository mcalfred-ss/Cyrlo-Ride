#!/usr/bin/env bash
set -euo pipefail

mkdir -p /var/www/cyrlo-legal
cp /tmp/terms.html /var/www/cyrlo-legal/terms.html
cp /tmp/privacy.html /var/www/cyrlo-legal/privacy.html
chmod 644 /var/www/cyrlo-legal/*.html

python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/eqostack')
text = p.read_text()
marker = '    location = /kypa/delete-account {'
block = '''    location = /cyrlo/terms {
        alias /var/www/cyrlo-legal/terms.html;
        default_type text/html;
        add_header Cache-Control "public, max-age=300";
    }

    location = /cyrlo/privacy {
        alias /var/www/cyrlo-legal/privacy.html;
        default_type text/html;
        add_header Cache-Control "public, max-age=300";
    }

'''
if 'location = /cyrlo/terms' in text:
    print('nginx locations already present')
else:
    if marker not in text:
        raise SystemExit('marker not found in nginx config')
    p.write_text(text.replace(marker, block + marker, 1))
    print('nginx locations inserted')
PY

nginx -t
systemctl reload nginx

curl -sS -o /dev/null -w 'terms:%{http_code}\n' https://eqostack.com/cyrlo/terms
curl -sS -o /dev/null -w 'privacy:%{http_code}\n' https://eqostack.com/cyrlo/privacy
curl -sS -o /dev/null -w 'eqostack_home:%{http_code}\n' https://eqostack.com/
curl -sS -o /dev/null -w 'cyrloride:%{http_code}\n' https://cyrloride.eqostack.com/api/v1/health
echo DONE
