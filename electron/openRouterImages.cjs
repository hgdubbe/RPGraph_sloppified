// OpenRouter's Image API accepts explicit pixel sizes and returns base64 images.
function openRouterImageBody(request) {
  const model = request?.connection?.model?.trim();
  const prompt = request?.prompt?.trim();
  if (!model) throw new Error('Choose an OpenRouter image model first.');
  if (!prompt) throw new Error('Enter an image prompt first.');
  const dimension = (value) => Number.isInteger(value) && value >= 64 && value <= 4096;
  if (!request.aspectRatio && (!dimension(request.width) || !dimension(request.height))) {
    throw new Error('Image dimensions must be whole pixels from 64 through 4096.');
  }
  if (request.aspectRatio && !['3:4', '4:5', '9:16', '1:1', '4:3', '16:9'].includes(request.aspectRatio)) {
    throw new Error('Choose a supported image aspect ratio.');
  }
  const references = request.referenceImages ?? [];
  if (!Array.isArray(references) || references.length > 3 || references.some((image) =>
    typeof image !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))) {
    throw new Error('Choose up to three JPEG, PNG, or WebP reference images.');
  }
  return {
    model, prompt: request.aspectRatio ? `Output aspect ratio: ${request.aspectRatio}.\n${prompt}` : prompt, ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : { size: `${request.width}x${request.height}` }), n: 1, output_format: 'png',
    ...(references.length ? { input_references: references.map((url) => ({
      type: 'image_url', image_url: { url },
    })) } : {}),
  };
}

function openRouterResponseImages(result) {
  if (result?.error) {
    throw new Error(result.error.message || 'OpenRouter image generation failed.');
  }
  const images = (Array.isArray(result?.data) ? result.data : []).map((entry) => {
    const data = typeof entry?.b64_json === 'string' ? entry.b64_json.trim() : '';
    const mimeType = entry?.media_type || 'image/png';
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      throw new Error('OpenRouter returned an unsupported or invalid image.');
    }
    return `data:${mimeType};base64,${data}`;
  });
  if (!images.length) throw new Error('OpenRouter finished without returning an image.');
  return { images };
}

module.exports = { openRouterImageBody, openRouterResponseImages };
