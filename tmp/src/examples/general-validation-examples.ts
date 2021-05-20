import { strict as assert } from 'assert';
import * as util from 'util';
import { Event } from '../oa';
import { OaValidationError } from '../oaValidationError';

const event = Event.validate({
  '@type': 'Event',
  subEvent: [{ '@type': 'Event' }],
  leader: [{ '@type': 'Person' }],
});
assert(!(event instanceof OaValidationError), util.inspect(event instanceof OaValidationError && event.validationError));
// at this point, `event` has type `Event.Type`

const notEvent = Event.validate({ '@type': 'Event', subEvent: [{ '@type': 'Airplane' }] });
assert(notEvent instanceof OaValidationError);
// at this point, `notEvent` has type `OaValidationError`
