
import { Tokenizer } from '../../src/core/Tokenizer.mjs';

const t = new Tokenizer({ useVocab: true, universeSize: 10000 });
const text = "s0001 t05";
const ids = t.encode(text);
const decoded = t.decode(ids);

console.log("Input:", text);
console.log("IDs:", ids);
console.log("Decoded:", decoded);
