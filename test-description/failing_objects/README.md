# Failing Objects

The objects given in this directory are nearly, but not quite, identical to those given in the top-level directory. These, however, are malformed in important but subtle ways. Ensuring these objects fail tests appropriately is thus a simple means of checking your test coverage.

The ways in which these objects should fail are enumerated below.

## SessionSeries

* `ageRange` is missing a `@type` attribute with value `Quantitative Value`.

## Slot

* `activity` is populated by a single value, rather than an array.

## Event

* `activity` is populated by a single value, rather than an array.
* The required attribute `duration` is missing.
