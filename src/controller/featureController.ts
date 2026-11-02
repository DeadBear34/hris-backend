import type { Request, Response, NextFunction } from "express";
import { withTransaction } from "../helpers/transaction.js";
import * as featureModel from "../models/feature.js";
import * as positionModel from "../models/position.js";
import type { Feature, FeatureCategory } from "../models/feature.js";
import { invalidateFeatureCache } from "../helpers/featureCache.js";
import { getUserFeatureCodes } from "../middlewares/feature.js";
import { NotFound } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import { plural } from "../helpers/plural.js";
import * as profileModel from "../models/accessProfile.js";
import {
  FEATURE_REQUIRES,
  SENSITIVE_FEATURES,
  diffCodes,
} from "../helpers/accessRules.js";
import { newProfileCode, validatedCodes } from "./accessProfileController.js";

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

// Setiap fitur diberi tanda sensitif dan daftar fitur yang dibutuhkannya,
// supaya layar dapat memberi peringatan dan mencentang otomatis
function groupByCategory(features: Feature[]) {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    features: features
      .filter((f) => f.category === category)
      .map((f) => ({
        ...f,
        is_sensitive: SENSITIVE_FEATURES.has(f.code),
        requires: [...(FEATURE_REQUIRES[f.code] ?? [])],
      })),
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

// Jalur lama yang mengirim centang per jabatan. Tetap didukung supaya klien
// lama tidak rusak, tetapi kini dipetakan ke paket akses: dipakai paket yang
// isinya sama persis, atau dibuatkan paket kustom baru untuk jabatan ini
export async function ReplacePositionFeatureController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { codes, updated_at: expectedUpdatedAt } = req.body as {
      codes: string[];
      updated_at?: string;
    };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Position not found");

    const cleanCodes = await validatedCodes(codes);
    const before = await featureModel.findCodesByPosition(id);

    const result = await withTransaction(async (client) => {
      let profile =
        cleanCodes.length === 0
          ? null
          : await profileModel.findByExactCodes(cleanCodes, client);

      if (cleanCodes.length > 0 && !profile) {
        const profileId = await profileModel.createProfile(client, {
          code: newProfileCode(),
          name: `Kustom: ${position.name}`.slice(0, 100),
          description: "Dibuat otomatis dari pengaturan fitur per jabatan",
        });
        await profileModel.replaceFeatures(client, profileId, cleanCodes);
        profile = { id: profileId, name: `Kustom: ${position.name}` };
      }

      const row = await profileModel.assignToPosition(
        client,
        id,
        profile?.id ?? null,
        req.user?.id ?? null,
        expectedUpdatedAt,
      );

      if (!row) {
        throw await rejectStaleUpdate(
          "position",
          () => positionModel.findById(id),
          "Position not found",
        );
      }

      return { row, profile };
    });

    invalidateFeatureCache(id);

    activity.success({
      action: "position.features_replace",
      entity: "position",
      entity_id: id,
      summary: `Features for position ${position.name} updated to ${plural(cleanCodes.length, "feature")}`,
      metadata: {
        codes: cleanCodes,
        access_profile_id: result.profile?.id ?? null,
        ...diffCodes(before, cleanCodes),
      },
    });

    res.json({
      success: true,
      message: `Features for position ${position.name} updated successfully`,
      data: {
        position_id: id,
        updated_at: result.row.updated_at,
        codes: cleanCodes,
        total: cleanCodes.length,
        access_profile_id: result.profile?.id ?? null,
        access_profile_name: result.profile?.name ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function FeatureMatrixController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const [positions, features, grants, profiles, assignments] =
      await Promise.all([
        positionModel.findAll(),
        featureModel.findAllFeatures(),
        featureModel.findMatrix(),
        profileModel.findAll(),
        profileModel.findAssignments(),
      ]);

    const assignmentOf = new Map(
      assignments.map((row) => [row.position_id, row]),
    );

    res.json({
      success: true,
      data: {
        positions: positions.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          level: p.level,
          // nama jabatan hanya unik per unit, jadi unitnya ikut ditampilkan
          department_id: p.department_id,
          department_name: p.department_name,
          is_unit_head: p.is_unit_head,
          access_profile_id: assignmentOf.get(p.id)?.access_profile_id ?? null,
          holder_count: assignmentOf.get(p.id)?.holder_count ?? 0,
          updated_at: p.updated_at,
        })),
        categories: groupByCategory(features),
        grants,
        access_profiles: profiles,
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
