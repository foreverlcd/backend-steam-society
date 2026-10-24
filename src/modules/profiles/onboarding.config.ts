export const ONBOARDING_VERSION = 1;

export const COUNTRY_CODES = ['PE', 'CO', 'MX', 'BR'] as const;
export const COUNTRY_OPTIONS = [
  { value: 'PE', label: 'Perú' },
  { value: 'CO', label: 'Colombia' },
  { value: 'MX', label: 'México' },
  { value: 'BR', label: 'Brasil' },
] as const;

export const PROFESSIONAL_ROLES = [
  'professional',
  'researcher',
  'founder_executive',
] as const;
export const PROFESSIONAL_ROLE_OPTIONS = [
  { value: 'professional', label: 'Profesional' },
  { value: 'researcher', label: 'Investigadora' },
  { value: 'founder_executive', label: 'Founder / Ejecutiva' },
] as const;

export const EXPERIENCE_RANGES = ['3-5', '6-9', '10+'] as const;
export const EXPERIENCE_RANGE_OPTIONS = [
  { value: '3-5', label: '3–5 años' },
  { value: '6-9', label: '6–9 años' },
  { value: '10+', label: '10 años a más' },
] as const;

export const SUPPORT_TYPES = [
  'study_plan',
  'innovation',
  'research_thesis',
  'portfolio',
  'interviews',
  'scholarships',
  'networking',
  'leadership',
] as const;
export const SUPPORT_TYPE_OPTIONS = [
  { value: 'study_plan', label: 'Plan de estudio y recursos' },
  { value: 'innovation', label: 'Innovación / creación' },
  { value: 'research_thesis', label: 'Investigación / tesis' },
  { value: 'portfolio', label: 'Portafolio / proyectos' },
  { value: 'interviews', label: 'Entrevistas técnicas / HR' },
  { value: 'scholarships', label: 'Becas / internacional' },
  { value: 'networking', label: 'Networking / carrera' },
  { value: 'leadership', label: 'Liderazgo / confianza' },
] as const;

export const INDUSTRIES = [
  'tech_saas',
  'education',
  'health',
  'fintech',
  'energy',
  'manufacturing',
  'research',
  'government_ngo',
  'startups',
  'other',
] as const;
export const INDUSTRY_OPTIONS = [
  { value: 'tech_saas', label: 'Tech / SaaS' },
  { value: 'education', label: 'Educación' },
  { value: 'health', label: 'Salud' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'energy', label: 'Energía' },
  { value: 'manufacturing', label: 'Manufactura' },
  { value: 'research', label: 'Investigación' },
  { value: 'government_ngo', label: 'Gobierno / ONG' },
  { value: 'startups', label: 'Startups' },
  { value: 'other', label: 'Otro' },
] as const;

export const MENTORING_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const MENTORING_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
] as const;

export const MENTEE_STAGES = [
  'school',
  'preuniversity',
  'university',
  'early_career',
] as const;
export const MENTEE_STAGE_OPTIONS = [
  { value: 'school', label: 'Escolar' },
  { value: 'preuniversity', label: 'Preuniversitaria' },
  { value: 'university', label: 'Universitaria' },
  { value: 'early_career', label: 'Primeros años laborales' },
] as const;

export const AVAILABILITY_PREFERENCES = [
  'mornings',
  'afternoons',
  'evenings',
  'weekends',
] as const;
export const AVAILABILITY_PREFERENCE_OPTIONS = [
  { value: 'mornings', label: 'Mañanas (6:00–12:00)' },
  { value: 'afternoons', label: 'Tardes (12:00–18:00)' },
  { value: 'evenings', label: 'Noches (18:00–22:00)' },
  { value: 'weekends', label: 'Fines de semana' },
] as const;

export const MAIN_GOALS = [
  'decide_career',
  'transition_to_stem',
  'learning_path',
  'studies_scholarships_internships',
  'career_clarity',
] as const;
export const MAIN_GOAL_OPTIONS = [
  { value: 'decide_career', label: 'Decidir carrera o especialidad' },
  { value: 'transition_to_stem', label: 'Cambiar o transicionar a STEM' },
  { value: 'learning_path', label: 'Diseñar una ruta de aprendizaje' },
  {
    value: 'studies_scholarships_internships',
    label: 'Prepararme para estudios, becas o prácticas',
  },
  { value: 'career_clarity', label: 'Claridad profesional' },
] as const;

export const CURRENT_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const CURRENT_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Principiante (estoy empezando o explorando)' },
  { value: 'intermediate', label: 'Intermedio (tengo conocimientos básicos)' },
  { value: 'advanced', label: 'Avanzado (tengo experiencia práctica)' },
] as const;

export type OnboardingRole = 'mentor' | 'mentee';

export interface OnboardingOption {
  value: string;
  label: string;
}

export interface OnboardingQuestion {
  code: string;
  label: string;
  type:
    | 'number'
    | 'text'
    | 'url'
    | 'single_select'
    | 'multi_select'
    | 'area_single'
    | 'area_multi'
    | 'language_single';
  required: boolean;
  maxSelections?: number;
  options?: readonly OnboardingOption[];
  help?: string;
}

export interface OnboardingStep {
  code: string;
  title: string;
  questions: OnboardingQuestion[];
}

export interface OnboardingConfig {
  version: number;
  role: OnboardingRole;
  steps: OnboardingStep[];
}

