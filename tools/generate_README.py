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
            items.append(dict(jsfile=jsfilename, header=d))

doctitle = "MusicBrainz UserScripts"
print(doctitle)
print('=' * len(doctitle))
print()

for item in items:
    print('### ', item['header']['name'][0])
    print()
    if item['header']['downloadurl']:
        downloadlink = ' [download](%s)' % item['header']['downloadurl'][0]
    else:
        downloadlink = ''
    print('  + **filename**: `%s`%s' % (item['jsfile'], downloadlink))
    for key in item['header']:
        if key not in ('include', 'exclude'):
            continue
        print("    + **%s**" % key)
        for value in item['header'][key]:
            print("      + `%s`" % value)
    print()
