// src/lib/dag/nodes/ShotFramingNode.js
import { CinematicNode, NODE_TYPES } from '../CinematicNode';

const SHOT_SIZES = {
  extreme_wide:      'extreme wide shot (EWS) — full environment, subject very small',
  wide:              'wide shot (WS) — subject and full surroundings visible',
  full_body:         'full body shot — subject head to toe',
  cowboy:            'cowboy shot (American shot) — mid-thigh up',
  medium:            'medium shot (MS) — waist up',
  medium_close:      'medium close-up (MCU) — chest up',
  close_up:          'close-up (CU) — head and shoulders',
  extreme_close_up:  'extreme close-up (ECU) — face details or macro',

  // Español (compatibilidad con DSL existente)
  gran_plano_general:         'extreme wide shot (gran plano general)',
  plano_general:              'wide shot (plano general)',
  plano_entero:               'full body shot (plano entero)',
  plano_americano:            'cowboy shot (plano americano)',
  plano_medio:                'medium shot (plano medio)',
  primer_plano:               'close-up (primer plano)',
  primerisimo_primer_plano:   'extreme close-up (primerísimo primer plano)',
};

const ANGLES = {
  eye_level:    'eye level angle — neutral, natural',
  high_angle:   'high angle — camera looking down, subject feels smaller',
  low_angle:    'low angle — camera looking up, subject feels powerful',
  birds_eye:    "bird's eye view — top-down 90°",
  worms_eye:    "worm's eye view — extreme low angle looking up",
  dutch_tilt:   'dutch tilt — camera tilted for tension/unease',

  // Español
  frontal:          'frontal eye level',
  picado:           'high angle (picado)',
  contrapicado:     'low angle (contrapicado)',
  lateral_izq:      'left profile, eye level',
  lateral_der:      'right profile, eye level',
  tres_cuartos_izq: 'three-quarter left, eye level',
  tres_cuartos_der: 'three-quarter right, eye level',
};

export class ShotFramingNode extends CinematicNode {
  constructor(config = {}) {
    super({
      ...config,
      type: NODE_TYPES.SHOT_FRAMING,
      name: 'Shot Framing',
      parameters: {
        shotSize:  config.parameters?.shotSize  || 'medium',
        angle:     config.parameters?.angle     || 'eye_level',
        degrees:   config.parameters?.degrees   || 0,
        ...config.parameters,
      },
    });
  }

  async process() {
    const { shotSize, angle, degrees } = this.parameters;

    const shotDesc  = SHOT_SIZES[shotSize]  || `${shotSize} shot`;
    const angleDesc = ANGLES[angle]         || `${angle} angle`;
    const degreesStr = degrees ? ` at ${degrees}°` : '';

    return {
      shotSize,
      angle,
      degrees,
      shotDescription:  shotDesc,
      angleDescription: angleDesc,
      promptFragment: `${shotDesc}, ${angleDesc}${degreesStr}`,
    };
  }
}

export default ShotFramingNode;