// Minimal IANA timezone helpers built on Intl (no extra dependency).

function isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/** Wall-clock parts of `date` in `tz`. */
function getZonedParts(date, tz) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
    };
}

/** Offset of `tz` from UTC at instant `date`, in milliseconds. */
function tzOffsetMs(date, tz) {
    const p = getZonedParts(date, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` to a UTC Date (DST-aware). */
function zonedTimeToUtc(year, month, day, hour, minute, tz) {
    const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
    let result = guess - tzOffsetMs(new Date(guess), tz);
    // Second pass corrects for DST transitions between the guess and the result
    result = guess - tzOffsetMs(new Date(result), tz);
    return new Date(result);
}

/** Local calendar date string (YYYY-MM-DD) for `date` in `tz`. */
function localDateKey(date, tz) {
    const p = getZonedParts(date, tz);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** UTC instant for `hour`:00 local time, `daysAhead` local days after the local day of `from`. */
function atLocalHour(from, daysAhead, hour, tz) {
    const p = getZonedParts(from, tz);
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead));
    return zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, 0, tz);
}

module.exports = { isValidTimeZone, getZonedParts, zonedTimeToUtc, localDateKey, atLocalHour };
