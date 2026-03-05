import { z } from "zod";

export const artistTypeSchema = z.enum(["COMPANY", "INDIVIDUAL"]);
export const artworkCategorySchema = z.enum(["STEEL_ART", "PUBLIC_ART"]);
export const userResidencySchema = z.enum(["POHANG", "NON_POHANG"]);
export const userAgeGroupSchema = z.enum([
  "TEEN",
  "20S",
  "30S",
  "40S",
  "50S",
  "60S",
  "70_PLUS",
]);
export const userLanguageSchema = z.enum(["ko", "en"]);

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const deletedFilterSchema = z.enum(["all", "only", "exclude"]).default("exclude");

export const artistsQuerySchema = z.object({
  query: z.string().optional(),
  type: artistTypeSchema.optional(),
  deleted: deletedFilterSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const usersQuerySchema = z.object({
  query: z.string().optional(),
  residency: userResidencySchema.optional(),
  ageGroup: userAgeGroupSchema.optional(),
  language: userLanguageSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

const artistBasePayloadSchema = z.object({
  name_ko: z.string().min(1),
  name_en: z.string().min(1),
  type: artistTypeSchema,
});

export const artistCreatePayloadSchema = artistBasePayloadSchema.extend({
  profile_image_url: z.string().url(),
});

export const artistUpdatePayloadSchema = artistBasePayloadSchema.extend({
  profile_image_url: z.string().url().optional(),
});

export const artworksQuerySchema = z.object({
  query: z.string().optional(),
  category: artworkCategorySchema.optional(),
  artistId: z.coerce.number().int().positive().optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  placeId: z.coerce.number().int().positive().optional(),
  deleted: deletedFilterSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const placesQuerySchema = z.object({
  query: z.string().optional(),
  zoneId: z.coerce.number().int().positive().optional(),
  deleted: deletedFilterSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

const optionalAddressSchema = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const placeBasePayloadSchema = z.object({
  name_ko: z.string().trim().min(1),
  name_en: z.string().trim().min(1),
  address: optionalAddressSchema,
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  zone_id: z.coerce.number().int().positive().nullable().optional(),
});

export const placeCreatePayloadSchema = placeBasePayloadSchema;

export const placeUpdatePayloadSchema = placeBasePayloadSchema;

export const placeGeocodePayloadSchema = z.object({
  address: z.string().trim().min(1),
});

const artworkBasePayloadSchema = z.object({
  title_ko: z.string().min(1),
  title_en: z.string().min(1),
  artist_id: z.coerce.number().int().positive(),
  category: artworkCategorySchema,
  production_year: z.coerce.number().int().positive(),
  size_text_ko: z.string().min(1),
  size_text_en: z.string().min(1),
  description_ko: z.string().min(1),
  description_en: z.string().min(1),
});

const artworkPlacePayloadSchema = placeBasePayloadSchema;

const artworkAudioUrlSchema = z.object({
  audio_url_ko: z.string().url().optional(),
  audio_url_en: z.string().url().optional(),
});

const artworkImagesSchema = z
  .array(
    z.object({
      image_url: z.string().trim().url(),
    }),
  )
  .min(1);

const FESTIVAL_YEAR_PATTERN = /^\d{4}$/;

const artworkFestivalYearsSchema = z
  .array(z.string())
  .transform((years) =>
    years.map((year) => year.trim()).filter((year) => year.length > 0),
  )
  .refine(
    (years) => years.every((year) => FESTIVAL_YEAR_PATTERN.test(year)),
    "축제 연도는 4자리 숫자여야 합니다.",
  )
  .transform((years) => Array.from(new Set(years)));

export const artworkPayloadSchema = artworkBasePayloadSchema.extend({
  place: artworkPlacePayloadSchema,
  audio_url_ko: z.string().url(),
  audio_url_en: z.string().url(),
  images: artworkImagesSchema,
  festival_years: artworkFestivalYearsSchema,
});

export const artworkUpdatePayloadSchema = artworkBasePayloadSchema
  .merge(artworkAudioUrlSchema)
  .extend({
    place: artworkPlacePayloadSchema,
    images: artworkImagesSchema,
    festival_years: artworkFestivalYearsSchema,
  });

export const coursesQuerySchema = z.object({
  query: z.string().optional(),
  isOfficial: z
    .union([
      z.literal("true"),
      z.literal("false"),
      z.literal("1"),
      z.literal("0"),
    ])
    .optional(),
  deleted: deletedFilterSchema.optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const coursePayloadSchema = z.object({
  title_ko: z.string().min(1),
  title_en: z.string().min(1),
  description_ko: z.string().min(1),
  description_en: z.string().min(1),
  is_official: z.boolean(),
});

export const courseItemAddSchema = z.object({
  artwork_id: z.coerce.number().int().positive(),
  seq: z.coerce.number().int().positive().optional(),
});

export const courseItemReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        seq: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
});

export const homeBannerCreateSchema = z.object({
  banner_image_url: z.string().url(),
  is_active: z.boolean(),
});

export const homeBannerUpdateSchema = z.object({
  is_active: z.boolean(),
});

export const homeBannerImageUpdateSchema = z.object({
  banner_image_url: z.string().url(),
});

export const homeBannerReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        display_order: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
});

export const uploadPresignSchema = z.object({
  folder: z.string().min(1).max(120).regex(/^[a-z0-9\-_/]+$/i),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
});

export function parseBooleanString(value: string | undefined) {
  if (!value) return undefined;
  return value === "true" || value === "1";
}

export function validateMimeType(contentType: string) {
  return contentType.startsWith("image/") || contentType.startsWith("audio/");
}
