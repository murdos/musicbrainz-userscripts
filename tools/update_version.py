#!/usr/bin/env python
# -*- coding: utf-8 -*-
from __future__ import print_function

import sys
import fileinput
import re
import datetime

"""
Update the version of .user.js file(s) passed as arguments

File is edited in-place, and the version is set to YYYY.MM.DD.N format
automatically.
If version is missing, one will be added.
If ran more than once a day, N will be updated.
UTC date is used.

Add or update version in the metablock:
    $> ./tools/update_version.py bandcamp_importer.user.js

To test without modifying file, use stdin:
    $> ./tools/update_version.py < bandcamp_importer.user.js
"""

def make_version_line(old_value='0.0.0.0', spacing=' '*8, eol="\n"):
    prev_version = [int(x) for x in old_value.split('.')]
    now = datetime.datetime.utcnow()
    version = [now.year, now.month, now.day, 1]
    if prev_version[:3] == version[:3]:
        version[3] = prev_version[3] + 1
    version_str = '%04d.%d.%d.%d' % tuple(version)
    return ('// @version' + spacing + version_str + eol, version_str)


re_start_header = re.compile(r'//\s*==UserScript==', re.IGNORECASE)
re_stop_header = re.compile(r'//\s*==/UserScript==', re.IGNORECASE)
re_keyval = re.compile(r'^[\s\*/]+@(\S+)(\s+)(.+)\s*$', re.IGNORECASE)


def process_files(files, verbose=True):
    def echo(*args):
        if verbose:
            sys.stderr.write(*args)

    for line in fileinput.input(files, inplace=1):
        try:
            current = fileinput.filename()
            if fileinput.isfirstline():
                echo('%s: processing...\n' % current)
                version_done = False
                in_header = False
                header_processed = False

            if not header_processed:
                if not in_header:
                    in_header = re_start_header.search(line)
                else:
                    if re_stop_header.search(line):
                        in_header = False
                        header_processed = True
                        if not version_done:
                            newline, version_str = make_version_line()
                            sys.stdout.write(newline)
                            echo('%s: %s (added)\n' %
                                 (current, version_str))
                    else:
                         m = re_keyval.search(line)
                         if m:
                            key, spacing, value = m.groups()
                            if key == 'version':
                                if version_done:
                                    echo('%s: %s dupe removed\n' %
                                         (current, value))
                                    continue # skip the line, more than one version
                                line, version_str = make_version_line(value, spacing)
                                echo('%s: %s (old)\n' % (current, value))
                                echo('%s: %s (new)\n' % (current, version_str))

                                version_done = True
        finally:
            sys.stdout.write(line)


if __name__ == "__main__":
    process_files(sys.argv[1:], verbose=True)

