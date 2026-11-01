import { Temporal } from 'temporal-polyfill';
import type {
  CandidateScore,
  MatchingAvailabilityPreference,
  MatchingCareerStage,
  MatchingConfig,
  MatchingCurrentLevel,
  MatchingLanguage,
  MatchingSignal,
  MenteeSignals,
  MentorAvailabilitySlot,
  MentorCandidate,
  RecommendInput,
  Recommendation,
  ScoreBreakdown,
} from './matching.types.js';

const STAGE_TARGET_YEARS: Record<MatchingCareerStage, number> = {
  school: 3,
  preuniversity: 3,
  university: 6,
  early_career: 10,
};

const LEVEL_TARGET_YEARS: Record<MatchingCurrentLevel, number> = {
  beginner: 3,
  intermediate: 6,
  advanced: 10,
};

interface ComponentResult {
  breakdown: ScoreBreakdown;
  reason: string | null;
}

export function recommend(input: RecommendInput): Recommendation[] {
  return input.candidates
    .filter((candidate) => passesHardFilters(input.mentee, candidate))
    .map((candidate) => scoreCandidate(input.mentee, candidate, input.config))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.userId.localeCompare(right.candidate.userId),
    )
    .map(toRecommendation);
}

export function passesHardFilters(
  mentee: MenteeSignals,
  candidate: MentorCandidate,
): boolean {
  if (candidate.status !== 'approved' || candidate.userStatus !== 'active') {
    return false;
  }

  if (mentee.blockedMentorIds?.includes(candidate.userId)) {
    return false;
  }

  if (
    mentee.languages.length > 0 &&
    !hasCommonLanguage(mentee.languages, candidate.languages)
  ) {
    return false;
  }

  if (mentee.areas.length > 0 && !hasCommonArea(mentee, candidate)) {
    return false;
  }

  if (candidate.availability.length === 0) {
    return false;
  }

  if (mentee.onlyFree === true && !candidate.offerings.some(isFree)) {
    return false;
  }

  if (
    mentee.maxPriceMinor !== null &&
    !candidate.offerings.some(
      (offering) => offering.priceMinor <= mentee.maxPriceMinor!,
    )
  ) {
    return false;
  }

  return true;
}

function scoreCandidate(
  mentee: MenteeSignals,
  candidate: MentorCandidate,
  config: MatchingConfig,
): CandidateScore {
  const areas = scoreAreas(mentee, candidate, config);
  const availability = scoreAvailability(mentee, candidate, config);
  const language = scoreLanguage(mentee, candidate, config);
  const level = scoreLevelFit(mentee, candidate, config);
  const price = scorePriceFit(mentee, candidate, config);
  const reliability = scoreReliability(config);
  const components = [
    areas,
    availability,
    language,
    level,
    price,
    reliability,
  ];
  const breakdown = components.map((component) => component.breakdown);

  return {
    candidate,
    score: round2(
      breakdown.reduce((total, component) => total + component.points, 0),
    ),
    breakdown,
    reason: buildReason(components),
  };
}

function scoreAreas(
  mentee: MenteeSignals,
  candidate: MentorCandidate,
  config: MatchingConfig,
): ComponentResult {
  const candidateAreaIds = new Set(
    candidate.areas.map((area) => area.id),
  );
  const candidateAreaParents = new Set(
    candidate.areas
      .map((area) => area.parentId)
      .filter((parentId): parentId is string => parentId !== null),
  );
  const matches = mentee.areas.map((area) => {
    if (candidateAreaIds.has(area.id)) {
      return { area, weight: 1 };
    }

    if (
      (area.parentId !== null && candidateAreaIds.has(area.parentId)) ||
      candidateAreaParents.has(area.id)
    ) {
      return { area, weight: 0.5 };
    }

    return { area, weight: 0 };
  });
  const matchedNames = matches
    .filter((match) => match.weight > 0)
    .map((match) => match.area.name);
  const fraction =
    mentee.areas.length === 0
      ? 0
      : matches.reduce((total, match) => total + match.weight, 0) /
        mentee.areas.length;
  const detail =
    mentee.areas.length === 0
      ? 'No declaraste intereses STEM.'
      : matchedNames.length > 0
        ? `${matchedNames.length} de ${mentee.areas.length} intereses en común: ${formatList(matchedNames)}.`
        : 'No hay intereses en común.';

  return component(
    'areas',
    fraction,
    config,
    detail,
    matchedNames.length > 0
      ? `Comparte tu interés en ${formatList(matchedNames)}`
      : null,
  );
}

