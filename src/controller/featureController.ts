import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as featureModel from "../models/feature.js";
import * as positionModel from "../models/position.js";
import type { Feature, FeatureCategory } from "../models/feature.js";
import { batalkanCacheFitur } from "../helpers/featureCache.js";
import { ambilKodeFiturPengguna } from "../middlewares/feature.js";
import { BadRequest, NotFound } from "../helpers/appError.js";

const URUTAN_KATEGORI: FeatureCategory[] = [
  "employee",
  "organization",
  "leave",
  "attendance",
  "system",
];

const LABEL_KATEGORI: Record<FeatureCategory, string> = {
  employee: "Kepegawaian",
  organization: "Organisasi",
  leave: "Cuti",
  attendance: "Absensi",
  system: "Sistem",
};

function kelompokkanPerKategori(features: Feature[]) {
  return URUTAN_KATEGORI.map((category) => ({
    category,
    label: LABEL_KATEGORI[category],
    features: features.filter((f) => f.category === category),
  })).filter((grup) => grup.features.length > 0);
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
        categories: kelompokkanPerKategori(features),
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
    if (!position) throw NotFound("Jabatan tidak ditemukan");

    const features = await featureModel.findFeaturesByPosition(id);

    res.json({
      success: true,
      data: {
        position: { id: position.id, code: position.code, name: position.name },
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
    const { id } = res.locals.params as { id: string };
    const { codes } = req.body as { codes: string[] };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Jabatan tidak ditemukan");

    const diminta = [...new Set(codes)];
    const dikenal = await featureModel.findByCodes(diminta);

    if (dikenal.length !== diminta.length) {
      const kodeDikenal = new Set(dikenal.map((f) => f.code));
      const tidakDikenal = diminta.filter((code) => !kodeDikenal.has(code));

      throw BadRequest(
        `Kode fitur berikut tidak dikenal: ${tidakDikenal.join(", ")}`,
        { unknown_codes: tidakDikenal },
      );
    }

    await client.query("BEGIN");

    await featureModel.replacePositionFeatures(
      client,
      id,
      dikenal.map((f) => f.id),
      req.user?.id ?? null,
    );

    await client.query("COMMIT");

    batalkanCacheFitur(id);

    res.json({
      success: true,
      message: `Fitur untuk jabatan ${position.name} berhasil diperbarui`,
      data: {
        position_id: id,
        codes: dikenal.map((f) => f.code),
        total: dikenal.length,
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
        })),
        categories: kelompokkanPerKategori(features),
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
    const codes = await ambilKodeFiturPengguna(req, res);

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
