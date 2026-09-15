import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import * as featureModel from "../models/feature.js";
import type { Employee } from "../models/employee.js";
import { readFromCache, writeToCache } from "../helpers/featureCache.js";
import { Forbidden } from "../helpers/appError.js";

async function getRequestEmployee(
  req: Request,
  res: Response,
): Promise<Employee | null> {
  const stored = res.locals.employee as Employee | undefined;
  if (stored) return stored;

  if (!req.user) return null;

  const employee = await employeeModel.findByUserId(req.user.id);
  if (!employee) return null;

  res.locals.employee = employee;

  return employee;
}

async function getPositionFeatureCodes(position_id: string): Promise<string[]> {
  const fromCache = readFromCache(position_id);
  if (fromCache) return fromCache;

  const codes = await featureModel.findCodesByPosition(position_id);
  writeToCache(position_id, codes);

  return codes;
}

export async function getUserFeatureCodes(
  req: Request,
  res: Response,
): Promise<string[]> {
  if (req.user?.role === "admin") {
    return featureModel.findAllCodes();
  }

  const employee = await getRequestEmployee(req, res);

  if (!employee?.position_id) return [];

  return getPositionFeatureCodes(employee.position_id);
}

export async function hasFeature(
  req: Request,
  res: Response,
  code: string,
): Promise<boolean> {
  if (req.user?.role === "admin") return true;

  const employee = await getRequestEmployee(req, res);

  if (!employee?.position_id) return false;

  const codes = await getPositionFeatureCodes(employee.position_id);

  return codes.includes(code);
}

export function requireFeature(code: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === "admin") return next();

      const employee = await getRequestEmployee(req, res);

      if (!employee) {
        throw Forbidden(
          "Your account is not linked to an employee record, so it has no access yet. Please contact an admin",
          { required_feature: code },
        );
      }

      if (!employee.position_id) {
        throw Forbidden(
          "Your position has not been set, so no features are available yet. Please contact an admin",
          { required_feature: code },
        );
      }

      const codes = await getPositionFeatureCodes(employee.position_id);

      if (!codes.includes(code)) {
        throw Forbidden(
          "Your position does not have access to the requested feature",
          { required_feature: code },
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
