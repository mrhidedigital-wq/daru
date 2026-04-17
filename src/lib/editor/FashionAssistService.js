import { selectFashionRefs } from './FashionReferenceSelector';
import { buildFashionAssistPrompt } from './FashionPromptBuilder';

async function urlToInlineData(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error('Could not load reference image: ' + url);
  }

  const blob = await res.blob();

  return await new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onloadend = function () {
      const result = String(reader.result || '');
      const parts = result.split(',');
      const base64 = parts.length > 1 ? parts[1] : '';

      resolve({
        mimeType: blob.type || 'image/jpeg',
        data: base64,
      });
    };

    reader.onerror = function () {
      reject(new Error('Could not read image as base64'));
    };

    reader.readAsDataURL(blob);
  });
}

export class FashionAssistService {
  constructor(config) {
    const safeConfig = config || {};
    this.maxRefs = safeConfig.maxRefs || 3;
    this.model = safeConfig.model || 'gemini-2.5-flash-image';
  }

  async run(input) {
    const safeInput = input || {};

    if (!safeInput.subjectImage) {
      throw new Error('subjectImage is required');
    }

    const selectedRefs = selectFashionRefs(safeInput.productRefs || [], this.maxRefs);

    const prompt = buildFashionAssistPrompt({
      subjectImage: safeInput.subjectImage,
      productRefs: selectedRefs,
      constraints: safeInput.constraints || {},
    });

    const subjectInline = await urlToInlineData(safeInput.subjectImage);

    const refParts = [];
    for (const ref of selectedRefs) {
      const inline = await urlToInlineData(ref.url);
      refParts.push({
        inlineData: {
          mimeType: inline.mimeType,
          data: inline.data,
        },
      });
    }

    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';
    const endpoint = `${serverUrl}/api/llm`;

    const body = {
      action: 'gemini-proxy',
      model: this.model,
      contents: [
        {
          parts: [
            {
              text:
                prompt +
                ' Base image: preserve this subject and apply the garment references onto it.',
            },
            {
              inlineData: {
                mimeType: subjectInline.mimeType,
                data: subjectInline.data,
              },
            },
          ].concat(refParts),
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(function () {
      return {};
    });

    if (!res.ok) {
      const message =
        (data &&
          data.error &&
          data.error.message) ||
        'Fashion Assist request failed with status ' + res.status;
      throw new Error(message);
    }

    const parts =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts
        ? data.candidates[0].content.parts
        : [];

    const imagePart = parts.find(function (p) {
      return p && p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.indexOf('image/') === 0;
    });

    if (!imagePart) {
      throw new Error('Fashion Assist returned no image');
    }

    return {
      prompt: prompt,
      selectedRefs: selectedRefs,
      imageUrl:
        'data:' +
        imagePart.inlineData.mimeType +
        ';base64,' +
        imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
      rawResponse: data,
    };
  }
}

export default FashionAssistService;