const mentorSteps: OnboardingStep[] = [
  {
    code: 'basic',
    title: 'Información básica',
    questions: [
      {
        code: 'age',
        label: 'Edad',
        type: 'number',
        required: true,
      },
      {
        code: 'city',
        label: 'Ciudad',
        type: 'text',
        required: true,
      },
      {
        code: 'country',
        label: 'País',
        type: 'single_select',
        required: true,
        options: COUNTRY_OPTIONS,
      },
      {
        code: 'professionalRole',
        label: 'Rol principal',
        type: 'single_select',
        required: true,
        options: PROFESSIONAL_ROLE_OPTIONS,
      },
      {
        code: 'experienceRange',
        label: 'Años de experiencia',
        type: 'single_select',
        required: true,
        options: EXPERIENCE_RANGE_OPTIONS,
      },
      {
        code: 'linkedinUrl',
        label: 'Perfil LinkedIn',
        type: 'url',
        required: false,
      },
    ],
  },
  {
    code: 'stem',
    title: 'Experiencia STEM',
    questions: [
      {
        code: 'primaryAreaId',
        label: 'Área STEM principal',
        type: 'area_single',
        required: true,
      },
      {
        code: 'areaIds',
        label: 'Sub-áreas que dominas',
        type: 'area_multi',
        required: true,
        maxSelections: 5,
        help: 'Elige hasta 5 sub-áreas de tu área principal.',
      },
      {
        code: 'supportTypes',
        label: 'Tipo de problemas que ayudas a resolver',
        type: 'multi_select',
        required: true,
        maxSelections: 5,
        options: SUPPORT_TYPE_OPTIONS,
      },
      {
        code: 'industries',
        label: 'Industrias o sectores con experiencia',
        type: 'multi_select',
        required: false,
        maxSelections: 3,
        options: INDUSTRY_OPTIONS,
      },
    ],
  },
  {
    code: 'mentoring',
    title: 'Nivel de mentoría',
    questions: [
      {
        code: 'mentoringLevels',
        label: 'Niveles que te gustaría mentorear',
        type: 'multi_select',
        required: true,
        options: MENTORING_LEVEL_OPTIONS,
      },
      {
        code: 'menteeStages',
        label: 'Etapas que aceptas',
        type: 'multi_select',
        required: true,
        options: MENTEE_STAGE_OPTIONS,
      },
    ],
  },
  {
    code: 'preferences',
    title: 'Disponibilidad y preferencias',
    questions: [
      {
        code: 'languageCodes',
        label: 'Idioma preferido',
        type: 'language_single',
        required: true,
      },
      {
        code: 'availabilityPreferences',
        label: 'Momentos más fáciles para dar mentoría',
        type: 'multi_select',
        required: true,
        maxSelections: 2,
        options: AVAILABILITY_PREFERENCE_OPTIONS,
      },
    ],
  },
];

const menteeSteps: OnboardingStep[] = [
  {
    code: 'about',
    title: 'Cuéntanos sobre ti',
    questions: [
      {
        code: 'age',
        label: 'Edad',
        type: 'number',
        required: true,
      },
      {
        code: 'city',
        label: 'Ciudad',
        type: 'text',
        required: true,
      },
      {
        code: 'country',
        label: 'País',
        type: 'single_select',
        required: true,
        options: COUNTRY_OPTIONS,
      },
      {
        code: 'stage',
        label: '¿En qué etapa estás?',
        type: 'single_select',
        required: true,
        options: MENTEE_STAGE_OPTIONS,
      },
    ],
  },
  {
    code: 'goals',
    title: 'Tus objetivos STEM',
    questions: [
      {
        code: 'primaryAreaId',
        label: 'Área de interés STEM',
        type: 'area_single',
        required: true,
      },
      {
        code: 'areaIds',
        label: 'Temas que te llaman más la atención',
        type: 'area_multi',
        required: true,
        maxSelections: 3,
        help: 'Elige hasta 3 temas de tu área principal.',
      },
      {
        code: 'mainGoal',
        label: 'Objetivo principal en este momento',
        type: 'single_select',
        required: true,
        options: MAIN_GOAL_OPTIONS,
      },
      {
        code: 'supportTypes',
        label: 'Tipo de apoyo que necesitas',
        type: 'multi_select',
        required: true,
        maxSelections: 3,
        options: SUPPORT_TYPE_OPTIONS,
      },
      {
        code: 'industries',
        label: 'Industrias o sectores de interés',
        type: 'multi_select',
        required: false,
        maxSelections: 3,
        options: INDUSTRY_OPTIONS,
      },
    ],
  },
  {
    code: 'level',
    title: 'Tu nivel actual',
    questions: [
      {
        code: 'currentLevel',
        label: '¿Cuál es tu nivel en el área de interés?',
        type: 'single_select',
        required: true,
        options: CURRENT_LEVEL_OPTIONS,
      },
    ],
  },
  {
    code: 'preferences',
    title: 'Preferencias de mentora',
    questions: [
      {
        code: 'languageCodes',
        label: 'Idioma preferido',
        type: 'language_single',
        required: true,
      },
      {
        code: 'availabilityPreferences',
        label: 'Momentos más fáciles para tener mentoría',
        type: 'multi_select',
        required: true,
        maxSelections: 2,
        options: AVAILABILITY_PREFERENCE_OPTIONS,
      },
    ],
  },
];

export function getOnboardingConfig(role: OnboardingRole): OnboardingConfig {
  return {
    version: ONBOARDING_VERSION,
    role,
    steps: role === 'mentor' ? mentorSteps : menteeSteps,
  };
}
