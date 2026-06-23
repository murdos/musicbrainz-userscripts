import { Logger, LogLevel } from '~/lib/logger';
import type { MBRelease, MBReleaseEvent } from '~/types/musicbrainz';

import { isFutureRelease } from './partial-date';

const LOGGER = new Logger('future_release_annotation', LogLevel.INFO);

const ANNOTATION_NOTE =
    'Note: this release was imported before the official release, after it is released please verify all info and then remove this note.';

const POLL_INTERVAL_MS = 500;
const MB_WAIT_INTERVAL_MS = 200;
const MAX_POLLS = 20;

function isReleaseAddPage(): boolean {
    return window.location.pathname === '/release/add';
}

function getRelease(): MBRelease | null {
    const release = window.MB?.releaseEditor.rootField.release();
    return release ?? null;
}

function getReleaseEventDates(events: MBReleaseEvent[]) {
    return events.map(event => ({
        year: event.date.year(),
        month: event.date.month(),
        day: event.date.day(),
    }));
}

function prependAnnotationNote(currentAnnotation: string): string {
    if (currentAnnotation.includes(ANNOTATION_NOTE)) {
        return currentAnnotation;
    }

    LOGGER.info('Updated annotation note');

    const trimmed = currentAnnotation.trim();
    return trimmed ? `${ANNOTATION_NOTE}\n\n${trimmed}` : ANNOTATION_NOTE;
}

function buildStateFingerprint(release: MBRelease): string {
    const dates = getReleaseEventDates(release.events());
    return JSON.stringify({
        annotation: release.annotation(),
        dates,
    });
}

function updateAnnotationIfNeeded(): void {
    if (!isReleaseAddPage()) {
        LOGGER.debug('Not on release add page, skipping');
        return;
    }

    const release = getRelease();
    if (!release) {
        LOGGER.debug('No release found, skipping');
        return;
    }

    const eventDates = getReleaseEventDates(release.events());
    if (!isFutureRelease(eventDates)) {
        LOGGER.debug('Release event dates are not in the future, skipping');
        return;
    }

    const currentAnnotation = release.annotation();
    const updatedAnnotation = prependAnnotationNote(currentAnnotation);
    if (updatedAnnotation !== currentAnnotation) {
        release.annotation(updatedAnnotation);
        LOGGER.debug('Added future release annotation note');
    }
}

function waitForReleaseEditor(): Promise<boolean> {
    return new Promise(resolve => {
        let attempts = 0;
        const check = () => {
            LOGGER.debug('Checking for release editor');
            if (getRelease()) {
                LOGGER.debug('Release editor found');
                resolve(true);
                return;
            }
            attempts++;
            if (attempts >= MAX_POLLS) {
                LOGGER.debug('Release editor not found after max polls, giving up');
                resolve(false);
                return;
            }
            window.setTimeout(check, MB_WAIT_INTERVAL_MS);
        };
        check();
    });
}

function startWatching(): void {
    let lastFingerprint = '';

    window.setInterval(() => {
        if (!isReleaseAddPage()) {
            return;
        }

        const release = getRelease();
        if (!release) {
            return;
        }

        const fingerprint = buildStateFingerprint(release);
        if (fingerprint !== lastFingerprint) {
            lastFingerprint = fingerprint;
            updateAnnotationIfNeeded();
        }
    }, POLL_INTERVAL_MS);
}

async function init(): Promise<void> {
    LOGGER.debug('Initializing future release annotation');
    if (!isReleaseAddPage()) {
        return;
    }

    LOGGER.debug('Waiting for release editor');
    const releaseEditorFound = await waitForReleaseEditor();
    if (releaseEditorFound) {
        LOGGER.debug('Updating annotation if needed');
        updateAnnotationIfNeeded();
    }
    LOGGER.debug('Starting to watch for changes');
    startWatching();
}

void init();
