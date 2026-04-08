// src/lib/dag/nodes/LightingSetupNode.js
import { CinematicNode, NODE_TYPES } from '../CinematicNode';

const SCHEMES = {
  three_point:    (dir, ratio) => `classic three-point lighting — key from ${dir}, fill at ${ratio} ratio, subtle backlight separation`,
  rembrandt:      ()           => 'Rembrandt lighting — dramatic key creating triangle of light under eye, deep shadows',
  split:          ()           => 'split lighting — half face illuminated, half in shadow, high contrast',
  butterfly:      ()           => 'butterfly lighting — key directly above, symmetrical nose shadow',
  rim:            ()           => 'rim/backlight only — edges of subject illuminated, separating from dark background',
  natural_window: (dir)        => `natural window light from ${dir} — soft, directional, realistic`,
  motivated:      (dir)        => `motivated lighting — simulating ${dir} as practical source (false sun/lamp)`,
  flat:           ()           => 'flat soft lighting — minimal shadows, even exposure, commercial look',
};

const MOODS = {
  warm:       'warm golden tones, 3200K color temperature',
  cool:       'cool blue tones, 5600K+ color temperature',
  dramatic:   'high contrast, deep blacks, dramatic shadows',
  soft:       'soft diffused light, gentle shadows, low contrast',
  natural:    'natural balanced exposure, true-to-life colors',
  golden:     'golden hour warmth, long shadows, rich oranges',
  night:      'night scene, low key, motivated artificial light sources',
  overcast:   'overcast daylight, flat diffused, no hard shadows',
};

export class LightingSetupNode extends CinematicNode {
  constructor(config = {}) {
    super({
      ...config,
      type: NODE_TYPES.LIGHTING_SETUP,
      name: 'Lighting Setup',
      parameters: {
        scheme:       config.parameters?.scheme       || 'three_point',
        keyDirection: config.parameters?.keyDirection || '45° front left',
        fillRatio:    config.parameters?.fillRatio    || '2:1',
        mood:         config.parameters?.mood         || 'natural',
        intensity:    config.parameters?.intensity    || 0.8,
        hasNegFill:   config.parameters?.hasNegFill   || false,
        practicals:   config.parameters?.practicals   || [],
        ...config.parameters,
      },
    });
  }

  async process() {
    const { scheme, keyDirection, fillRatio, mood, intensity, hasNegFill, practicals } = this.parameters;

    const schemeDesc = (SCHEMES[scheme] || SCHEMES.three_point)(keyDirection, fillRatio);
    const moodDesc   = MOODS[mood] || MOODS.natural;

    const extras = [];
    if (hasNegFill)       extras.push('negative fill to deepen shadows');
    if (practicals?.length) extras.push(`practicals: ${practicals.join(', ')}`);

    const extrasStr = extras.length ? `, ${extras.join(', ')}` : '';

    return {
      scheme,
      keyDirection,
      fillRatio,
      mood,
      intensity,
      promptFragment: `${schemeDesc}, ${moodDesc}${extrasStr}`,
    };
  }
}

export default LightingSetupNode;