const crypto = require('node:crypto');

function supportsComfyImageReferences(workflow) {
  const nodes = Object.values(workflow ?? {});
  return nodes.some((node) => node?.class_type === 'LoadImage') &&
    nodes.some((node) => node?.class_type === 'TextEncodeQwenImage21');
}

// Only Qwen's optional image inputs are managed; unrelated workflow inputs stay intact.
async function prepareComfyImageReferences(workflow, references = [], upload) {
  if (!Array.isArray(references) || references.length > 3 || references.some((image) =>
    typeof image !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))) {
    throw new Error('Choose up to three JPEG, PNG, or WebP reference images.');
  }
  const encoders = Object.values(workflow).filter((node) => node.class_type === 'TextEncodeQwenImage21');
  if (references.length && !supportsComfyImageReferences(workflow)) {
    throw new Error('This ComfyUI workflow does not support Qwen image references.');
  }
  const names = [];
  for (const reference of references) names.push(await upload(reference));
  for (const encoder of encoders) {
    for (let index = 0; index < 3; index += 1) {
      const key = `images.image_${index + 1}`;
      delete encoder.inputs[key];
      if (index < names.length) {
        // Dedicated nodes avoid modifying a loader used elsewhere in the graph.
        let id = `rpgraph_reference_${index + 1}`;
        while (Object.hasOwn(workflow, id)) id += '_';
        workflow[id] = { class_type: 'LoadImage', inputs: { image: names[index] } };
        encoder.inputs[key] = [id, 0];
      }
    }
  }
  return workflow;
}

async function uploadComfyImageReference(dataUrl, send) {
  const [, mimeType, data] = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  const buffer = Buffer.from(data, 'base64');
  const extension = mimeType.split('/')[1];
  const filename = `rpgraph-reference-${crypto.randomUUID()}.${extension}`;
  const boundary = `----rpgraph-${crypto.randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\ntemp\r\n--${boundary}--\r\n`),
  ]);
  const result = await send({ method: 'POST', headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(body.length),
  }, body });
  if (typeof result?.name !== 'string' || !result.name.trim()) {
    throw new Error('ComfyUI did not return an uploaded reference image name.');
  }
  const name = result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
  return result.type === 'temp' || result.type === 'output' ? `${name} [${result.type}]` : name;
}

module.exports = { supportsComfyImageReferences, prepareComfyImageReferences, uploadComfyImageReference };
