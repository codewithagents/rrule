#!/usr/bin/env python3
"""
dateutil conformance oracle for rrule-ts.

Reads a JSON array of test cases from stdin (or from the file given as the
first positional argument).  Each case is an object with the fields:

  {
    "id":       string,           -- unique case id (echoed back)
    "rrule":    string,           -- RRULE string, e.g. "FREQ=WEEKLY;COUNT=5"
    "dtstart":  string,           -- ISO-8601 datetime, e.g. "1997-09-02T09:00:00"
                                  --   append "Z" for UTC, omit TZ for floating.
                                  --   For date-only, use "1997-09-02" (no T).
    "tzid":     string | null,    -- IANA tz name, e.g. "America/New_York" or null
    "count":    number            -- how many occurrences to return
  }

Writes to stdout a JSON array (same order) of result objects:

  {
    "id":                 string,
    "occurrences":        string[],   -- ISO-8601 strings, length <= count
    "error":              string | null
  }

python-dateutil version: 2.9.0.post0
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timezone, timedelta

# python-dateutil 2.9.0.post0
from dateutil import rrule as du_rrule
from dateutil.parser import isoparse

try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore[no-reuse-impl]

FREQ_MAP: dict[str, int] = {
    "SECONDLY": du_rrule.SECONDLY,
    "MINUTELY": du_rrule.MINUTELY,
    "HOURLY": du_rrule.HOURLY,
    "DAILY": du_rrule.DAILY,
    "WEEKLY": du_rrule.WEEKLY,
    "MONTHLY": du_rrule.MONTHLY,
    "YEARLY": du_rrule.YEARLY,
}

WEEKDAY_MAP: dict[str, du_rrule.weekday] = {
    "MO": du_rrule.MO,
    "TU": du_rrule.TU,
    "WE": du_rrule.WE,
    "TH": du_rrule.TH,
    "FR": du_rrule.FR,
    "SA": du_rrule.SA,
    "SU": du_rrule.SU,
}


def _parse_dtstart(dtstart_str: str, tzid: str | None) -> datetime:
    """Parse dtstart string into a datetime, applying tzid if given."""
    # Date-only: "YYYY-MM-DD"
    if len(dtstart_str) == 10 and "T" not in dtstart_str:
        d = date.fromisoformat(dtstart_str)
        if tzid:
            return datetime(d.year, d.month, d.day, tzinfo=ZoneInfo(tzid))
        return datetime(d.year, d.month, d.day)

    dt = isoparse(dtstart_str)
    if tzid:
        # Localise to the IANA zone regardless of what the string said
        return dt.replace(tzinfo=ZoneInfo(tzid))
    return dt


def _parse_rrule_parts(rrule_str: str) -> dict[str, str]:
    """Strip optional RRULE: prefix and split into a key->value dict."""
    s = rrule_str.strip()
    if s.upper().startswith("RRULE:"):
        s = s[6:]
    parts: dict[str, str] = {}
    for token in s.split(";"):
        if "=" not in token:
            continue
        k, _, v = token.partition("=")
        parts[k.strip().upper()] = v.strip()
    return parts


def _parse_until(until_str: str, tzid: str | None) -> datetime:
    """Parse UNTIL value: date-only or UTC datetime."""
    if len(until_str) == 8:
        # YYYYMMDD
        d = date(int(until_str[:4]), int(until_str[4:6]), int(until_str[6:8]))
        return datetime(d.year, d.month, d.day)
    # YYYYMMDDTHHmmss[Z]
    dt_s = until_str
    is_utc = dt_s.endswith("Z")
    if is_utc:
        dt_s = dt_s[:-1]
    y = int(dt_s[0:4])
    mo = int(dt_s[4:6])
    d_ = int(dt_s[6:8])
    h = int(dt_s[9:11]) if len(dt_s) > 8 else 0
    mi = int(dt_s[11:13]) if len(dt_s) > 10 else 0
    s_ = int(dt_s[13:15]) if len(dt_s) > 12 else 0
    if is_utc:
        return datetime(y, mo, d_, h, mi, s_, tzinfo=timezone.utc)
    if tzid:
        return datetime(y, mo, d_, h, mi, s_, tzinfo=ZoneInfo(tzid))
    return datetime(y, mo, d_, h, mi, s_)


def _build_rrule(parts: dict[str, str], dtstart: datetime, tzid: str | None) -> du_rrule.rrule:
    """Build a dateutil rrule from parsed parts and dtstart."""
    freq_str = parts.get("FREQ", "DAILY").upper()
    freq = FREQ_MAP[freq_str]

    kwargs: dict = {"dtstart": dtstart}

    if "INTERVAL" in parts:
        kwargs["interval"] = int(parts["INTERVAL"])

    if "COUNT" in parts:
        kwargs["count"] = int(parts["COUNT"])

    if "UNTIL" in parts:
        kwargs["until"] = _parse_until(parts["UNTIL"], tzid)

    if "WKST" in parts:
        kwargs["wkst"] = WEEKDAY_MAP[parts["WKST"].upper()]

    if "BYDAY" in parts:
        days = []
        for token in parts["BYDAY"].split(","):
            token = token.strip()
            # Parse optional leading ordinal, e.g. "-1FR", "2MO", "SU"
            if len(token) >= 2 and token[-2:].upper() in WEEKDAY_MAP:
                wd_str = token[-2:].upper()
                ordinal_str = token[:-2]
                wd = WEEKDAY_MAP[wd_str]
                if ordinal_str:
                    n = int(ordinal_str)
                    days.append(wd(n))
                else:
                    days.append(wd)
            else:
                days.append(WEEKDAY_MAP[token.upper()])
        kwargs["byweekday"] = days

    if "BYMONTH" in parts:
        kwargs["bymonth"] = [int(x) for x in parts["BYMONTH"].split(",")]

    if "BYMONTHDAY" in parts:
        kwargs["bymonthday"] = [int(x) for x in parts["BYMONTHDAY"].split(",")]

    if "BYYEARDAY" in parts:
        kwargs["byyearday"] = [int(x) for x in parts["BYYEARDAY"].split(",")]

    if "BYWEEKNO" in parts:
        kwargs["byweekno"] = [int(x) for x in parts["BYWEEKNO"].split(",")]

    if "BYSETPOS" in parts:
        kwargs["bysetpos"] = [int(x) for x in parts["BYSETPOS"].split(",")]

    if "BYHOUR" in parts:
        kwargs["byhour"] = [int(x) for x in parts["BYHOUR"].split(",")]

    if "BYMINUTE" in parts:
        kwargs["byminute"] = [int(x) for x in parts["BYMINUTE"].split(",")]

    if "BYSECOND" in parts:
        kwargs["bysecond"] = [int(x) for x in parts["BYSECOND"].split(",")]

    return du_rrule.rrule(freq, **kwargs)


def _format_occurrence(dt: datetime) -> str:
    """Format a datetime as ISO-8601.  UTC gets a Z suffix; naive stays naive."""
    if dt.tzinfo is not None and dt.tzinfo.utcoffset(dt) == timedelta(0):
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    if dt.tzinfo is not None:
        # Zone-aware: include UTC offset
        return dt.isoformat(timespec="seconds")
    # Naive (floating)
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def _process_case(case: dict) -> dict:
    case_id = case.get("id", "?")
    try:
        rrule_str: str = case["rrule"]
        dtstart_str: str = case["dtstart"]
        tzid: str | None = case.get("tzid") or None
        count: int = int(case["count"])

        dtstart = _parse_dtstart(dtstart_str, tzid)
        parts = _parse_rrule_parts(rrule_str)

        rule = _build_rrule(parts, dtstart, tzid)
        occurrences = list(rule[:count])
        iso_list = [_format_occurrence(o) for o in occurrences]

        return {"id": case_id, "occurrences": iso_list, "error": None}
    except Exception as exc:
        return {"id": case_id, "occurrences": [], "error": str(exc)}


def main() -> None:
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            cases = json.load(f)
    else:
        cases = json.load(sys.stdin)

    results = [_process_case(c) for c in cases]
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
