# models-ts

Model validation and TypeScript types for OpenActive's data model

This library works for both JavaScript and TypeScript developers, making it easier to conform to the OpenActive specifications.

Example:

```ts
import Joi from 'joi';
import {
  OaValidationError,
  Course,
  Eventt,
  RequiredStatusType,
  EventtOrSubClass,
  validateRequiredStatusType,
  RequiredStatusTypeJoiSchema,
  EventtOrSubClassJoiSchema,
  schema,
} from '@openactive/models-ts';

// TypeScript types (for OpenActive models) are found with the model/enum name
const myRequiredStatusType: RequiredStatusType = 'https://openactive.io/Required';
const myNotRequiredStatusType: RequiredStatusType = 'somethingelse.com'; // this will raise a TS error
const maybeCourse: Course = { '@type': 'Course', /* ... */ };
// Event is an exception - it's labelled `Eventt` because `Event` is not a permissable type name in TypeScript.
const myEvent: Eventt = { '@type': 'Event', /* ... */ };
// TypeScript types for Schema.org models are in the schema namespace
const dayOfWeek: schema.DayOfWeek = 'https://schema.org/Sunday';

// Each model has an additional type which can also accept an object which conforms to a sub-class of the model
// e.g. `EventOrSubClass` can be used to annotate Events or ScheduledSessions (which sub-class Event)
// Access these types at `{ model/enum name }OrSubClass`.
const scheduledSession: EventtOrSubClass = { '@type': 'ScheduledSession', /* ... */ };

// Validator lives at `validate{ model/enum name}` e.g. `validateRequiredStatusType`
const maybeRequiredStatusType = validateRequiredStatusType(/* some data */);
if (maybeRequiredStatusType instanceof OaValidationError) {
  // The data did not conform to the RequiredStatusType type.
  // From this point on, `maybeRequiredStatusType` will have type `OaValidationError`
  const error = maybeRequiredStatusType;
  // Do something with the error. Maybe ignore it? Or log it? Or throw? Up to you.
} else {
  // The data _did_ conform to the RequiredStatusType type.
  // From this point on, `maybeRequiredStatusType` will have type `RequiredStatusType.Type`
  const requiredStatusType = maybeRequiredStatusType;
}
// Again, validators for Schema.org models are in the schema namespace
const maybeImageObject = schema.validateImageObject(/* some data */);

// JOI Schema lives at `{ model/enum name }JoiSchema`, for OpenActive models, and `schema.{ model/enum name }JoiSchema` for Schema.org models.
const compositeJoiSchema = Joi.object({
  somethingElse: Joi.string(),
  requiredStatusType: RequiredStatusTypeJoiSchema,
});

// Each model has an additional JOI schema which can also validate an object which conforms to a sub-class of the model
// e.g. `EventtOrSubClassJoiSchema` can be used to annotate Events or SessionSeries (which sub-classes Event)
// Access these JOI schemas at `{ model/enum name}OrSubClassJoiSchema`.
const sessionSeries = EventtOrSubClassJoiSchema.validate({ '@type': 'SessionSeries', /* ... */ });
```

Find some more extensive example usage in `src/test/data-model-examples`.

## Using Types in a JavaScript Project

It is recommended to use TypeScript, which allows for more seamless use of the types in this library. However, it is
absolutely possible to use them in JavaScript by using JSDoc.

Here's how:

1. Ensure you're using a TypeScript-aware editor like VSCode.
2. Install TypeScript in your project

    ```sh
    npm install --save-dev typescript
    ```
3. Create a `tsconfig.json` file at the root of your project with the following contents:

    ```json
    {
      "compilerOptions": {
        "noEmit": true,
        "allowJs": true,
        "checkJs": true,
      },
      "include": [
        "src/**/*.js" // replace with the path to all of your JS files.
      ]
    }
    ```

    The top 3 options mean that 1). TypeScript will not produce any output - it will just check files 2). It will
    check .js files.

    More info on options you can put in tsconfig.json [here](https://www.typescriptlang.org/tsconfig).

    It is highly recommended that you use `"strict": true` in your `compilerOptions`, which improves TypeScript's
    ability to catch issues before they happen live. However, if you do this, you will have to make sure to annotate
    every function in your project.
4. Annotate your functions and variables with type signatures using JSDoc.

    e.g.

    ```js
    /**
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    function add(x, y) { return x + y; }

    /**
     * @template T
     * @param {T} val
     * @returns {{ val: T }}
     */
    function wrap(val) { return { val }; }
    ```

    (Note: you will often not need to annotate return values, which TypeScript can infer. You can see what TypeScript
    has inferred by hovering over the function in VSCode).
5. Run `npx tsc` to check your files. Ensure this happens frequently by including it in your CI scripts.

Some examples of using `@openactive/models-ts` with JSDoc:

```js
/** @type {import('@openactive/models-ts').RequiredStatusType} */
const myRequiredStatusType = 'https://openactive.io/Required';
/** @type {import('@openactive/models-ts').schema.ImageObject} */
const myImageObject = { '@type': 'ImageObject', /* ... */ };

// You can use `@typedef` aliases in order to not have to type the whole `import('@openactive/models-ts')...` bit each time:
/**
 * @typedef {import('@openactive/models-ts').Course} Course
 */

// And here the `@typedef` alias is being used:
/**
 * @param {Course}
 */
function doSomethingToCourse(course) {
  // ..
}
```

## Contributing

- `lib/*` files are generated by TypeScript
- A pre-commit hook re-builds the above files
