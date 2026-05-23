#!/usr/bin/env python
from __future__ import print_function

import json
import os
import re
import glob
from collections import defaultdict

"""Output a human-readable list of scripts, using data from their headers

Example of usage:
    $> python ./tools/generate_README.py > README.md
"""

TYPESCRIPT_ICON = '<img src="assets/icons/typescript.svg" alt="TypeScript" width="16" height="16">'

re_start_header = re.compile(r'==UserScript==', re.IGNORECASE)
re_stop_header = re.compile(r'==/UserScript==', re.IGNORECASE)
re_keyval = re.compile(r'^[\s\*/]+@(\S+)\s+(.+)\s*$', re.IGNORECASE)

# Collect items from root *.user.js files
items_by_shortname = {}
for jsfilename in sorted(glob.glob('*.user.js')):
    in_header = False
    with open(jsfilename, encoding='utf-8') as jsfile:
        d = defaultdict(list)
        for line in jsfile:
            if not in_header and re_start_header.search(line):
                in_header = True
                continue
            if in_header and re_stop_header.search(line):
                in_header = False
                break
            if not in_header:
                continue

            m = re_keyval.search(line)
            if not m:
                continue
            key, value = m.groups()
            d[key.lower()].append(value)
        if d:
            shortname = jsfilename.replace('.user.js', '')
            items_by_shortname[shortname] = dict(jsfile=jsfilename, shortname=shortname, header=d)

# Add TypeScript scripts from src/userscripts/
src_userscripts = 'src/userscripts'
if os.path.isdir(src_userscripts):
    for name in sorted(os.listdir(src_userscripts)):
        meta_path = os.path.join(src_userscripts, name, 'meta.json')
        if os.path.isfile(meta_path):
            with open(meta_path, encoding='utf-8') as f:
                meta = json.load(f)
            header = defaultdict(list)
            header['name'].append(meta['name'])
            header['description'].append(meta['description'])
            header['downloadurl'].append(meta['downloadURL'])
            items_by_shortname[name] = dict(
                jsfile='dist/%s.user.js' % name,
                shortname=name,
                header=header,
            )

items = list(items_by_shortname.values())


def is_typescript(shortname):
    """Check if script has TypeScript source in src/userscripts/<shortname>/"""
    return os.path.isfile(os.path.join('src', 'userscripts', shortname, 'index.ts'))


items = [item for item in items if '[DISCONTINUED]' not in item['header']['name'][0]]
items.sort(key=lambda elem: elem['header']['name'])

print("# MusicBrainz UserScripts")
print()

for item in items:
    name = item['header']['name'][0]
    prefix = TYPESCRIPT_ICON + ' ' if is_typescript(item['shortname']) else ''
    print('- [%s%s](#%s)' % (prefix, name, item['shortname']))

install_button_url = 'assets/buttons/button-install.svg'
source_button_url = 'assets/buttons/button-source.svg'
source_base_master = 'https://github.com/murdos/musicbrainz-userscripts/blob/master'
source_base_dist = 'https://github.com/murdos/musicbrainz-userscripts/blob/dist'

for item in items:
    print()
    name = item['header']['name'][0]
    prefix = TYPESCRIPT_ICON + ' ' if is_typescript(item['shortname']) else ''
    print('## <a name="%s"></a> %s%s' % (item['shortname'], prefix, name))
    print()
    if (item['header']['description']):
        print(item['header']['description'][0])
        print()
    # TypeScript scripts live on the dist branch; others on master
    source_url = '%s/%s.user.js' % (source_base_dist, item['shortname']) if is_typescript(item['shortname']) else '%s/%s' % (source_base_master, item['jsfile'])
    print('[![Source](%s)](%s)' % (source_button_url, source_url))
    if item['header']['downloadurl']:
        downloadlink = '[![Install](%s)](%s)' % (install_button_url, item['header']['downloadurl'][0])
        print(downloadlink)
