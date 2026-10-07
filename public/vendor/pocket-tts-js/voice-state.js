// WaveAtlas extension. Preserve NaN padding and typed state while storing only
// occupied cache runs. Speaker state is prepared once, independent of new text.
export function cloneVoiceState(state, createTensor) {
    return Object.fromEntries(Object.entries(state).map(([key, tensor]) => [key, createTensor(tensor.type, tensor.data.slice(), [...tensor.dims])]));
}
export function packVoiceState(state) {
    return Object.fromEntries(Object.entries(state).map(([key, tensor]) => {
        const saved = { type: tensor.type, dims: [...tensor.dims] };
        if (tensor.type === 'float32' && tensor.data.some(Number.isNaN)) {
            saved.runs = [];
            for (let index = 0; index < tensor.data.length;) {
                if (Number.isNaN(tensor.data[index])) { index++; continue; }
                const offset = index;
                while (index < tensor.data.length && !Number.isNaN(tensor.data[index])) index++;
                saved.runs.push({ offset, data: tensor.data.slice(offset, index) });
            }
        } else saved.data = tensor.data.slice();
        return [key, saved];
    }));
}
export function unpackVoiceState(tensors, manifest, createTensor) {
    const state = {};
    const types = { float32: Float32Array, int64: BigInt64Array, bool: Uint8Array };
    for (const entry of manifest) {
        const tensor = tensors?.[entry.input_name];
        const ArrayType = types[entry.dtype];
        // current_end is an initially empty sequence whose length grows during
        // reference conditioning. Its saved dimension is not the initial [0].
        const capacity = manifest.find(item => item.module === entry.module && item.key === 'cache')?.shape[2] || 1000;
        if (!tensor || !ArrayType || tensor.type !== entry.dtype || !Array.isArray(tensor.dims) || tensor.dims.length !== entry.shape.length || !tensor.dims.every((dimension, index) => Number.isSafeInteger(dimension) && dimension >= 0 && (entry.key === 'current_end' && entry.shape[index] === 0 ? dimension <= capacity : dimension === entry.shape[index]))) throw new Error('Invalid cached speaker tensor');
        const size = tensor.dims.reduce((a, b) => a * b, 1);
        let data;
        if (Array.isArray(tensor.runs) && entry.dtype === 'float32') {
            data = new Float32Array(size).fill(NaN);
            let end = 0;
            for (const run of tensor.runs) {
                if (!Number.isSafeInteger(run.offset) || run.offset < end || !(run.data instanceof Float32Array) || run.offset + run.data.length > size) throw new Error('Invalid cached speaker cache run');
                data.set(run.data, run.offset); end = run.offset + run.data.length;
            }
        } else {
            if (!(tensor.data instanceof ArrayType) || tensor.data.length !== size) throw new Error('Invalid cached speaker data');
            data = tensor.data.slice();
        }
        state[entry.input_name] = createTensor(tensor.type, data, [...tensor.dims]);
    }
    return state;
}
