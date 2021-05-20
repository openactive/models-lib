import { strict as assert } from 'assert';
import * as util from 'util';
import { EventSeries } from '../oa';
import { OaValidationError } from '../oaValidationError';

const eventSeries = EventSeries.validate({
  '@type': 'EventSeries',
  subEvent: [{
    /* This should validate even though EventSeries.subEvent is just defined as accepting Events because SessionSeries
    is a kind of Event */
    '@type': 'SessionSeries',
    subEvent: [{
      '@type': 'ScheduledSession',
    }],
  }],
});
// FIXME this fails currently (TODO link to GH Issue)
assert(!(eventSeries instanceof OaValidationError), util.inspect(eventSeries instanceof OaValidationError && eventSeries.validationError));