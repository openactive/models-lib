import { strict as assert } from 'assert';
import * as Joi from 'joi';
import * as util from 'util';
import { OaValidationError } from '..';
// OpenActive types live at /lib/oa
import { Event, RequiredStatusType } from '../oa'
// Schema.org types live at /lib/schema
import { DayOfWeek, ImageObject } from '../schema';

// TypeScript type lives at `.Type`
const myRequiredStatusType: RequiredStatusType.Type = 'https://openactive.io/Required';
// @ts-expect-error
const myNotRequiredStatusType: RequiredStatusType.Type = 'somethingelse.com'; // this will raise a TS error

// Validate(..) - test
{
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
}

// JOI Schema lives at `.JoiSchema`
const compositeJoiSchema = Joi.object({
  somethingElse: Joi.string(),
  requiredStatusType: RequiredStatusType.JoiSchema,
});

// A few more type examples
const event: Event.Type = {
  '@type': 'Event',
  name: 'myEvent',
};
const dayOfWeek: DayOfWeek.Type = 'https://schema.org/Sunday';
const imageObject: ImageObject.Type = {
  '@type': 'ImageObject',
  url: 'https://example.com/image.jpg',
};
