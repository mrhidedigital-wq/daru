// src/lib/dag/nodes/CameraSetupNode.js
import { CinematicNode, NODE_TYPES } from '../CinematicNode';

export class CameraSetupNode extends CinematicNode {
  constructor(config = {}) {
    super({
      ...config,
      type: NODE_TYPES.CAMERA_SETUP,
      name: 'Camera Setup',
      parameters: {
        camera:    config.parameters?.camera    || 'ARRI Alexa 35',
        sensor:    config.parameters?.sensor    || 'Super 35',
        ...config.parameters,
      },
    });
  }

  async process() {
    const { camera, sensor } = this.parameters;

    return {
      camera,
      sensor,
      promptFragment: `shot on ${camera} with ${sensor} sensor, cinematic quality`,
    };
  }
}

export default CameraSetupNode;