// src/lib/dag/nodes/LensChoiceNode.js
import { CinematicNode, NODE_TYPES } from '../CinematicNode';

export class LensChoiceNode extends CinematicNode {
  constructor(config = {}) {
    super({
      ...config,
      type: NODE_TYPES.LENS_CHOICE,
      name: 'Lens Choice',
      parameters: {
        lensFamily:  config.parameters?.lensFamily  || 'Cooke S4/i',
        focalLength: config.parameters?.focalLength || 50,
        aperture:    config.parameters?.aperture    || 'T2.8',
        ...config.parameters,
      },
    });
  }

  async process() {
    const { lensFamily, focalLength, aperture } = this.parameters;

    const depthOfField  = this._calcDoF(focalLength, aperture);
    const perspective   = this._calcPerspective(focalLength);
    const bokehStyle    = lensFamily.toLowerCase().includes('cooke') ? 'creamy smooth bokeh' : 'neutral bokeh';

    return {
      lens: `${lensFamily} ${focalLength}mm ${aperture}`,
      depthOfField,
      perspective,
      bokehStyle,
      promptFragment: `${focalLength}mm ${lensFamily} lens at ${aperture}, ${depthOfField} depth of field, ${perspective}, ${bokehStyle}`,
    };
  }

  _calcDoF(focal, aperture) {
    const t = parseFloat(String(aperture).replace('T', '').replace('f', ''));
    if (t <= 2.0) return 'shallow';
    if (t <= 4.0) return 'medium';
    return 'deep';
  }

  _calcPerspective(focal) {
    if (focal <= 24)  return 'wide angle with natural distortion';
    if (focal <= 35)  return 'slightly wide, natural perspective';
    if (focal <= 50)  return 'natural human eye perspective';
    if (focal <= 85)  return 'slight compression, flattering portrait perspective';
    return 'compressed telephoto perspective';
  }
}

export default LensChoiceNode;