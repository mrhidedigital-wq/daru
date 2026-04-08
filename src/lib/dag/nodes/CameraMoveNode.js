// src/lib/dag/nodes/CameraMoveNode.js
import { CinematicNode, NODE_TYPES } from '../CinematicNode';

const MOVE_DESCRIPTIONS = {
  static:     (lvl) => 'locked-off static camera, no movement',
  dolly_in:   (lvl) => `${lvl} push-in dolly move toward subject`,
  dolly_out:  (lvl) => `${lvl} pull-back dolly move away from subject`,
  pan_left:   (lvl) => `${lvl} horizontal pan to the left`,
  pan_right:  (lvl) => `${lvl} horizontal pan to the right`,
  tilt_up:    (lvl) => `${lvl} tilt upward`,
  tilt_down:  (lvl) => `${lvl} tilt downward`,
  arc:        (lvl) => `${lvl} arc move orbiting around subject`,
  crane_up:   (lvl) => `${lvl} crane/jib move upward`,
  crane_down: (lvl) => `${lvl} crane/jib move downward`,
  dutch_tilt: (lvl) => `${lvl} dutch angle tilt for tension`,
  zoom_in:    (lvl) => `${lvl} optical zoom in (not dolly)`,
  zoom_out:   (lvl) => `${lvl} optical zoom out`,
  parallax:   (lvl) => `${lvl} parallax effect — subtle depth motion`,
  handheld:   (lvl) => `${lvl} handheld camera — organic movement, slight shake`,
};

function intensityLabel(intensity) {
  const n = parseFloat(intensity);
  if (n <= 0.15) return 'very subtle';
  if (n <= 0.22) return 'subtle';
  if (n <= 0.28) return 'smooth';
  if (n <= 0.35) return 'moderate';
  return 'dramatic';
}

export class CameraMoveNode extends CinematicNode {
  constructor(config = {}) {
    super({
      ...config,
      type: NODE_TYPES.CAMERA_MOVE,
      name: 'Camera Move',
      parameters: {
        moveType:  config.parameters?.moveType  || 'static',
        intensity: config.parameters?.intensity || 0.2,
        duration:  config.parameters?.duration  || 4,
        easing:    config.parameters?.easing    || 'ease-out',
        ...config.parameters,
      },
    });
  }

  async process() {
    const { moveType, intensity, duration, easing } = this.parameters;

    const lvl  = intensityLabel(intensity);
    const desc = (MOVE_DESCRIPTIONS[moveType] || MOVE_DESCRIPTIONS.static)(lvl);

    return {
      moveType,
      intensity,
      duration,
      easing,
      intensityLabel: lvl,
      promptFragment: `${desc} over ${duration} seconds, ${easing} easing`,
    };
  }
}

export default CameraMoveNode;