function scoreAvailability(
  mentee: MenteeSignals,
  candidate: MentorCandidate,
  config: MatchingConfig,
): ComponentResult {
  if (mentee.availabilityPreferences.length === 0) {
    return component(
      'availability',
      candidate.availability.length > 0 ? 0.5 : 0,
      config,
      'No declaraste preferencias horarias.',
      null,
    );
  }

  const overlap = candidate.availability.reduce(
    (total, slot) =>
      total + overlapMinutes(slot, mentee.availabilityPreferences, mentee.timezone),
    0,
  );
  const hours = overlap / 60;
  const fraction = Math.min(1, hours / config.targetAvailabilityHours);

  return component(
    'availability',
    fraction,
    config,
    hours > 0
      ? `${formatNumber(hours)} h de coincidencia en los próximos ${config.horizonDays} días.`
      : 'Sin coincidencia con tus preferencias horarias.',
    hours > 0 ? 'Tiene horarios que coinciden con tu disponibilidad' : null,
  );
}

function scoreLanguage(
  mentee: MenteeSignals,
  candidate: MentorCandidate,
  config: MatchingConfig,
): ComponentResult {
  const menteeCodes = new Set(mentee.languages.map((language) => language.code));
  const common = candidate.languages.filter((language) =>
    menteeCodes.has(language.code),
  );
  const fraction =
    mentee.languages.length === 0
      ? 0
      : common.length / mentee.languages.length;
  const detail =
    mentee.languages.length === 0
      ? 'No declaraste idiomas.'
      : common.length > 0
        ? `${common.length} de ${mentee.languages.length} idiomas en común: ${formatList(common.map((language) => language.name))}.`
        : 'No hay idiomas en común.';

  return component(
    'language',
    fraction,
    config,
    detail,
    common.length > 0
      ? `Habla ${formatList(common.map((language) => language.name))}`
      : null,
  );
}

function scoreLevelFit(
  mentee: MenteeSignals,
  candidate: MentorCandidate,
  config: MatchingConfig,
): ComponentResult {
  const targets: number[] = [];

  if (mentee.careerStage) {
    targets.push(STAGE_TARGET_YEARS[mentee.careerStage]);
  }

  if (mentee.currentLevel) {
    targets.push(LEVEL_TARGET_YEARS[mentee.currentLevel]);
  }

  if (targets.length === 0 || candidate.yearsExperience === null) {
    return component(
      'level_fit',
      0.5,
      config,
      'Sin datos suficientes para ajustar la experiencia.',
      null,
    );
  }

  const target =
    targets.reduce((total, value) => total + value, 0) / targets.length;
  const distance = Math.abs(candidate.yearsExperience - target);
  const fraction = Math.max(
    0,
    1 - distance / config.levelFitMaxYearsDistance,
  );

  return component(
    'level_fit',
    fraction,
    config,
    `${candidate.yearsExperience} años de experiencia; tu perfil sugiere ~${formatNumber(target)} años.`,
    fraction >= 0.75 ? 'Su experiencia se ajusta a tu etapa' : null,
  );
}

function scorePriceFit(
  mentee: MenteeSignals,
  candidate: MentorCandidate,
  config: MatchingConfig,
): ComponentResult {
  const hasFreeOffering = candidate.offerings.some(isFree);

  if (mentee.onlyFree === true) {
    return component(
      'price_fit',
      hasFreeOffering ? 1 : 0,
      config,
      hasFreeOffering
        ? 'Ofrece una mentoría gratuita.'
        : 'No ofrece mentorías gratuitas.',
      hasFreeOffering ? 'Ofrece una mentoría gratuita' : null,
    );
  }

  if (mentee.maxPriceMinor !== null) {
    const withinBudget = candidate.offerings.some(
      (offering) => offering.priceMinor <= mentee.maxPriceMinor!,
    );

    return component(
      'price_fit',
      withinBudget ? 1 : 0,
      config,
      withinBudget
        ? 'Tiene una oferta dentro de tu presupuesto.'
        : 'No tiene ofertas dentro de tu presupuesto.',
      withinBudget ? 'Tiene una oferta dentro de tu presupuesto' : null,
    );
  }

  return component(
    'price_fit',
    hasFreeOffering ? 1 : candidate.offerings.length > 0 ? 0.5 : 0,
    config,
    hasFreeOffering
      ? 'Ofrece una mentoría gratuita.'
      : candidate.offerings.length > 0
        ? 'Solo ofrece mentorías de pago; no declaraste presupuesto.'
        : 'No tiene ofertas activas.',
    hasFreeOffering ? 'Ofrece una mentoría gratuita' : null,
  );
}

