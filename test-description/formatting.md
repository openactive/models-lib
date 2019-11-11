

# Format Tests

**Date and time in correct format**

All tests are drawn from the `SessionSeries` example.

*   SessionSeries.subEvent.startDate in correct ISO-8601 format
*   SessionSeries.subEvent.endDate in correct ISO-8601 format
*   SessionSeries.duration
    *   Matches subEvent.startDate and subEvent.endDate difference
    *   In correct ISO-8601 format

**URLs**

*   SessionSeries.id, SessionSeries.activity.id, and SessionSeries.subEvent.url are both correctly-formatted URLs
