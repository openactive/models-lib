import { strict as assert } from 'assert';
import { Event } from '../oa';
import { OaValidationError } from '../oaValidationError';

console.log('hi0');

const event = Event.validate({ '@type': 'Event' });
// assert(!(event instanceof OaValidationError));


// const t: {
//   x: never;
//   y: 3;
// } = { y: 3 }