function scoreReliability(config: MatchingConfig): ComponentResult {
  return component(
    'reliability',
    config.reliabilityNeutral,
    config,
    'Sin datos de confiabilidad todavía; valor neutral.',
    null,
  );
}

function component(
  signal: MatchingSignal,
  fraction: number,
  config: MatchingConfig,
  detail: string,
  reason: string | null,
): ComponentResult {
  const max = config.weights[signal];
  const points = round2(Math.min(1, Math.max(0, fraction)) * max);

  return {
    breakdown: { signal, points, max, detail },
    reason: points > 0 ? reason : null,
  };
}

function buildReason(components: ComponentResult[]): string {
  const reasons = components
    .filter(
      (component) =>
        component.breakdown.points > 0 && component.reason !== null,
    )
    .sort(
      (left, right) =>
        right.breakdown.points - left.breakdown.points,
    )
    .slice(0, 2)
    .map((component) => component.reason!)
    .map((reason, index) =>
      index === 0 ? reason : lowercaseFirst(reason),
    );

  if (reasons.length === 0) {
    return 'Cumple los filtros de tu búsqueda.';
  }

  return capitalize(reasons.join(' y ')) + '.';
}

function hasCommonLanguage(
  menteeLanguages: MatchingLanguage[],
  candidateLanguages: MatchingLanguage[],
): boolean {
  const candidateCodes = new Set(
    candidateLanguages.map((language) => language.code),
  );

  return menteeLanguages.some((language) =>
    candidateCodes.has(language.code),
  );
}

function hasCommonArea(
  mentee: MenteeSignals,
  candidate: MentorCandidate,
): boolean {
  const menteeAreaIds = new Set(mentee.areas.map((area) => area.id));
  const candidateAreaIds = new Set(
    candidate.areas.map((area) => area.id),
  );

  return (
    mentee.areas.some(
      (area) =>
        candidateAreaIds.has(area.id) ||
        (area.parentId !== null && candidateAreaIds.has(area.parentId)),
    ) ||
    candidate.areas.some(
      (area) =>
        menteeAreaIds.has(area.id) ||
        (area.parentId !== null && menteeAreaIds.has(area.parentId)),
    )
  );
}

function overlapMinutes(
  slot: MentorAvailabilitySlot,
  preferences: MatchingAvailabilityPreference[],
  timezone: string,
): number {
  const start = slot.startsAt.getTime();
  const end = slot.endsAt.getTime();
  let minutes = 0;

  try {
    for (let instant = start; instant < end; instant += 60_000) {
      const local = Temporal.Instant.fromEpochMilliseconds(
        instant,
      ).toZonedDateTimeISO(timezone);

      if (matchesPreference(local, preferences)) {
        minutes += 1;
      }
    }
  } catch {
    // A malformed stored timezone must not break the whole recommendation
    // list; the candidate simply gets no availability points.
    return 0;
  }

  return minutes;
}

function matchesPreference(
  local: Temporal.ZonedDateTime,
  preferences: MatchingAvailabilityPreference[],
): boolean {
  if (
    preferences.includes('weekends') &&
    (local.dayOfWeek === 6 || local.dayOfWeek === 7)
  ) {
    return true;
  }

  if (
    preferences.includes('mornings') &&
    local.hour >= 6 &&
    local.hour < 12
  ) {
    return true;
  }

  if (
    preferences.includes('afternoons') &&
    local.hour >= 12 &&
    local.hour < 18
  ) {
    return true;
  }

  if (
    preferences.includes('evenings') &&
    local.hour >= 18 &&
    local.hour < 22
  ) {
    return true;
  }

  return false;
}

function isFree(offering: { isFree: boolean }): boolean {
  return offering.isFree;
}

function toRecommendation(scored: CandidateScore): Recommendation {
  const { candidate } = scored;

  return {
    mentorId: candidate.userId,
    mentor: {
      userId: candidate.userId,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      headline: candidate.headline,
      bio: candidate.bio,
      yearsExperience: candidate.yearsExperience,
      country: candidate.country,
      city: candidate.city,
      areas: candidate.areas,
      languages: candidate.languages,
      offerings: candidate.offerings,
    },
    score: scored.score,
    breakdown: scored.breakdown,
    reason: scored.reason,
  };
}

function formatList(values: string[]): string {
  const unique = [...new Set(values)];
  const shown = unique.slice(0, 2);

  if (unique.length <= 2) {
    return shown.join(' y ');
  }

  return `${shown.join(', ')} y ${unique.length - 2} más`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, '');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lowercaseFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
