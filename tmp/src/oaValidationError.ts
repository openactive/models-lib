// This file is not auto-generated
import * as Joi from 'joi';
export class OaValidationError extends Error { // extend Error just so that it retains the stack trace, which might be useful
  item: unknown;
  validationError: Joi.ValidationError;

  constructor(type: string, item: unknown, validationError: Joi.ValidationError) {
    super(`Object is not a valid "${type}". Check \`.item\` and \`.validationError\` for more info`);
    this.name = 'OaValidationError';
    this.item = item;
    this.validationError = validationError;
  }
}