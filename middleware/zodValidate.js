// backend/middleware/zodValidate.js  (ESM)
export const zodValidate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse(req.body);
    req.validatedBody = parsed;
    next();
  } catch (e) {
    const errors =
      e?.errors?.map((er) => ({ field: er.path.join("."), msg: er.message })) ||
      [{ msg: "Invalid input" }];
    return res.status(400).json({ errors });
  }
};
