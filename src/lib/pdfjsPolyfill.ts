export function ensureDomMatrixPolyfill() {
  if (typeof globalThis.DOMMatrix !== "undefined") return;

  type MatrixValues = {
    a?: unknown;
    b?: unknown;
    c?: unknown;
    d?: unknown;
    e?: unknown;
    f?: unknown;
  };

  function getMatrixNumber(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: unknown) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = this.m11 = getMatrixNumber(init[0], this.a);
        this.b = this.m12 = getMatrixNumber(init[1], this.b);
        this.c = this.m21 = getMatrixNumber(init[2], this.c);
        this.d = this.m22 = getMatrixNumber(init[3], this.d);
        this.e = this.m41 = getMatrixNumber(init[4], this.e);
        this.f = this.m42 = getMatrixNumber(init[5], this.f);
      }
    }

    translate(tx = 0, ty = 0) {
      return new DOMMatrixPolyfill([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]);
    }

    scale(sx = 1, sy = sx) {
      return new DOMMatrixPolyfill([this.a * sx, this.b * sx, this.c * sy, this.d * sy, this.e, this.f]);
    }

    multiply(other: unknown) {
      if (other !== null && typeof other === "object") {
        const matrix = other as MatrixValues;
        const a1 = this.a,
          b1 = this.b,
          c1 = this.c,
          d1 = this.d,
          e1 = this.e,
          f1 = this.f;
        const a2 = getMatrixNumber(matrix.a, 1),
          b2 = getMatrixNumber(matrix.b, 0),
          c2 = getMatrixNumber(matrix.c, 0),
          d2 = getMatrixNumber(matrix.d, 1),
          e2 = getMatrixNumber(matrix.e, 0),
          f2 = getMatrixNumber(matrix.f, 0);
        return new DOMMatrixPolyfill([
          a1 * a2 + c1 * b2,
          b1 * a2 + d1 * b2,
          a1 * c2 + c1 * d2,
          b1 * c2 + d1 * d2,
          a1 * e2 + c1 * f2 + e1,
          b1 * e2 + d1 * f2 + f1,
        ]);
      }
      return this;
    }

    inverse() {
      const det = this.a * this.d - this.b * this.c;
      if (!det) return new DOMMatrixPolyfill();
      return new DOMMatrixPolyfill([
        this.d / det,
        -this.b / det,
        -this.c / det,
        this.a / det,
        (this.c * this.f - this.d * this.e) / det,
        (this.b * this.e - this.a * this.f) / det,
      ]);
    }

    transformPoint(point?: { x?: number; y?: number }) {
      const x = point?.x ?? 0;
      const y = point?.y ?? 0;
      return {
        x: x * this.a + y * this.c + this.e,
        y: x * this.b + y * this.d + this.f,
        z: 0,
        w: 1,
      };
    }
  }

  (globalThis as { DOMMatrix?: typeof DOMMatrixPolyfill }).DOMMatrix = DOMMatrixPolyfill;
}
