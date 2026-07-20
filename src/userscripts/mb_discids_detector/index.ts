import { bbForumPageHandler } from './bb-forum-logic/bb-forum-logic';
import { BB_FORUM_HOST_PATTERN, GAZELLE_HOST_PATTERN, LOGGER } from './constants';
import { gazellePageHandler } from './gazalle-forum-logic/gazalle-logic';

function init(): void {
    const serverHost = window.location.host;

    if (serverHost.match(GAZELLE_HOST_PATTERN)) {
        LOGGER.info('Gazelle site detected');
        gazellePageHandler();
        return;
    }

    if (serverHost.match(BB_FORUM_HOST_PATTERN)) {
        LOGGER.info('BB Forum site detected');
        void bbForumPageHandler();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
