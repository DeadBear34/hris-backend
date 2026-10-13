import type { Request, Response, NextFunction } from "express";
import * as featureModel from "../models/feature.js";
import { readFromCache, writeToCache } from "../helpers/featureCache.js";
import { Forbidden } from "../helpers/appError.js";
import { findRequestEmployee } from "../helpers/requestEmployee.js";
import { markFeature } from "../docs/routeMeta.js";

async function loadPositionFeatureCodes(
  position_id: string,
): Promise<string[]> {
  const fromCache = readFromCache(position_id);
  if (fromCache) return fromCache;

  const codes = await featureModel.findCodesByPosition(position_id);
  writeToCache(position_id, codes);

  return codes;
}

// Dibaca sekali per request. Yang disimpan janjinya, bukan hasilnya, supaya
// beberapa pemeriksaan fitur yang berjalan bersamaan (misalnya tiga hasFeature
// lewat Promise.all) tetap hanya memicu satu query saat cache kosong
function getPositionFeatureCodes(
  res: Response,
  position_id: string,
): Promise<string[]> {
  const stored = res.locals.featureCodes as Promise<string[]> | undefined;
  if (stored) return stored;

  const pending = loadPositionFeatureCodes(position_id);
  res.locals.featureCodes = pending;

  return pending;
}

export async function getUserFeatureCodes(
  req: Request,
  res: Response,
): Promise<string[]> {
  if (req.user?.role === "admin") {
    return featureModel.findAllCodes();
  }

  const employee = await findRequestEmployee(req, res);

  if (!employee?.position_id) return [];

  return getPositionFeatureCodes(res, employee.position_id);
}

export async function hasFeature(
  req: Request,
  res: Response,
  code: string,
): Promise<boolean> {
  if (req.user?.role === "admin") return true;

  const employee = await findRequestEmployee(req, res);

  if (!employee?.position_id) return false;

  const codes = await getPositionFeatureCodes(res, employee.position_id);

  return codes.includes(code);
}

export function requireFeature(code: string) {
  return markFeature(
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (req.user?.role === "admin") return next();

        const employee = await findRequestEmployee(req, res);

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

        const codes = await getPositionFeatureCodes(res, employee.position_id);

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
    },
    code,
  );
}
