const { z } = require('zod');
const RegisterSchema=z.object({email:z.string().email(),password:z.string().min(6),name:z.string().min(2).optional()});
const LoginSchema=z.object({email:z.string().email(),password:z.string().min(1)});
module.exports={RegisterSchema,LoginSchema};
