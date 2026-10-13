import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { markSchema } from "../docs/routeMeta.js";

export function validate(schema: ZodType) {
  return markSchema(
    (req: Request, _res: Response, next: NextFunction) => {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        return next(result.error);
      }

      req.body = result.data;
      next();
    },
    "body",
    schema,
  );
}

export function validateQuery(schema: ZodType) {
  return markSchema(
    (req: Request, res: Response, next: NextFunction) => {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        return next(result.error);
      }

      res.locals.query = result.data;
      next();
    },
    "query",
    schema,
  );
}

export function validateParams(schema: ZodType) {
  return markSchema(
    (req: Request, res: Response, next: NextFunction) => {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        return next(result.error);
      }

      res.locals.params = result.data;
      next();
    },
    "params",
    schema,
  );
}
