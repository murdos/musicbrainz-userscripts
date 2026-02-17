export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    ERROR = 'error',
}

export class Logger {
    private LOG_LEVEL: LogLevel = LogLevel.INFO;
    private scriptName: string;

    constructor(scriptName: string, level: LogLevel = LogLevel.ERROR) {
        this.scriptName = scriptName;
        this.LOG_LEVEL = level;
    }

    debug(...args: unknown[]): void {
        this._log(LogLevel.DEBUG, args);
    }

    info(...args: unknown[]): void {
        this._log(LogLevel.INFO, args);
    }

    error(...args: unknown[]): void {
        this._log(LogLevel.ERROR, args);
    }

    setLevel(level: LogLevel): void {
        this.LOG_LEVEL = level;
    }

    private _log(level: LogLevel, args: unknown[]): void {
        if (level < this.LOG_LEVEL) {
            return;
        }

        let logMethod = console.log;
        switch (level) {
            case LogLevel.DEBUG:
                logMethod = console.debug;
                break;
            case LogLevel.INFO:
                logMethod = console.info;
                break;
            case LogLevel.ERROR:
                logMethod = console.error;
                break;
        }

        try {
            logMethod.apply(this, [`[${this.scriptName}]`, ...args]);
        } catch {
            // do nothing
        }
    }
}
