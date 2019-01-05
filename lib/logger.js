///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                  Logger
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var LOGGER = (function() {
    let LOG_LEVEL = 'info';

    function fnDebug() {
        if (LOG_LEVEL == 'debug') {
            _log('DEBUG', arguments);
        }
    }

    function fnInfo() {
        if (LOG_LEVEL == 'debug' || LOG_LEVEL === 'info') {
            _log('INFO', arguments);
        }
    }

    function fnError() {
        _log('ERROR', arguments);
    }

    function fnSetLevel(level) {
        LOG_LEVEL = level;
    }

    // --------------------------------------- privates ----------------------------------------- //

    function _log(level, args) {
        // Prepends log level to things that will be logged
        args = Array.prototype.slice.call(args);
        args.unshift(`[${level}]`);
        try {
            console.log.apply(this, args);
        } catch (e) {
            // do nothing
        }
    }

    // ---------------------------------- expose publics here ------------------------------------ //

    return {
        debug: fnDebug,
        info: fnInfo,
        error: fnError,
        setLevel: fnSetLevel
    };
})();
