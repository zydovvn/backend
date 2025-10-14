const { z } = require('zod');
const MessageSendSchema=z.object({to_user_id:z.number().int().positive(),content:z.string().min(1).max(2000)});
module.exports={MessageSendSchema};
