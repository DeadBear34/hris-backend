import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

export function validate(schema: ZodType) {
    return (req: Request, _res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);

        if(!result.success) {
            return next(result.error);
        }

        req.body = result.data;
        next();
    };
}

export function validateQuery(schema: ZodType) {
    return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
        return next(result.error);
    }

    res.locals.query = result.data;
    next();
  };
}