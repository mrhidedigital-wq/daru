export const FASHION_TASK_TYPE_OPTIONS = [
  { value: 'replace_existing_garment', label: 'Reemplazar prenda existente' },
  { value: 'add_garment_or_accessory', label: 'Agregar prenda o accesorio' },
  { value: 'exact_product_transfer', label: 'Transferencia exacta del producto' },
];

export const FASHION_SUBJECT_TYPE_OPTIONS = [
  { value: 'person', label: 'Persona' },
  { value: 'dog', label: 'Perro' },
  { value: 'cat', label: 'Gato' },
  { value: 'other', label: 'Otro' },
];

export const FASHION_POSE_OPTIONS = {
  person: [
    { value: 'front', label: 'Frontal' },
    { value: 'three_quarter', label: 'Tres cuartos' },
    { value: 'side', label: 'Lateral' },
    { value: 'back', label: 'Espalda' },
    { value: 'seated', label: 'Sentado/a' },
    { value: 'walking', label: 'Caminando' },
  ],
  dog: [
    { value: 'standing_side', label: 'Parado de lado' },
    { value: 'standing_front', label: 'Parado de frente' },
    { value: 'seated_side', label: 'Sentado de lado' },
    { value: 'seated_front', label: 'Sentado de frente' },
    { value: 'jumping', label: 'Saltando' },
    { value: 'lying_down', label: 'Acostado' },
  ],
  cat: [
    { value: 'standing_side', label: 'Parado de lado' },
    { value: 'standing_front', label: 'Parado de frente' },
    { value: 'seated_side', label: 'Sentado de lado' },
    { value: 'seated_front', label: 'Sentado de frente' },
    { value: 'jumping', label: 'Saltando' },
    { value: 'lying_down', label: 'Acostado' },
  ],
  other: [
    { value: 'front', label: 'Frontal' },
    { value: 'side', label: 'Lateral' },
    { value: 'back', label: 'Espalda' },
    { value: 'seated', label: 'Sentado' },
  ],
};

export const FASHION_BODY_AREA_OPTIONS = [
  { value: 'head', label: 'Cabeza' },
  { value: 'neck', label: 'Cuello' },
  { value: 'torso', label: 'Torso' },
  { value: 'front_legs_or_arms', label: 'Patas delanteras o brazos' },
  { value: 'back_legs', label: 'Patas traseras' },
  { value: 'full_body', label: 'Cuerpo completo' },
  { value: 'feet_or_paws', label: 'Pies o patas' },
];

export const FASHION_REF_ROLE_OPTIONS = [
  { value: 'hero_front', label: 'Principal frontal' },
  { value: 'hero_side', label: 'Principal lateral' },
  { value: 'hero_back', label: 'Principal trasera' },
  { value: 'detail_structure', label: 'Detalle de estructura' },
  { value: 'detail_texture', label: 'Detalle de textura' },
  { value: 'detail_logo', label: 'Detalle de logo' },
  { value: 'detail_closure', label: 'Detalle de cierre' },
  { value: 'fit_reference', label: 'Referencia de ajuste' },
];

export const FASHION_FIDELITY_MODE_OPTIONS = [
  { value: 'strict', label: 'Estricto' },
  { value: 'balanced', label: 'Balanceado' },
  { value: 'creative', label: 'Creativo' },
];

export function createEmptyFashionRef(index = 0) {
  return {
    id: `ref_${Date.now()}_${index}`,
    url: '',
    name: '',
    role: index === 0 ? 'hero_front' : 'detail_texture',
    priority: index + 1,
    notes: '',
  };
}

export const DEFAULT_FASHION_ASSIST_INPUT = {
  taskType: 'exact_product_transfer',
  subjectType: 'dog',
  pose: 'seated_side',
  bodyArea: 'torso',
  fidelityMode: 'strict',
  subjectImage: '',
  productRefs: [
    createEmptyFashionRef(0),
    createEmptyFashionRef(1),
    createEmptyFashionRef(2),
  ],
  constraints: {
    preserveFace: true,
    preservePose: true,
    preserveBodyProportions: true,
    preserveFurSkinHair: true,
    preserveBackground: true,
    preserveLighting: true,
    applyOnlyGarmentArea: true,
    noRedesign: true,
    keepExactColor: false,
    exactColor: '',
    keepExactLogoPlacement: true,
    useMask: false,
    autoDetectGarmentArea: true,
  },
};