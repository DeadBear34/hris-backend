import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { withTransaction } from "../helpers/transaction.js";
import * as profileModel from "../models/accessProfile.js";
import * as featureModel from "../models/feature.js";
import * as positionModel from "../models/position.js";
import { invalidateFeatureCache } from "../helpers/featureCache.js";
import { BadRequest, Conflict, NotFound } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import { plural } from "../helpers/plural.js";
import { diffCodes, missingRequirements } from "../helpers/accessRules.js";

// Kode fitur harus dikenal, masih aktif, dan lengkap dengan fitur yang
// dibutuhkannya. Mengembalikan daftar tanpa duplikat yang urut
export async function validatedCodes(codes: string[]): Promise<string[]> {
  const requested = [...new Set(codes)].sort();
  const recognized = await featureModel.findByCodes(requested);

  if (recognized.length !== requested.length) {
    const known = new Set(recognized.map((feature) => feature.code));
    const unknown = requested.filter((code) => !known.has(code));

    throw BadRequest(`Unknown feature codes: ${unknown.join(", ")}`, {
      unknown_codes: unknown,
    });
  }

  const missing = missingRequirements(requested);

  if (missing.length > 0) {
    const sentence = missing
      .map((item) => `${item.code} needs ${item.requires.join(", ")}`)
      .join("; ");

    throw BadRequest(`Some features are missing what they need: ${sentence}`, {
      missing_requirements: missing,
    });
  }

  return requested;
}

async function assertNameAvailable(
  name: string,
  exceptId?: string,
): Promise<void> {
  if (await profileModel.findByName(name, exceptId)) {
    throw Conflict(`An access profile named ${name} already exists`);
  }
}

export function newProfileCode(): string {
  return `custom_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function invalidatePositions(position_ids: string[]): void {
  for (const id of position_ids) invalidateFeatureCache(id);
}

export async function ListAccessProfileController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const profiles = await profileModel.findAll();

    res.json({ success: true, data: profiles });
  } catch (err) {
    next(err);
  }
}

export async function DetailAccessProfileController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const profile = await profileModel.findById(id);
    if (!profile) throw NotFound("Access profile not found");

    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

export async function CreateAccessProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { name, description, codes } = req.body as {
      name: string;
      description?: string | null;
      codes: string[];
    };

    const cleanCodes = await validatedCodes(codes);
    await assertNameAvailable(name);

    const profile = await withTransaction(async (client) => {
      const id = await profileModel.createProfile(client, {
        code: newProfileCode(),
        name,
        description,
      });
      await profileModel.replaceFeatures(client, id, cleanCodes);

      return profileModel.findById(id, client);
    });

    if (!profile) throw new Error("Failed to load the saved access profile");

    activity.success({
      action: "access_profile.create",
      entity: "access_profile",
      entity_id: profile.id,
      summary: `Access profile ${profile.name} created with ${plural(cleanCodes.length, "feature")}`,
      metadata: { codes: cleanCodes },
    });

    res.status(201).json({
      success: true,
      message: "Access profile created successfully",
      data: profile,
    });
  } catch (err) {
    next(err);
  }
}

export async function UpdateAccessProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const {
      name,
      description,
      codes,
      updated_at: expectedUpdatedAt,
    } = req.body as {
      name?: string;
      description?: string | null;
      codes?: string[];
      updated_at?: string;
    };

    const existing = await profileModel.findById(id);
    if (!existing) throw NotFound("Access profile not found");

    const cleanCodes =
      codes === undefined ? undefined : await validatedCodes(codes);

    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      await assertNameAvailable(name, id);
    }

    // Paket dan seluruh jabatan pemakainya berubah dalam satu transaksi:
    // tidak ada saat di mana sebagian jabatan masih memakai isi lama
    const { profile, touched } = await withTransaction(async (client) => {
      const updated = await profileModel.updateProfile(
        client,
        id,
        { name, description },
        expectedUpdatedAt,
      );

      if (!updated) {
        throw await rejectStaleUpdate(
          "access_profile",
          () => profileModel.findById(id),
          "Access profile not found",
        );
      }

      let touched: string[] = [];

      if (cleanCodes) {
        await profileModel.replaceFeatures(client, id, cleanCodes);
        touched = await profileModel.syncPositions(
          client,
          id,
          req.user?.id ?? null,
        );
      }

      return { profile: await profileModel.findById(id, client), touched };
    });

    invalidatePositions(touched);

    const changes = cleanCodes
      ? diffCodes(existing.codes, cleanCodes)
      : { added: [], removed: [] };

    activity.success({
      action: "access_profile.update",
      entity: "access_profile",
      entity_id: id,
      summary: cleanCodes
        ? `Access profile ${existing.name} updated: ${plural(changes.added.length, "feature")} added, ${changes.removed.length} removed, applied to ${plural(touched.length, "position")}`
        : `Access profile ${existing.name} updated`,
      metadata: { ...changes, positions_updated: touched.length },
    });

    res.json({
      success: true,
      message: cleanCodes
        ? `Access profile updated, the change applies to ${plural(touched.length, "position")}`
        : "Access profile updated successfully",
      data: profile,
    });
  } catch (err) {
    next(err);
  }
}

export async function DeleteAccessProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await profileModel.findById(id);
    if (!existing) throw NotFound("Access profile not found");

    if (existing.is_system) {
      throw BadRequest(
        `${existing.name} is a standard access profile and cannot be deleted`,
      );
    }

    // Menghapus diam-diam akan mencabut akses semua pemegangnya sekaligus
    if (existing.position_count > 0) {
      throw Conflict(
        `${existing.name} is still used by ${plural(existing.position_count, "position")}. Move them to another access profile first`,
        { position_count: existing.position_count },
      );
    }

    await withTransaction((client) => profileModel.deleteProfile(client, id));

    activity.success({
      action: "access_profile.delete",
      entity: "access_profile",
      entity_id: id,
      summary: `Access profile ${existing.name} deleted`,
      metadata: { codes: existing.codes },
    });

    res.json({ success: true, message: "Access profile deleted successfully" });
  } catch (err) {
    next(err);
  }
}

export async function AssignAccessProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { access_profile_id, updated_at: expectedUpdatedAt } = req.body as {
      access_profile_id: string | null;
      updated_at?: string;
    };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Position not found");

    const profile = access_profile_id
      ? await profileModel.findById(access_profile_id)
      : null;

    if (access_profile_id && !profile) {
      throw BadRequest("Access profile not found");
    }

    const before = await featureModel.findCodesByPosition(id);

    const saved = await withTransaction(async (client) => {
      const row = await profileModel.assignToPosition(
        client,
        id,
        access_profile_id,
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

      return row;
    });

    invalidateFeatureCache(id);

    const after = profile?.codes ?? [];

    activity.success({
      action: "position.access_profile_assign",
      entity: "position",
      entity_id: id,
      summary: profile
        ? `Position ${position.name} now uses access profile ${profile.name}`
        : `Position ${position.name} no longer has an access profile`,
      metadata: {
        access_profile_id,
        ...diffCodes(before, after),
      },
    });

    res.json({
      success: true,
      message: profile
        ? `${position.name} now uses ${profile.name}`
        : `${position.name} now has employee self-service access only`,
      data: {
        position_id: id,
        access_profile_id,
        access_profile_name: profile?.name ?? null,
        codes: after,
        updated_at: saved.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}
