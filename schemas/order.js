const { z } = require('zod');
const OrderItemSchema=z.object({product_id:z.number().int().positive(),quantity:z.number().int().positive()});
const OrderCreateSchema=z.object({items:z.array(OrderItemSchema).min(1),address:z.string().min(5)});
const OrderUpdateSchema=z.object({status:z.enum(['pending','paid','shipped','completed','canceled']).optional(),address:z.string().min(5).optional()});
module.exports={OrderCreateSchema,OrderUpdateSchema};
