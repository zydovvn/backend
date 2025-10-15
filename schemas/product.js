const { z } = require('zod');
const ProductCreateSchema=z.object({name:z.string().min(2),price:z.number().nonnegative(),category_id:z.number().int().positive().optional(),description:z.string().max(2000).optional()});
const ProductUpdateSchema=ProductCreateSchema.partial();
module.exports={ProductCreateSchema,ProductUpdateSchema};
