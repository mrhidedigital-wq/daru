// src/lib/editor/FashionPromptBuilder.js

function clean(value) {
  if (!value) return '';
  return String(value).trim();
}

export function buildFashionAssistPrompt(input = {}) {
  const {
    productRefs = [],
    constraints = {},
  } = input;

  const roles = productRefs.map(r => r.role).filter(Boolean);

  const keepPose = constraints.preserveSubjectPose !== false;
  const keepBody = constraints.preserveBodyProportions !== false;
  const keepFace = constraints.preserveFace !== false;
  const keepBg   = constraints.preserveBackground !== false;
  const noRedesign = constraints.noRedesign !== false;
  const applyOnlyGarment = constraints.applyOnlyGarment !== false;
  const exactColor = clean(constraints.exactColor);

  const instructions = [
    'Apply the exact garment from the product reference images to the subject in the base image.',
    'Preserve the garment category, silhouette, cut, seams, closures, hood structure, hem length, and material appearance.',
    'Use the hero references to define the full garment shape and the detail references only to reinforce construction accuracy.',
  ];

  if (noRedesign) {
    instructions.push('Do not redesign, reinterpret, stylize, simplify, or invent new garment features.');
  }

  if (applyOnlyGarment) {
    instructions.push('Edit only the garment area on the subject.');
  }

  if (keepPose) {
    instructions.push('Preserve the original subject pose exactly.');
  }

  if (keepBody) {
    instructions.push('Preserve the original body proportions and anatomy.');
  }

  if (keepFace) {
    instructions.push('Preserve the face, head, fur, and identity of the subject.');
  }

  if (keepBg) {
    instructions.push('Preserve the original background and scene composition.');
  }

  if (exactColor) {
    instructions.push(`The garment color must remain exactly ${exactColor}.`);
  }

  instructions.push(
    'Do not add accessories, trims, patterns, text, logos, pockets, straps, or closures that are not visible in the references.'
  );

  if (roles.length > 0) {
    instructions.push(`Reference roles provided: ${roles.join(', ')}.`);
    instructions.push('Prioritize hero_front first, then hero_side or hero_back, then detail references.');
  }

  return instructions.join(' ');
}