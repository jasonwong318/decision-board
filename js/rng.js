/**
 * Fair random bit source backed by crypto.getRandomValues.
 *
 * Every fork on the board consumes exactly one bit from here, so each fork is a
 * true 50/50 coin flip. Math.random() is deliberately not used: it is not
 * required to be uniform or unpredictable, and this app's whole promise is that
 * the draw is fair.
 */

const BITS_PER_WORD = 32;

export class BitSource {
  constructor() {
    this._word = 0;
    this._remaining = 0;
    this._buf = new Uint32Array(1);
  }

  /** @returns {0|1} the next fair bit */
  nextBit() {
    if (this._remaining === 0) {
      crypto.getRandomValues(this._buf);
      this._word = this._buf[0];
      this._remaining = BITS_PER_WORD;
    }
    const bit = this._word & 1;
    this._word >>>= 1;
    this._remaining -= 1;
    return bit;
  }

  /** @param {number} n @returns {(0|1)[]} n fair bits */
  nextBits(n) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.nextBit();
    return out;
  }
}

export const defaultBitSource = new BitSource();
