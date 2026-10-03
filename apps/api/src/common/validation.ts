import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { isValidLocalDate, isValidTimeOfDay, isValidTimezone } from '../domain/dates';

@ValidatorConstraint({ name: 'isTimezone' })
export class IsTimezone implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidTimezone(value);
  }
  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a valid IANA timezone (e.g. Asia/Kolkata)`;
  }
}

@ValidatorConstraint({ name: 'isLocalDate' })
export class IsLocalDate implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidLocalDate(value);
  }
  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a date in YYYY-MM-DD format`;
  }
}

@ValidatorConstraint({ name: 'isTimeOfDay' })
export class IsTimeOfDay implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidTimeOfDay(value);
  }
  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a time in HH:mm format`;
  }
}
