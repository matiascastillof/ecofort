import { body, validationResult } from 'express-validator';

export const validateOrderPayload = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('items must be a non-empty array'),
  body('items.*.quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Each item quantity must be a positive integer'),
  body('items.*.product_id')
    .optional()
    .isString()
    .notEmpty()
    .withMessage('Each item product_id must be a non-empty string'),
  body('items.*.sku')
    .optional()
    .isString()
    .notEmpty()
    .withMessage('Each item sku must be a non-empty string'),
  body(['customer_id', 'customerId', 'customer_email', 'customerEmail'])
    .custom((value, { req }) => {
      const customerValue =
        value ?? req.body.customer_id ?? req.body.customerId ?? req.body.customer_email ?? req.body.customerEmail;

      if (!customerValue || String(customerValue).trim() === '') {
        throw new Error('customer_id or customer_email is required');
      }

      return true;
    }),
];

export function handleValidation(req: any, res: any, next: any) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  return next();
}
