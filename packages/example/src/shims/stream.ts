// iconv-lite optionally enables its streaming API when stream.Transform exists.
// A no-op stub keeps encode/decode working in the browser without Node polyfills.
const streamStub = {}
export default streamStub
export const Transform = undefined
