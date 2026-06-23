function parsePart(value: number | string): number | null {
    if (value === '') {
        return null;
    }
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
    if (Number.isNaN(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

interface MbPartialDateInput {
    year: string;
    month: number | string;
    day: number | string;
}

interface IsEventDateInFutureParams {
    event: MbPartialDateInput;
    today: Date;
}

/** True when a MB partial date is strictly after today; false when unset or not in the future. */
export function isEventDateInFuture({ event, today }: IsEventDateInFutureParams): boolean {
    const { year, month, day } = event;
    const y = parsePart(year);
    if (y === null) {
        return false;
    }

    const todayYear = today.getFullYear();
    if (y > todayYear) {
        return true;
    }
    if (y < todayYear) {
        return false;
    }

    const m = parsePart(month);
    if (m === null) {
        return false;
    }

    const todayMonth = today.getMonth() + 1;
    if (m > todayMonth) {
        return true;
    }
    if (m < todayMonth) {
        return false;
    }

    const d = parsePart(day);
    if (d === null) {
        return false;
    }

    return d > today.getDate();
}

/** True when every dated release event is strictly after today. */
export function isFutureRelease(events: MbPartialDateInput[]): boolean {
    const fullyDatedEvents = events.filter(event => event.year !== '' && event.month !== '' && event.day !== '');

    if (fullyDatedEvents.length === 0) {
        return false;
    }

    const today = new Date();

    return fullyDatedEvents.every(event => isEventDateInFuture({ event, today }));
}
