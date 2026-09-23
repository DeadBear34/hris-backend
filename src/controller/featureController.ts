import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as featureModel from "../models/feature.js";
import * as positionModel from "../models/position.js";
import type { Feature, FeatureCategory } from "../models/feature.js";
import { invalidateFeatureCache } from "../helpers/featureCache.js";
import { getUserFeatureCodes } from "../middlewares/feature.js";
import { BadRequest, NotFound } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import { plural } from "../helpers/plural.js";

const CATEGORY_ORDER: FeatureCategory[] = [
  "employee",
  "organization",
  "leave",
  "attendance",
  "system",
];

const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  employee: "Employment",
  organization: "Organization",
  leave: "Leave",
  attendance: "Attendance",
  system: "System",
};

function groupByCategory(features: Feature[]) {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    features: features.filter((f) => f.category === category),
  })).filter((group) => group.features.length > 0);
}

export async function ListFeatureCatalogController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const features = await featureModel.findAllFeatures();

    res.json({
      success: true,
      data: {
        total: features.length,
        categories: groupByCategory(features),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function PositionFeatureController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Position not found");

    const features = await featureModel.findFeaturesByPosition(id);

    res.json({
      success: true,
      data: {
        position: {
          id: position.id,
          code: position.code,
          name: position.name,
          updated_at: position.updated_at,
        },
        codes: features.map((f) => f.code),
        features,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function ReplacePositionFeatureController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const client = await pool.connect();

  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { codes, updated_at: expectedUpdatedAt } = req.body as {
      codes: string[];
      updated_at?: string;
    };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Position not found");

    const requestedCodes = [...new Set(codes)];
    const recognizedCodes = await featureModel.findByCodes(requestedCodes);

    if (recognizedCodes.length !== requestedCodes.length) {
      const knownCodes = new Set(recognizedCodes.map((f) => f.code));
      const unknownCodes = requestedCodes.filter(
        (code) => !knownCodes.has(code),
      );

      throw BadRequest(`Unknown feature codes: ${unknownCodes.join(", ")}`, {
        unknown_codes: unknownCodes,
      });
    }

    await client.query("BEGIN");

    // Pengaturan fitur dianggap bagian dari data jabatan, jadi dua admin yang
    // mengubah centang jabatan yang sama saling terdeteksi lewat updated_at-nya
    const touched = await positionModel.touchPosition(
      client,
      id,
      expectedUpdatedAt,
    );

    if (!touched) {
      throw await rejectStaleUpdate(
        "position",
        () => positionModel.findById(id),
        "Position not found",
      );
    }

    await featureModel.replacePositionFeatures(
      client,
      id,
      recognizedCodes.map((f) => f.id),
      req.user?.id ?? null,
    );

    await client.query("COMMIT");

    invalidateFeatureCache(id);

    activity.success({
      action: "position.features_replace",
      entity: "position",
      entity_id: id,
      summary: `Features for position ${position.name} updated to ${plural(recognizedCodes.length, "feature")}`,
      metadata: { codes: recognizedCodes.map((f) => f.code) },
    });

    res.json({
      success: true,
      message: `Features for position ${position.name} updated successfully`,
      data: {
        position_id: id,
        updated_at: touched.updated_at,
        codes: recognizedCodes.map((f) => f.code),
        total: recognizedCodes.length,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

export async function FeatureMatrixController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const [positions, features, grants] = await Promise.all([
      positionModel.findAll(),
      featureModel.findAllFeatures(),
      featureModel.findMatrix(),
    ]);

    res.json({
      success: true,
      data: {
        positions: positions.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          level: p.level,
          updated_at: p.updated_at,
        })),
        categories: groupByCategory(features),
        grants,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function MyFeatureController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const codes = await getUserFeatureCodes(req, res);

    res.json({
      success: true,
      data: {
        role: req.user?.role ?? null,
        is_admin: req.user?.role === "admin",
        codes,
      },
    });
  } catch (err) {
    next(err);
  }
}
