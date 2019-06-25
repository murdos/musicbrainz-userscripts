#!/usr/bin/env python
from __future__ import print_function

import re
import glob
from collections import defaultdict

"""Output a human-readable list of scripts, using data from their headers

Example of usage:
    $> python ./tools/generate_README.py > README.md
"""


re_start_header = re.compile(r'==UserScript==', re.IGNORECASE)
re_stop_header = re.compile(r'==/UserScript==', re.IGNORECASE)

re_keyval = re.compile(r'^[\s\*/]+@(\S+)\s+(.+)\s*$', re.IGNORECASE)

items = list()
for jsfilename in sorted(glob.glob('*.user.js')):
    in_header = False
    with open(jsfilename) as jsfile:
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
            items.append(dict(jsfile=jsfilename, shortname=shortname, header=d))


items.sort(key=lambda elem: elem['header']['name'])

print("# MusicBrainz UserScripts")
print()

for item in items:
    print('-   [%s](#%s)' % (item['header']['name'][0], item['shortname']))

install_button_url = 'https://raw.github.com/jerone/UserScripts/master/_resources/Install-button.png'
source_button_url = 'https://github.com/jerone/UserScripts/blob/master/_resources/Source-button.png'
source_base_url = 'https://github.com/murdos/musicbrainz-userscripts/blob/master'

for item in items:
    print()
    print('## <a name="%s"></a> %s' % (item['shortname'], item['header']['name'][0]))
    print()
    if (item['header']['description']):
        print(item['header']['description'][0])
        print()
    print('[![Source](%s)](%s/%s)' % (source_button_url, source_base_url, item['jsfile']))
    if item['header']['downloadurl']:
        downloadlink = '[![Install](%s)](%s)' % (install_button_url, item['header']['downloadurl'][0])
        print(downloadlink)
