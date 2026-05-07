export const INVALID_EMPLOYEE_PIN_MESSAGE = 'Code PIN invalide.';

export const EMPLOYEE_PIN_CODE_PATTERN = /^\d{4}$/;

export const DISALLOWED_EMPLOYEE_PIN_CODES = [
  '0000',
  '1111',
  '1234',
  '4321',
  '9999',
] as const;

export function isDisallowedEmployeePinCode(value: string) {
  return DISALLOWED_EMPLOYEE_PIN_CODES.includes(
    value as (typeof DISALLOWED_EMPLOYEE_PIN_CODES)[number],
  );
}

export function isValidEmployeePinCode(value: string) {
  return (
    EMPLOYEE_PIN_CODE_PATTERN.test(value) && !isDisallowedEmployeePinCode(value)
  );
}
