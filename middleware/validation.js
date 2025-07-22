import { validationResult, body } from 'express-validator';

const validateRequest = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  };
};

const authValidation = {
  register: [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('firstName')
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ max: 50 }),
    body('lastName')
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ max: 50 })
  ],
  login: [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').exists().withMessage('Password is required')
  ]
};

const planValidation = {
  createPlan: [
    body('goalId')
      .notEmpty()
      .withMessage('Goal ID is required')
      .isMongoId()
      .withMessage('Invalid goal ID format')
  ],
  recordSession: [
    body('planId')
      .notEmpty()
      .withMessage('Plan ID is required')
      .isMongoId(),
    body('date')
      .notEmpty()
      .withMessage('Date is required')
      .isISO8601(),
    body('hours')
      .isFloat({ min: 0.1, max: 24 })
      .withMessage('Hours must be between 0.1 and 24')
  ],
  missedSession: [
    body('planId')
      .notEmpty()
      .withMessage('Plan ID is required')
      .isMongoId(),
    body('date')
      .notEmpty()
      .withMessage('Date is required')
      .isISO8601()
  ]
};

export { validateRequest, authValidation, planValidation };
